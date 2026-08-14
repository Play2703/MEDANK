/**
 * Parallel AI Service - Arquitetura Concomitante
 * Gemini (Principal) + 9Router (Ajudante)
 */

import { GoogleGenAI } from "@google/genai";
import { generateWithFallback, parseJsonLoose } from "../core/config/aiGateway";
import { retryWithBackoff } from "../core/utils/retryUtils";

export interface ParallelResult {
  success: boolean;
  mainText?: string;
  helperText?: string;
  mainData?: any;
  helperData?: any;
  mainModel?: string;
  helperModel?: string;
  error?: string;
}

export interface ParallelExecutionOptions {
  temperature?: number;
  context?: string;
  maxRetries?: number;
  initialDelayMs?: number;
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

  async executeParallel(
    mainPrompt: string,
    helperPrompt: string,
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

    try {
      console.log(`[ParallelAI:${context}] 🚀 Iniciando chamadas com resiliência (Gemini principal + 9Router)...`);

      // ══ AMBAS AS CHAMADAS EM PARALELO COM RETRY AUTOMÁTICO ══
      const geminiPromise = this.callGemini(mainPrompt, temperature, context, maxRetries, initialDelayMs);
      const routerPromise = this.call9Router(helperPrompt, temperature, context);


      const [geminiResult, routerResult] = await Promise.allSettled([geminiPromise, routerPromise]);

      let mainText = "";
      let mainModel = "gemini-3.6-flash";
      let helperText = "";
      let helperModel = "";

      if (geminiResult.status === "fulfilled" && geminiResult.value.success) {
        mainText = geminiResult.value.text;
        mainModel = geminiResult.value.model;
      }

      if (routerResult.status === "fulfilled" && routerResult.value.success) {
        helperText = routerResult.value.text;
        helperModel = routerResult.value.model;
      }

      // Se o Gemini falhou após retries mas o 9Router teve sucesso -> Fallback fluído para o 9Router
      if (!mainText && helperText) {
        console.log(
          `[ParallelAI:${context}] 🔀 Gemini indisponível após retries. Utilizando resposta do 9Router (${helperModel}) como fallback transparente.`
        );
        let helperFallbackData;
        try {
          helperFallbackData = parseJsonLoose(helperText);
        } catch {
          helperFallbackData = { content: helperText };
        }
        return {
          success: true,
          mainText: helperText,
          mainModel: helperModel || "9router-fallback",
          helperText: "",
          mainData: helperFallbackData,
          helperData: null,
          helperModel: "",
        };
      }

      // Se ambos os canais falharam esgotados
      if (!mainText) {
        const geminiErr =
          geminiResult.status === "rejected"
            ? geminiResult.reason?.message
            : geminiResult.status === "fulfilled" && !geminiResult.value.success
            ? geminiResult.value.error
            : "Gemini indisponível";
        const routerErr =
          routerResult.status === "rejected"
            ? routerResult.reason?.message
            : routerResult.status === "fulfilled" && !routerResult.value.success
            ? routerResult.value.error
            : "9Router indisponível";
        console.error(`[ParallelAI:${context}] ❌ Todas as tentativas de IA falharam (Gemini + 9Router).`);
        return {
          success: false,
          error: `[${context}] Falha em todos os provedores de IA. Gemini: ${geminiErr} | 9Router: ${routerErr}`,
        };
      }

      let mainData;
      try {
        mainData = parseJsonLoose(mainText);
      } catch {
        mainData = { content: mainText };
      }

      let helperData;
      if (helperText) {
        try {
          helperData = parseJsonLoose(helperText);
        } catch {
          helperData = { raw: helperText };
        }
      }

      console.log(`[ParallelAI:${context}] ✅ Sucesso via ${mainModel} (helper: ${helperModel || "none"})`);

      return {
        success: true,
        mainText,
        helperText,
        mainData,
        helperData,
        mainModel,
        helperModel,
      };
    } catch (error: any) {
      console.error(`[ParallelAI:${context}] Erro inesperado na orquestração paralela:`, error);
      return { success: false, error: error.message || String(error) };
    }
  }

  private async callGemini(prompt: string, temp: number, context = "generic", maxRetries = 3, initialDelayMs = 2000) {
    try {
      const client = this.getGeminiClient();
      const model = process.env.PRIMARY_AI_MODEL || "gemini-3.6-flash";

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
          })
        );
      }

      return { success: true, text: r.text || "", model };
    } catch (e: any) {
      console.warn(`[ParallelAI:callGemini:${context}] ⚠️ Falha persistente no Gemini após retries:`, e.message || String(e));
      return { success: false, text: "", model: "gemini", error: e.message || String(e) };
    }
  }

  private async call9Router(prompt: string, temp: number, context = "generic") {
    try {
      const r = await generateWithFallback({ prompt, temperature: temp, context: `parallel-9router:${context}` });
      return { success: true, text: r.text, model: r.modelUsed };
    } catch (e: any) {
      console.warn(`[ParallelAI:call9Router:${context}] ⚠️ Falha no 9Router em todos os modelos:`, e.message || String(e));
      return { success: false, text: "", model: "9router", error: e.message || String(e) };
    }
  }

  async generateFlashcardsParallel(
    mainPrompt: string,
    helperPrompt?: string,
    temperatureOrOptions: number | ParallelExecutionOptions = 0.2,
    context = "generate-cards"
  ): Promise<ParallelResult> {
    const hPrompt = helperPrompt || `Valide e enriqueça este material para flashcards:\n${mainPrompt.slice(0, 1000)}`;
    return this.executeParallel(mainPrompt, hPrompt, temperatureOrOptions, context);
  }

  async generateQuestionsParallel(
    mainPrompt: string,
    helperPrompt?: string,
    temperatureOrOptions: number | ParallelExecutionOptions = 0.35,
    context = "generate-questions"
  ): Promise<ParallelResult> {
    const hPrompt = helperPrompt || `Valide e enriqueça estas questões médicas:\n${mainPrompt.slice(0, 1000)}`;
    return this.executeParallel(mainPrompt, hPrompt, temperatureOrOptions, context);
  }
}

export const parallelAIService = new ParallelAIService();

