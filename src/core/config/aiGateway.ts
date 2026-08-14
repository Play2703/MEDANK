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
    const requestTimeoutMs = Math.min(20000, remainingTimeMs);

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

