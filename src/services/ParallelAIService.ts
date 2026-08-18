/**
 * Parallel AI Service - Arquitetura Concomitante Otimizada
 * Gemini (Principal Direto) + Validação Local (NER / Dicionário DeCS & CID-10)
 * 9Router (Fallback Estrito com Teto de Timeout)
 */

import { GoogleGenAI } from "@google/genai";
import { generateWithFallback, parseJsonLoose } from "../core/config/aiGateway";
import { retryWithBackoff } from "../core/utils/retryUtils";
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
   * O 9Router é acionado estritamente como fallback apenas se o Gemini falhar após retries.
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
          `[ParallelAI:${context}] ✅ Sucesso via ${geminiResult.model} (Validação local concluída em memória; 9Router não foi necessário)`
        );

        return {
          success: true,
          mainText: geminiResult.text,
          mainData,
          mainModel: geminiResult.model,
          helperText: "",
          helperData: null,
          helperModel: "local-validation",
          localValidation,
        };
      }

      // ══ 3. GEMINI FALHOU -> 9ROUTER ESTREITAMENTE COMO FALLBACK COM TETO DE TEMPO ══
      console.warn(
        `[ParallelAI:${context}] ⚠️ Gemini indisponível após retries (${geminiResult.error}). Acionando 9Router como fallback estrito (teto ${fallbackTimeoutMs}ms)...`
      );

      const routerResult = await this.call9Router(
        helperPrompt || mainPrompt,
        temperature,
        context,
        fallbackTimeoutMs
      );

      if (routerResult.success && routerResult.text) {
        let fallbackData;
        try {
          fallbackData = parseJsonLoose(routerResult.text);
        } catch {
          fallbackData = { content: routerResult.text };
        }

        const localValidation = this.runLocalValidation(fallbackData, context);

        console.log(
          `[ParallelAI:${context}] 🔀 Sucesso via fallback do 9Router (${routerResult.model}) com validação local.`
        );

        return {
          success: true,
          mainText: routerResult.text,
          mainData: fallbackData,
          mainModel: routerResult.model,
          helperText: routerResult.text,
          helperData: fallbackData,
          helperModel: routerResult.model,
          localValidation,
        };
      }

      // ══ 4. AMBOS FALHARAM ══
      console.error(
        `[ParallelAI:${context}] ❌ Todas as estratégias falharam (Gemini retries + 9Router fallback teto ${fallbackTimeoutMs}ms).`
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

      return { success: true, text: r.text || "", model };
    } catch (e: any) {
      console.warn(
        `[ParallelAI:callGemini:${context}] ⚠️ Falha persistente no Gemini após retries:`,
        e.message || String(e)
      );
      return { success: false, text: "", model: "gemini", error: e.message || String(e) };
    }
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
