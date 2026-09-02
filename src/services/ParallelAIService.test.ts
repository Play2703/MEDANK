import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ParallelAIService,
  resetGeminiQuotaCooldown,
  getGeminiQuotaCooldownUntil,
  resetProviderStats,
  getProviderStats,
} from './ParallelAIService';
import * as aiGateway from '../core/config/aiGateway';

describe('ParallelAIService - Arquitetura Otimizada (Gemini Principal + Validação Local)', () => {
  let service: ParallelAIService;
  let mockGenerateContent: any;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGeminiQuotaCooldown();
    resetProviderStats();
    process.env.GEMINI_API_KEY = 'test_key';
    service = new ParallelAIService();

    mockGenerateContent = vi.fn();
    // @ts-ignore
    service.getGeminiClient = vi.fn().mockReturnValue({
      models: {
        generateContent: mockGenerateContent,
      },
    });
  });

  it('Caminho Feliz: Gemini sucesso deve responder imediatamente e NÃO deve acionar o 9Router', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify([
        {
          front: 'Qual a conduta inicial no IAM com supra de ST?',
          back: 'Reperfusão coronariana imediata com ICP ou trombólise.',
        },
      ]),
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    });

    const mockRouter = vi.spyOn(aiGateway, 'generateWithFallback').mockResolvedValue({
      text: JSON.stringify({ enriched: true }),
      modelUsed: 'gpt-4o-mini',
    });

    const result = await service.executeParallel('prompt principal', 'prompt helper', {
      temperature: 0.2,
      context: 'test-happy-path',
      initialDelayMs: 10,
    });

    expect(result.success).toBe(true);
    expect(result.mainModel).toContain('gemini');
    expect(result.helperModel).toBe('local-validation');
    expect(result.helperData).toBeNull();
    expect(result.localValidation).toBeDefined();
    expect(result.localValidation?.engine).toContain('DictionaryNEREngine');
    expect(mockRouter).not.toHaveBeenCalled(); // 9Router NUNCA deve ser disparado no caminho feliz!

    mockRouter.mockRestore();
  });

  it('deve realizar retry no Gemini em caso de 503 transitório sem acionar o 9Router', async () => {
    mockGenerateContent
      .mockRejectedValueOnce({ status: 503, message: 'Gemini overloaded / 503 UNAVAILABLE' })
      .mockResolvedValueOnce({
        text: JSON.stringify([{ front: 'Pergunta', back: 'Resposta' }]),
        usageMetadata: {},
      });

    const mockRouter = vi.spyOn(aiGateway, 'generateWithFallback').mockResolvedValue({
      text: 'helper text',
      modelUsed: 'helper-model',
    });

    const result = await service.executeParallel('prompt', 'helper', {
      temperature: 0.2,
      context: 'test-503-retry',
      initialDelayMs: 10,
    });

    expect(result.success).toBe(true);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockRouter).not.toHaveBeenCalled();
    expect(result.helperModel).toBe('local-validation');

    mockRouter.mockRestore();
  });

  it('deve retornar erro claro ao usuário se todos os provedores da cascata falharem', async () => {
    mockGenerateContent.mockRejectedValue({
      status: 503,
      message: 'Gemini down',
    });

    const result = await service.executeParallel('prompt', 'helper', {
      temperature: 0.2,
      context: 'test-all-failed',
      initialDelayMs: 10,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Todos os provedores de IA estão temporariamente indisponíveis');
  });

  it('Circuit Breaker Gemini: em caso de 429 RESOURCE_EXHAUSTED, não faz 3 retries e pula nas chamadas seguintes', async () => {
    mockGenerateContent.mockRejectedValue({
      status: 429,
      message: 'Resource has been exhausted (e.g. check quota). Please retry after 30s',
    });

    const mockGroq = vi.spyOn(aiGateway, 'callGroq').mockResolvedValue({
      text: JSON.stringify([{ front: 'Card Groq', back: 'Resp Groq' }]),
      modelUsed: 'groq/openai/gpt-oss-120b',
    });

    process.env.GROQ_API_KEY = 'test_groq_key';

    // 1ª Chamada: Gemini recebe 429 -> aborta retries lentos (1 chamada) e usa Groq
    const res1 = await service.executeParallel('prompt 1', undefined, {
      context: 'test-quota-skip-1',
      initialDelayMs: 10,
    });

    expect(res1.success).toBe(true);
    expect(res1.mainModel).toBe('groq/openai/gpt-oss-120b');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1); // Não gastou 3 retries lentos!

    // 2ª Chamada: Gemini está em cooldown -> é pulado diretamente (0 chamadas a mais no Gemini)
    const res2 = await service.executeParallel('prompt 2', undefined, {
      context: 'test-quota-skip-2',
      initialDelayMs: 10,
    });

    expect(res2.success).toBe(true);
    expect(res2.mainModel).toBe('groq/openai/gpt-oss-120b');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1); // Manteve 1, não chamou Gemini de novo!

    delete process.env.GROQ_API_KEY;
    mockGroq.mockRestore();
  });

  it('Multi-Keys Gemini: quando chave 1 atinge cota 429, rotaciona para chave 2 com sucesso sem ativar cooldown global', async () => {
    process.env.GEMINI_API_KEYS = 'secret_key_1,secret_key_2,secret_key_3';
    delete process.env.GEMINI_API_KEY;

    const mockGen1 = vi.fn().mockRejectedValue({
      status: 429,
      message: 'Resource has been exhausted (quota limit reached).',
    });
    const mockGen2 = vi.fn().mockResolvedValue({
      text: JSON.stringify([{ front: 'Card Key 2', back: 'Resp Key 2' }]),
      usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 25, totalTokenCount: 40 },
    });
    const mockGen3 = vi.fn();

    const clientMap: Record<number, any> = {
      0: { models: { generateContent: mockGen1 } },
      1: { models: { generateContent: mockGen2 } },
      2: { models: { generateContent: mockGen3 } },
    };

    // @ts-ignore
    service.getGeminiClient = vi.fn().mockImplementation((keyIdx?: number) => {
      const idx = keyIdx ?? service.getCurrentGeminiKeyIndex();
      return clientMap[idx];
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await service.executeParallel('prompt multi key', undefined, {
      context: 'test-multi-key-success',
      initialDelayMs: 10,
    });

    expect(result.success).toBe(true);
    expect(result.mainModel).toContain('gemini');
    expect(mockGen1).toHaveBeenCalledTimes(1);
    expect(mockGen2).toHaveBeenCalledTimes(1);
    expect(mockGen3).not.toHaveBeenCalled();

    // Confirma que o cooldown global NÃO foi ativado
    expect(getGeminiQuotaCooldownUntil()).toBeLessThanOrEqual(Date.now());

    // Confirma que o índice atual do Gemini ficou na chave 2 (índice 1)
    expect(service.getCurrentGeminiKeyIndex()).toBe(1);

    // Confirma que nenhuma chave secreta foi vazada nos logs, apenas índices
    const warnCalls = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(warnCalls).toContain('Chave 1/3 atingiu cota, rotacionando para a próxima');
    expect(warnCalls).not.toContain('secret_key_1');
    expect(warnCalls).not.toContain('secret_key_2');

    warnSpy.mockRestore();
    delete process.env.GEMINI_API_KEYS;
    process.env.GEMINI_API_KEY = 'test_key';
  });

  it('Multi-Keys Gemini: quando TODAS as chaves atingem cota 429, ativa cooldown global e dispara fallback', async () => {
    process.env.GEMINI_API_KEYS = 'secret_key_1,secret_key_2,secret_key_3';
    process.env.GROQ_API_KEY = 'groq_test_key';
    delete process.env.GEMINI_API_KEY;

    const mockGen1 = vi.fn().mockRejectedValue({ status: 429, message: 'Resource exhausted 429' });
    const mockGen2 = vi.fn().mockRejectedValue({ status: 429, message: 'Resource exhausted 429' });
    const mockGen3 = vi.fn().mockRejectedValue({ status: 429, message: 'Resource exhausted 429' });

    const clientMap: Record<number, any> = {
      0: { models: { generateContent: mockGen1 } },
      1: { models: { generateContent: mockGen2 } },
      2: { models: { generateContent: mockGen3 } },
    };

    // @ts-ignore
    service.getGeminiClient = vi.fn().mockImplementation((keyIdx?: number) => {
      const idx = keyIdx ?? service.getCurrentGeminiKeyIndex();
      return clientMap[idx];
    });

    const mockGroq = vi.spyOn(aiGateway, 'callGroq').mockResolvedValue({
      text: JSON.stringify([{ front: 'Card Groq Multi', back: 'Resp Groq Multi' }]),
      modelUsed: 'groq/openai/gpt-oss-120b',
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await service.executeParallel('prompt all keys fail', undefined, {
      context: 'test-multi-key-all-fail',
      initialDelayMs: 10,
    });

    expect(result.success).toBe(true);
    expect(result.mainModel).toBe('groq/openai/gpt-oss-120b');
    expect(mockGen1).toHaveBeenCalledTimes(1);
    expect(mockGen2).toHaveBeenCalledTimes(1);
    expect(mockGen3).toHaveBeenCalledTimes(1);
    expect(mockGroq).toHaveBeenCalledTimes(1);

    // Confirma que o cooldown global FOI ativado após todas falharem
    expect(getGeminiQuotaCooldownUntil()).toBeGreaterThan(Date.now());

    // Confirma que nos logs só constam índices e nunca chaves secretas
    const warnCalls = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(warnCalls).toContain('Todas as 3 chaves do Gemini esgotaram cota');
    expect(warnCalls).not.toContain('secret_key_1');
    expect(warnCalls).not.toContain('secret_key_2');
    expect(warnCalls).not.toContain('secret_key_3');

    warnSpy.mockRestore();
    mockGroq.mockRestore();
    delete process.env.GEMINI_API_KEYS;
    delete process.env.GROQ_API_KEY;
    process.env.GEMINI_API_KEY = 'test_key';
  });

  it('Fallback Cascata: Gemini falha -> Groq falha -> Mistral responde com sucesso', async () => {
    mockGenerateContent.mockRejectedValue({ status: 503, message: 'Gemini down' });

    process.env.GROQ_API_KEY = 'groq_key';
    process.env.MISTRAL_API_KEY = 'mistral_key';

    const mockGroq = vi.spyOn(aiGateway, 'callGroq').mockRejectedValue(new Error('Groq 500 error'));
    const mockMistral = vi.spyOn(aiGateway, 'callMistral').mockResolvedValue({
      text: JSON.stringify([{ front: 'Card Mistral', back: 'Resp Mistral' }]),
      modelUsed: 'mistral/mistral-small-latest',
    });
    const mockRouter = vi.spyOn(aiGateway, 'generateWithFallback');

    const result = await service.executeParallel('prompt', undefined, {
      context: 'test-mistral-fallback',
      initialDelayMs: 10,
    });

    expect(result.success).toBe(true);
    expect(result.mainModel).toBe('mistral/mistral-small-latest');
    expect(mockGroq).toHaveBeenCalled();
    expect(mockMistral).toHaveBeenCalled();
    expect(mockRouter).not.toHaveBeenCalled(); // 9Router não foi necessário

    delete process.env.GROQ_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    mockGroq.mockRestore();
    mockMistral.mockRestore();
    mockRouter.mockRestore();
  });

  it('Round-Robin Load Balancer: deve alternar o primeiro provedor tentado entre Groq, Mistral e Cloudflare', async () => {
    mockGenerateContent.mockRejectedValue({ status: 503, message: 'Gemini down' });

    process.env.GROQ_API_KEY = 'groq_key';
    process.env.MISTRAL_API_KEY = 'mistral_key';
    process.env.CLOUDFLARE_ACCOUNT_ID = '1234567890abcdef1234567890abcdef';
    process.env.CLOUDFLARE_API_TOKEN = 'cf_token';

    const mockGroq = vi.spyOn(aiGateway, 'callGroq').mockResolvedValue({
      text: JSON.stringify([{ front: 'Groq', back: 'Resp' }]),
      modelUsed: 'groq/openai/gpt-oss-120b',
    });
    const mockMistral = vi.spyOn(aiGateway, 'callMistral').mockResolvedValue({
      text: JSON.stringify([{ front: 'Mistral', back: 'Resp' }]),
      modelUsed: 'mistral/mistral-small-latest',
    });
    const mockCF = vi.spyOn(aiGateway, 'callCloudflareAI').mockResolvedValue({
      text: JSON.stringify([{ front: 'CF', back: 'Resp' }]),
      modelUsed: 'cloudflare-ai/@cf/openai/gpt-oss-120b',
    });

    // 1ª Req -> Groq primeiro
    const res1 = await service.executeParallel('prompt 1', undefined, { initialDelayMs: 10 });
    expect(res1.mainModel).toBe('groq/openai/gpt-oss-120b');

    // 2ª Req -> Mistral primeiro
    const res2 = await service.executeParallel('prompt 2', undefined, { initialDelayMs: 10 });
    expect(res2.mainModel).toBe('mistral/mistral-small-latest');

    // 3ª Req -> Cloudflare primeiro
    const res3 = await service.executeParallel('prompt 3', undefined, { initialDelayMs: 10 });
    expect(res3.mainModel).toBe('cloudflare-ai/@cf/openai/gpt-oss-120b');

    const stats = getProviderStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.groq).toBe(1);
    expect(stats.mistral).toBe(1);
    expect(stats.cloudflare).toBe(1);

    delete process.env.GROQ_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    mockGroq.mockRestore();
    mockMistral.mockRestore();
    mockCF.mockRestore();
  });

  describe('TAREFA 1 & 4 — Validação em Lote Unificado (Opção A)', () => {
    it('deve extrair e segregar entidades para cada item do lote sem cruzamento indevido', () => {
      const batchData = [
        {
          statement: 'Paciente com infarto agudo do miocárdio e dor torácica típica.',
          options: [{ text: 'Ácido acetilsalicílico' }, { text: 'Placebo' }],
          commentary: { correta: 'AAS é antiagregante plaquetário inicial no IAM.' },
        },
        {
          statement: 'Paciente portador de diabetes mellitus tipo 2 em uso de metformina.',
          options: [{ text: 'Glicemia normal' }, { text: 'Insulina' }],
          commentary: { correta: 'Metformina é primeira linha no DM2.' },
        },
        {
          statement: 'Quadro de pneumonia adquirida na comunidade com febre alta e dispneia.',
          options: [{ text: 'Amoxicilina com clavulanato' }],
          commentary: 'Antibioticoterapia para PAC.',
        },
      ];

      const validation = service.runLocalValidation(batchData, 'test-batch');

      expect(validation).toBeDefined();
      expect(validation.totalItems).toBe(3);
      expect(validation.items.length).toBe(3);

      // Item 0 deve conter apenas termos de IAM / cardio
      const item0Terms = validation.items[0].recognizedEntities.map((e) => e.canonicalTerm.toLowerCase());
      expect(item0Terms.some((t) => t.includes('infarto') || t.includes('miocárdio'))).toBe(true);
      expect(item0Terms.some((t) => t.includes('metformina') || t.includes('pneumonia'))).toBe(false);

      // Item 1 deve conter apenas termos de DM2 / endócrino
      const item1Terms = validation.items[1].recognizedEntities.map((e) => e.canonicalTerm.toLowerCase());
      expect(item1Terms.some((t) => t.includes('diabetes') || t.includes('metformina'))).toBe(true);
      expect(item1Terms.some((t) => t.includes('infarto') || t.includes('pneumonia'))).toBe(false);

      // Item 2 deve conter apenas termos de PAC / respiratório
      const item2Terms = validation.items[2].recognizedEntities.map((e) => e.canonicalTerm.toLowerCase());
      expect(item2Terms.some((t) => t.includes('pneumonia') || t.includes('febre') || t.includes('dispneia'))).toBe(true);
      expect(item2Terms.some((t) => t.includes('metformina') || t.includes('infarto'))).toBe(false);
    });

    it('TAREFA 2: deve registrar cachedContentTokenCount no log de TokenUsage', async () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify([{ front: 'Pergunta', back: 'Resposta' }]),
        usageMetadata: {
          promptTokenCount: 150,
          candidatesTokenCount: 50,
          totalTokenCount: 200,
          cachedContentTokenCount: 100,
        },
      });

      await service.executeParallel('prompt', undefined, {
        temperature: 0.2,
        context: 'test-cached-tokens',
      });

      const tokenLogCall = debugSpy.mock.calls.find((call) => call[0] === '[TokenUsage]');
      expect(tokenLogCall).toBeDefined();
      const parsedLog = JSON.parse(tokenLogCall![1]);
      expect(parsedLog.cachedContentTokenCount).toBe(100);
      expect(parsedLog.promptTokenCount).toBe(150);
      expect(parsedLog.candidatesTokenCount).toBe(50);
      expect(parsedLog.totalTokenCount).toBe(200);

      debugSpy.mockRestore();
    });
  });
});
