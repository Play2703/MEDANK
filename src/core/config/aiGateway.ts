import { retryWithBackoff } from "../utils/retryUtils";

export const PRIMARY_AI_MODEL = process.env.PRIMARY_AI_MODEL || "gemini-3.6-flash";
export const LIGHT_AI_MODEL = process.env.LIGHT_AI_MODEL || "gemini-2.5-flash-lite";

function getGatewayConfig() {
  return {
    baseUrl: process.env.AI_GATEWAY_BASE_URL || "",
    apiKey: process.env.AI_GATEWAY_API_KEY || "",
    models: (process.env.AI_GATEWAY_MODELS || "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
  };
}

export interface GatewayGenerateOptions {
  prompt: string;
  temperature?: number;
  responseFormat?: "json_object" | "text";
  context?: string;
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
    const model = models[mIdx];
    const modelContext = `9router:${model}${contextTag}`;

    try {
      // Executa o modelo atual com retry e backoff automático para 503 / 429 transitórios
      const result = await retryWithBackoff(
        async () => {
          const format = options.responseFormat ?? "json_object";
          const requestBody: any = {
            model,
            messages: [{ role: "user", content: options.prompt }],
            temperature: options.temperature ?? 0.2,
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
            signal: AbortSignal.timeout(45000),
          });

          if (!response.ok) {
            const errBody = await response.text().catch(() => "");
            const status = response.status;
            const errObj: any = new Error(`Gateway respondeu HTTP ${status} para o modelo "${model}": ${errBody}`);
            errObj.status = status;
            errObj.statusCode = status;
            throw errObj;
          }

          const data = await response.json();
          const text = data?.choices?.[0]?.message?.content;
          if (!text || !text.trim()) {
            throw new Error(`Modelo "${model}" retornou conteúdo vazio.`);
          }

          const usageMetadata = data?.usage
            ? {
                promptTokenCount: data.usage.prompt_tokens || 0,
                candidatesTokenCount: data.usage.completion_tokens || 0,
                totalTokenCount: data.usage.total_tokens || 0,
              }
            : undefined;

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
          maxRetries: 2, // Até 2 tentativas rápidas com backoff antes de avançar para o próximo modelo do fallback
          initialDelayMs: 1500,
          contextTag: modelContext,
        }
      );

      return result;
    } catch (err: any) {
      lastError = err;
      const isLastModel = mIdx === models.length - 1;
      if (!isLastModel) {
        console.warn(
          `[aiGateway${contextTag}] 🔄 Modelo "${model}" falhou (${err.status || err.message}). Isolando erro e avançando para o próximo modelo da lista de fallback ("${models[mIdx + 1]}")...`
        );
      } else {
        console.error(`[aiGateway${contextTag}] ❌ Último modelo do fallback ("${model}") falhou.`);
      }
      continue;
    }
  }

  throw new Error(
    `[aiGateway${contextTag}] Todos os ${models.length} modelos do fallback falharam. Último erro: ${lastError?.message || lastError}`
  );
}

export function parseJsonLoose(rawText: string): any {

  try {
    return JSON.parse(rawText);
  } catch {
    const cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  }
}
