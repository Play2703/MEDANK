import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParallelAIService } from './ParallelAIService';
import * as aiGateway from '../core/config/aiGateway';

describe('ParallelAIService - Arquitetura Otimizada (Gemini Principal + Validação Local)', () => {
  let service: ParallelAIService;
  let mockGenerateContent: any;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('Fallback: se o Gemini falhar após todos os retries, aciona o 9Router com teto de timeout', async () => {
    mockGenerateContent.mockRejectedValue({
      status: 503,
      message: 'Persistent 503 Service Unavailable',
    });

    const mockRouter = vi.spyOn(aiGateway, 'generateWithFallback').mockResolvedValue({
      text: JSON.stringify([{ front: 'Card Fallback', back: 'Resposta Fallback' }]),
      modelUsed: 'claude-3-haiku',
    });

    const result = await service.executeParallel('prompt', 'helper', {
      temperature: 0.2,
      context: 'test-fallback-9router',
      initialDelayMs: 10,
      fallbackTimeoutMs: 30000,
    });

    expect(result.success).toBe(true);
    expect(result.mainModel).toBe('claude-3-haiku');
    expect(result.helperModel).toBe('claude-3-haiku');
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    expect(mockRouter).toHaveBeenCalledTimes(1);
    expect(mockRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTotalTimeMs: 30000,
      })
    );

    mockRouter.mockRestore();
  });

  it('deve retornar erro fatal se Gemini e 9Router falharem esgotados', async () => {
    mockGenerateContent.mockRejectedValue({
      status: 503,
      message: 'Gemini down',
    });

    const mockRouter = vi.spyOn(aiGateway, 'generateWithFallback').mockRejectedValue(
      new Error('9Router 429 quota exhausted on all models')
    );

    const result = await service.executeParallel('prompt', 'helper', {
      temperature: 0.2,
      context: 'test-all-failed',
      initialDelayMs: 10,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Falha em todos os provedores de IA');
    expect(result.error).toContain('Gemini');
    expect(result.error).toContain('9Router');

    mockRouter.mockRestore();
  });
});
