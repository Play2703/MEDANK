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

  for (const model of models) {
    try {
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
        throw new Error(`Gateway respondeu ${response.status} pro modelo ${model}: ${errBody}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text || !text.trim()) {
        throw new Error(`Modelo ${model} retornou conteúdo vazio.`);
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
    } catch (err) {
      console.warn(`[aiGateway${contextTag}] Falhou no modelo "${model}", tentando o próximo do fallback:`, err);
      lastError = err;
      continue;
    }
  }

  throw new Error(
    `[aiGateway${contextTag}] Todos os modelos do fallback falharam. Último erro: ${lastError?.message || lastError}`
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
