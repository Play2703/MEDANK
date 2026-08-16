import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { generateWithFallback, parseJsonLoose, LIGHT_AI_MODEL } from "./src/core/config/aiGateway";
import { mapWithConcurrency } from "./src/core/utils/asyncUtils";
import { retryWithBackoff } from "./src/core/utils/retryUtils";
import { parallelAIService } from "./src/services/ParallelAIService";

import { PDFExamRenderService } from "./src/services/PDFExamRenderService";
import { interpretExamDNA } from "./src/core/medcore_kernel/engines/ExamDNAInterpreter";
import { professorEngine } from "./src/core/medcore_kernel/engines/ProfessorEngine";

import { localEmbeddingClient } from "./src/data/services/embeddings/LocalEmbeddingClient";
import { LOCAL_EMBEDDING_CONFIG } from "./src/data/services/embeddings/localEmbeddingConfig";
import { hybridNEREngine } from "./src/core/ner/HybridNEREngine";
import { dictionaryNEREngine, getTerminologyDb, getDbPath } from "./src/core/ner/DictionaryNEREngine";

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY environment variable is not defined. Crie um arquivo .env na raiz com GEMINI_API_KEY=sua_chave_aqui."
      );
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors({
    origin: [
      "capacitor://localhost",
      "ionic://localhost",
      "http://localhost",
      "https://localhost",
      "https://medank.onrender.com",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));

  app.use(express.json({ limit: "10mb" }));

  // API Health check
  app.get("/api/health", (_req, res) => {
    const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY);
    res.json({ status: "ok", app: "MedAnki", geminiConfigured: hasKey });
  });

  // Dictionary Health endpoint (for Developer Console)
  app.get("/api/dictionary-health", (_req, res) => {
    try {
      const db = getTerminologyDb();
      if (!db) {
        return res.status(503).json({
          success: false,
          error: "Dicionário médico SQLite não inicializado ou inacessível no servidor.",
          totalTerms: 0,
          termsBySystem: [],
          graphNodes: 0,
          graphEdges: 0,
          topPredicates: [],
          lastUpdated: null,
          dbSizeBytes: 0,
        });
      }

      const totalTerms = (db.prepare('SELECT COUNT(*) as count FROM terms').get() as any)?.count ?? 0;
      const termsBySystem = db.prepare(`
        SELECT COALESCE(system, 'SEM_SISTEMA') as system, COUNT(*) as count
        FROM terms GROUP BY system ORDER BY count DESC
      `).all();

      let graphNodes = 0;
      let graphEdges = 0;
      let edgesByPredicate: any[] = [];

      try {
        graphNodes = (db.prepare('SELECT COUNT(*) as count FROM graph_nodes').get() as any)?.count ?? 0;
      } catch {
        graphNodes = 0;
      }

      try {
        graphEdges = (db.prepare('SELECT COUNT(*) as count FROM graph_edges').get() as any)?.count ?? 0;
        edgesByPredicate = db.prepare(`
          SELECT predicate, COUNT(*) as count FROM graph_edges GROUP BY predicate ORDER BY count DESC LIMIT 10
        `).all();
      } catch {
        graphEdges = 0;
        edgesByPredicate = [];
      }

      const dbPath = getDbPath();
      let lastUpdated: string | null = null;
      let dbSizeBytes = 0;

      if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        lastUpdated = stats.mtime.toISOString();
        dbSizeBytes = stats.size;
      }

      res.json({
        success: true,
        totalTerms,
        termsBySystem,
        graphNodes,
        graphEdges,
        topPredicates: edgesByPredicate,
        lastUpdated,
        dbSizeBytes,
      });
    } catch (err: any) {
      console.error("[server] Erro em /api/dictionary-health:", err);
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // REAL Embedding Endpoint (Gemini gemini-embedding-001 with outputDimensionality: 768, batching and rate limit throttling)
  app.post("/api/embeddings", async (req, res) => {
    try {
      const contents = req.body.contents || req.body.text || req.body.texts;

      if (!contents) {
        return res.status(400).json({ error: "O conteúdo para embedding é obrigatório." });
      }

      const inputList: string[] = Array.isArray(contents) ? contents : [contents];
      const ai = getGeminiClient();

      const allEmbeddings: number[][] = [];
      const BATCH_SIZE = 15;
      const EMBED_CONCURRENCY = parseInt(process.env.EMBED_CONCURRENCY || "5", 10) || 5;

      for (let i = 0; i < inputList.length; i += BATCH_SIZE) {
        const batch = inputList.slice(i, i + BATCH_SIZE);
        
        const batchResults = await mapWithConcurrency(batch, EMBED_CONCURRENCY, async (textChunk) => {
          let attempts = 0;
          let success = false;
          let embeddingValues: number[] = [];

          while (attempts < 3 && !success) {
            try {
              attempts++;
              const response = await ai.models.embedContent({
                model: "gemini-embedding-001",
                contents: textChunk,
                config: {
                  outputDimensionality: 768,
                },
              });

              if (response.embeddings && response.embeddings.length > 0 && response.embeddings[0].values) {
                embeddingValues = response.embeddings[0].values;
                success = true;
              }
            } catch (err: any) {
              const isQuotaErr = err.status === 429 || (err.message && (err.message.includes("429") || err.message.includes("RESOURCE_EXHAUSTED")));
              const enableFallback = process.env.ENABLE_9ROUTER_FALLBACK_FOR_EMBEDDINGS === "true";

              if (isQuotaErr && enableFallback) {
                console.warn("[aiGateway:seed-build:embeddings-fallback] Cota do Gemini excedida. O 9Router (/v1/chat/completions) não gera vetores de embedding. Recorrendo ao localEmbeddingClient (transformers.js)...");
                try {
                  const localVectors = await localEmbeddingClient.generateEmbeddings([textChunk]);
                  if (localVectors && localVectors.length > 0) {
                    embeddingValues = localVectors[0];
                    success = true;
                    break;
                  }
                } catch (locErr: any) {
                  console.error("[Embeddings Local Fallback Error]", locErr.message || String(locErr));
                }
              }

              if (isQuotaErr && attempts < 3) {
                console.warn(`[Gemini Embedding 429 Rate Limit] Retrying attempt ${attempts} in 1500ms...`);
                await delay(1500);
              } else {
                throw err;
              }
            }
          }

          return embeddingValues;
        });

        allEmbeddings.push(...batchResults);

        if (i + BATCH_SIZE < inputList.length) {
          await delay(150);
        }
      }

      return res.json({
        success: true,
        embeddings: allEmbeddings,
        model: "gemini-embedding-001",
        dimension: allEmbeddings[0]?.length || 768,
      });
    } catch (error: any) {
      console.error("Erro ao gerar embeddings via Gemini:", error);
      return res.status(500).json({
        error: "Falha ao calcular embeddings semânticos reais.",
        details: error.message || String(error),
      });
    }
  });

  // Helper for formatting retrieved RAG chunks with structured medical entities (CID-10 / SNOMED CT)
  function formatChunkWithEntities(chunk: any, idx: number): string {
    const content = typeof chunk === 'string' ? chunk : (chunk.content || '');
    const entities = typeof chunk === 'object' && Array.isArray(chunk.entities) ? chunk.entities : [];

    let formatted = `[Trecho Relevante ${idx + 1}]\n${content}`;
    if (entities.length > 0) {
      const entityLines = entities
        .map((e: any) => {
          const codeStr = e.code_system && e.code ? ` (${e.code_system}: ${e.code})` : '';
          const confStr = typeof e.confidence === 'number' ? ` [confiança: ${e.confidence.toFixed(2)}]` : '';
          return `  - [${(e.type || 'term').toUpperCase()}] "${e.text}"${codeStr}${confStr}`;
        })
        .join('\n');
      formatted += `\nEntidades Clínicas Estruturadas (CID-10 / SNOMED / DeCS):\n${entityLines}`;
    }
    return formatted;
  }

  // API Medical Named Entity Recognition (NER) & Clinical Relations Endpoint (Motor Híbrido: Local Determinístico + IA opcional)
  app.post("/api/extract-entities", async (req, res) => {
    try {
      const { chunks = [] } = req.body;

      if (!Array.isArray(chunks) || chunks.length === 0) {
        return res.json({ success: true, results: [] });
      }

      const CATEGORY_TO_TYPE: Record<string, string> = {
        DOENCA: 'disease',
        MEDICAMENTO: 'medication',
        SINTOMA: 'symptom',
        ESTRUTURA_ANATOMICA: 'anatomy',
        EXAME: 'exam',
        PROCEDIMENTO: 'procedure',
      };

      const RELATION_TYPE_TO_PREDICATE: Record<string, string> = {
        CAUSA: 'causa',
        TRATAMENTO: 'trata',
        FATOR_DE_RISCO: 'causa',
        CONTRAINDICACAO: 'contraindica',
        MANIFESTACAO: 'é_sintoma_de',
        ASSOCIACAO: 'associado_a',
        DIAGNOSTICO_POR: 'diagnostica',
        MECANISMO_DE_ACAO: 'mecanismo_de_acao',
        EFEITO_ADVERSO: 'complica',
        PREVENCAO: 'previne',
        IRRIGACAO: 'irriga',
        INERVACAO: 'inerva',
        DRENAGEM: 'drena',
        LOCALIZACAO: 'localizado_em',
        COMPOSICAO: 'compoe',
        REGULACAO: 'regula',
        CLASSIFICACAO: 'classifica_como',
        COMPLICACAO: 'complica',
        EPIDEMIOLOGIA: 'associado_a',
        PROGNOSTICO: 'associado_a',
      };

      // Garante que o motor terminológico esteja pronto antes do processamento
      await hybridNEREngine.warmup();

      const results = await Promise.all(
        chunks.map(async (item: any) => {
          const text = item.text || '';
          const matchedEntities = await hybridNEREngine.extractEntities(text);

          const extractedRelations = hybridNEREngine.extractRelations(text, matchedEntities);

          const entities = matchedEntities.map((ent) => ({
            text: ent.text,
            type: CATEGORY_TO_TYPE[ent.category] || ent.category.toLowerCase(),
            code_system: ent.codeSystem ?? null,
            code: ent.code ?? null,
            confidence: 1.0,
          }));

        const relations = extractedRelations.map((rel) => {
          const sourceCategory = matchedEntities.find((e) => e.normalizedTerm === rel.sourceEntity)?.category || '';
          const targetCategory = matchedEntities.find((e) => e.normalizedTerm === rel.targetEntity)?.category || '';
          return {
            subjectText: rel.sourceEntity,
            subjectType: CATEGORY_TO_TYPE[sourceCategory] || 'finding',
            predicate: RELATION_TYPE_TO_PREDICATE[rel.relationType] || rel.relationType.toLowerCase(),
            objectText: rel.targetEntity,
            objectType: CATEGORY_TO_TYPE[targetCategory] || 'finding',
            confidence: 1.0,
          };
        });

        return {
          assetId: item.assetId,
          chunkIndex: typeof item.chunkIndex === 'number' ? item.chunkIndex : 0,
          entities,
          relations,
        };
      })
      );

      return res.json({ success: true, results });
    } catch (error: any) {
      console.error("Erro ao extrair entidades e relações médicas localmente:", error);
      return res.status(500).json({
        error: "Falha ao executar extração de entidades e relações médicas (NER).",
        details: error.message || String(error),
      });
    }
  });

  // DeCS/CID-10 Category Siblings Endpoint (Fonte 4 para DistractorEngine)
  app.get("/api/decs-siblings", async (req, res) => {
    try {
      const term = String(req.query.term || "").trim();
      const limit = Math.min(Number(req.query.limit) || 8, 20);
      if (!term) {
        return res.json({ success: true, siblings: [] });
      }
      const siblings = dictionaryNEREngine.getSiblingsByCategory(term, limit);
      return res.json({ success: true, siblings });
    } catch (error: any) {
      console.warn("[decs-siblings] Erro:", error.message);
      return res.json({ success: true, siblings: [] }); // falha graciosa, nunca 500 aqui
    }
  });

  // AI Medical Flashcard Generation Endpoint (Fase 31, 32 & 32.5 RAG + Anti-Duplication + Copyright Rule)
  app.post("/api/generate-cards", async (req, res) => {
    try {
      const {
        text,
        userInstructions = "",
        retrievedChunks = [],
        existingCardsSummary = "",
        subject = "Medicina Geral",
        examBoard = "",
        professor = "",
        cardCount = 5,
        cardType = "mixed",
        level = "intermediario",
        filesInfo = [],
      } = req.body;

      // Material médico vem SEMPRE de retrievedChunks (biblioteca via RAG)
      // Se não há chunks e há texto bruto, apenas usamos como "conteúdo bruto" injetado,
      // mas precisamos de pelo menos um deles
      if (!retrievedChunks || retrievedChunks.length === 0) {
        if (!text || !text.trim()) {
          return res.status(400).json({
            error: "Nenhum material relevante encontrado na sua biblioteca para este assunto — importe um documento ou anexe um arquivo.",
          });
        }
        // Se há texto bruto mas sem chunks RAG, ainda prosseguimos (compatibilidade)
        console.warn('[/api/generate-cards] Gerando cards com texto bruto em vez de chunks RAG');
      }

      // Separação clara entre material médico (RAG) e instrução do usuário
      const contextMaterial = retrievedChunks.length > 0
        ? retrievedChunks.map((c: any, idx: number) => formatChunkWithEntities(c, idx)).join("\n\n")
        : (text && text.trim() ? text.slice(0, 30000) : "");

      const existingSection = existingCardsSummary && existingCardsSummary.trim()
        ? `\n=== CONCEITOS JÁ EXISTENTES NESTE DECK (NÃO REPETIR ESTES CONCEITOS) ===\n${existingCardsSummary}\n=== FIM DOS CONCEITOS EXISTENTES ===\n`
        : "";

      // Nova seção: dirección solicitada pelo usuário (separada do material)
      const userDirectionSection = userInstructions && userInstructions.trim()
        ? `\n=== DIREÇÃO SOLICITADA PELO USUÁRIO ===\nUse as instruções abaixo para direcionar FOCO, NÍVEL DE DETALHE e ÂNGULO da geração, mas NUNCA como fonte de fatos médicos — os fatos vêm exclusivamente do MATERIAL MÉDICO acima.\n${userInstructions}\n=== FIM DA DIREÇÃO ===\n`
        : "";

      const prompt = `Você é um professor titular de Medicina especialista em Anki, Repetição Espaçada (SM-2/FSRS) e Active Recall para provas de Residência Médica (REVALIDA, ENARE, USP, UNIFESP, etc).

=== MATERIAL MÉDICO / CHUNKS DE ALTA RELEVÂNCIA E ENTIDADES CLÍNICAS ===
${contextMaterial}
=== FIM DO MATERIAL ===

Configurações solicitadas:
- Assunto Principal: ${subject}
${examBoard ? `- Origem / Banca da Prova: ${examBoard}` : ""}
${professor ? `- Professor / Preceptor: ${professor}` : ""}
- Modo de Geração: ${cardType} ("cloze" para lacunas {{c1::termo::dica}}, "basic" para Pergunta/Resposta, "mixed" para ambos)
- Nível de Detalhamento: ${level} ("resumido": definições essenciais, "intermediario": visão clínica equilibrada, "completo": fisiopatologia e diretrizes completas)

REGRAS DE APRENDIZAGEM ATIVA E BOAS PRÁTICAS DO ANKI (OBRIGATÓRIO):
1. UM CONCEITO POR CARD: Cada card deve focar em apenas uma única informação ou relação de causa-efeito.
2. PERGUNTAS CLARAS E OBJETIVAS: Evite enunciados longos ou ambíguos.
${
  level === 'resumido'
    ? `3. VERSO COMPACTO (Nível RESUMIDO): O verso deve ter NO MÁXIMO 2-3 frases contendo APENAS a definição ou fato central. Omita completamente mecanismos fisiopatológicos extensos, diferenciais, e contextos de conduta. Foque exclusivamente na resposta direta à pergunta.

EXEMPLO DE VERSO NO NÍVEL RESUMIDO (siga este padrão de tamanho e objetividade):
"back": "Betabloqueador. Reduz mortalidade pós-IAM ao diminuir consumo de O2 miocárdico."`
    : level === 'completo'
    ? `3. VERSO DETALHADO (Nível COMPLETO): O verso pode ter múltiplos parágrafos cobrindo: (a) definição/conceito, (b) fisiopatologia relevante, (c) 2-3 diagnósticos diferenciais quando aplicável, (d) critérios diagnósticos principais, (e) valores de referência e pontos de corte quando pertinente, (f) citação de diretriz/guideline se disponível no material. Mantenha clareza e estrutura — evite texto prolixo ou repetitivo, mas favoreça profundidade.`
    : `3. VERSO EQUILIBRADO (Nível INTERMEDIÁRIO): O verso pode ter um parágrafo curto incluindo: (a) a resposta direta, (b) 1-2 informações de contexto clínico (ex: conduta associada, valor de corte, fato de diferencial principal). Evite excesso de mecanismo ou detalhe, mas vá além de uma definição seca.`
}
4. SINTAXE CLOZE CORRETA: Se for tipo cloze, use obrigatoriamente {{c1::termo::dica opcional}}. Ex: "A conduta inicial na taquicardia supraventricular estável é {{c1::manobra vagal::medida não farmacológica}}."
5. NÃO REPETIR CONCEITOS: Se houver uma seção de "CONCEITOS JÁ EXISTENTES NESTE DECK", crie apenas flashcards sobre aspectos novos ou lacunas de conteúdo ainda não cobertos no deck.
6. DIREITOS AUTORAIS / INSPIRAÇÃO DE ESTILO: Utilize os trechos de prova real apenas como referência de formato, nível de dificuldade e complexidade clínica. NUNCA reproduza uma questão real literalmente.
7. PRIORIDADES DE CONTEÚDO MÉDICO (adaptadas ao nível "${level}"):
   ${
     level === 'resumido'
       ? `- Definições essenciais e conceitos fundamentais
   - OMITA: mecanismos extensos, diferenciais complexos, diretrizes detalhadas`
       : level === 'completo'
       ? `- Definições e conceitos fundamentais
   - Mecanismos fisiológicos e fisiopatológicos (em profundidade)
   - Classificações e critérios diagnósticos (ex: Critérios de Jones, Duke, Wells)
   - Medicamentos e tratamentos de 1ª, 2ª e 3ª linha quando relevante
   - Exames complementares de escolha e alternativas
   - Diagnósticos diferenciais (2-4 principais)
   - Valores laboratoriais de referência e pontos de corte
   - Diretrizes e recomendações de provas de residência (cite fonte quando disponível)`
       : `- Definições e conceitos fundamentais
   - Mecanismos fisiológicos e fisiopatológicos (nível intermediário)
   - Classificações e critérios diagnósticos (principais)
   - Medicamentos e tratamentos de 1ª linha (e 2ª quando relevante)
   - Exames complementares de escolha
   - Diagnósticos diferenciais (1-2 principais)
   - Valores laboratoriais de referência e pontos de corte principais
   - Diretrizes básicas de provas de residência`
   }
8. TAGUEAMENTO DE ENTIDADES CLÍNICAS E CID-10: Utilize as entidades estruturadas (CIDs, SNOMED, sintomas) dos trechos para incluir códigos CID-10 e termos clínicos principais na lista de tags dos flashcards gerados.

Retorne a resposta EXCLUSIVAMENTE em formato JSON VÁLIDO (sem texto extra, sem bloco de código markdown):
[
  {
    "type": "cloze" | "basic",
    "front": "Pergunta objetiva ou texto cloze com {{c1::...}}",
    "back": "Explicação clínica${level === 'resumido' ? ' compacta (máx 3 frases)' : level === 'completo' ? ' detalhada (múltiplos parágrafos)' : ' concisa e equilibrada (1 parágrafo)'}",
    "hint": "Dica curta ou valor de referência (opcional)",
    "tags": ["Assunto", "ResidênciaMédica", "CID10_Opcional"],
    "difficulty": "Fácil" | "Médio" | "Difícil",
    "highYield": true | false,
    "mnemonic": "Mnemônico ou 'pulo do gato' (opcional)"
  }
]
${userDirectionSection}${existingSection}
COMANDO DE GERAÇÃO:
Gere no máximo ${cardCount} flashcards de altíssimo rendimento (High-Yield) baseados em todo o material médico e diretrizes acima.`;

      const result = await parallelAIService.generateFlashcardsParallel(prompt, undefined, 0.2);

      if (!result.success || !result.mainData) {
        throw new Error(result.error || "Falha na geração paralela de flashcards.");
      }

      const cards = Array.isArray(result.mainData) ? result.mainData : (result.mainData.cards || [result.mainData]);

      return res.json({
        success: true,
        cards,
        modelUsed: result.mainModel,
        helperModel: result.helperModel,
        helperData: result.helperData,
        localValidation: result.localValidation,
      });
    } catch (error: any) {
      console.error("Erro ao gerar flashcards via ParallelAIService:", error);
      return res.status(500).json({
        error: "Falha ao gerar flashcards médicos com IA.",
        details: error.message || String(error),
      });
    }
  });

const USE_LIGHT_MODEL_FOR_SIMILARITY_REGENERATION = true;

  // AI Medical Exam Question Generation Endpoint (Fase 33 & 33.5 RAG-Anchored High Quality Exam Questions)
  app.post("/api/generate-questions", async (req, res) => {
    try {
      const {
        retrievedChunks = [],
        examReferenceChunks = [],
        specialty = "Medicina",
        topics = [],
        quantity = 5,
        difficulty = "media",
        questionType = "caso_clinico",
        bancaName,
        professorName,
        professorStyleAnalysis,
        examDNA: reqExamDNA,
        mode = "geral",
        distractorHints = [],
        existingQuestionsSummary,
        customContext,
        avoidTopics = [],
        useLightModel = false,
      } = req.body;

      let customContextSection = "";
      if (customContext && typeof customContext === "string" && customContext.trim()) {
        customContextSection = `\n=== CONTEXTO ADICIONAL / TEXTO-FONTE FORNECIDO PELO USUÁRIO ===\n${customContext.trim()}\n=== FIM DO CONTEXTO ADICIONAL ===\nPriorize a inclusão e cobrança direta dos conceitos, condutas e definições presentes neste contexto adicional para formular os enunciados e alternativas das questões.\n`;
      }

      function buildContextMaterial(chunks: any[]): string {
        if (!Array.isArray(chunks) || chunks.length === 0) {
          return "Base de conhecimento geral médica em conformidade com as diretrizes da Sociedade Brasileira e Ministério da Saúde.";
        }

        return chunks
          .map((c: any, i: number) => {
            const content = typeof c === "string" ? c : c.content || c.text || "";
            const source = c.assetName || c.banca || c.professor || "Material RAG";
            const entities = Array.isArray(c.entities) ? c.entities : [];

            // Calcula proporção de cobertura de entidades extraídas
            const entityChars = entities.reduce(
              (sum: number, ent: any) =>
                sum + (ent.name?.length || ent.displayText?.length || ent.normalizedText?.length || ent.text?.length || 0),
              0
            );
            const coverage = content.length > 0 ? entityChars / content.length : 0;

            // Se cobertura >= 0.15 e houver entidades estruturadas, formata como resumo de triplas/grafo
            if (coverage >= 0.15 && entities.length >= 2) {
              const relations = Array.isArray(c.relations) ? c.relations : [];
              if (relations.length > 0) {
                const relationLines = relations
                  .map((r: any) => `${r.sourceEntity || r.subjectNormalized} -- ${String(r.relationType || r.predicate).toUpperCase()} --> ${r.targetEntity || r.objectNormalized}`)
                  .join("\n");
                return `--- TRECHO ${i + 1} (resumo estruturado do grafo, fonte: ${source}) ---\n${relationLines}`;
              }

              const entityList = entities
                .map((e: any) => `- [${e.type || 'Entidade'}] ${e.displayText || e.name || e.text || ''}`)
                .join("\n");
              return `--- TRECHO ${i + 1} (resumo estruturado do grafo, fonte: ${source}) ---\n${entityList}`;
            }

            return `--- TRECHO ${i + 1} (${source}) ---\n${content}`;
          })
          .join("\n\n");
      }

      const contextMaterial = buildContextMaterial(retrievedChunks);

      let examReferenceSection = "";
      if (Array.isArray(examReferenceChunks) && examReferenceChunks.length > 0) {
        examReferenceSection = `\n=== REFERÊNCIA: COMO ESSE ASSUNTO APARECE EM PROVAS CLÍNICAS (REVALIDA/ENARE/RESIDÊNCIA) ===\nUse os trechos abaixo APENAS como sinal de relevância clínica — para entender qual aspecto do conceito básico costuma ser cobrado na prática. NÃO reproduza, não parafraseie e não copie nenhuma pergunta ou alternativa destes trechos. A questão gerada deve testar EXCLUSIVAMENTE mecanismo, estrutura ou função básica — nunca diagnóstico ou conduta clínica.\n\n${buildContextMaterial(examReferenceChunks)}\n=== FIM DA REFERÊNCIA CLÍNICA ===\n`;
      }

      let distractorSection = "";
      if (Array.isArray(distractorHints) && distractorHints.length > 0) {
        const hintLines = distractorHints
          .slice(0, 10)
          .map((h: any) => `- ${h.label || h.text || h}`)
          .join("\n");

        distractorSection = `\n=== CONCEITOS E TERMOS CORRELATOS RELEVANTES ===\n${hintLines}\n=== FIM DOS TERMOS CORRELATOS ===\n`;
      }


      let existingQuestionsSection = "";
      if (existingQuestionsSummary && existingQuestionsSummary.trim()) {
        existingQuestionsSection = `\n=== QUESTÕES/ENUNCIADOS JÁ ELABORADOS NOS LOTES ANTERIORES (NÃO REPETIR ESTES CASOS/ABORDAGENS) ===\n${existingQuestionsSummary}\n=== FIM DAS QUESTÕES ANTERIORES ===\n`;
      }

      let professorStyleSection = "";
      if (professorStyleAnalysis) {
        const temas = Array.isArray(professorStyleAnalysis.temasFavoritos)
          ? professorStyleAnalysis.temasFavoritos.join(", ")
          : "";
        const pegadinhas = Array.isArray(professorStyleAnalysis.pegadinhasRecorrentes)
          ? professorStyleAnalysis.pegadinhasRecorrentes.join("; ")
          : "";
        professorStyleSection = `\n=== PERFIL DE ELABORAÇÃO E ESTILO DE COBRANÇA DO PROFESSOR (DEVE SER SEGUIDO FIELMENTE) ===
- Estilo de Questão: ${professorStyleAnalysis.estiloDeQuestao || 'Vinhetas clínicas objetivas'}
- Nível Cognitivo: ${professorStyleAnalysis.nivelCognitivo || 'Aplicação prática e raciocínio clínico'}
- Temas Favoritos/Recorrentes: ${temas || 'Diretrizes Médicas'}
- Pegadinhas e Armadilhas Recorrentes: ${pegadinhas || 'Diferenças de conduta por estágio'}
- Síntese de Estilo Geral: ${professorStyleAnalysis.resumoEstiloGeral || ''}
=== FIM DO ESTILO DO PROFESSOR ===\n`;
      }

      const activeDNA = reqExamDNA || professorStyleAnalysis?.examDNA;
      let dnaSection = "";
      if (activeDNA) {
        const textDNA = interpretExamDNA(activeDNA);
        if (textDNA) {
          dnaSection = `\n${textDNA}\n`;
        }
      }

      const originLabel =
        mode === "geral" || (!bancaName && !professorName)
          ? "Base de Conhecimento Geral"
          : mode === "banca"
          ? `Banca ${bancaName || 'de Residência'}`
          : `Prof. ${professorName || 'Personalizado'}`;
      const topicStr = topics.length > 0 ? topics.join(", ") : "Geral";

      const avoidTopicsSection = Array.isArray(avoidTopics) && avoidTopics.length > 0
        ? `\n⚠️ TÓPICOS SATURADOS NESTA SESSÃO — NÃO GERAR questões sobre os seguintes tópicos, pois já atingiram o limite de variações únicas possíveis e toda tentativa recente resultou em questões quase-idênticas às já existentes: ${avoidTopics.join(", ")}. Se o tópico principal desta chamada for um desses, redirecione o enunciado para um subtema ADJACENTE mas genuinamente distinto dentro da mesma especialidade, em vez de reformular a mesma pergunta.\n`
        : "";

      let questionTypeSection = "";
      if (questionType === "conceitual") {
        questionTypeSection = `
═══════════════════════════════════════════════════════════════════════════════
DIRETRIZ E MATRIZ DE CONTEÚDO OBRIGATÓRIA — TIPO: CONCEITUAL
═══════════════════════════════════════════════════════════════════════════════
- ESTRUTURA DO ENUNCIADO: Pergunta direta, clara e objetiva sobre definição, mecanismo, classificação ou conceito fundamental.
  • PROIBIDO incluir vinheta de paciente, PROIBIDO forçar dados demográficos fictícios (idade, sexo, ocupação).
  • PROIBIDO incluir Queixa Principal, HDA, história da doença, antecedentes ou exames físicos.
  • Pode incluir um exemplo breve (ex: "qual é a diferença entre..."), mas SEM estrutura de caso clínico.
- INCLUIR: Definições precisas de termos/estruturas/processos, mecanismos fisiológicos ou fisiopatológicos, classificações e diferenças entre conceitos correlatos.
- OMITIR: Vinhetas clínicas extensas com paciente fictício, dados demográficos detalhados, progressão anamnéstica e correlação clínica forçada no comentário.
- COMENTÁRIO: "correta" (explicação clara e concisa de por que a resposta é correta) e "porOpcao" (explicações individuais de cada alternativa). O campo "correlacaoClinica" é OPCIONAL — inclua apenas se genuinamente agregar entendimento clínico prático, NUNCA force um caso fictício.
`;
      } else if (questionType === "caso_clinico") {
        questionTypeSection = `
═══════════════════════════════════════════════════════════════════════════════
DIRETRIZ E MATRIZ DE CONTEÚDO OBRIGATÓRIA — TIPO: CASO CLÍNICO
═══════════════════════════════════════════════════════════════════════════════
- ESTRUTURA DO ENUNCIADO: OBRIGATÓRIO seguir vinheta clínica progressiva com paciente fictício:
  • Dados demográficos fictícios realistas (idade, sexo, ocupação, etnia) → Queixa Principal → História da Doença Atual (HDA) → Antecedentes/Medicamentos → Exame Físico (achados pertinentes) → Exames Complementares (valores específicos) → Pergunta Objetiva de Tomada de Decisão.
- INCLUIR: Vinheta clínica progressiva (anamnese completa), dados demográficos realistas, exame físico com achados e exames complementares com valores específicos.
- OMITIR: Perguntas puramente conceituais sem anamnese e excesso de dados irrelevantes.
- COMENTÁRIO: OBRIGATÓRIO objeto JSON estruturado contendo "correta" (justificativa completa), "porOpcao" (A, B, C, D) e "correlacaoClinica" (síntese prática da conduta e diretriz).
`;
      } else if (questionType === "multipla_escolha") {
        questionTypeSection = `
═══════════════════════════════════════════════════════════════════════════════
DIRETRIZ E MATRIZ DE CONTEÚDO OBRIGATÓRIA — TIPO: MÚLTIPLA ESCOLHA CURTA
═══════════════════════════════════════════════════════════════════════════════
- ESTRUTURA DO ENUNCIADO: Enunciado direto e objetivo, sem ambiguidades.
  • Pode incluir contexto clínico BREVE (1-2 frases), mas NÃO é necessária a progressão anamnéstica completa.
- INCLUIR: Pergunta clara sobre diagnóstico, conduta ou conceito, com alternativas que representam erros de raciocínio específicos.
- OMITIR: Estrutura anamnéstica completa/obrigatória e excesso de dados clínicos que ofuscam a pergunta.
- COMENTÁRIO: "correta" (justificativa direta da resposta) e "porOpcao" (explicações dos erros de raciocínio de cada alternativa). O campo "correlacaoClinica" é OPCIONAL.
`;
      } else {
        questionTypeSection = `
═══════════════════════════════════════════════════════════════════════════════
DIRETRIZ E MATRIZ DE CONTEÚDO OBRIGATÓRIA — TIPO: MISTURAR
═══════════════════════════════════════════════════════════════════════════════
- ESTRUTURA DO LOTE: Varie entre os três estilos acima ao longo do lote: aproximadamente 1/3 de questões "conceitual", 1/3 de "caso_clinico" e 1/3 de "multipla_escolha".
- Siga as regras específicas de enunciado e comentário para cada estilo individual dentro do lote:
  • Se tipo="caso_clinico": OBRIGATÓRIO seguir progressão anamnéstica (Queixa Principal → HDA → Antecedentes → Exame Físico → Exames → Pergunta) e "correlacaoClinica" no comentário.
  • Se tipo="conceitual": PROIBIDO incluir vinheta de paciente ou dados demográficos fictícios; enunciado DEVE ser uma pergunta direta; "correlacaoClinica" no comentário é OPCIONAL.
  • Se tipo="multipla_escolha": Enunciado direto e objetivo (pode ter contexto clínico BREVE de 1-2 frases); "correlacaoClinica" opcional.
`;
      }

      const prompt = `Você é um professor titular de Medicina especialista em elaboração de questões de alta qualidade para exames de Residência Médica (REVALIDA, ENARE, USP, UNIFESP, ENAMED).

=== MATERIAL MÉDICO E CONHECIMENTO DE REFERÊNCIA (RAG) ===
${contextMaterial}
=== FIM DO MATERIAL ===
${distractorSection}${examReferenceSection}
${professorStyleSection}
${dnaSection}
Configurações Solicitadas:
- Especialidade: ${specialty}
- Assuntos: ${topicStr}
- Origem / Perfil de Referência: ${originLabel}
- Nível de Dificuldade: ${difficulty} ("facil", "media", "dificil")
- TIPO DE QUESTÃO OBRIGATÓRIO: ${questionType.toUpperCase()} ("caso_clinico", "conceitual", "multipla_escolha", "misturar")

${questionTypeSection}

REGRAS RÍGIDAS DE ELABORAÇÃO E QUALIDADE CLÍNICA (OBRIGATÓRIO):
1. DISTRATORES PLAUSÍVEIS E ERROS DE RACIOCÍNIO ESPECÍFICOS: Cada distrator (opções incorretas) deve representar um erro de raciocínio clínico plausível e específico (ex: confundir fisiopatologias correlatas, indicar conduta de estágio/gravidade diferente, ou esquecer contraindicação relevante). É PROIBIDO criar opções absurdas, vazias ou óbvias que qualquer leigo descartaria.
2. SIMETRIA E EQUILÍBRIO DAS ALTERNATIVAS: As 4 alternativas (A, B, C, D) devem ter extensão, profundidade técnica e formato gramatical semelhantes entre si. É PROIBIDO que a alternativa correta seja visivelmente mais longa, detalhada ou gramaticalmente destacada das demais.
3. UNICIDADE E CLAREZA DO GABARITO: O enunciado deve fornecer todos os dados necessários (dados conceituais se tipo="conceitual", ou dados de anamnese/sinais se tipo="caso_clinico") para que exista EXATAMENTE UMA alternativa correta indiscutivelmente perante as diretrizes médicas vigentes.
4. VARIABILIDADE E DIREITOS AUTORAIS: Altere ativamente os dados demográficos, histórico e valores de exames em relação a materiais de origem, mantendo a essência do conceito. NUNCA reproduza 4 ou mais palavras consecutivas idênticas do material de referência RAG.
5. TAGUEAMENTO DE ENTIDADES CLÍNICAS E CID-10: Utilize as entidades estruturadas (CIDs, SNOMED, sintomas) dos trechos RAG para incluir códigos CID-10 e termos clínicos principais na lista de tags da questão gerada.

Retorne EXCLUSIVAMENTE em formato JSON VÁLIDO (sem markdown extra, sem blocos de texto fora do JSON):
[
  {
    "statement": "Enunciado completo e progressivo da questão...",
    "clinicalContext": "Resumo clínico opcional",
    "correctAnswerText": "Texto da resposta/conduta/diagnóstico correto, de forma objetiva",
    "correctAnswerExplanation": "Por que esta é a resposta correta",
    "commentary": {
      "correta": "Justificativa da alternativa correta embasada nas diretrizes médicas...",
      "correlacaoClinica": "Síntese da correlação clínica e conceito fundamental."
    },
    "references": ["Diretriz de referência médica oficial"],
    "tags": ["${specialty}", "CID10_Opcional"],
    "specialty": "${specialty}",
    "topic": "${topicStr}",
    "difficulty": "${difficulty}",
    "questionType": "${questionType}"
  }
]
${avoidTopicsSection}${customContextSection}${existingQuestionsSection}
COMANDO DE GERAÇÃO:
Crie exatamente ${quantity} questões inéditas de múltipla escolha inspiradas na ${originLabel}, seguindo fielmente todas as regras e o material acima.`;


      const selectedModel = (useLightModel && USE_LIGHT_MODEL_FOR_SIMILARITY_REGENERATION)
        ? LIGHT_AI_MODEL
        : (process.env.PRIMARY_AI_MODEL || "gemini-3.6-flash");

      const result = await parallelAIService.generateQuestionsParallel(
        prompt,
        undefined,
        {
          temperature: 0.35,
          model: selectedModel,
          context: useLightModel ? "generate-questions:similarity-regen" : "generate-questions",
        }
      );

      if (!result.success || !result.mainData) {
        throw new Error(result.error || "Falha na geração paralela de questões.");
      }

      const questionsRaw = Array.isArray(result.mainData) ? result.mainData : (result.mainData.questions || [result.mainData]);

      return res.json({
        success: true,
        questions: questionsRaw,
        modelUsed: result.mainModel,
        helperModel: result.helperModel,
        helperData: result.helperData,
        localValidation: result.localValidation,
      });
    } catch (error: any) {
      console.error("Erro ao gerar simulado de questões via ParallelAIService:", error);
      return res.status(500).json({
        error: "Falha ao gerar simulado de questões médicas.",
        details: error.message || String(error),
      });
    }
  });

  // Official PDF Exam Export Endpoint (100% Server-Side PDF Rendering via pdfmake)
  app.post("/api/export-pdf", async (req, res) => {
    try {
      const questionSet = req.body;

      if (!questionSet || !Array.isArray(questionSet.questions) || questionSet.questions.length === 0) {
        return res.status(400).json({ error: "O conjunto de questões (questionSet) é inválido ou está vazio." });
      }

      const pdfBuffer = await PDFExamRenderService.generatePDFBuffer(questionSet);

      const titleClean = (questionSet.title || 'Simulado_MedAnki')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s-]/gi, '')
        .replace(/\s+/g, '_');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${titleClean}.pdf"`);
      return res.send(pdfBuffer);
    } catch (error: any) {
      console.error("Erro ao gerar PDF do simulado via PDFExamRenderService:", error);
      return res.status(500).json({
        error: "Falha ao gerar o arquivo PDF do simulado.",
        details: error.message || String(error),
      });
    }
  });

  // AI Document OCR & Text Extraction Endpoint (2-Step Pipeline: Gemini Raw OCR + Multi-Provider Markdown Structuring)
  app.post("/api/ocr", async (req, res) => {
    try {
      const { imageBase64, mimeType = "image/png" } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: "Imagem ou arquivo em base64 é obrigatório." });
      }

      const ai = getGeminiClient();
      const response = await retryWithBackoff(
        async () => {
          return await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: [
              {
                inlineData: {
                  data: imageBase64,
                  mimeType: mimeType,
                },
              },
              {
                text: `Execute OCR neste documento/imagem médica. Extraia todo o texto legível, incluindo conteúdo de tabelas (célula por célula, na ordem em que aparecem) e qualquer achado textual visível em imagens médicas (ECG/RX/etc). Ignore cabeçalhos, rodapés, números de página e marcas d'água repetitivas. Não formate ainda — apenas extraia o texto bruto, preservando a ordem de leitura.`,
              },
            ],
          });
        },
        {
          maxRetries: 3,
          initialDelayMs: 2000,
          contextTag: "server:ocr",
        }
      );

      const rawOcrText = response.text || "";

      if (!rawOcrText.trim()) {
        return res.json({ success: true, text: "" });
      }

      let structuredText = rawOcrText; // fallback: se a estruturação falhar, devolve o texto bruto mesmo
      try {
        const structuringPrompt = `Reformate o texto extraído abaixo em Markdown limpo e estruturado, seguindo estas regras:
- Tabelas: converta em tabela Markdown de verdade (| coluna | coluna |, com linha separadora).
- Imagens/figuras/achados visuais mencionados: descreva em UMA frase curta e objetiva, sem elaborar demais (economize palavras).
- Trechos de destaque, avisos ou caixas de texto: use blockquote (> texto).
- Tópicos e subtítulos: use cabeçalhos Markdown (##, ###) condizentes com a hierarquia original.
- Não invente conteúdo que não esteja no texto original. Não adicione comentários seus, só o Markdown reformatado.

Texto bruto:
${rawOcrText}`;

        const { text: formatted } = await generateWithFallback({
          prompt: structuringPrompt,
          temperature: 0.1,
          responseFormat: "text",
        });
        if (formatted && formatted.trim()) {
          structuredText = formatted;
        }
      } catch (structErr) {
        console.warn("[ocr] Falha ao estruturar via gateway multi-provedor, devolvendo texto bruto do Gemini:", structErr);
        // structuredText já está com o fallback (rawOcrText), segue o fluxo normalmente
      }

      return res.json({ success: true, text: structuredText });
    } catch (error: any) {
      console.error("Erro no serviço de OCR Gemini:", error);
      return res.status(500).json({
        error: "Falha ao realizar OCR no arquivo médico.",
        details: error.message || String(error),
      });
    }
  });

  // AI Single Card Regeneration Endpoint
  app.post("/api/regenerate-card", async (req, res) => {
    try {
      const { card, contextText = "", subject = "Medicina" } = req.body;

      if (!card || !card.front) {
        return res.status(400).json({ error: "Dados do flashcard são obrigatórios." });
      }

      const ai = getGeminiClient();

      const prompt = `Você é um especialista em Anki e Active Recall. Reformule e aprimore este flashcard médico especifico para tornar a pergunta mais direta, fácil de memorizar e focada em 1 único conceito:

Card Atual:
Frente: ${card.front}
Verso: ${card.back}
Tipo: ${card.type}

Contexto Médico Relevante:
${contextText.slice(0, 2000)}

Retorne um JSON VÁLIDO no seguinte formato:
{
  "type": "cloze" | "basic",
  "front": "Nova pergunta reformulada ou cloze {{c1::...}}",
  "back": "Novo verso otimizado",
  "hint": "Dica curta",
  "tags": ["${subject}"],
  "difficulty": "Fácil" | "Médio" | "Difícil",
  "highYield": true,
  "mnemonic": "Mnemônico aprimorado (se aplicável)"
}`;

      const response = await retryWithBackoff(
        async () => {
          return await ai.models.generateContent({
            model: LIGHT_AI_MODEL,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.3,
            },
          });
        },
        {
          maxRetries: 3,
          initialDelayMs: 2000,
          contextTag: "server:regenerate-card",
        }
      );


      const updatedCard = JSON.parse(response.text || "{}");
      return res.json({ success: true, card: updatedCard });
    } catch (error: any) {
      console.error("Erro ao regenerar card único:", error);
      return res.status(500).json({
        error: "Falha ao regenerar flashcard.",
        details: error.message || String(error),
      });
    }
  });

  // AI Reformulate Question to Atomic Active Recall Flashcards Endpoint
  app.post("/api/reformulate-question-to-flashcard", async (req, res) => {
    try {
      const { question } = req.body;

      if (!question || !question.statement) {
        return res.status(400).json({ error: "Dados da questão são obrigatórios." });
      }

      const correctOption = question.options?.find((o: any) => o.id === question.correctOptionId || o.isCorrect);
      const userOption = question.userAnswerId ? question.options?.find((o: any) => o.id === question.userAnswerId) : null;

      let commentaryStr = "";
      if (typeof question.commentary === "string") {
        commentaryStr = question.commentary;
      } else if (question.commentary && typeof question.commentary === "object") {
        const comm = question.commentary;
        commentaryStr = `Justificativa correta: ${comm.correta || ""}`;
        if (comm.correlacaoClinica) {
          commentaryStr += `\nCorrelação clínica: ${comm.correlacaoClinica}`;
        }
        if (comm.porOpcao) {
          commentaryStr += `\nAnálise por opção: ${JSON.stringify(comm.porOpcao)}`;
        }
      }

      const isWrong = question.isCorrect === false;
      const wrongInfo = isWrong && userOption ? `\n- Alternativa INCORRETA que o aluno marcou: (${userOption.letter}) ${userOption.text}` : "";

      const optionsStr = Array.isArray(question.options)
        ? question.options.map((o: any) => `(${o.letter}) ${o.text}`).join("\n")
        : "";

      const prompt = `Você é um professor médico especialista em Anki, Active Recall e Repetição Espaçada (SM-2/FSRS).

Sua tarefa é REFORMULAR a seguinte questão de prova médica em 1 ou 2 flashcards atômicos de recordação ativa (Active Recall).

=== QUESTÃO ORIGINAL DE ORIGEM ===
Enunciado Completo:
${question.statement}

Alternativas da Questão:
${optionsStr}

Alternativa Correta (Gabarito): (${correctOption?.letter || "Gabarito"}) ${correctOption?.text || ""}
${wrongInfo}

Comentário / Explicação da Questão:
${commentaryStr}

Especialidade: ${question.specialty || "Medicina"}
Assunto: ${question.topic || "Geral"}
=== FIM DA QUESTÃO ===

REGRAS RÍGIDAS DE REFORMULAÇÃO E QUALIDADE DO ANKI (OBRIGATÓRIO):
1. PROIBIDA CÓPIA LITERAL: NÃO reproduza o enunciado da questão nem a concatenação das 4 alternativas no front do card. O front DEVE ser uma pergunta direta, clara e objetiva sobre o conceito médico testado.
2. EXTRAIR O CONCEITO CENTRAL: Identifique o fato, conduta, critério diagnóstico ou mecanismo fisiopatológico sendo testado pela questão e converta em 1 (ou no máximo 2) flashcards atômicos de recordação ativa (Active Recall).
3. UM CONCEITO POR CARD: Cada card deve testar apenas um único fato discreto.
4. ABORDAGEM DO ERRO (SE APLICÁVEL): ${
        isWrong
          ? "Como o aluno errou a questão marcando a opção incorreta citada acima, você PODE opcionalmente fazer com que UM dos cards gerados aborde a armadilha ou o motivo pelo qual aquela opção específica é incorreta no contexto (ex: 'Por que X é contraindicado no contexto Y?'), quando isso agregar valor pedagógico real."
          : "O aluno acertou a questão. Foque na consolidação direta do conceito correto."
      }
5. FORMATO DE SAÍDA: Retorne a resposta EXCLUSIVAMENTE em formato JSON VÁLIDO no seguinte esquema (sem markdown extra fora do JSON):
[
  {
    "type": "basic" | "cloze",
    "front": "Pergunta objetiva e direta em estilo Active Recall (NÃO copiar o enunciado)",
    "back": "Explicação clínica concisa e direta ao ponto",
    "hint": "Dica curta ou valor de referência (opcional)",
    "tags": ["${question.specialty || "Medicina"}", "RevisãoSimulado"],
    "difficulty": "Médio",
    "highYield": true,
    "mnemonic": "Mnemônico curto (opcional)"
  }
]`;

      const ai = getGeminiClient();
      const response = await retryWithBackoff(
        async () => {
          return await ai.models.generateContent({
            model: LIGHT_AI_MODEL,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          });
        },
        {
          maxRetries: 3,
          initialDelayMs: 2000,
          contextTag: "server:reformulate-question",
        }
      );


      const parsedCards = JSON.parse(response.text || "[]");
      return res.json({ success: true, cards: Array.isArray(parsedCards) ? parsedCards : [parsedCards] });
    } catch (error: any) {
      console.error("Erro ao reformular questão em flashcard via Gemini:", error);
      return res.status(500).json({
        error: "Falha ao reformular questão em flashcard com IA.",
        details: error.message || String(error),
      });
    }
  });

  // AI Medical Mnemonic & Explanation Generator
  app.post("/api/generate-mnemonic", async (req, res) => {
    try {
      const { front, back, subject } = req.body;

      if (!front) {
        return res.status(400).json({ error: "Conteúdo do flashcard necessário." });
      }

      const ai = getGeminiClient();

      const prompt = `Como arquiteto e especialista em memorização médica (MedAnki), crie um mnemônico criativo, acrônimo ou associação visual para ajudar um estudante de medicina a memorizar o seguinte conceito:

Assunto: ${subject || "Medicina"}
Frente do Card: ${front}
Verso/Resposta: ${back || ""}

Responda em formato JSON:
{
  "mnemonic": "Mnemônico marcante e fácil de lembrar",
  "explanation": "Explicação de 2 frases sobre como aplicar o mnemônico",
  "clinicalTip": "Pulo do gato para a prova de residência médica"
}`;

      const response = await retryWithBackoff(
        async () => {
          return await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.4,
            },
          });
        },
        {
          maxRetries: 3,
          initialDelayMs: 2000,
          contextTag: "server:generate-mnemonic",
        }
      );

      const data = JSON.parse(response.text || "{}");
      return res.json({ success: true, ...data });
    } catch (error: any) {
      console.error("Erro ao gerar mnemônico:", error);
      return res.status(500).json({
        error: "Falha ao gerar mnemônico médico.",
      });
    }
  });

  // AI Clone Exam Style Endpoint
  app.post("/api/clone-exam-style", async (req, res) => {
    try {
      const { profileName, sourceExamName, examText } = req.body;

      if (!profileName || (!examText && !sourceExamName)) {
        return res.status(400).json({ success: false, error: "profileName e examText/sourceExamName são obrigatórios." });
      }

      const analysis = await professorEngine.analyzeProfessorStyle(profileName, examText || "");

      const profile = {
        name: profileName,
        sourceExamName: sourceExamName || profileName,
        styleAnalysis: analysis,
        examDNA: analysis.examDNA,
        analyzedAt: analysis.analyzedAt,
      };

      return res.json({ success: true, profile });
    } catch (error: any) {
      console.error("Erro ao clonar estilo de prova:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Falha ao analisar e clonar estilo de prova.",
      });
    }
  });

  // AI Generate Flashcards Endpoint (MedKnowledgeService contract)
  app.post("/api/generate-flashcards", async (req, res) => {
    try {
      const { subjectName, topicName, customText = "", count = 5 } = req.body;

      if (!subjectName && !topicName && !customText) {
        return res.status(400).json({ success: false, error: "subjectName, topicName ou customText são obrigatórios." });
      }

      const prompt = `Você é um professor titular de Medicina especialista em Anki, Repetição Espaçada (SM-2/FSRS) e Active Recall para provas de Residência Médica.

Gere exatamente ${count} flashcards de alta relevância (High-Yield) focando no assunto "${subjectName || 'Medicina'}" e tópico "${topicName || 'Geral'}".
${customText ? `\n=== CONTEXTO ADICIONAL / TEXTO PERSONALIZADO ===\n${customText}\n=== FIM DO CONTEXTO ===\n` : ""}

REGRAS:
1. UM CONCEITO POR CARD: Cada card deve focar em apenas uma única informação objetiva.
2. SINTAXE CLOZE: Para clozes, use {{c1::resposta::dica opcional}}.
3. Retorne EXCLUSIVAMENTE em formato JSON VÁLIDO (sem bloco de código markdown extra):
[
  {
    "type": "cloze" | "basic",
    "front": "Pergunta objetiva ou cloze com {{c1::...}}",
    "back": "Resposta ou explicação direta",
    "hint": "Dica curta (opcional)",
    "tags": ["${subjectName || 'Medicina'}", "${topicName || 'Geral'}"],
    "difficulty": "Médio",
    "highYield": true,
    "mnemonic": "Mnemônico (opcional)"
  }
]`;

      const result = await parallelAIService.generateFlashcardsParallel(prompt, undefined, 0.2);

      if (!result.success || !result.mainData) {
        throw new Error(result.error || "Falha na geração paralela de flashcards.");
      }

      const cards = Array.isArray(result.mainData) ? result.mainData : (result.mainData.cards || [result.mainData]);

      return res.json({ success: true, flashcards: cards });
    } catch (error: any) {
      console.error("Erro no endpoint /api/generate-flashcards:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Falha ao gerar flashcards por IA.",
      });
    }
  });

  // AI Contextual Chat Note Endpoint
  app.post("/api/chat-note", async (req, res) => {
    try {
      const { noteTitle = "Nota Médica", noteContent = "", userMessage, chatHistory = [] } = req.body;

      if (!userMessage || !userMessage.trim()) {
        return res.status(400).json({ success: false, error: "A pergunta (userMessage) é obrigatória." });
      }

      const formattedHistory = Array.isArray(chatHistory) && chatHistory.length > 0
        ? chatHistory.map((h: any) => `${h.sender === 'user' ? 'Usuário' : 'IA'}: ${h.text}`).join("\n")
        : "Nenhum histórico anterior.";

      const prompt = `Você é um tutor e assistente especialista em Medicina do MedAnki.
O usuário está estudando a seguinte nota médica:

=== NOTA: ${noteTitle} ===
${noteContent.slice(0, 12000)}
=== FIM DA NOTA ===

HISTÓRICO DA CONVERSA:
${formattedHistory}

PERGUNTA ATUAL DO USUÁRIO:
${userMessage}

Responda de forma clara, didática, embasada nas diretrizes médicas mais recentes e direta ao ponto.`;

      const { text: reply } = await generateWithFallback({
        prompt,
        temperature: 0.3,
        responseFormat: "text",
      });

      return res.json({ success: true, reply });
    } catch (error: any) {
      console.error("Erro no endpoint /api/chat-note:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Erro ao conversar com a IA sobre a nota.",
      });
    }
  });

  // Vite middleware in dev mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[MedAnki Server] 🚀 Servidor pronto e escutando na porta ${PORT}`);

    // Warmup assíncrono dos motores pós-vinculação de porta
    setImmediate(async () => {
      console.log("[MedAnki Server] Iniciando warmup do NER/Knowledge Engine em background pós-listen...");
      try {
        await hybridNEREngine.warmup();
      } catch (err) {
        console.warn("[MedAnki Server] Aviso durante warmup em background pós-listen:", err);
      }
    });
  });
}

startServer();

