import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateWithFallback, parseJsonLoose } from './aiGateway';

describe('aiGateway - generateWithFallback com Retry, Fallback Sequencial e Teto de Timeout', () => {
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

  it('deve ter sucesso no primeiro modelo e enviar stream: false no requestBody', async () => {
    let capturedBody: any = null;

    // @ts-ignore
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: '{"status":"ok"}' } }],
          usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
        }),
      };
    });

    const result = await generateWithFallback({
      prompt: 'Olá teste',
      context: 'test-first-model',
    });

    expect(result.modelUsed).toBe('model-a');
    expect(result.text).toBe('{"status":"ok"}');
    expect(result.usage?.totalTokenCount).toBe(40);
    expect(capturedBody).toBeDefined();
    expect(capturedBody.stream).toBe(false); // stream: false explicitamente garantido
  });

  it('deve avançar para o próximo modelo do fallback se o primeiro modelo retornar erro 429', async () => {
    // @ts-ignore
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
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
          text: async () => JSON.stringify({
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

  it('deve suportar parsing de resposta Server-Sent Events (SSE data: {...})', async () => {
    const sseResponse = `data: {"id":"1","choices":[{"delta":{"content":"{\\"card\\":\\"ok\\"}"}}]}\n\ndata: [DONE]`;

    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => sseResponse,
    });

    const result = await generateWithFallback({
      prompt: 'SSE teste',
      context: 'test-sse-parsing',
    });

    expect(result.modelUsed).toBe('model-a');
    const parsed = parseJsonLoose(result.text);
    expect(parsed).toEqual({ card: 'ok' });
  });

  it('deve interromper a cascata e lançar erro se o teto maxTotalTimeMs for atingido', async () => {
    // Simula cada modelo demorando 150ms
    // @ts-ignore
    global.fetch = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 150));
      return {
        ok: false,
        status: 503,
        text: async () => '503 Service Unavailable',
      };
    });

    await expect(
      generateWithFallback({
        prompt: 'Erro com timeout rápido',
        context: 'test-timeout-ceiling',
        maxTotalTimeMs: 200, // Teto curto de 200ms
      })
    ).rejects.toThrow(/limite de 200ms atingido/);
  });
});
