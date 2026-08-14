import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParallelAIService } from './ParallelAIService';
import * as aiGateway from '../core/config/aiGateway';

describe('ParallelAIService - Resiliência e Fallbacks', () => {
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

  it('deve retornar sucesso com Gemini quando a chamada principal responder corretamente', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify([{ front: 'Pergunta 1', back: 'Resposta 1' }]),
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    });

    const mockRouter = vi.spyOn(aiGateway, 'generateWithFallback').mockResolvedValue({
      text: JSON.stringify({ enriched: true }),
      modelUsed: 'gpt-4o-mini',
    });

    const result = await service.executeParallel('prompt principal', 'prompt helper', {
      temperature: 0.2,
      context: 'test-success',
      initialDelayMs: 10,
    });

    expect(result.success).toBe(true);
    expect(result.mainModel).toContain('gemini');
    expect(result.mainData).toBeDefined();
    mockRouter.mockRestore();
  });

  it('deve realizar retry com backoff e ter sucesso se o Gemini retornar 503 temporário', async () => {
    mockGenerateContent
      .mockRejectedValueOnce({ status: 503, message: 'Gemini overloaded / 503 UNAVAILABLE' })
      .mockResolvedValueOnce({
        text: JSON.stringify({ recuperado: true }),
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
    expect(result.mainData).toEqual({ recuperado: true });
    mockRouter.mockRestore();
  });

  it('deve realizar fallback fluido para o 9Router se o Gemini falhar após esgotar todos os retries', async () => {
    mockGenerateContent.mockRejectedValue({
      status: 503,
      message: 'Persistent 503 Service Unavailable',
    });

    const mockRouter = vi.spyOn(aiGateway, 'generateWithFallback').mockResolvedValue({
      text: JSON.stringify({ fallbackCards: [{ q: 'Q1', a: 'A1' }] }),
      modelUsed: 'claude-3-haiku',
    });

    const result = await service.executeParallel('prompt', 'helper', {
      temperature: 0.2,
      context: 'test-fallback-9router',
      initialDelayMs: 10,
    });

    expect(result.success).toBe(true);
    expect(result.mainModel).toBe('claude-3-haiku');
    expect(result.mainData).toEqual({ fallbackCards: [{ q: 'Q1', a: 'A1' }] });
    expect(mockGenerateContent).toHaveBeenCalledTimes(3); // 3 tentativas antes de desistir
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
