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

  it('deve filtrar modelos groq do 9Router para não desperdiçar tentativas redundantes', async () => {
    process.env.AI_GATEWAY_MODELS = 'groq/openai/gpt-oss-120b,mistralai/mistral-small-24b';

    let requestedModel = '';
    // @ts-ignore
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);
      requestedModel = body.model;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
      };
    });

    const result = await generateWithFallback({
      prompt: 'Teste sanitização',
    });

    expect(requestedModel).toBe('mistralai/mistral-small-24b');
    expect(result.modelUsed).toBe('mistralai/mistral-small-24b');
  });

  it('callGroq: deve utilizar openai/gpt-oss-120b para chamadas em json_object mode', async () => {
    process.env.GROQ_API_KEY = 'groq_test_key';
    const triedModels: string[] = [];

    // @ts-ignore
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);
      triedModels.push(body.model);

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
      };
    });

    const { callGroq } = await import('./aiGateway');
    const result = await callGroq('Olá Groq');

    expect(triedModels).toEqual(['openai/gpt-oss-120b']);
    expect(result.modelUsed).toBe('groq/openai/gpt-oss-120b');
    expect(result.text).toBe('{"ok":true}');

    delete process.env.GROQ_API_KEY;
  });

  it('resolveMistralModel: deve resolver dinamicamente o modelo versionado mais recente de mistral-small', async () => {
    process.env.MISTRAL_API_KEY = 'mistral_test_key';
    const { resolveMistralModel, resetMistralModelCache } = await import('./aiGateway');
    resetMistralModelCache();

    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'mistral-tiny' },
          { id: 'mistral-small-2402' },
          { id: 'mistral-small-2506' },
          { id: 'mistral-small-latest' },
          { id: 'mistral-large-2407' },
        ],
      }),
    });

    const resolved = await resolveMistralModel();
    expect(resolved).toBe('mistral-small-2506'); // Versionado mais recente

    delete process.env.MISTRAL_API_KEY;
    resetMistralModelCache();
  });

  it('callCloudflareAI: deve chamar o endpoint do Cloudflare Workers AI com a autenticação e modelo corretos', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'cf_acc_123';
    process.env.CLOUDFLARE_API_TOKEN = 'cf_tok_456';

    let calledUrl = '';
    let authHeader = '';
    let requestedModel = '';

    // @ts-ignore
    global.fetch = vi.fn().mockImplementation(async (url, options) => {
      calledUrl = String(url);
      authHeader = options.headers['Authorization'];
      const body = JSON.parse(options.body);
      requestedModel = body.model;

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: '{"cf":true}' } }],
        }),
      };
    });

    const { callCloudflareAI } = await import('./aiGateway');
    const result = await callCloudflareAI('Pergunta Cloudflare');

    expect(calledUrl).toBe('https://api.cloudflare.com/client/v4/accounts/cf_acc_123/ai/v1/chat/completions');
    expect(authHeader).toBe('Bearer cf_tok_456');
    expect(requestedModel).toBe('@cf/openai/gpt-oss-120b');
    expect(result.modelUsed).toBe('cloudflare-ai/@cf/openai/gpt-oss-120b');
    expect(result.text).toBe('{"cf":true}');

    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
  });
});
