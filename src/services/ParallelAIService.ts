/**
 * Parallel AI Service - Arquitetura Concomitante Otimizada
 * Gemini (Principal Direto) + Validação Local (NER / Dicionário DeCS & CID-10)
 * 9Router (Fallback Estrito com Teto de Timeout)
 */

import { GoogleGenAI } from "@google/genai";
import {
  generateWithFallback,
  parseJsonLoose,
  callGroq,
  callMistral,
  callCerebras,
  GatewayGenerateResult,
} from "../core/config/aiGateway";
import { retryWithBackoff, isRetryableError } from "../core/utils/retryUtils";
import { dictionaryNEREngine, MatchedEntity } from "../core/ner/DictionaryNEREngine";

export interface RecognizedMedicalEntity {
  term: string;
  canonicalTerm: string;
  category: string;
  codeSystem?: string | null;
  code?: string | null;
}

export interface LocalValidationItem {
  index: number;
  itemType: "card" | "question" | "general";
  recognizedEntities: RecognizedMedicalEntity[];
  unrecognizedTerms?: string[];
  anchoringConfidence: number; // 0.0 a 1.0
  status: "well_anchored" | "moderate" | "low_anchoring";
}

export interface LocalValidationResult {
  engine: "DictionaryNEREngine (Local SQLite / DeCS & CID-10)";
  validatedAt: string;
  totalItems: number;
  overallConfidence: number;
  totalRecognizedEntities: number;
  items: LocalValidationItem[];
  unrecognizedTermsSummary: string[];
}

export interface ParallelResult {
  success: boolean;
  mainText?: string;
  helperText?: string;
  mainData?: any;
  helperData?: any;
  mainModel?: string;
  helperModel?: string;
  localValidation?: LocalValidationResult;
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  error?: string;
}

export interface ParallelExecutionOptions {
  model?: string;
  temperature?: number;
  context?: string;
  maxRetries?: number;
  initialDelayMs?: number;
  /** Teto de timeout total para o fallback do 9Router em ms (default: 35000) */
  fallbackTimeoutMs?: number;
}

/**
 * Circuit Breaker em memória para cota do Gemini (429 / RESOURCE_EXHAUSTED).
 * Evita que o backend gaste 3 retries e ~10s de espera quando a cota diária já zerou.
 */
let geminiQuotaBlockedUntil = 0;

export function isGeminiQuotaError(error: any): boolean {
  if (!error) return false;
  const status = error?.status || error?.statusCode || error?.response?.status;
  if (status === 429) return true;
  const msg = (
    (typeof error === "string" ? error : error?.message || "") +
    " " +
    (error?.code || "") +
    " " +
    (error?.details || "")
  ).toLowerCase();
  return (
    msg.includes("resource_exhausted") ||
    msg.includes("resource exhausted") ||
    msg.includes("quota") ||
    msg.includes("429") ||
    msg.includes("too many requests")
  );
}

export function extractGeminiRetryDelayMs(error: any, defaultSeconds = 60): number {
  if (!error) return defaultSeconds * 1000;
  const msg = (typeof error === "string" ? error : error?.message || "") + " " + (error?.details || "");
  const match = msg.match(/(?:retry|wait)\s+(?:in|after|for)?\s*([0-9\.]+)\s*(?:s|seconds)/i);
  if (match && match[1]) {
    const sec = parseFloat(match[1]);
    if (!isNaN(sec) && sec > 0) {
      return Math.round(sec * 1000);
    }
  }
  return defaultSeconds * 1000;
}

export function getGeminiQuotaCooldownUntil(): number {
  return geminiQuotaBlockedUntil;
}

export function setGeminiQuotaCooldown(delayMs: number): void {
  geminiQuotaBlockedUntil = Date.now() + delayMs;
}

export function resetGeminiQuotaCooldown(): void {
  geminiQuotaBlockedUntil = 0;
}

export class ParallelAIService {
  private geminiClient: GoogleGenAI | null = null;

  private getGeminiClient(): GoogleGenAI {
    if (!this.geminiClient) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY não configurada. Defina essa variável no arquivo .env.");
      }
      this.geminiClient = new GoogleGenAI({ apiKey });
    }
    return this.geminiClient;
  }

  /**
   * Executa a geração com Gemini como fonte primária ultra-rápida.
   * Se o Gemini tiver sucesso, enriquece via Validação Local (NER/CID-10/DeCS) em <5ms sem chamar APIs externas.
   * Ordem da cascata em caso de indisponibilidade/cota:
   * Gemini (com skip inteligente de 429) -> Groq (7s) -> Mistral (7s) -> Cerebras (7s) -> 9Router.
   */
  async executeParallel(
    mainPrompt: string,
    helperPrompt?: string,
    temperatureOrOptions: number | ParallelExecutionOptions = 0.2,
    contextParam = "generic"
  ): Promise<ParallelResult> {
    const opts: ParallelExecutionOptions =
      typeof temperatureOrOptions === "object"
        ? temperatureOrOptions
        : { temperature: temperatureOrOptions, context: contextParam };

    const temperature = opts.temperature ?? 0.2;
    const context = opts.context ?? contextParam;
    const maxRetries = opts.maxRetries ?? 3;
    const initialDelayMs = opts.initialDelayMs ?? 2000;
    const fallbackTimeoutMs = opts.fallbackTimeoutMs ?? 35000;
    const modelOverride = opts.model;

    try {
      console.log(`[ParallelAI:${context}] 🚀 Executando Gemini como principal...`);

      // ══ 1. GEMINI COMO PRINCIPAL DIRETO ══
      const geminiResult = await this.callGemini(
        mainPrompt,
        temperature,
        context,
        maxRetries,
        initialDelayMs,
        modelOverride
      );

      if (geminiResult.success && geminiResult.text) {
        let mainData;
        try {
          mainData = parseJsonLoose(geminiResult.text);
        } catch {
          mainData = { content: geminiResult.text };
        }

        // ══ 2. VALIDAÇÃO LOCAL ULTRA-RÁPIDA (NER/DeCS/CID-10) ══
        const localValidation = this.runLocalValidation(mainData, context);

        console.log(
          `[ParallelAI:${context}] ✅ Sucesso via ${geminiResult.model} (Validação local concluída em memória; fallbacks não foram necessários)`
        );

        return {
          success: true,
          mainText: geminiResult.text,
          mainData,
          mainModel: geminiResult.model,
          usage: geminiResult.usage,
          helperText: "",
          helperData: null,
          helperModel: "local-validation",
          localValidation,
        };
      }

      // ══ 2. GEMINI FALHOU/PULOU -> CASCATA DE FALLBACK ÁGIL (GROQ -> MISTRAL -> CEREBRAS -> 9ROUTER) ══
      console.warn(
        `[ParallelAI:${context}] ⚠️ Gemini indisponível (${geminiResult.error}). Acionando cascata de fallback: Groq -> Mistral -> Cerebras -> 9Router...`
      );

      const promptToUse = helperPrompt || mainPrompt;

      // 2.1 GROQ (se GROQ_API_KEY estiver no .env)
      if (process.env.GROQ_API_KEY) {
        try {
          console.log(
            `[ParallelAI:${context}] 🔀 Tentando fallback via Groq (${process.env.GROQ_MODEL || "llama-3.1-8b-instant"})...`
          );
          const groqRes = await callGroq(promptToUse, temperature, context, 7000);
          if (groqRes.text) {
            return this.handleFallbackSuccess(groqRes, context);
          }
        } catch (err: any) {
          console.warn(
            `[ParallelAI:${context}] ⚠️ Groq falhou (${err.status || err.message}). Avançando para o próximo fallback...`
          );
        }
      }

      // 2.2 MISTRAL AI (se MISTRAL_API_KEY estiver no .env)
      if (process.env.MISTRAL_API_KEY) {
        try {
          console.log(
            `[ParallelAI:${context}] 🔀 Tentando fallback via Mistral AI (${process.env.MISTRAL_MODEL || "mistral-small-latest"})...`
          );
          const mistralRes = await callMistral(promptToUse, temperature, context, 7000);
          if (mistralRes.text) {
            return this.handleFallbackSuccess(mistralRes, context);
          }
        } catch (err: any) {
          console.warn(
            `[ParallelAI:${context}] ⚠️ Mistral falhou (${err.status || err.message}). Avançando para o próximo fallback...`
          );
        }
      }

      // 2.3 CEREBRAS (se CEREBRAS_API_KEY estiver no .env)
      if (process.env.CEREBRAS_API_KEY) {
        try {
          console.log(
            `[ParallelAI:${context}] 🔀 Tentando fallback via Cerebras (${process.env.CEREBRAS_MODEL || "llama3.1-8b"})...`
          );
          const cerebrasRes = await callCerebras(promptToUse, temperature, context, 7000);
          if (cerebrasRes.text) {
            return this.handleFallbackSuccess(cerebrasRes, context);
          }
        } catch (err: any) {
          console.warn(
            `[ParallelAI:${context}] ⚠️ Cerebras falhou (${err.status || err.message}). Avançando para o 9Router...`
          );
        }
      }

      // 2.4 9ROUTER (Fallback final com timeout curto por modelo)
      const routerResult = await this.call9Router(
        promptToUse,
        temperature,
        context,
        fallbackTimeoutMs
      );

      if (routerResult.success && routerResult.text) {
        return this.handleFallbackSuccess(
          { text: routerResult.text, modelUsed: routerResult.model },
          context
        );
      }

      // ══ 3. TODAS AS ESTRATÉGIAS FALHARAM ══
      console.error(
        `[ParallelAI:${context}] ❌ Todas as estratégias da cascata falharam (Gemini -> Groq -> Mistral -> Cerebras -> 9Router).`
      );
      return {
        success: false,
        error: `[${context}] Falha em todos os provedores de IA. Gemini: ${geminiResult.error} | 9Router: ${routerResult.error}`,
      };
    } catch (error: any) {
      console.error(`[ParallelAI:${context}] Erro inesperado na orquestração de IA:`, error);
      return { success: false, error: error.message || String(error) };
    }
  }

  /**
   * Executa a validação local determinística com base no DictionaryNEREngine.
   * OTIMIZAÇÃO: Combina todos os itens do lote numa única string com delimitador
   * não-ambíguo, executando extractEntities() UMA ÚNICA VEZ por lote em vez de N
   * chamadas síncronas bloqueantes ao SQLite.
   */
  public runLocalValidation(data: any, context = "generic"): LocalValidationResult {
    const rawItems: any[] = Array.isArray(data)
      ? data
      : data?.cards || data?.questions || (data?.content ? [data] : [data]);

    interface ItemSpanMeta {
      index: number;
      itemType: "card" | "question" | "general";
      startOffset: number;
      endOffset: number;
      wordsCount: number;
    }

    const ITEM_BOUNDARY = "\n\n===MEDANKI_ITEM_BOUNDARY===\n\n";
    const itemMetas: ItemSpanMeta[] = [];
    const parts: string[] = [];
    let currentOffset = 0;

    rawItems.forEach((item, index) => {
      if (!item || typeof item !== "object") return;

      const isQuestion = Boolean(item.statement || item.enunciado || item.options || item.alternativas);
      const isCard = Boolean(item.front || item.frente || item.back || item.verso);

      let textToScan = "";
      if (isQuestion) {
        const stmt = item.statement || item.enunciado || "";
        const opts = Array.isArray(item.options)
          ? item.options.map((o: any) => o.text || o.texto || "").join(" ")
          : Array.isArray(item.alternativas)
          ? item.alternativas.join(" ")
          : "";
        const comm =
          typeof item.commentary === "string"
            ? item.commentary
            : item.commentary?.correta || item.comentario || "";
        textToScan = `${stmt} ${opts} ${comm}`.trim();
      } else if (isCard) {
        const front = item.front || item.frente || "";
        const back = item.back || item.verso || "";
        const hint = item.hint || item.dica || "";
        textToScan = `${front} ${back} ${hint}`.trim();
      } else {
        textToScan = JSON.stringify(item);
      }

      const words = textToScan.split(/\s+/).filter((w) => w.length > 2);

      if (parts.length > 0) {
        parts.push(ITEM_BOUNDARY);
        currentOffset += ITEM_BOUNDARY.length;
      }

      const startOffset = currentOffset;
      parts.push(textToScan);
      currentOffset += textToScan.length;
      const endOffset = currentOffset;

      itemMetas.push({
        index,
        itemType: isQuestion ? "question" : isCard ? "card" : "general",
        startOffset,
        endOffset,
        wordsCount: words.length,
      });
    });

    const combinedText = parts.join("");
    const validatedItems: LocalValidationItem[] = [];
    const allUnrecognized: Set<string> = new Set();
    let totalRecognized = 0;

    if (itemMetas.length === 0 || !combinedText.trim()) {
      return {
        engine: "DictionaryNEREngine (Local SQLite / DeCS & CID-10)",
        validatedAt: new Date().toISOString(),
        totalItems: 0,
        overallConfidence: 0.85,
        totalRecognizedEntities: 0,
        items: [],
        unrecognizedTermsSummary: [],
      };
    }

    // ══ EXECUÇÃO ÚNICA DO NER PARA O LOTE INTEIRO ══
    let allMatches: MatchedEntity[] = [];
    try {
      allMatches = dictionaryNEREngine.extractEntities(combinedText);
    } catch (err) {
      allMatches = [];
    }

    const itemRecognized: RecognizedMedicalEntity[][] = itemMetas.map(() => []);

    for (const m of allMatches) {
      const targetMetaIdx = itemMetas.findIndex(
        (meta) => m.startIndex >= meta.startOffset && m.endIndex <= meta.endOffset
      );
      if (targetMetaIdx !== -1) {
        itemRecognized[targetMetaIdx].push({
          term: m.text,
          canonicalTerm: m.normalizedTerm,
          category: m.category,
          codeSystem: m.codeSystem,
          code: m.code,
        });
      }
    }

    itemMetas.forEach((meta, idx) => {
      const recognizedEntities = itemRecognized[idx];
      totalRecognized += recognizedEntities.length;
      const wordsCount = meta.wordsCount;
      const recognizedCount = recognizedEntities.length;

      let anchoringConfidence = 0.5;
      if (wordsCount > 0) {
        const density = recognizedCount / (wordsCount / 10);
        anchoringConfidence = Math.min(1.0, Math.max(0.2, Number((density * 0.5 + 0.3).toFixed(2))));
      }

      let status: "well_anchored" | "moderate" | "low_anchoring" = "moderate";
      if (recognizedCount >= 2 || anchoringConfidence >= 0.7) {
        status = "well_anchored";
      } else if (recognizedCount === 0 && wordsCount > 10) {
        status = "low_anchoring";
      }

      validatedItems.push({
        index: meta.index,
        itemType: meta.itemType,
        recognizedEntities,
        anchoringConfidence,
        status,
      });
    });

    const overallConfidence =
      validatedItems.length > 0
        ? Number(
            (
              validatedItems.reduce((acc, it) => acc + it.anchoringConfidence, 0) /
              validatedItems.length
            ).toFixed(2)
          )
        : 0.85;

    return {
      engine: "DictionaryNEREngine (Local SQLite / DeCS & CID-10)",
      validatedAt: new Date().toISOString(),
      totalItems: validatedItems.length,
      overallConfidence,
      totalRecognizedEntities: totalRecognized,
      items: validatedItems,
      unrecognizedTermsSummary: Array.from(allUnrecognized),
    };
  }

  private async callGemini(
    prompt: string,
    temp: number,
    context = "generic",
    maxRetries = 3,
    initialDelayMs = 2000,
    modelOverride?: string
  ) {
    // Checagem de Circuit Breaker para Cota do Gemini
    if (Date.now() < geminiQuotaBlockedUntil) {
      const waitSeconds = Math.ceil((geminiQuotaBlockedUntil - Date.now()) / 1000);
      console.warn(
        `[ParallelAI:callGemini:${context}] ⏭️ Gemini em cooldown de cota (429) por mais ${waitSeconds}s. Pulando direto para fallback...`
      );
      return {
        success: false,
        text: "",
        model: "gemini",
        error: `Gemini quota em cooldown ativo (${waitSeconds}s restantes)`,
      };
    }

    try {
      const client = this.getGeminiClient();
      const model = modelOverride || process.env.PRIMARY_AI_MODEL || "gemini-3.6-flash";

      const r = await retryWithBackoff(
        async () => {
          const res = await client.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: temp,
            },
          });

          if (!res.text || !res.text.trim()) {
            throw new Error(`Gemini (${model}) retornou texto vazio.`);
          }

          return res;
        },
        {
          maxRetries,
          initialDelayMs,
          maxDelayMs: 8000,
          contextTag: `ParallelAI:Gemini:${context}`,
          isRetryable: (err) => {
            // Se o erro for de cota esgotada (429), aborta retries lentos imediatamente
            if (isGeminiQuotaError(err)) {
              return false;
            }
            return isRetryableError(err);
          },
        }
      );

      if (r.usageMetadata) {
        console.debug(
          "[TokenUsage]",
          JSON.stringify({
            timestamp: new Date().toISOString(),
            context: `parallel-gemini:${context}`,
            endpoint: "ParallelAIService.callGemini",
            model,
            promptTokenCount: r.usageMetadata.promptTokenCount || 0,
            candidatesTokenCount: r.usageMetadata.candidatesTokenCount || 0,
            totalTokenCount: r.usageMetadata.totalTokenCount || 0,
            cachedContentTokenCount: (r.usageMetadata as any).cachedContentTokenCount || 0,
          })
        );
      }

      const usage = r.usageMetadata
        ? {
            promptTokenCount: r.usageMetadata.promptTokenCount || 0,
            candidatesTokenCount: r.usageMetadata.candidatesTokenCount || 0,
            totalTokenCount: r.usageMetadata.totalTokenCount || 0,
            cachedContentTokenCount: (r.usageMetadata as any).cachedContentTokenCount || 0,
          }
        : undefined;

      return { success: true, text: r.text || "", model, usage };
    } catch (e: any) {
      if (isGeminiQuotaError(e)) {
        const cooldownMs = extractGeminiRetryDelayMs(e, 60);
        geminiQuotaBlockedUntil = Date.now() + cooldownMs;
        const cooldownSec = Math.round(cooldownMs / 1000);
        console.warn(
          `[ParallelAI:callGemini:${context}] ⚠️ Quota do Gemini esgotada (429 RESOURCE_EXHAUSTED). Ativando cooldown de ${cooldownSec}s para pular chamadas subsequentes.`
        );
      } else {
        console.warn(
          `[ParallelAI:callGemini:${context}] ⚠️ Falha no Gemini após retries:`,
          e.message || String(e)
        );
      }
      return { success: false, text: "", model: "gemini", error: e.message || String(e) };
    }
  }

  private handleFallbackSuccess(
    result: { text: string; modelUsed: string; usage?: any },
    context: string
  ): ParallelResult {
    let fallbackData;
    try {
      fallbackData = parseJsonLoose(result.text);
    } catch {
      fallbackData = { content: result.text };
    }

    const localValidation = this.runLocalValidation(fallbackData, context);

    console.log(
      `[ParallelAI:${context}] 🔀 Sucesso via fallback (${result.modelUsed}) com validação local.`
    );

    return {
      success: true,
      mainText: result.text,
      mainData: fallbackData,
      mainModel: result.modelUsed,
      usage: result.usage,
      helperText: result.text,
      helperData: fallbackData,
      helperModel: result.modelUsed,
      localValidation,
    };
  }

  private async call9Router(
    prompt: string,
    temp: number,
    context = "generic",
    maxTotalTimeMs = 35000
  ) {
    try {
      const r = await generateWithFallback({
        prompt,
        temperature: temp,
        context: `fallback-9router:${context}`,
        maxTotalTimeMs,
      });
      return { success: true, text: r.text, model: r.modelUsed };
    } catch (e: any) {
      console.warn(
        `[ParallelAI:call9Router:${context}] ⚠️ Falha no 9Router em todos os modelos de fallback:`,
        e.message || String(e)
      );
      return { success: false, text: "", model: "9router", error: e.message || String(e) };
    }
  }

  async generateFlashcardsParallel(
    mainPrompt: string,
    helperPrompt?: string,
    temperatureOrOptions: number | ParallelExecutionOptions = 0.2,
    context = "generate-cards"
  ): Promise<ParallelResult> {
    return this.executeParallel(mainPrompt, helperPrompt, temperatureOrOptions, context);
  }

  async generateQuestionsParallel(
    mainPrompt: string,
    helperPrompt?: string,
    temperatureOrOptions: number | ParallelExecutionOptions = 0.35,
    context = "generate-questions"
  ): Promise<ParallelResult> {
    return this.executeParallel(mainPrompt, helperPrompt, temperatureOrOptions, context);
  }
}

export const parallelAIService = new ParallelAIService();
