import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateWithFallback } from './aiGateway';

describe('aiGateway - generateWithFallback com Retry e Fallback Sequencial', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      AI_GATEWAY_BASE_URL: 'https://test-9router.com',
      AI_GATEWAY_API_KEY: 'test_token',
      AI_GATEWAY_MODELS: 'model-a,model-b,model-c',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('deve ter sucesso no primeiro modelo quando a resposta for 200 OK', async () => {
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"status":"ok"}' } }],
        usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
      }),
    });

    const result = await generateWithFallback({
      prompt: 'Olá teste',
      context: 'test-first-model',
    });

    expect(result.modelUsed).toBe('model-a');
    expect(result.text).toBe('{"status":"ok"}');
    expect(result.usage?.totalTokenCount).toBe(40);
  });

  it('deve avançar para o próximo modelo do fallback se o primeiro modelo retornar erro 429', async () => {
    let callCount = 0;
    // @ts-ignore
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      callCount++;
      const body = JSON.parse(options.body);

      if (body.model === 'model-a') {
        return {
          ok: false,
          status: 429,
          text: async () => 'Rate limit exceeded for model-a',
        };
      }

      if (body.model === 'model-b') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: '{"recovered":true}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          }),
        };
      }

      throw new Error('Unexpected call');
    });

    const result = await generateWithFallback({
      prompt: 'Fallback teste',
      context: 'test-fallback-model',
    });

    expect(result.modelUsed).toBe('model-b');
    expect(result.text).toBe('{"recovered":true}');
  });

  it('deve falhar e lançar exceção se todos os modelos da lista falharem', async () => {
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '503 Service Unavailable',
    });

    await expect(
      generateWithFallback({
        prompt: 'Erro total',
        context: 'test-all-failed',
      })
    ).rejects.toThrow(/Todos os 3 modelos do fallback falharam/);
  });
});
