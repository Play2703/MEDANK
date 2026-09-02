import { retryWithBackoff } from "../utils/retryUtils";

export const PRIMARY_AI_MODEL = process.env.PRIMARY_AI_MODEL || "gemini-3.6-flash";
export const LIGHT_AI_MODEL = process.env.LIGHT_AI_MODEL || "gemini-3.5-flash-lite";

function getGatewayConfig() {
  const rawModels = (process.env.AI_GATEWAY_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  // Sanitiza modelos descontinuados ou restritos a Enterprise no Groq
  // (ex: groq/llama-3.3-70b-versatile e groq/llama-3.1-8b-instant -> groq/openai/gpt-oss-120b)
  const sanitizedModels = rawModels.map((m) => {
    if (
      m === "groq/llama-3.3-70b-versatile" ||
      m === "llama-3.3-70b-versatile" ||
      m === "groq/llama-3.1-8b-instant" ||
      m === "llama-3.1-8b-instant"
    ) {
      return "groq/openai/gpt-oss-120b";
    }
    return m;
  });

  return {
    baseUrl: process.env.AI_GATEWAY_BASE_URL || "",
    apiKey: process.env.AI_GATEWAY_API_KEY || "",
    models: sanitizedModels,
  };
}

export interface GatewayGenerateOptions {
  prompt: string;
  temperature?: number;
  responseFormat?: "json_object" | "text";
  context?: string;
  /** Teto de tempo total em ms para todo o processo de fallback em cascata (default: 35000 ms) */
  maxTotalTimeMs?: number;
}

export interface GatewayGenerateResult {
  text: string;
  modelUsed: string;
  usage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export async function generateWithFallback(
  options: GatewayGenerateOptions
): Promise<GatewayGenerateResult> {
  const contextTag = options.context ? `:${options.context}` : "";
  const { baseUrl, apiKey, models } = getGatewayConfig();
  const maxTotalTimeMs = options.maxTotalTimeMs ?? 35000;
  const startTime = Date.now();

  if (!baseUrl || !apiKey) {
    throw new Error(
      `[aiGateway${contextTag}] AI_GATEWAY_BASE_URL ou AI_GATEWAY_API_KEY não configurados. Defina essas env vars apontando pro seu 9router.`
    );
  }
  if (models.length === 0) {
    throw new Error(
      `[aiGateway${contextTag}] AI_GATEWAY_MODELS não configurado — defina no .env a lista de modelos do 9Router, separados por vírgula.`
    );
  }

  let lastError: any = null;

  for (let mIdx = 0; mIdx < models.length; mIdx++) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= maxTotalTimeMs) {
      console.warn(
        `[aiGateway${contextTag}] ⏱️ Teto de tempo total (${maxTotalTimeMs}ms) excedido (${elapsed}ms decorridos). Interrompendo cascata no modelo ${mIdx + 1}/${models.length}.`
      );
      break;
    }

    const model = models[mIdx];
    const modelContext = `9router:${model}${contextTag}`;
    const remainingTimeMs = Math.max(3000, maxTotalTimeMs - (Date.now() - startTime));
    // Timeout curto de 7s por modelo para falhar rápido e avançar na lista sem travar a requisição
    const requestTimeoutMs = Math.min(7000, remainingTimeMs);

    try {
      // 1 tentativa por modelo com timeout proporcional para permitir cascata fluida dentro do teto
      const result = await retryWithBackoff(
        async () => {
          const format = options.responseFormat ?? "json_object";
          const requestBody: any = {
            model,
            messages: [{ role: "user", content: options.prompt }],
            temperature: options.temperature ?? 0.2,
            stream: false, // Força desativação explícita de Server-Sent Events (SSE)
          };
          if (format === "json_object") {
            requestBody.response_format = { type: "json_object" };
          }

          const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(requestTimeoutMs),
          });

          if (!response.ok) {
            const errBody = await response.text().catch(() => "");
            const status = response.status;
            const errObj: any = new Error(`Gateway respondeu HTTP ${status} para o modelo "${model}": ${errBody}`);
            errObj.status = status;
            errObj.statusCode = status;
            throw errObj;
          }

          const rawText = await response.text();
          let text = "";
          let usageMetadata: any = undefined;

          // Suporta tanto JSON padrão quanto resposta Server-Sent Events (data: {...}) caso o provedor force SSE
          if (rawText.trim().startsWith("data:") || rawText.includes("\ndata:")) {
            const parsed = parseJsonLoose(rawText);
            if (parsed && typeof parsed === "object") {
              text = typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed);
            } else {
              text = String(parsed || "");
            }
          } else {
            const data = JSON.parse(rawText);
            text = data?.choices?.[0]?.message?.content || "";
            if (data?.usage) {
              usageMetadata = {
                promptTokenCount: data.usage.prompt_tokens || 0,
                candidatesTokenCount: data.usage.completion_tokens || 0,
                totalTokenCount: data.usage.total_tokens || 0,
              };
            }
          }

          if (!text || !text.trim()) {
            throw new Error(`Modelo "${model}" retornou conteúdo vazio.`);
          }

          if (usageMetadata) {
            console.debug(
              "[TokenUsage]",
              JSON.stringify({
                timestamp: new Date().toISOString(),
                context: options.context || "aiGateway.generateWithFallback",
                endpoint: "aiGateway.generateWithFallback",
                model,
                ...usageMetadata,
              })
            );
          }

          return { text, modelUsed: model, usage: usageMetadata };
        },
        {
          maxRetries: 1, // 1 tentativa por modelo para transição ágil na lista de fallback
          initialDelayMs: 1000,
          contextTag: modelContext,
        }
      );

      return result;
    } catch (err: any) {
      lastError = err;
      const isLastModel = mIdx === models.length - 1;
      if (!isLastModel) {
        console.warn(
          `[aiGateway${contextTag}] 🔄 Modelo "${model}" falhou (${err.status || err.message}). Avançando para o próximo modelo do fallback ("${models[mIdx + 1]}")...`
        );
      } else {
        console.error(`[aiGateway${contextTag}] ❌ Último modelo testado do fallback ("${model}") falhou.`);
      }
      continue;
    }
  }

  throw new Error(
    `[aiGateway${contextTag}] Todos os modelos do fallback falharam (ou limite de ${maxTotalTimeMs}ms atingido). Último erro: ${lastError?.message || lastError}`
  );
}

// ══ HELPER GENÉRICO PARA PROVEDORES COMPATÍVEIS COM OPENAI (GROQ, MISTRAL, CEREBRAS) ══

export interface OpenAICompatibleConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
}

export async function callOpenAICompatible(
  config: OpenAICompatibleConfig,
  prompt: string,
  temperature = 0.2,
  contextTag = ""
): Promise<GatewayGenerateResult> {
  const timeoutMs = config.timeoutMs ?? 7000;
  const format = config.responseFormat ?? "json_object";
  const requestBody: any = {
    model: config.model,
    messages: [{ role: "user", content: prompt }],
    temperature,
    stream: false,
  };
  if (config.maxTokens) {
    requestBody.max_tokens = config.maxTokens;
  }
  if (format === "json_object") {
    requestBody.response_format = { type: "json_object" };
  }

  const endpoint = config.baseUrl.endsWith("/chat/completions")
    ? config.baseUrl
    : `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    const status = response.status;
    const errObj: any = new Error(
      `[${config.name}${contextTag ? `:${contextTag}` : ""}] HTTP ${status} para "${config.model}": ${errBody}`
    );
    errObj.status = status;
    errObj.statusCode = status;
    throw errObj;
  }

  const rawText = await response.text();
  let text = "";
  let usageMetadata: any = undefined;

  if (rawText.trim().startsWith("data:") || rawText.includes("\ndata:")) {
    const parsed = parseJsonLoose(rawText);
    if (parsed && typeof parsed === "object") {
      text = typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed);
    } else {
      text = String(parsed || "");
    }
  } else {
    const data = JSON.parse(rawText);
    text = data?.choices?.[0]?.message?.content || "";
    if (data?.usage) {
      usageMetadata = {
        promptTokenCount: data.usage.prompt_tokens || 0,
        candidatesTokenCount: data.usage.completion_tokens || 0,
        totalTokenCount: data.usage.total_tokens || 0,
      };
    }
  }

  if (!text || !text.trim()) {
    throw new Error(
      `[${config.name}${contextTag ? `:${contextTag}` : ""}] Modelo "${config.model}" retornou conteúdo vazio.`
    );
  }

  return {
    text,
    modelUsed: `${config.name}/${config.model}`,
    usage: usageMetadata,
  };
}

export async function callGroq(
  prompt: string,
  temperature = 0.2,
  context = "",
  timeoutMs = 7000
): Promise<GatewayGenerateResult> {
  const apiKey = process.env.GROQ_API_KEY || "";
  if (!apiKey) throw new Error("GROQ_API_KEY não configurada.");
  const baseUrl = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

  const models = (
    process.env.GROQ_MODELS
      ? process.env.GROQ_MODELS.split(",").map((m) => m.trim())
      : [process.env.GROQ_MODEL || "openai/gpt-oss-120b", "openai/gpt-oss-20b"]
  ).filter(Boolean);

  let lastError: any = null;
  for (const model of models) {
    try {
      return await callOpenAICompatible(
        { name: "groq", baseUrl, apiKey, model, timeoutMs, maxTokens: 3000 },
        prompt,
        temperature,
        context
      );
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[Groq${context ? `:${context}` : ""}] ⚠️ Modelo "${model}" falhou (${err.status || err.message}). Tentando próximo modelo Groq...`
      );
    }
  }

  throw new Error(`Groq: todos os modelos disponíveis falharam. Último erro: ${lastError?.message || lastError}`);
}

let cachedMistralModel: { id: string; fetchedAt: number } | null = null;
const MISTRAL_MODEL_CACHE_TTL = 60 * 60 * 1000; // 1h

export function resetMistralModelCache(): void {
  cachedMistralModel = null;
}

export async function resolveMistralModel(
  baseUrl = "https://api.mistral.ai/v1",
  apiKey = ""
): Promise<string> {
  // Se houver MISTRAL_MODEL forçado no env, respeita
  if (process.env.MISTRAL_MODEL) {
    return process.env.MISTRAL_MODEL;
  }

  const now = Date.now();

  // Reusa o cache se ainda estiver dentro do TTL
  if (cachedMistralModel && now - cachedMistralModel.fetchedAt < MISTRAL_MODEL_CACHE_TTL) {
    return cachedMistralModel.id;
  }

  try {
    const key = apiKey || process.env.MISTRAL_API_KEY || "";
    if (!key) return "mistral-small-latest";

    const endpoint = `${baseUrl.replace(/\/+$/, "")}/models`;
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Falha ao listar modelos Mistral (${response.status})`);
    }

    const data = await response.json();
    const modelIds: string[] = (data?.data || []).map((m: { id: string }) => m.id);

    // Prioriza IDs versionados de "small" (mais estável que aliases -latest),
    // pegando o mais recente (maior data no ID, ex: 2506 ou 2409)
    const versionedSmall = modelIds
      .filter((id) => /^mistral-small-\d{4}$/.test(id))
      .sort()
      .pop();

    const resolved =
      versionedSmall ??
      modelIds.find((id) => id === "mistral-small-latest") ??
      modelIds.find((id) => id.startsWith("mistral-small"));

    if (!resolved) {
      throw new Error("Nenhum modelo 'mistral-small*' encontrado na lista da Mistral");
    }

    cachedMistralModel = { id: resolved, fetchedAt: now };
    console.log(`[Mistral] Modelo resolvido dinamicamente: ${resolved}`);
    return resolved;
  } catch (err: any) {
    // Fallback de segurança: se a listagem falhar, usa o alias conhecido
    console.warn(
      `⚠️ Falha ao resolver modelo Mistral dinamicamente, usando fallback: ${err?.message || String(err)}`
    );
    return "mistral-small-latest";
  }
}

export async function callMistral(
  prompt: string,
  temperature = 0.2,
  context = "",
  timeoutMs = 7000
): Promise<GatewayGenerateResult> {
  const apiKey = process.env.MISTRAL_API_KEY || "";
  if (!apiKey) throw new Error("MISTRAL_API_KEY não configurada.");
  const baseUrl = process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1";
  const model = await resolveMistralModel(baseUrl, apiKey);

  try {
    return await callOpenAICompatible(
      { name: "mistral", baseUrl, apiKey, model, timeoutMs, maxTokens: 3000 },
      prompt,
      temperature,
      context
    );
  } catch (err: any) {
    // Se o modelo cacheado passou a ser inválido (404/400), invalida o cache pra forçar nova resolução na próxima chamada
    if (err.status === 404 || err.status === 400 || err.statusCode === 404 || err.statusCode === 400) {
      cachedMistralModel = null;
    }
    throw err;
  }
}

export async function callCerebras(
  prompt: string,
  temperature = 0.2,
  context = "",
  timeoutMs = 7000
): Promise<GatewayGenerateResult> {
  const apiKey = process.env.CEREBRAS_API_KEY || "";
  if (!apiKey) throw new Error("CEREBRAS_API_KEY não configurada.");
  const baseUrl = process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1";
  const model = process.env.CEREBRAS_MODEL || "llama3.1-8b";
  return callOpenAICompatible(
    { name: "cerebras", baseUrl, apiKey, model, timeoutMs },
    prompt,
    temperature,
    context
  );
}

export function parseJsonLoose(rawText: string): any {
  if (!rawText || !rawText.trim()) return null;
  let text = rawText.trim();

  // Tratamento para Server-Sent Events (SSE) que começam com "data: "
  if (text.startsWith("data:") || text.includes("\ndata:")) {
    const dataLines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:") && line !== "data: [DONE]")
      .map((line) => line.replace(/^data:\s*/, ""));

    // Tenta obter o texto consolidado a partir dos deltas do stream
    let aggregatedContent = "";
    for (const line of dataLines) {
      try {
        const p = JSON.parse(line);
        const delta = p?.choices?.[0]?.delta?.content || p?.choices?.[0]?.message?.content || "";
        aggregatedContent += delta;
      } catch {
        // Ignora linha inválida
      }
    }

    if (aggregatedContent.trim()) {
      return parseJsonLoose(aggregatedContent);
    }
  }

  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return JSON.parse(cleaned);
  }
}

