import {
  QuestionGenerationRequest,
  QuestionSet,
  Question,
  QuestionOption,
} from '../../domain/entities/Question';
import { ragEngine } from './RAGEngine';
import { knowledgeGraphService } from './KnowledgeGraphService';
import { distractorEngine } from './distractorEngine/DistractorEngine';
import {
  isValidGeneratedQuestion,
  isValidOptionText,
  validateDistracter,
  ensureVariedCorrectLength,
  DistractorType,
} from '../../core/utils/contentValidation';
import { mapWithConcurrency } from '../../core/utils/asyncUtils';
import { formatCompactAntiDuplicationList } from '../../core/utils/termExtractor';
import { balanceAndShuffleQuestionOptions } from '../../core/utils/optionBalancer';
import { RepositoryFactory } from '../repositories_impl/RepositoryFactory';
import { db } from '../db/database';
import { isBasicCycleSpecialty } from '../../core/curriculum/basicCycleDisciplines';
import { KnowledgeCategoryMapper } from '../../core/medcore_kernel/ontology/KnowledgeCategoryMapper';
import { SemanticChunkResult } from './RealSemanticSearchService';
import { apiUrl } from '../../lib/apiBaseUrl';
import { questionSimilarityEngine, SIMILARITY_THRESHOLD, MAX_REGENERATION_ATTEMPTS } from './QuestionSimilarityEngine';
import {
  pruneObjectByTokenBudget,
  pruneChunksByTokenBudget,
  truncateChunkText,
  estimateTokenCount,
  extractRelevantContextForTopic,
  condenseProfessorProfileForDistribution,
  MAX_TOTAL_PAYLOAD_TOKENS,
  SECONDARY_BATCH_CONTEXT_TOKENS_PER_CALL,
  REGEN_SINGLE_QUESTION_CONTEXT_TOKENS,
  REGEN_CHUNK_MAX_CHARS,
  MAX_REGEN_CALLS_PER_REQUEST,
  MAX_REGEN_TOKENS_PER_REQUEST,
} from './tokenBudget';
import {
  segmentContextIntoCoverageUnits,
  assignCoverageUnitsToQuestions,
  CoverageUnit,
  CoverageAssignment,
} from './contextSegmentation';

const questionRepo = RepositoryFactory.getQuestionRepository();

/**
 * Recupera os IDs de KnowledgeAssets que são materiais de banco de provas (REVALIDA, ENARE, Provas de Residência/Professor),
 * com cache em memória para não repetir a consulta durante gerações em lote.
 */
let cachedExamBankAssetIds: string[] | null = null;
export async function getExamBankAssetIds(forceRefresh = false): Promise<string[]> {
  if (cachedExamBankAssetIds !== null && !forceRefresh) {
    return cachedExamBankAssetIds;
  }
  try {
    const allAssets = await db.knowledgeAssets.toArray();
    cachedExamBankAssetIds = allAssets
      .filter((a) => KnowledgeCategoryMapper.isQuestionSource(a.category))
      .map((a) => a.id);
  } catch (err) {
    console.warn('[QuestionGenerationService] Failed to retrieve exam bank asset IDs:', err);
    cachedExamBankAssetIds = [];
  }
  return cachedExamBankAssetIds;
}

/**
 * Regra de Direitos Autorais:
 * Questões cujo originSource aponte para bancas ou provas de terceiros (ex: ENARE, Revalida, USP)
 * NUNCA podem ser reusadas verbatim — somente como base de adaptação para a IA gerar uma questão inédita.
 * Apenas questões sem originSource de terceiro (geradas pela própria IA do app anteriormente ou manuais)
 * podem ser reusadas diretamente quando autorizado pelo usuário.
 */
export function isThirdPartyQuestion(q: Question): boolean {
  if (!q.originSource) return false;
  const src = q.originSource.toLowerCase().trim();
  if (!src) return false;
  if (
    src.includes('medanki') ||
    src.includes('manual') ||
    src.includes('próprio') ||
    src.includes('proprio') ||
    src.includes('ia local') ||
    src.includes('banco local')
  ) {
    return false;
  }
  return true;
}

/**
 * Formata o bloco de adaptação posicionado após os blocos estáticos do prompt
 */
export function formatAdaptationPromptBlock(question: Question): string {
  const statement = question.statement || '';
  const correctOpt = question.options?.find((o) => o.isCorrect)?.text || question.options?.[0]?.text || 'Opção correta';
  const otherOpts = (question.options || []).filter((o) => !o.isCorrect).map((o) => o.text);

  return `
[MODO: ADAPTAÇÃO DE QUESTÃO EXISTENTE DETECTADA]
Aviso ao examinador: foi encontrada uma questão de referência na base local para este tópico.
QUESTÃO-BASE LOCAL:
"""
Enunciado: ${statement}
Alternativa Correta: ${correctOpt}
Distratores: ${otherOpts.join(', ')}
"""
DIRETRIZ DE TRANSFORMAÇÃO:
- NÃO copie o enunciado textualmente.
- Mantenha o CONCEITO CLÍNICO central (o mesmo mecanismo/diagnóstico).
- Altere os dados secundários do caso clínico (sexo/idade, histórico pregresso, sinais vitais, valores laboratoriais).
- Reformule as alternativas e distratores para criar uma questão 100% inédita baseada no mesmo padrão de cobrança.
`.trim();
}

export interface SimilarityRegenStatsTracker {
  count: number;
  actualTokensSpent: number;
  breakdownByCause: {
    attempt1Duplicate: number;
    expandedContextRegen: number;
    circuitBreakerTripped: boolean;
    saturatedTopicEarlySkips: number;
  };
}

export function createSimilarityRegenStatsTracker(): SimilarityRegenStatsTracker {
  return {
    count: 0,
    actualTokensSpent: 0,
    breakdownByCause: {
      attempt1Duplicate: 0,
      expandedContextRegen: 0,
      circuitBreakerTripped: false,
      saturatedTopicEarlySkips: 0,
    },
  };
}

/**
 * TAREFA 2: Estima a capacidade de geração de questões distintas (diversity capacity) para um tópico
 * ANTES de gastar tokens em gerações e regenerações repetidas.
 */
export function estimateTopicDiversityCapacity(
  topic: string,
  customContext?: string,
  chunks?: any[],
  coverageUnits?: CoverageUnit[]
): { capacity: number; isLimited: boolean; reason: string } {
  if (coverageUnits && coverageUnits.length > 0) {
    const capacity = Math.max(1, Math.round(coverageUnits.length * 1.5));
    return {
      capacity,
      isLimited: capacity <= 4,
      reason: `Baseado em ${coverageUnits.length} unidades de cobertura delimitadas`,
    };
  }

  if (customContext && typeof customContext === 'string' && customContext.trim().length > 0) {
    const effectiveTokens = estimateTokenCount(customContext);
    const capacity = Math.max(1, Math.floor(effectiveTokens / 200));
    return {
      capacity,
      isLimited: capacity <= 4,
      reason: `Texto-fonte com ~${effectiveTokens} tokens de conteúdo`,
    };
  }

  if (Array.isArray(chunks) && chunks.length > 0) {
    const effectiveTokens = estimateTokenCount(chunks);
    const capacity = Math.max(2, Math.min(10, Math.floor(effectiveTokens / 250)));
    return {
      capacity,
      isLimited: capacity <= 3,
      reason: `RAG com ${chunks.length} chunks (~${effectiveTokens} tokens)`,
    };
  }

  return { capacity: 5, isLimited: false, reason: 'Base de conhecimento médica geral' };
}

/**
 * TAREFA 2: Gera diretriz de máxima diversidade para tópicos com material conciso,
 * forçando a IA a variar ângulos clínicos já na 1ª tentativa para evitar colisões caras.
 */
export function formatDiversityDirectivePrompt(topic: string, requestedQty: number, capacity: number): string {
  return `
[DIRETRIZ OBRIGATÓRIA DE MÁXIMA DIVERSIDADE - TÓPICO COM CONTEÚDO CONCENTRADO]
Atenção: Este tópico possui material-fonte conciso/específico para a quantidade solicitada (${requestedQty} questões / capacidade estimada ~${capacity}).
Para evitar qualquer redundância ou colisão entre questões, você DEVE OBRIGATORIAMENTE variar os ângulos de abordagem em cada item do lote:
- Questão 1: Caso clínico diagnóstico (identificação de síndrome/lesão a partir de sinais e sintomas).
- Questão 2: Fisiopatologia / Mecanismo molecular ou anatomia topográfica direta.
- Questão 3: Propedêutica armada / Interpretação de exame complementar ou conduta terapêutica imediata.
- Questão 4+: Prognóstico, complicações agudas, diagnóstico diferencial ou asserção de exceção ("EXCETO/INCORRETA").
NÃO elabore enunciados com a mesma estrutura clínica nem pergunte sobre a mesma estrutura anatômica/função mais de uma vez.
`.trim();
}

async function processRawQuestionsWithSimilarityCheck(
  rawQuestions: any[],
  specialtyStr: string,
  topicStr: string,
  postPayload: any,
  saturatedTopics: Set<string> = new Set(),
  contentLimitedTopics: Set<string> = new Set(),
  regenStatsTracker?: SimilarityRegenStatsTracker,
  sharedGeneratedStatements?: string[]
): Promise<any[]> {
  const BATCH_SIMILARITY_CONCURRENCY = 3;

  let initialEmbeddings: number[][] = [];
  try {
    const statements = rawQuestions.map((q) => q.statement || '');
    initialEmbeddings = await questionSimilarityEngine.getEmbeddingsBatch(statements);
  } catch (err) {
    console.warn(
      '[QuestionGenerationService] Batch embedding fetch failed, proceeding without similarity check:',
      err
    );
    initialEmbeddings = rawQuestions.map(() => []);
  }

  return await mapWithConcurrency(rawQuestions, BATCH_SIMILARITY_CONCURRENCY, async (q, idx) => {
    try {
      let currentQ = q;
      const spec = q.specialty || specialtyStr;
      const top = q.topic || topicStr;
      const initialStatement = currentQ.statement || '';
      const initialEmb = initialEmbeddings[idx] || [];

      // TAREFA 4: Registra o statement gerado imediatamente no conjunto compartilhado
      if (sharedGeneratedStatements && initialStatement) {
        if (!sharedGeneratedStatements.includes(initialStatement)) {
          sharedGeneratedStatements.push(initialStatement);
        }
      }

      // TAREFA 2: Se o tópico já foi previamente marcado como saturado/limitado, pula regeneração cara
      if (saturatedTopics.has(top)) {
        if (regenStatsTracker) {
          regenStatsTracker.breakdownByCause.saturatedTopicEarlySkips++;
        }
        return currentQ;
      }

      let { maxSimilarity, embedding } = await questionSimilarityEngine.findMaxSimilarity(
        initialStatement,
        spec,
        top,
        initialEmb
      );

      if (maxSimilarity > SIMILARITY_THRESHOLD) {
        // TAREFA 3: Circuit Breaker de Orçamento Agregado de Regeneração
        if (
          regenStatsTracker &&
          (regenStatsTracker.count >= MAX_REGEN_CALLS_PER_REQUEST ||
            regenStatsTracker.actualTokensSpent >= MAX_REGEN_TOKENS_PER_REQUEST)
        ) {
          console.warn(
            `[QuestionGenerationService] Circuit breaker acionado: limite de regeneração atingido (${regenStatsTracker.count} chamadas / ~${regenStatsTracker.actualTokensSpent} tokens). Entregando questão restante com aviso de similaridade.`
          );
          regenStatsTracker.breakdownByCause.circuitBreakerTripped = true;
          currentQ.flaggedSimilar = true;
          currentQ.similarityWarning = 'Possivelmente similar a outra questão do simulado (limite de diversidade do conteúdo atingido).';
          return currentQ;
        }

        console.warn(
          `[QuestionGenerationService] High question similarity detected (${maxSimilarity.toFixed(3)} > ${SIMILARITY_THRESHOLD}) for topic "${top}". Initiating single-question regeneration...`
        );

        let bestQ = currentQ;
        let bestSim = maxSimilarity;
        let bestEmb = embedding;
        const rejectedStatements = [initialStatement];

        // TAREFA 1: Orçamento enxuto para regeneração de 1 única questão (REGEN_SINGLE_QUESTION_CONTEXT_TOKENS = 1200)
        const prunedRegenChunks = pruneChunksByTokenBudget(
          (postPayload.retrievedChunks || []).map((c: any) => ({
            ...c,
            content: truncateChunkText(c.content, REGEN_CHUNK_MAX_CHARS),
          })),
          REGEN_SINGLE_QUESTION_CONTEXT_TOKENS
        );

        // Recorta customContext para o tópico específico se disponível
        let prunedCustomContext = postPayload.customContext;
        const maxContextChars = REGEN_SINGLE_QUESTION_CONTEXT_TOKENS * 4;
        if (typeof prunedCustomContext === 'string' && prunedCustomContext.length > maxContextChars) {
          try {
            prunedCustomContext = await extractRelevantContextForTopic(
              prunedCustomContext,
              top,
              spec,
              maxContextChars
            );
          } catch {
            prunedCustomContext = prunedCustomContext.slice(0, maxContextChars);
          }
        }

        for (let attempt = 1; attempt <= MAX_REGENERATION_ATTEMPTS; attempt++) {
          try {
            // TAREFA 3: Circuit breaker check dentro do loop
            if (
              regenStatsTracker &&
              (regenStatsTracker.count >= MAX_REGEN_CALLS_PER_REQUEST ||
                regenStatsTracker.actualTokensSpent >= MAX_REGEN_TOKENS_PER_REQUEST)
            ) {
              regenStatsTracker.breakdownByCause.circuitBreakerTripped = true;
              break;
            }

            const similarityAvoidHint = rejectedStatements
              .map((s, i) => `EVITE especificamente a seguinte abordagem/enunciado rejeitado #${i + 1}: "${s}"`)
              .join('\n');

            // TAREFA 4: Consulta os statements gerados pelos outros lotes concorrentes em tempo real
            const sharedStatementsSnapshot = sharedGeneratedStatements || [];
            const antiDuplicationItems = [
              ...rejectedStatements,
              ...sharedStatementsSnapshot.slice(-15),
              similarityAvoidHint,
            ];

            // TAREFA 1: Payload enxuto com useLightModel: true e context recortado
            const singlePayload: any = {
              ...postPayload,
              quantity: 1,
              topics: [top],
              subtopics: undefined,
              retrievedChunks: prunedRegenChunks,
              examReferenceChunks: undefined,
              coverageAssignments: undefined,
              customContext: prunedCustomContext || undefined,
              distractorHints: (postPayload.distractorHints || [])
                .slice(0, 3)
                .map((h: any) => ({ label: typeof h === 'string' ? h : h.label || h.text })),
              professorStyleAnalysis: undefined,
              examDNA: undefined,
              useLightModel: true,
              existingQuestionsSummary: formatCompactAntiDuplicationList(antiDuplicationItems, 15),
            };

            // DIAGNÓSTICO: Medição em tokens de cada campo do singlePayload
            const fieldBreakdown: Record<string, number> = {};
            for (const key of Object.keys(singlePayload)) {
              const val = singlePayload[key];
              if (val !== undefined) {
                fieldBreakdown[key] = estimateTokenCount(val);
              }
            }
            const totalPayloadTokens = estimateTokenCount(singlePayload);
            console.log(
              `[QuestionGenerationService:DIAGNOSTIC] === SIMILARITY REGENERATION PAYLOAD BREAKDOWN (Attempt ${attempt}) ===\n` +
              `Total singlePayload tokens: ${totalPayloadTokens}\n` +
              Object.entries(fieldBreakdown)
                .map(([k, v]) => `  - ${k}: ${v} tokens (${typeof singlePayload[k] === 'object' ? JSON.stringify(singlePayload[k]).length : String(singlePayload[k]).length} chars)`)
                .join('\n')
            );
            if (singlePayload.distractorHints && Array.isArray(singlePayload.distractorHints)) {
              console.log(
                `[QuestionGenerationService:DIAGNOSTIC] distractorHints detail (${singlePayload.distractorHints.length} items):\n` +
                singlePayload.distractorHints.map((h: any, idx: number) =>
                  `  Hint #${idx + 1}: label="${h.label || h.text}", rationale=${h.rationale ? estimateTokenCount(h.rationale) : 0} tok, fullObj=${estimateTokenCount(h)} tok`
                ).join('\n')
              );
            }

            // TAREFA 5: Contabilizar regeneração e tokens extras com tracking de causa
            const estimatedPreCall = estimateTokenCount(singlePayload) + 350;
            if (regenStatsTracker) {
              regenStatsTracker.count++;
              regenStatsTracker.breakdownByCause.attempt1Duplicate++;
            }

            const res = await fetch(apiUrl('/api/generate-questions'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(singlePayload),
            });

            if (res.ok) {
              const data = await res.json();
              if (regenStatsTracker) {
                const callTokens = Number(data.usage?.totalTokenCount) || estimatedPreCall;
                regenStatsTracker.actualTokensSpent += callTokens;
              }
              if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
                const candidateQ = data.questions[0];
                const candStatement = candidateQ.statement || '';
                rejectedStatements.push(candStatement);

                const candRes = await questionSimilarityEngine.findMaxSimilarity(candStatement, spec, top);

                if (candRes.maxSimilarity < bestSim) {
                  bestQ = candidateQ;
                  bestSim = candRes.maxSimilarity;
                  bestEmb = candRes.embedding;
                }

                if (candRes.maxSimilarity <= SIMILARITY_THRESHOLD) {
                  console.warn(
                    `[QuestionGenerationService] Regeneration attempt ${attempt} succeeded with similarity ${candRes.maxSimilarity.toFixed(3)} <= ${SIMILARITY_THRESHOLD}.`
                  );
                  currentQ = candidateQ;
                  maxSimilarity = candRes.maxSimilarity;
                  embedding = candRes.embedding;
                  break;
                }
              }
            } else {
              if (regenStatsTracker) {
                regenStatsTracker.actualTokensSpent += estimatedPreCall;
              }
            }
          } catch (retryErr) {
            console.warn(`[QuestionGenerationService] Regeneration attempt ${attempt} failed:`, retryErr);
          }
        }

        if (maxSimilarity > SIMILARITY_THRESHOLD) {
          // TAREFA 3: Checagem de circuit breaker antes de buscar chunks extras
          const canAttemptExpanded =
            !regenStatsTracker ||
            (regenStatsTracker.count < MAX_REGEN_CALLS_PER_REQUEST &&
              regenStatsTracker.actualTokensSpent < MAX_REGEN_TOKENS_PER_REQUEST);

          if (canAttemptExpanded) {
            try {
              const extraChunks = await ragEngine.retrieveContext(top, { topK: 5 });
              const existingChunks = postPayload.retrievedChunks || [];
              const existingKeys = new Set(
                existingChunks.map((c: any) => `${c.assetId || ''}-${c.chunkIndex ?? ''}`)
              );
              const newChunks = extraChunks.filter(
                (c: any) => !existingKeys.has(`${c.assetId || ''}-${c.chunkIndex ?? ''}`)
              );

              if (newChunks.length > 0) {
                console.warn(
                  `[QuestionGenerationService] Found ${newChunks.length} additional RAG chunks for topic "${top}". Attempting 1 single-question expanded-context regeneration...`
                );
                // TAREFA 1: Podar mantendo orçamento enxuto de 1200 tokens
                const combinedChunks = [...existingChunks, ...newChunks];
                const prunedExpandedChunks = pruneChunksByTokenBudget(
                  combinedChunks.map((c: any) => ({
                    ...c,
                    content: truncateChunkText(c.content, REGEN_CHUNK_MAX_CHARS),
                  })),
                  REGEN_SINGLE_QUESTION_CONTEXT_TOKENS
                );

                const expandedPayload: any = {
                  ...postPayload,
                  quantity: 1,
                  topics: [top],
                  subtopics: undefined,
                  retrievedChunks: prunedExpandedChunks,
                  examReferenceChunks: undefined,
                  coverageAssignments: undefined,
                  customContext: prunedCustomContext || undefined,
                  distractorHints: (postPayload.distractorHints || [])
                    .slice(0, 3)
                    .map((h: any) => ({ label: typeof h === 'string' ? h : h.label || h.text })),
                  professorStyleAnalysis: undefined,
                  examDNA: undefined,
                  useLightModel: true,
                  existingQuestionsSummary: formatCompactAntiDuplicationList(
                    [...rejectedStatements, ...(sharedGeneratedStatements?.slice(-10) || [])],
                    15
                  ),
                };

                const estimatedPreCall = estimateTokenCount(expandedPayload) + 350;
                if (regenStatsTracker) {
                  regenStatsTracker.count++;
                  regenStatsTracker.breakdownByCause.expandedContextRegen++;
                }

                const res = await fetch(apiUrl('/api/generate-questions'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(expandedPayload),
                });
                if (res.ok) {
                  const data = await res.json();
                  if (regenStatsTracker) {
                    const callTokens = Number(data.usage?.totalTokenCount) || estimatedPreCall;
                    regenStatsTracker.actualTokensSpent += callTokens;
                  }
                  if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
                    const candidateQ = data.questions[0];
                    const candStatement = candidateQ.statement || '';
                    const candRes = await questionSimilarityEngine.findMaxSimilarity(candStatement, spec, top);

                    if (candRes.maxSimilarity < bestSim) {
                      bestQ = candidateQ;
                      bestSim = candRes.maxSimilarity;
                      bestEmb = candRes.embedding;
                    }

                    if (candRes.maxSimilarity <= SIMILARITY_THRESHOLD) {
                      console.warn(
                        `[QuestionGenerationService] Expanded context regeneration succeeded with similarity ${candRes.maxSimilarity.toFixed(3)} <= ${SIMILARITY_THRESHOLD}.`
                      );
                      currentQ = candidateQ;
                      maxSimilarity = candRes.maxSimilarity;
                      embedding = candRes.embedding;
                    }
                  }
                } else {
                  if (regenStatsTracker) {
                    regenStatsTracker.actualTokensSpent += estimatedPreCall;
                  }
                }
              } else {
                contentLimitedTopics.add(top);
              }
            } catch (extraErr) {
              console.warn(`[QuestionGenerationService] Failed fetching extra chunks for topic "${top}":`, extraErr);
            }
          }

          if (maxSimilarity > SIMILARITY_THRESHOLD) {
            console.warn(
              `[QuestionGenerationService] Regeneration completed for topic "${top}". Accepting candidate with lowest similarity (${bestSim.toFixed(3)}). Marking topic as saturated.`
            );
            saturatedTopics.add(top);
            contentLimitedTopics.add(top);
            currentQ = bestQ;
            maxSimilarity = bestSim;
            embedding = bestEmb;
            currentQ.flaggedSimilar = true;
            currentQ.similarityWarning = 'Possivelmente similar a outra questão deste simulado (limite de diversidade do conteúdo atingido).';
          }
        }
      }

      // TAREFA 4: Registra o statement final aprovado no conjunto compartilhado
      if (sharedGeneratedStatements && currentQ.statement) {
        if (!sharedGeneratedStatements.includes(currentQ.statement)) {
          sharedGeneratedStatements.push(currentQ.statement);
        }
      }

      const tempQId = `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      if (embedding && embedding.length > 0) {
        await questionSimilarityEngine.registerQuestionEmbedding(tempQId, spec, top, embedding);
      }

      return currentQ;
    } catch (questionErr) {
      console.warn(
        `[QuestionGenerationService] Similarity check failed for individual question "${q.statement?.substring(0, 30)}" — accepting question without similarity check:`,
        questionErr
      );
      return q;
    }
  });
}

async function replaceInvalidQuestionsDeficit(
  validQuestions: any[],
  targetQuantity: number,
  postPayload: any,
  maxReplacementAttempts = 3,
  saturatedTopics: Set<string> = new Set(),
  contentLimitedTopics: Set<string> = new Set(),
  regenStatsTracker?: SimilarityRegenStatsTracker,
  sharedGeneratedStatements?: string[]
): Promise<any[]> {
  let currentValid = [...validQuestions];
  let attempt = 0;

  while (currentValid.length < targetQuantity && attempt < maxReplacementAttempts) {
    attempt++;
    const deficit = targetQuantity - currentValid.length;
    console.warn(
      `[QuestionGenerationService] Deficit of ${deficit} valid questions detected. Attempting replacement call ${attempt}/${maxReplacementAttempts}...`
    );

    try {
      const originalTopics = postPayload.topics || [];
      const availableTopics = originalTopics.filter((t: string) => !saturatedTopics.has(t));
      let replacementTopics = availableTopics;

      if (availableTopics.length === 0) {
        if (originalTopics.length > 0) {
          console.warn(
            '[QuestionGenerationService] Todos os tópicos disponíveis já estão saturados. Mantendo o pool completo de tópicos para a tentativa de reposição.'
          );
        }
        replacementTopics = originalTopics;
      }

      const antiDupList = [
        ...(postPayload.existingQuestionsSummary ? [postPayload.existingQuestionsSummary] : []),
        ...currentValid.map((q) => q.statement || ''),
        ...(sharedGeneratedStatements || []),
      ];

      const replacementPayload = {
        ...postPayload,
        quantity: deficit,
        topics: replacementTopics,
        avoidTopics: Array.from(saturatedTopics),
        existingQuestionsSummary: formatCompactAntiDuplicationList(antiDupList, 30),
      };

      const res = await fetch(apiUrl('/api/generate-questions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(replacementPayload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.questions)) {
          const repValidationItems = data.localValidation?.items || [];
          const repWithReview = data.questions.map((q: any, qIdx: number) => {
            const matchedValidation = repValidationItems.find(
              (v: any) => v.itemType === 'question' && data.questions.indexOf(q) === v.index
            );
            const assigned = (postPayload.coverageAssignments && postPayload.coverageAssignments[qIdx]) || undefined;
            return {
              ...q,
              sourceContextExcerpt: q.sourceContextExcerpt || (assigned ? assigned.unitContent.slice(0, 300) : undefined),
              coverageUnitId: q.coverageUnitId || assigned?.unitId,
              coverageUnitLabel: q.coverageUnitLabel || assigned?.unitLabel,
              __needsReview: matchedValidation?.status === 'low_anchoring',
            };
          });
          const repRetrievedChunksText = Array.isArray(postPayload.retrievedChunks)
            ? postPayload.retrievedChunks.map((c: any) => c.text || c.content || (typeof c === 'string' ? c : '')).join(' ')
            : undefined;
          let replacementValid = repWithReview.filter(
            (q: any) => isValidGeneratedQuestion(q) && isQuestionGroundedInCustomContext(q, postPayload.customContext, repRetrievedChunksText)
          );
          if (replacementValid.length > 0) {
            replacementValid = await processRawQuestionsWithSimilarityCheck(
              replacementValid,
              postPayload.specialty || 'Medicina',
              (replacementTopics && replacementTopics[0]) || 'Geral',
              replacementPayload,
              saturatedTopics,
              contentLimitedTopics,
              regenStatsTracker,
              sharedGeneratedStatements
            );
            replacementValid = replacementValid.filter(
              (q: any) => isValidGeneratedQuestion(q) && isQuestionGroundedInCustomContext(q, postPayload.customContext, repRetrievedChunksText)
            );
          }
          console.warn(
            `[QuestionGenerationService] Replacement attempt ${attempt} added ${replacementValid.length} valid questions.`
          );
          currentValid.push(...replacementValid);
        }
      }
    } catch (err) {
      console.warn(`[QuestionGenerationService] Replacement attempt ${attempt} failed:`, err);
    }
  }

  return currentValid.slice(0, targetQuantity);
}

export interface QuestionGenerationResult {
  questionSet?: QuestionSet;
  contentLimitedTopics?: string[];
  adjustedQuantity?: {
    requested: number;
    delivered: number;
    reason: string;
  };
  warning?: {
    lowChunks: boolean;
    chunkCount: number;
    bancaOrProf: string;
    topic: string;
    isGeneralMode?: boolean;
  };
  metrics?: {
    maxWordOverlap: number;
    matchingSequence: string;
  };
  shortfall?: {
    requested: number;
    actual: number;
    reason: string;
  };
  similarityRegenStats?: SimilarityRegenStatsTracker;
}

/**
 * Calculates automatic distribution of total questions across selected topics
 */
export function calculateAutoTopicDistribution(totalQuantity: number, topics: string[]): Record<string, number> {
  if (!topics || topics.length === 0) return {};
  const count = topics.length;
  const base = Math.floor(totalQuantity / count);
  const remainder = totalQuantity % count;

  const distribution: Record<string, number> = {};
  topics.forEach((t, idx) => {
    distribution[t] = base + (idx < remainder ? 1 : 0);
  });
  return distribution;
}

/**
 * Deterministic N-Gram Word Overlap Algorithm
 */
export function findLongestConsecutiveWordOverlap(text1: string, text2: string): { maxOverlapLength: number; matchingSequence: string } {
  const normalize = (t: string) =>
    (t || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/gi, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);
  const words1 = normalize(text1);
  const words2 = normalize(text2);

  let maxLen = 0;
  let maxSeq: string[] = [];

  for (let i = 0; i < words1.length; i++) {
    for (let j = 0; j < words2.length; j++) {
      let k = 0;
      while (i + k < words1.length && j + k < words2.length && words1[i + k] === words2[j + k]) {
        k++;
      }
      if (k > maxLen) {
        maxLen = k;
        maxSeq = words1.slice(i, i + k);
      }
    }
  }

  return {
    maxOverlapLength: maxLen,
    matchingSequence: maxSeq.join(' '),
  };
}

/**
 * Validação de ancoragem estrita no texto-fonte / customContext (Grounding Check pós-geração)
 */
export function isQuestionGroundedInCustomContext(
  q: any,
  customContext?: string,
  retrievedChunksText?: string
): boolean {
  if (!customContext || typeof customContext !== 'string' || customContext.trim().length < 30) {
    return true; // Sem customContext relevante (sem nota do usuário), não aplica restrição
  }

  // Validar contra AMBAS as fontes combinadas (nota + acervo), não só a nota isolada
  const combinedSourceContext = [customContext, retrievedChunksText].filter(Boolean).join(' ');
  const normContext = combinedSourceContext
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const statement = q.statement || '';
  const correctText =
    q.correctAnswerText ||
    (Array.isArray(q.options) ? q.options.find((o: any) => o.isCorrect)?.text : '') ||
    '';

  const combinedText = (statement + ' ' + correctText)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const PT_STOPWORDS_GROUNDING = new Set([
    'para', 'com', 'por', 'sobre', 'entre', 'como', 'mais', 'qual', 'quais',
    'quando', 'onde', 'porque', 'caso', 'clinico', 'paciente', 'apresenta',
    'apresentando', 'quadro', 'anos', 'idade', 'sexo', 'feminino', 'masculino',
    'assinale', 'alternativa', 'correta', 'incorreta', 'resposta', 'diagnostico',
    'conduta', 'exame', 'exames', 'durante', 'apos', 'antes', 'segundo', 'diretriz',
    'seguinte', 'seguintes', 'abaixo', 'acima', 'relacao', 'pacientes', 'quadros',
    'apenas', 'exceto', 'sendo', 'sobretudo', 'principal', 'principais'
  ]);

  const words = combinedText
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !PT_STOPWORDS_GROUNDING.has(w));

  if (words.length === 0) return true;

  let matchedWords = 0;
  for (const w of words) {
    if (normContext.includes(w)) {
      matchedWords++;
    }
  }

  const matchRatio = matchedWords / words.length;
  const overlap = findLongestConsecutiveWordOverlap(statement, combinedSourceContext);

  if (matchedWords < 2 && overlap.maxOverlapLength < 2 && matchRatio < 0.15) {
    console.warn(
      `[QuestionGenerationService] Questão rejeitada no grounding check: conteúdo gerado não ancorado no texto-fonte fornecido (matchRatio: ${(matchRatio * 100).toFixed(1)}%, overlap: ${overlap.maxOverlapLength} palavras).`
    );
    return false;
  }

  return true;
}

async function assemblePrescriptiveQuestionOptions(
  q: any,
  qId: string,
  specialtyStr: string,
  topics: string[],
  fallbackDistractorHints: any[] = []
): Promise<QuestionOption[]> {
  const rawOpts = Array.isArray(q.options) ? q.options : Array.isArray(q.alternatives) ? q.alternatives : [];
  // Se a IA já retornou um array options/alternatives estruturado (com pelo menos 2 opções), mantém compatibilidade
  if (rawOpts.length >= 2) {
    return rawOpts
      .filter((opt: any) => opt && isValidOptionText(opt.text))
      .map((opt: any, oIdx: number) => ({
        id: `opt-${qId}-${opt.letter || String.fromCharCode(65 + oIdx)}`,
        letter: opt.letter || String.fromCharCode(65 + oIdx),
        text: (opt.text || '').trim(),
        isCorrect: opt.isCorrect ?? (opt.letter === q.correctOptionLetter),
        explanation: opt.explanation || '',
        distractorType: opt.distractorType || undefined,
      }));
  }

  const correctAnswerText = (q.correctAnswerText || q.correctAnswer || '').trim();
  const correctAnswerExplanation =
    q.correctAnswerExplanation ||
    (typeof q.commentary === 'string' ? q.commentary : q.commentary?.correta) ||
    'Resposta correta fundamentada nas diretrizes médicas.';

  // 1. Busca distratores específicos via DistractorEngine
  let candidates: any[] = [];
  if (correctAnswerText && isValidOptionText(correctAnswerText)) {
    try {
      candidates = await distractorEngine.getCandidates({
        correctAnswerText,
        specialty: specialtyStr,
        topics: topics || [],
        limit: 6,
      });
    } catch (err) {
      console.warn('[QuestionGenerationService] DistractorEngine error for question:', err);
    }
  }

  // 2. Filtra candidatos distintos (diferentes entre si e da resposta correta)
  const normCorrect = (correctAnswerText || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const uniqueCandidates: any[] = [];
  const seenCandidateTexts = new Set<string>();

  for (const c of candidates) {
    const cText = (c.text || c.label || '').trim();
    if (!isValidOptionText(cText)) continue;
    const normC = cText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!normC || normC === normCorrect || seenCandidateTexts.has(normC)) continue;
    seenCandidateTexts.add(normC);
    uniqueCandidates.push({ text: cText, rationale: c.rationale });
  }

  // 3. Fallback em cascata com pool genérico do lote se houver menos de 3
  if (uniqueCandidates.length < 3 && Array.isArray(fallbackDistractorHints)) {
    for (const h of fallbackDistractorHints) {
      const hText = (h.text || h.label || (typeof h === 'string' ? h : '')).trim();
      if (!isValidOptionText(hText)) continue;
      const normH = hText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (!normH || normH === normCorrect || seenCandidateTexts.has(normH)) continue;
      seenCandidateTexts.add(normH);
      uniqueCandidates.push({ text: hText, rationale: h.rationale });
      if (uniqueCandidates.length >= 3) break;
    }
  }

  // Seleciona até 3 incorretos
  const selectedDistractors = uniqueCandidates.slice(0, 3);

  // 4. Monta as opções (1 correta + incorretas)
  const rawOptions = [
    {
      text: correctAnswerText || 'Opção correta',
      isCorrect: true,
      explanation: correctAnswerExplanation,
    },
    ...selectedDistractors.map((d) => ({
      text: d.text,
      isCorrect: false,
      explanation: d.rationale || 'Conduta/diagnóstico incorreto para o quadro apresentado.',
    })),
  ];

  // 5. Embaralha com Fisher-Yates
  for (let i = rawOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rawOptions[i], rawOptions[j]] = [rawOptions[j], rawOptions[i]];
  }

  // 6. Atribui IDs e letras A/B/C/D
  return rawOptions.map((opt, idx) => ({
    id: `opt-${qId}-${String.fromCharCode(65 + idx)}`,
    letter: String.fromCharCode(65 + idx),
    text: opt.text,
    isCorrect: opt.isCorrect,
    explanation: opt.explanation,
  }));
}

export class QuestionGenerationService {

  /**
   * Main entrypoint for Question Generation
   */
  public async generateQuestions(
    request: QuestionGenerationRequest,
    ignoreLowChunkWarning = false
  ): Promise<QuestionGenerationResult> {
    const config = request.configuration;
    const distributionMode = config.distributionMode || 'interdisciplinar';

    if (distributionMode === 'distribuido') {
      return this.generateDistributedQuestions(request, ignoreLowChunkWarning);
    } else {
      return this.generateInterdisciplinaryQuestions(request, ignoreLowChunkWarning);
    }
  }

  /**
   * Mode A: Interdisciplinary Generation (Cases integrating all selected topics and specialties)
   */
  private async generateInterdisciplinaryQuestions(
    request: QuestionGenerationRequest,
    ignoreLowChunkWarning: boolean
  ): Promise<QuestionGenerationResult> {
    const config = request.configuration;
    const quantity = config.quantity || 5;
    const MAX_ITEMS_PER_AI_CALL = 5;

    const specialtyStr = config.specialties && config.specialties.length > 0 ? config.specialties.join(' & ') : config.specialty || 'Clínica Médica';
    const mainTopic = config.topics && config.topics.length > 0 ? config.topics.join(' & ') : 'Geral';
    const subtopicStr = (config.selectedSubtopics && config.selectedSubtopics.length > 0)
      ? config.selectedSubtopics.join(' ')
      : (config.subtopic || '');

    // 0. Local Question Matcher: busca questões locais antes do RAG via RepositoryFactory
    let existingLocalQuestions: Question[] = [];
    try {
      existingLocalQuestions = await questionRepo.findExistingQuestionsByTopic(
        specialtyStr,
        mainTopic,
        subtopicStr,
        10
      );
    } catch (err) {
      console.warn('[QuestionGenerationService] Error finding local existing questions:', err);
    }

    const directlyReusedQuestions: Question[] = [];
    const directlyReusedIds = new Set<string>();

    if (config.prioritizeLocalQuestions && existingLocalQuestions.length > 0) {
      // Regra de Direitos Autorais: questões de terceiros NUNCA são reusadas verbatim
      const eligibleForDirectReuse = existingLocalQuestions.filter((q) => !isThirdPartyQuestion(q));
      const reuseCount = Math.min(eligibleForDirectReuse.length, quantity);

      for (let i = 0; i < reuseCount; i++) {
        const eq = eligibleForDirectReuse[i];
        directlyReusedIds.add(eq.id);
        directlyReusedQuestions.push({
          ...eq,
          id: `q-local-reused-${Date.now()}-${i + 1}-${Math.random().toString(36).substring(2, 6)}`,
          originSource: eq.originSource || 'Banco Local (Reuso Direto)',
          isAnswered: false,
          userAnswerId: undefined,
          isCorrect: undefined,
          answeredAt: undefined,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // AJUSTE 3: Exclui da lista de candidatas para adaptação qualquer questão que já foi reusada diretamente
    const adaptationCandidates = existingLocalQuestions.filter((q) => !directlyReusedIds.has(q.id));

    let aiQuantityToGenerate = quantity - directlyReusedQuestions.length;

    // Se 100% das questões foram supridas pelo reuso direto local
    if (aiQuantityToGenerate <= 0) {
      const setId = `qset-local-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const now = new Date().toISOString();
      const finalQuestions = directlyReusedQuestions.map((q) => ({ ...q, setId }));
      const questionSet: QuestionSet = {
        id: setId,
        title: `Simulado: ${specialtyStr} - ${mainTopic} (Banco Local)`,
        request,
        questions: finalQuestions,
        totalQuestions: finalQuestions.length,
        answeredCount: 0,
        correctCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      return {
        questionSet,
        metrics: { maxWordOverlap: 0, matchingSequence: '' },
      };
    }
    
    const isGeneralMode = !request.mode || request.mode === 'geral' || (!request.bancaName && !request.professorName);
    const selectedOriginName = isGeneralMode ? '' : (request.mode === 'banca' ? request.bancaName || '' : request.professorName || '');

    // Dynamic RAG topK calculation: broader reference context for larger question batches up to a cap of 30 chunks
    const baseTopK = isGeneralMode ? 10 : 8;
    const topK = Math.min(30, baseTopK + Math.ceil(aiQuantityToGenerate / 3));

    // 1. Retrieve RAG chunks matching all topics & specialties
    const searchQuery = `${specialtyStr} ${mainTopic} ${subtopicStr}`.trim();
    const retrievedChunks = await ragEngine.retrieveContext(searchQuery, {
      banca: isGeneralMode ? undefined : (request.mode === 'banca' ? request.bancaName : undefined),
      professor: isGeneralMode ? undefined : (request.mode === 'professor' ? request.professorName : undefined),
      topK,
    });

    if (retrievedChunks.length < 3 && !ignoreLowChunkWarning && !config.strictCustomContextOnly) {
      return {
        warning: {
          lowChunks: true,
          chunkCount: retrievedChunks.length,
          bancaOrProf: isGeneralMode
            ? 'Base de Conhecimento Geral'
            : selectedOriginName || (request.mode === 'banca' ? 'Banca' : 'Professor'),
          topic: mainTopic,
          isGeneralMode,
        },
      };
    }

    // 1.1 Busca de referência clínica adicional em bancos de prova se for disciplina de Ciclo Básico
    let examReferenceChunks: SemanticChunkResult[] = [];
    const isBasicCycle =
      (config.topics || []).some((t) => isBasicCycleSpecialty(t)) ||
      isBasicCycleSpecialty(specialtyStr || '') ||
      isBasicCycleSpecialty(config.specialty || '');

    if (isBasicCycle) {
      const examBankAssetIds = await getExamBankAssetIds();
      if (examBankAssetIds.length > 0) {
        try {
          examReferenceChunks = await ragEngine.retrieveContext(searchQuery, {
            topK: 3,
            assetIds: examBankAssetIds,
          });
        } catch (err) {
          console.warn('[QuestionGenerationService] Failed to retrieve examReferenceChunks:', err);
        }
      }
    }

    // 2. Distractor Engine Candidates Generation anchored on extracted entity keys
    const topicCanonicalKeys: string[] = [];
    for (const c of retrievedChunks) {
      if (c.entities) {
        for (const e of c.entities) {
          if (e.canonicalKey) topicCanonicalKeys.push(e.canonicalKey);
        }
      }
    }

    let distractorHints: any[] = [];
    try {
      distractorHints = await distractorEngine.getCandidates({
        correctAnswerText: '',
        topicCanonicalKeys,
        specialty: specialtyStr,
        topics: config.topics || [],
        limit: 10,
      });
    } catch (err) {
      console.warn('[QuestionGenerationService] DistractorEngine error:', err);
    }


    // Segmentação de customContext em Coverage Units se fornecido
    let coverageUnits: CoverageUnit[] = [];
    if (config.customContext && config.customContext.trim()) {
      try {
        coverageUnits = await segmentContextIntoCoverageUnits(config.customContext);
      } catch (err) {
        console.warn('[QuestionGenerationService] Error segmenting customContext into coverage units:', err);
      }
    }

    // TAREFA 2: Estima capacidade de diversidade do conteúdo ANTES de gastar tokens
    const contentLimitedTopics = new Set<string>();
    const diversityEstimate = estimateTopicDiversityCapacity(
      mainTopic,
      config.customContext,
      retrievedChunks,
      coverageUnits
    );

    let topicDiversityDirective = '';
    let adjustedQuantityInfo: { requested: number; delivered: number; reason: string } | undefined = undefined;

    if (diversityEstimate.isLimited || aiQuantityToGenerate > diversityEstimate.capacity) {
      contentLimitedTopics.add(mainTopic);
      topicDiversityDirective = formatDiversityDirectivePrompt(mainTopic, aiQuantityToGenerate, diversityEstimate.capacity);
      console.warn(
        `[QuestionGenerationService] Tópico "${mainTopic}" possui conteúdo concentrado (${diversityEstimate.reason} - capacidade estimada: ~${diversityEstimate.capacity}, solicitadas: ${aiQuantityToGenerate}). Ativando diretriz de máxima diversidade na 1ª tentativa.`
      );

      // Se autoCapLimitedQuantity estiver habilitado, ajusta para a capacidade estimada
      if (config.autoCapLimitedQuantity && aiQuantityToGenerate > diversityEstimate.capacity) {
        const cappedAIQuantity = Math.max(1, diversityEstimate.capacity);
        adjustedQuantityInfo = {
          requested: quantity,
          delivered: cappedAIQuantity + directlyReusedQuestions.length,
          reason: `Conteúdo-fonte com material concentrado em "${mainTopic}" (~${diversityEstimate.capacity} questões com qualidade garantida).`,
        };
        console.warn(
          `[QuestionGenerationService] autoCapLimitedQuantity ativo: reduzindo quantidade de IA de ${aiQuantityToGenerate} para ${cappedAIQuantity}.`
        );
        aiQuantityToGenerate = cappedAIQuantity;
      }
    }

    // Split quantity into batches of up to MAX_ITEMS_PER_AI_CALL (5)
    const batchQuantities: number[] = [];
    let rem = aiQuantityToGenerate;
    while (rem > 0) {
      const current = Math.min(rem, MAX_ITEMS_PER_AI_CALL);
      batchQuantities.push(current);
      rem -= current;
    }

    // PASSO 1 & 2: Mapeia as unidades de cobertura para a quantidade TOTAL de questões ANTES do batching
    let allCoverageAssignments: CoverageAssignment[] = [];
    if (coverageUnits.length > 0 && aiQuantityToGenerate > 0) {
      const { assignments } = assignCoverageUnitsToQuestions(coverageUnits, aiQuantityToGenerate);
      allCoverageAssignments = assignments;
    }

    // Prepara as fatias contíguas de assignments por lote para evitar sobreposição entre lotes
    let currentAssignmentOffset = 0;
    const batchCoverageMap: CoverageAssignment[][] = [];
    for (const batchQty of batchQuantities) {
      const batchSlice = allCoverageAssignments.slice(
        currentAssignmentOffset,
        currentAssignmentOffset + batchQty
      );
      // Re-indexa questionIndex para 0..batchQty-1 para cada requisição individual ao servidor
      const reindexedSlice = batchSlice.map((a, idx) => ({
        ...a,
        questionIndex: idx,
      }));
      batchCoverageMap.push(reindexedSlice);
      currentAssignmentOffset += batchQty;
    }

    const allRawQuestions: any[] = [];
    const saturatedTopics = new Set<string>();
    const regenStatsTracker = createSimilarityRegenStatsTracker();
    const sharedGeneratedStatements: string[] = [];

    // Retrieve saved professor style analysis if available
    let professorStyleAnalysis: any = undefined;
    let examDNA: any = undefined;
    if (request.mode === 'professor') {
      try {
        const profs = await questionRepo.getProfessorProfiles();
        const matched = profs.find(
          (p) => (request.professorProfileId && p.id === request.professorProfileId) || (request.professorName && p.name === request.professorName)
        );
        if (matched) {
          if (matched.styleAnalysis) {
            professorStyleAnalysis = matched.styleAnalysis;
          }
          if (matched.examDNA || matched.styleAnalysis?.examDNA) {
            examDNA = matched.examDNA || matched.styleAnalysis?.examDNA;
          }
        }
      } catch (err) {
        console.warn('[QuestionGenerationService] Failed to load professor style analysis:', err);
      }
    }

    const batchResults = await mapWithConcurrency(batchQuantities, 3, async (batchQty, batchIdx) => {
      const chunksForThisBatch = batchIdx === 0
        ? retrievedChunks
        : pruneChunksByTokenBudget(
            retrievedChunks.map((c) => ({
              ...c,
              content: truncateChunkText(c.content, 600),
            })),
            SECONDARY_BATCH_CONTEXT_TOKENS_PER_CALL
          );

      const estimatedContextTokens = estimateTokenCount(chunksForThisBatch);
      console.debug(
        `[QuestionGenerationService] Lote ${batchIdx + 1}/${batchQuantities.length}: ` +
        `${chunksForThisBatch.length} chunks (~${estimatedContextTokens} tokens de contexto, ` +
        `modo: ${batchIdx === 0 ? 'completo' : 'truncado 600ch/4500tok'}).`
      );

      let adaptationPromptBlockForThisBatch = '';
      if (adaptationCandidates.length > 0) {
        const candidateIdx = batchIdx % adaptationCandidates.length;
        adaptationPromptBlockForThisBatch = formatAdaptationPromptBlock(adaptationCandidates[candidateIdx]);
      }

      const batchCoverageAssignments: CoverageAssignment[] = batchCoverageMap[batchIdx] || [];

      // TAREFA 4: Consulta em tempo real os enunciados já gerados pelos lotes paralelos
      const liveAntiDuplication = sharedGeneratedStatements.length > 0
        ? formatCompactAntiDuplicationList([...sharedGeneratedStatements], 30)
        : undefined;

      const rawPayload = {
        retrievedChunks: config.strictCustomContextOnly ? [] : chunksForThisBatch,
        examReferenceChunks: (config.strictCustomContextOnly || examReferenceChunks.length === 0) ? undefined : examReferenceChunks,
        specialty: specialtyStr,
        topics: config.topics,
        quantity: batchQty,
        difficulty: config.difficulty,
        questionType: config.questionType,
        bancaName: request.bancaName,
        professorName: request.professorName,
        professorStyleAnalysis,
        examDNA,
        mode: request.mode || 'geral',
        distractorHints,
        customContext: [config.customContext, adaptationPromptBlockForThisBatch, topicDiversityDirective].filter(Boolean).join('\n\n'),
        coverageAssignments: batchCoverageAssignments.length > 0 ? batchCoverageAssignments : undefined,
        strictCustomContextOnly: config.strictCustomContextOnly,
        existingQuestionsSummary: liveAntiDuplication,
      };

      const postPayload = pruneObjectByTokenBudget(rawPayload, MAX_TOTAL_PAYLOAD_TOKENS);


      const res = await fetch(apiUrl('/api/generate-questions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postPayload),
      });


      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Falha ao gerar simulado lote ${batchIdx + 1} (${res.statusText})`);
      }

      const data = await res.json();
      if (!data.success || !data.questions) {
        throw new Error(data.error || 'A IA não retornou questões válidas.');
      }

      const batchValidationItems = data.localValidation?.items || [];
      let batchRawQuestions: any[] = data.questions.map((q: any, qIdx: number) => {
        const matchedValidation = batchValidationItems.find(
          (v: any) => v.itemType === 'question' && data.questions.indexOf(q) === v.index
        );
        const assigned = batchCoverageAssignments[qIdx] || batchCoverageAssignments.find((a) => a.unitId === q.coverageUnitId);
        const statement = (q.statement || q.questionText || '').trim();
        const options = Array.isArray(q.options) ? q.options : Array.isArray(q.alternatives) ? q.alternatives : undefined;
        const explanation = q.explanation || q.correctAnswerExplanation;
        const sourceExcerpt = q.sourceContextExcerpt || (assigned ? assigned.unitContent.slice(0, 300) : undefined);

        // Validação de distractores e variação de tamanho
        if (Array.isArray(options) && options.length > 0) {
          options.forEach((opt: any) => {
            if (!opt.isCorrect && sourceExcerpt) {
              const validation = validateDistracter(sourceExcerpt, opt.text, opt.distractorType);
              if (!validation.valid) {
                console.warn(`[QuestionGenerationService] Q${qIdx + 1}: ${validation.reason}`);
              }
            }
          });

          if (!ensureVariedCorrectLength(options, qIdx)) {
            console.warn(`[QuestionGenerationService] Q${qIdx + 1}: Padrão detectado no tamanho da resposta correta`);
          }
        }

        return {
          ...q,
          statement,
          options,
          correctAnswerExplanation: explanation,
          sourceContextExcerpt: sourceExcerpt,
          coverageUnitId: q.coverageUnitId || assigned?.unitId,
          coverageUnitLabel: assigned?.unitLabel,
          __needsReview: matchedValidation?.status === 'low_anchoring',
        };
      });

      const calcOverlap = (rawList: any[]) => {
        let maxLen = 0;
        let seq = '';
        for (const q of rawList) {
          const statementStr = q.statement || '';
          for (const chunk of retrievedChunks) {
            const chunkTextStr = typeof chunk === 'string' ? chunk : chunk.content;
            const overlap = findLongestConsecutiveWordOverlap(statementStr, chunkTextStr);
            if (overlap.maxOverlapLength > maxLen) {
              maxLen = overlap.maxOverlapLength;
              seq = overlap.matchingSequence;
            }
          }
        }
        return { maxLen, seq };
      };

      const initialOverlap = calcOverlap(batchRawQuestions);

      if (initialOverlap.maxLen >= 4) {
        console.warn(
          `[QuestionGenerationService] High N-Gram overlap detected (${initialOverlap.maxLen} words). Performing 1 auto-retry for batch ${batchIdx + 1}...`
        );
        try {
          const retryRes = await fetch(apiUrl('/api/generate-questions'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postPayload),
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            if (retryData.success && Array.isArray(retryData.questions)) {
              const retryOverlap = calcOverlap(retryData.questions);
              if (retryOverlap.maxLen < initialOverlap.maxLen) {
                console.warn(
                  `[QuestionGenerationService] Auto-retry successful: overlap reduced from ${initialOverlap.maxLen} to ${retryOverlap.maxLen} words.`
                );
                const retryValidationItems = retryData.localValidation?.items || [];
                batchRawQuestions = retryData.questions.map((q: any) => {
                  const matchedValidation = retryValidationItems.find(
                    (v: any) => v.itemType === 'question' && retryData.questions.indexOf(q) === v.index
                  );
                  return {
                    ...q,
                    __needsReview: matchedValidation?.status === 'low_anchoring',
                  };
                });
              }
            }
          }
        } catch (retryErr) {
          console.warn('[QuestionGenerationService] Auto-retry request failed:', retryErr);
        }
      }

      batchRawQuestions = await processRawQuestionsWithSimilarityCheck(
        batchRawQuestions,
        specialtyStr,
        mainTopic,
        postPayload,
        saturatedTopics,
        contentLimitedTopics,
        regenStatsTracker,
        sharedGeneratedStatements
      );

      return batchRawQuestions;
    });

    for (const bQuestions of batchResults) {
      allRawQuestions.push(...bQuestions);
    }

    const calcOverallOverlap = (rawList: any[]) => {
      let maxLen = 0;
      let seq = '';
      for (const q of rawList) {
        const statementStr = q.statement || '';
        for (const chunk of retrievedChunks) {
          const chunkTextStr = typeof chunk === 'string' ? chunk : chunk.content;
          const overlap = findLongestConsecutiveWordOverlap(statementStr, chunkTextStr);
          if (overlap.maxOverlapLength > maxLen) {
            maxLen = overlap.maxOverlapLength;
            seq = overlap.matchingSequence;
          }
        }
      }
      return { maxLen, seq };
    };

    const finalOverlap = calcOverallOverlap(allRawQuestions);

    const now = new Date().toISOString();
    const setId = `qset-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const originSourceLabel = isGeneralMode
      ? 'Base de Conhecimento Geral'
      : request.mode === 'banca'
      ? `Banca ${request.bancaName || 'de Residência'}`
      : `Prof. ${request.professorName || 'Personalizado'}`;

    let overallMaxWordOverlap = finalOverlap.maxLen;
    let overallMatchingSeq = finalOverlap.seq;

    const directRetrievedChunksText = Array.isArray(retrievedChunks)
      ? retrievedChunks.map((c: any) => c.text || c.content || (typeof c === 'string' ? c : '')).join(' ')
      : undefined;

    let validRawQuestions = allRawQuestions.filter((q) =>
      isValidGeneratedQuestion(q) && isQuestionGroundedInCustomContext(q, config.customContext, directRetrievedChunksText)
    );
    if (validRawQuestions.length < quantity) {
      console.warn(
        `[QuestionGenerationService] Filtered out ${allRawQuestions.length - validRawQuestions.length} invalid questions from output. Attempting deficit replacement...`
      );
      const postPayloadForInterdisciplinary = {
        retrievedChunks: config.strictCustomContextOnly ? [] : retrievedChunks,
        specialty: specialtyStr,
        topics: config.topics,
        difficulty: config.difficulty,
        questionType: config.questionType,
        bancaName: request.bancaName,
        professorName: request.professorName,
        professorStyleAnalysis,
        examDNA,
        mode: request.mode || 'geral',
        distractorHints,
        customContext: config.customContext,
        strictCustomContextOnly: config.strictCustomContextOnly,
      };
      validRawQuestions = await replaceInvalidQuestionsDeficit(
        validRawQuestions,
        quantity,
        postPayloadForInterdisciplinary,
        3,
        saturatedTopics,
        contentLimitedTopics,
        regenStatsTracker,
        sharedGeneratedStatements
      );
    }

    const questions: Question[] = await Promise.all(
      validRawQuestions.map(async (q: any, idx: number) => {
        const qId = `q-${Date.now()}-${idx + 1}-${Math.random().toString(36).substring(2, 6)}`;
        const statementStr = q.statement || `Questão #${idx + 1}`;

        for (const chunk of retrievedChunks) {
          const chunkTextStr = typeof chunk === 'string' ? chunk : chunk.content;
          const overlap = findLongestConsecutiveWordOverlap(statementStr, chunkTextStr);
          if (overlap.maxOverlapLength > overallMaxWordOverlap) {
            overallMaxWordOverlap = overlap.maxOverlapLength;
            overallMatchingSeq = overlap.matchingSequence;
          }
        }

        const options: QuestionOption[] = await assemblePrescriptiveQuestionOptions(
          q,
          qId,
          specialtyStr,
          config.topics || [],
          distractorHints
        );

        const correctOpt = options.find((o) => o.isCorrect) || options[0];

        return {
          id: qId,
          setId,
          statement: statementStr,
          clinicalContext: q.clinicalContext || undefined,
          assertionItems: Array.isArray(q.assertionItems) ? q.assertionItems : undefined,
          options,
          correctOptionId: correctOpt.id,
          commentary: q.commentary || 'Sem comentário fornecido.',
          references: q.references || undefined,
          tags: Array.isArray(q.tags) && q.tags.length > 0 ? q.tags : [specialtyStr, mainTopic],
          specialty: specialtyStr,
          topic: mainTopic,
          subtopic: config.subtopic,
          difficulty: (q.difficulty || config.difficulty) as any,
          questionType: (q.questionType || config.questionType) as any,
          originSource: originSourceLabel,
          needsReview: Boolean(q.__needsReview),
          sourceContextExcerpt: q.sourceContextExcerpt || undefined,
          coverageUnitId: q.coverageUnitId || undefined,
          coverageUnitLabel: q.coverageUnitLabel || undefined,
          flaggedSimilar: Boolean(q.flaggedSimilar),
          similarityWarning: q.similarityWarning || (q.flaggedSimilar ? 'Possivelmente similar a outra questão deste simulado devido ao limite de diversidade do conteúdo-fonte.' : undefined),
          isAnswered: false,
          createdAt: now,
        };
      })
    );


    const balancedQuestions = balanceAndShuffleQuestionOptions(questions);

    const finalAllQuestions = [
      ...directlyReusedQuestions.map((q) => ({ ...q, setId })),
      ...balancedQuestions,
    ];

    if (finalAllQuestions.length === 0) {
      throw new Error('Não foi possível gerar nenhuma questão válida. Tente novamente ou ajuste os tópicos selecionados.');
    }

    const shortfall = finalAllQuestions.length < quantity ? {
      requested: quantity,
      actual: finalAllQuestions.length,
      reason: `Gerado com ${finalAllQuestions.length} de ${quantity} questões solicitadas — algumas questões não passaram no controle de qualidade.`,
    } : undefined;

    const title = `${specialtyStr}: Simulado Interdisciplinar (${finalAllQuestions.length} q. - ${originSourceLabel})`;

    const questionSet: QuestionSet = {
      id: setId,
      title,
      request,
      questions: finalAllQuestions,
      totalQuestions: finalAllQuestions.length,
      answeredCount: 0,
      correctCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const canonicalKeys = Array.from(
      new Set(
        retrievedChunks
          .flatMap((c) => c.entities || [])
          .map((e) => e.canonicalKey)
          .filter(Boolean)
      )
    );

    if (canonicalKeys.length > 0) {
      for (const q of questions) {
        knowledgeGraphService.linkContentToEntities('question', q.id, canonicalKeys).catch((err) => {
          console.warn('[QuestionGenerationService] Failed linking question to graph entities:', err);
        });
      }
    }

    return {
      questionSet,
      contentLimitedTopics: contentLimitedTopics.size > 0 ? Array.from(contentLimitedTopics) : undefined,
      adjustedQuantity: adjustedQuantityInfo,
      metrics: {
        maxWordOverlap: overallMaxWordOverlap,
        matchingSequence: overallMatchingSeq,
      },
      shortfall: adjustedQuantityInfo ? undefined : shortfall,
      similarityRegenStats: regenStatsTracker.count > 0 ? regenStatsTracker : undefined,
    };
  }

  /**
   * Mode B: Distributed Generation (Multi-Specialty & Multi-Topic Single-Topic Question Blocks)
   */
  private async generateDistributedQuestions(
    request: QuestionGenerationRequest,
    ignoreLowChunkWarning: boolean
  ): Promise<QuestionGenerationResult> {
    const config = request.configuration;
    const totalQuantity = config.quantity || 5;
    const defaultSpecialty = config.specialty || 'Clínica Médica';
    const rawTopics = config.topics && config.topics.length > 0 ? config.topics : ['Geral'];
    const topics = Array.from(new Set(rawTopics));

    if (topics.length < rawTopics.length) {
      console.warn(
        `[QuestionGenerationService] ${rawTopics.length - topics.length} tópico(s) duplicado(s) removido(s) da lista antes da geração distribuída.`
      );
    }
    const topicSpecialtyMap = config.topicSpecialtyMap || {};
    
    const isGeneralMode = !request.mode || request.mode === 'geral' || (!request.bancaName && !request.professorName);
    const selectedOriginName = isGeneralMode ? '' : (request.mode === 'banca' ? request.bancaName || '' : request.professorName || '');
    const baseTopK = isGeneralMode ? 10 : 8;
    const topK = Math.min(30, baseTopK + Math.ceil(totalQuantity / 3));

    // Calculate allocation per topic
    const topicAllocation =
      config.customTopicQuantities && Object.keys(config.customTopicQuantities).length > 0
        ? config.customTopicQuantities
        : calculateAutoTopicDistribution(totalQuantity, topics);

    const now = new Date().toISOString();
    const setId = `qset-dist-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const originSourceLabel = isGeneralMode
      ? 'Base de Conhecimento Geral'
      : request.mode === 'banca'
      ? `Banca ${request.bancaName || 'de Residência'}`
      : `Prof. ${request.professorName || 'Personalizado'}`;

    // Retrieve saved professor style analysis and examDNA if available
    let professorStyleAnalysis: any = undefined;
    let examDNA: any = undefined;
    if (request.mode === 'professor') {
      try {
        const profs = await questionRepo.getProfessorProfiles();
        const matched = profs.find(
          (p) => (request.professorProfileId && p.id === request.professorProfileId) || (request.professorName && p.name === request.professorName)
        );
        if (matched) {
          if (matched.styleAnalysis) {
            professorStyleAnalysis = matched.styleAnalysis;
          }
          if (matched.examDNA || matched.styleAnalysis?.examDNA) {
            examDNA = matched.examDNA || matched.styleAnalysis?.examDNA;
          }
        }
      } catch (err) {
        console.warn('[QuestionGenerationService] Failed to load professor style analysis or examDNA:', err);
      }
    }

    // Limite de concorrência para geração distribuída por tópico (para não sobrecarregar as APIs Gemini / 9Router)
    const QUESTION_GEN_CONCURRENCY = 3;
    const saturatedTopics = new Set<string>();
    const contentLimitedTopics = new Set<string>();
    const regenStatsTracker = createSimilarityRegenStatsTracker();
    const sharedGeneratedStatements: string[] = [];

    const topicResults = await mapWithConcurrency(topics, QUESTION_GEN_CONCURRENCY, async (singleTopic, topicIndex) => {
      const countForThisTopic = topicAllocation[singleTopic] || 0;
      if (countForThisTopic <= 0) {
        return {
          singleTopic,
          originSpecialty: topicSpecialtyMap[singleTopic] || defaultSpecialty,
          count: 0,
          rawQuestions: [],
          canonicalKeys: [],
          maxOverlapLength: 0,
          matchingSequence: '',
          distractorHints: [],
          error: null,
        };
      }

      const originSpecialty = topicSpecialtyMap[singleTopic] || defaultSpecialty;

      try {
        // 0. Local Question Matcher para o tópico específico
        const topicSpecificSubtopics = config.topicSubtopicsMap?.[singleTopic] || [];
        const subtopicSuffix = topicSpecificSubtopics.length > 0
          ? topicSpecificSubtopics.join(' ')
          : (config.subtopic || '');

        let existingTopicQuestions: Question[] = [];
        try {
          existingTopicQuestions = await questionRepo.findExistingQuestionsByTopic(
            originSpecialty,
            singleTopic,
            subtopicSuffix,
            5
          );
        } catch (err) {
          console.warn(`[QuestionGenerationService] Error finding local existing questions for topic "${singleTopic}":`, err);
        }

        const directlyReusedForTopic: any[] = [];
        const directlyReusedTopicIds = new Set<string>();

        if (config.prioritizeLocalQuestions && existingTopicQuestions.length > 0) {
          const eligible = existingTopicQuestions.filter((q) => !isThirdPartyQuestion(q));
          const reuseCount = Math.min(eligible.length, countForThisTopic);

          for (let i = 0; i < reuseCount; i++) {
            const eq = eligible[i];
            directlyReusedTopicIds.add(eq.id);
            directlyReusedForTopic.push({
              statement: eq.statement,
              clinicalContext: eq.clinicalContext,
              options: eq.options,
              correctAnswerText: eq.options.find((o) => o.isCorrect)?.text || eq.options[0]?.text,
              commentary: eq.commentary,
              references: eq.references,
              tags: eq.tags,
              specialty: eq.specialty || originSpecialty,
              topic: eq.topic || singleTopic,
              subtopic: eq.subtopic,
              difficulty: eq.difficulty || config.difficulty,
              questionType: eq.questionType || config.questionType,
              originSource: eq.originSource || 'Banco Local (Reuso Direto)',
              __needsReview: false,
            });
          }
        }

        // AJUSTE 3: Exclui qualquer questão cujo id já esteja em directlyReusedForTopic
        const adaptationCandidatesForTopic = existingTopicQuestions.filter((q) => !directlyReusedTopicIds.has(q.id));

        // AJUSTE 2: Distribuir questão-base diferente rotacionando pelo topicIndex
        let topicAdaptationBlock = '';
        if (adaptationCandidatesForTopic.length > 0) {
          const candidateIdx = topicIndex % adaptationCandidatesForTopic.length;
          topicAdaptationBlock = formatAdaptationPromptBlock(adaptationCandidatesForTopic[candidateIdx]);
        }

        let aiCountForThisTopic = countForThisTopic - directlyReusedForTopic.length;

        // Se o tópico foi 100% suprido pelo banco local
        if (aiCountForThisTopic <= 0) {
          return {
            singleTopic,
            originSpecialty,
            count: countForThisTopic,
            rawQuestions: directlyReusedForTopic,
            canonicalKeys: [],
            maxOverlapLength: 0,
            matchingSequence: '',
            distractorHints: [],
            error: null,
          };
        }

        // Retrieve RAG context specific to THIS single topic & specialty (incluindo refinamento por subtópicos se houver)
        const searchQuery = `${originSpecialty} ${singleTopic} ${subtopicSuffix}`.trim();
        const retrievedChunks = await ragEngine.retrieveContext(searchQuery, {
          banca: isGeneralMode ? undefined : (request.mode === 'banca' ? request.bancaName : undefined),
          professor: isGeneralMode ? undefined : (request.mode === 'professor' ? request.professorName : undefined),
          topK,
        });

        // Busca de referência clínica adicional em bancos de prova se for disciplina de Ciclo Básico
        let examReferenceChunks: SemanticChunkResult[] = [];
        const isTopicBasicCycle =
          isBasicCycleSpecialty(singleTopic) ||
          isBasicCycleSpecialty(originSpecialty);

        if (isTopicBasicCycle) {
          const examBankAssetIds = await getExamBankAssetIds();
          if (examBankAssetIds.length > 0) {
            try {
              examReferenceChunks = await ragEngine.retrieveContext(searchQuery, {
                topK: 3,
                assetIds: examBankAssetIds,
              });
            } catch (err) {
              console.warn(`[QuestionGenerationService] Failed to retrieve examReferenceChunks for topic ${singleTopic}:`, err);
            }
          }
        }

        const topicCanonicalKeys: string[] = [];
        for (const c of retrievedChunks) {
          if (c.entities) {
            for (const e of c.entities) {
              if (e.canonicalKey) topicCanonicalKeys.push(e.canonicalKey);
            }
          }
        }

        // Generate distractor hints for this specific topic block anchored on extracted entity keys
        let distractorHints: any[] = [];
        try {
          distractorHints = await distractorEngine.getCandidates({
            correctAnswerText: '',
            topicCanonicalKeys,
            specialty: originSpecialty,
            topics: [singleTopic],
            limit: 10,
          });
        } catch (err) {
          console.warn('[QuestionGenerationService] DistractorEngine error:', err);
        }


        // Contexto recortado especificamente para o tópico atual (via similaridade semântica de embeddings locais)
        const baseTopicContext = await extractRelevantContextForTopic(
          config.customContext,
          singleTopic,
          originSpecialty,
          1500
        );

        const topicContext = [baseTopicContext, topicAdaptationBlock].filter(Boolean).join('\n\n');

        // Condensação do perfil de professor e examDNA para geração distribuída
        const {
          professorStyleAnalysis: condensedStyle,
          examDNA: condensedDNA,
        } = condenseProfessorProfileForDistribution(professorStyleAnalysis, examDNA);

        let topicCoverageUnits: CoverageUnit[] = [];
        const sourceForUnits = topicContext || config.customContext;
        if (sourceForUnits && sourceForUnits.trim()) {
          try {
            topicCoverageUnits = await segmentContextIntoCoverageUnits(sourceForUnits);
          } catch (err) {
            console.warn('[QuestionGenerationService] Error segmenting topicContext into coverage units:', err);
          }
        }

        let topicCoverageAssignments: CoverageAssignment[] = [];
        if (topicCoverageUnits.length > 0) {
          const { assignments } = assignCoverageUnitsToQuestions(topicCoverageUnits, aiCountForThisTopic);
          topicCoverageAssignments = assignments;
        }

        // TAREFA 2: Estima capacidade de diversidade do conteúdo para este tópico específico
        const diversityEstimate = estimateTopicDiversityCapacity(
          singleTopic,
          topicContext || config.customContext,
          retrievedChunks,
          topicCoverageUnits
        );

        let topicDiversityDirective = '';
        if (diversityEstimate.isLimited || aiCountForThisTopic > diversityEstimate.capacity) {
          contentLimitedTopics.add(singleTopic);
          topicDiversityDirective = formatDiversityDirectivePrompt(singleTopic, aiCountForThisTopic, diversityEstimate.capacity);
          console.warn(
            `[QuestionGenerationService] Tópico "${singleTopic}" possui conteúdo concentrado (${diversityEstimate.reason} - capacidade estimada: ~${diversityEstimate.capacity}, solicitadas: ${aiCountForThisTopic}). Injetando diretriz de máxima diversidade na 1ª tentativa.`
          );

          if (config.autoCapLimitedQuantity && aiCountForThisTopic > diversityEstimate.capacity) {
            const cappedTopicAI = Math.max(1, diversityEstimate.capacity);
            console.warn(
              `[QuestionGenerationService] autoCapLimitedQuantity ativo no tópico "${singleTopic}": reduzindo de ${aiCountForThisTopic} para ${cappedTopicAI}.`
            );
            aiCountForThisTopic = cappedTopicAI;
            if (topicCoverageUnits.length > 0) {
              const { assignments } = assignCoverageUnitsToQuestions(topicCoverageUnits, aiCountForThisTopic);
              topicCoverageAssignments = assignments;
            }
          }
        }

        // TAREFA 4: Consulta em tempo real os enunciados já gerados por outros lotes
        const liveAntiDuplication = sharedGeneratedStatements.length > 0
          ? formatCompactAntiDuplicationList([...sharedGeneratedStatements], 30)
          : undefined;

        const rawPayload = {
          retrievedChunks: config.strictCustomContextOnly ? [] : retrievedChunks,
          examReferenceChunks: (config.strictCustomContextOnly || examReferenceChunks.length === 0) ? undefined : examReferenceChunks,
          specialty: originSpecialty,
          topics: [singleTopic],
          subtopics: topicSpecificSubtopics.length > 0 ? topicSpecificSubtopics : undefined,
          quantity: aiCountForThisTopic,
          difficulty: config.difficulty,
          questionType: config.questionType,
          bancaName: request.bancaName,
          professorName: request.professorName,
          professorStyleAnalysis: condensedStyle,
          examDNA: condensedDNA,
          mode: request.mode || 'geral',
          distractorHints,
          customContext: [topicContext, topicDiversityDirective].filter(Boolean).join('\n\n') || undefined,
          coverageAssignments: topicCoverageAssignments.length > 0 ? topicCoverageAssignments : undefined,
          strictCustomContextOnly: config.strictCustomContextOnly,
          existingQuestionsSummary: liveAntiDuplication,
        };

        const postPayload = pruneObjectByTokenBudget(rawPayload, MAX_TOTAL_PAYLOAD_TOKENS);

        const res = await fetch(apiUrl('/api/generate-questions'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(postPayload),
        });


        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Falha ao gerar lote para o tópico "${singleTopic}"`);
        }

        const data = await res.json();
        if (!data.success || !data.questions) {
          throw new Error(`A IA não retornou questões para o tópico "${singleTopic}".`);
        }

        const batchValidationItems = data.localValidation?.items || [];
        let rawQuestions: any[] = data.questions.map((q: any, qIdx: number) => {
          const matchedValidation = batchValidationItems.find(
            (v: any) => v.itemType === 'question' && data.questions.indexOf(q) === v.index
          );
          const assigned = topicCoverageAssignments[qIdx] || topicCoverageAssignments.find((a) => a.unitId === q.coverageUnitId);
          const statement = (q.statement || q.questionText || '').trim();
          const options = Array.isArray(q.options) ? q.options : Array.isArray(q.alternatives) ? q.alternatives : undefined;
          const explanation = q.explanation || q.correctAnswerExplanation;
          const sourceExcerpt = q.sourceContextExcerpt || (assigned ? assigned.unitContent.slice(0, 300) : undefined);

          // Validação de distractores e variação de tamanho
          if (Array.isArray(options) && options.length > 0) {
            options.forEach((opt: any) => {
              if (!opt.isCorrect && sourceExcerpt) {
                const validation = validateDistracter(sourceExcerpt, opt.text, opt.distractorType);
                if (!validation.valid) {
                  console.warn(`[QuestionGenerationService] Q${qIdx + 1}: ${validation.reason}`);
                }
              }
            });

            if (!ensureVariedCorrectLength(options, qIdx)) {
              console.warn(`[QuestionGenerationService] Q${qIdx + 1}: Padrão detectado no tamanho da resposta correta`);
            }
          }

          return {
            ...q,
            statement,
            options,
            correctAnswerExplanation: explanation,
            sourceContextExcerpt: sourceExcerpt,
            coverageUnitId: q.coverageUnitId || assigned?.unitId,
            coverageUnitLabel: assigned?.unitLabel,
            __needsReview: matchedValidation?.status === 'low_anchoring',
          };
        });

        const calcTopicOverlap = (rawList: any[]) => {
          let maxLen = 0;
          let seq = '';
          for (const q of rawList) {
            const statementStr = q.statement || '';
            for (const chunk of retrievedChunks) {
              const chunkTextStr = typeof chunk === 'string' ? chunk : chunk.content;
              const overlap = findLongestConsecutiveWordOverlap(statementStr, chunkTextStr);
              if (overlap.maxOverlapLength > maxLen) {
                maxLen = overlap.maxOverlapLength;
                seq = overlap.matchingSequence;
              }
            }
          }
          return { maxLen, seq };
        };

        let initialOverlap = calcTopicOverlap(rawQuestions);

        if (initialOverlap.maxLen >= 4) {
          console.warn(
            `[QuestionGenerationService] High N-Gram overlap detected for topic "${singleTopic}" (${initialOverlap.maxLen} words). Performing 1 auto-retry...`
          );
          try {
            const retryRes = await fetch(apiUrl('/api/generate-questions'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(postPayload),
            });
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              if (retryData.success && Array.isArray(retryData.questions)) {
                const retryOverlap = calcTopicOverlap(retryData.questions);
                if (retryOverlap.maxLen < initialOverlap.maxLen) {
                  console.warn(
                    `[QuestionGenerationService] Auto-retry successful for topic "${singleTopic}": overlap reduced from ${initialOverlap.maxLen} to ${retryOverlap.maxLen} words.`
                  );
                  const retryValidationItems = retryData.localValidation?.items || [];
                  rawQuestions = retryData.questions.map((q: any) => {
                    const matchedValidation = retryValidationItems.find(
                      (v: any) => v.itemType === 'question' && retryData.questions.indexOf(q) === v.index
                    );
                    return {
                      ...q,
                      __needsReview: matchedValidation?.status === 'low_anchoring',
                    };
                  });
                  initialOverlap = retryOverlap;
                }
              }
            }
          } catch (retryErr) {
            console.warn('[QuestionGenerationService] Auto-retry request failed:', retryErr);
          }
        }

        rawQuestions = await processRawQuestionsWithSimilarityCheck(
          rawQuestions,
          originSpecialty,
          singleTopic,
          postPayload,
          saturatedTopics,
          contentLimitedTopics,
          regenStatsTracker,
          sharedGeneratedStatements
        );

        const distRetrievedChunksText = Array.isArray(retrievedChunks)
          ? retrievedChunks.map((c: any) => c.text || c.content || (typeof c === 'string' ? c : '')).join(' ')
          : undefined;

        let validRawQuestions = rawQuestions.filter((q) =>
          isValidGeneratedQuestion(q) && isQuestionGroundedInCustomContext(q, topicContext || config.customContext, distRetrievedChunksText)
        );
        if (validRawQuestions.length < countForThisTopic) {
          console.warn(
            `[QuestionGenerationService] Filtered out ${rawQuestions.length - validRawQuestions.length} invalid questions for topic "${singleTopic}". Attempting deficit replacement...`
          );
          validRawQuestions = await replaceInvalidQuestionsDeficit(
            validRawQuestions,
            countForThisTopic,
            postPayload,
            3,
            saturatedTopics,
            contentLimitedTopics,
            regenStatsTracker,
            sharedGeneratedStatements
          );
        }

        return {
          singleTopic,
          originSpecialty,
          count: countForThisTopic,
          rawQuestions: [...directlyReusedForTopic, ...validRawQuestions],
          canonicalKeys: topicCanonicalKeys,
          maxOverlapLength: initialOverlap.maxLen,
          matchingSequence: initialOverlap.seq,
          distractorHints: distractorHints || [],
          error: null,
        };
      } catch (err: any) {
        console.warn(`[QuestionGenerationService] Partial failure for topic "${singleTopic}":`, err);
        return {
          singleTopic,
          originSpecialty,
          count: countForThisTopic,
          rawQuestions: [],
          canonicalKeys: [],
          maxOverlapLength: 0,
          matchingSequence: '',
          distractorHints: [],
          error: err.message || String(err),
        };
      }
    });

    const allQuestions: Question[] = [];
    let overallMaxWordOverlap = 0;
    let overallMatchingSeq = '';
    let globalIndex = 0;

    const specialtyQuestionCounts: Record<string, number> = {};
    const allCanonicalKeys = new Set<string>();

    for (const topicRes of topicResults) {
      if (topicRes.error || topicRes.rawQuestions.length === 0) continue;

      specialtyQuestionCounts[topicRes.originSpecialty] =
        (specialtyQuestionCounts[topicRes.originSpecialty] || 0) + topicRes.rawQuestions.length;

      for (const key of topicRes.canonicalKeys) {
        allCanonicalKeys.add(key);
      }

      if (topicRes.maxOverlapLength > overallMaxWordOverlap) {
        overallMaxWordOverlap = topicRes.maxOverlapLength;
        overallMatchingSeq = topicRes.matchingSequence;
      }

      for (const q of topicRes.rawQuestions) {
        globalIndex++;
        const qId = `q-${Date.now()}-${globalIndex}-${Math.random().toString(36).substring(2, 6)}`;
        const statementStr = q.statement || `Questão #${globalIndex}`;

        const options: QuestionOption[] = await assemblePrescriptiveQuestionOptions(
          q,
          qId,
          topicRes.originSpecialty,
          [topicRes.singleTopic],
          topicRes.distractorHints || []
        );


        const correctOpt = options.find((o) => o.isCorrect) || options[0];

        allQuestions.push({
          id: qId,
          setId,
          statement: statementStr,
          clinicalContext: q.clinicalContext || undefined,
          assertionItems: Array.isArray(q.assertionItems) ? q.assertionItems : undefined,
          options,
          correctOptionId: correctOpt.id,
          commentary: q.commentary || 'Sem comentário fornecido.',
          references: q.references || undefined,
          tags: Array.isArray(q.tags) && q.tags.length > 0 ? q.tags : [topicRes.originSpecialty, topicRes.singleTopic],
          specialty: topicRes.originSpecialty,
          topic: topicRes.singleTopic,
          subtopic: config.subtopic,
          difficulty: (q.difficulty || config.difficulty) as any,
          questionType: (q.questionType || config.questionType) as any,
          originSource: originSourceLabel,
          needsReview: Boolean(q.__needsReview),
          sourceContextExcerpt: q.sourceContextExcerpt || undefined,
          coverageUnitId: q.coverageUnitId || undefined,
          coverageUnitLabel: q.coverageUnitLabel || undefined,
          flaggedSimilar: Boolean(q.flaggedSimilar),
          similarityWarning: q.similarityWarning || (q.flaggedSimilar ? 'Possivelmente similar a outra questão deste simulado devido ao limite de diversidade do conteúdo-fonte.' : undefined),
          isAnswered: false,
          createdAt: now,
        });
      }

    }

    const summarySpecList = Object.entries(specialtyQuestionCounts)
      .map(([spec, cnt]) => `${cnt} de ${spec}`)
      .join(', ');

    const balancedQuestions = balanceAndShuffleQuestionOptions(allQuestions);

    if (balancedQuestions.length === 0) {
      throw new Error('Não foi possível gerar nenhuma questão válida. Tente novamente ou ajuste os tópicos selecionados.');
    }

    const adjustedQuantityInfo = (config.autoCapLimitedQuantity && balancedQuestions.length < totalQuantity)
      ? {
          requested: totalQuantity,
          delivered: balancedQuestions.length,
          reason: `Conteúdo-fonte concentrado com capacidade estimada para ~${balancedQuestions.length} questões com qualidade garantida.`,
        }
      : undefined;

    const shortfall = (!adjustedQuantityInfo && balancedQuestions.length < totalQuantity) ? {
      requested: totalQuantity,
      actual: balancedQuestions.length,
      reason: `Gerado com ${balancedQuestions.length} de ${totalQuantity} questões solicitadas — algumas questões não passaram no controle de qualidade.`,
    } : undefined;

    const title = `Simulado Distribuído (${balancedQuestions.length} q.: ${summarySpecList})`;

    const questionSet: QuestionSet = {
      id: setId,
      title,
      request,
      questions: balancedQuestions,
      totalQuestions: balancedQuestions.length,
      answeredCount: 0,
      correctCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (allCanonicalKeys.size > 0) {
      const keysArray = Array.from(allCanonicalKeys);
      for (const q of allQuestions) {
        knowledgeGraphService.linkContentToEntities('question', q.id, keysArray).catch((err) => {
          console.warn('[QuestionGenerationService] Failed linking distributed question to graph entities:', err);
        });
      }
    }

    return {
      questionSet,
      contentLimitedTopics: contentLimitedTopics.size > 0 ? Array.from(contentLimitedTopics) : undefined,
      adjustedQuantity: adjustedQuantityInfo,
      metrics: {
        maxWordOverlap: overallMaxWordOverlap,
        matchingSequence: overallMatchingSeq,
      },
      shortfall,
      similarityRegenStats: regenStatsTracker.count > 0 ? regenStatsTracker : undefined,
    };
  }
}

