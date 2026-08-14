import {
  QuestionGenerationRequest,
  QuestionSet,
  Question,
  QuestionOption,
} from '../../domain/entities/Question';
import { ragEngine } from './RAGEngine';
import { knowledgeGraphService } from './KnowledgeGraphService';
import { distractorEngine } from './distractorEngine/DistractorEngine';
import { isValidGeneratedQuestion } from '../../core/utils/contentValidation';
import { mapWithConcurrency } from '../../core/utils/asyncUtils';
import { formatCompactAntiDuplicationList } from '../../core/utils/termExtractor';
import { balanceAndShuffleQuestionOptions } from '../../core/utils/optionBalancer';
import { QuestionRepositoryImpl } from '../repositories_impl/QuestionRepositoryImpl';
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
} from './tokenBudget';





const questionRepo = new QuestionRepositoryImpl();

async function processRawQuestionsWithSimilarityCheck(
  rawQuestions: any[],
  specialtyStr: string,
  topicStr: string,
  postPayload: any,
  saturatedTopics: Set<string> = new Set(),
  contentLimitedTopics: Set<string> = new Set()
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

      let { maxSimilarity, embedding } = await questionSimilarityEngine.findMaxSimilarity(
        initialStatement,
        spec,
        top,
        initialEmb
      );

      if (maxSimilarity > SIMILARITY_THRESHOLD) {
        console.warn(
          `[QuestionGenerationService] High question similarity detected (${maxSimilarity.toFixed(3)} > ${SIMILARITY_THRESHOLD}) for topic "${top}". Initiating regeneration attempts...`
        );

        let bestQ = currentQ;
        let bestSim = maxSimilarity;
        let bestEmb = embedding;
        const rejectedStatements = [initialStatement];

        for (let attempt = 1; attempt <= MAX_REGENERATION_ATTEMPTS; attempt++) {
          try {
            const similarityAvoidHint = rejectedStatements
              .map((s, i) => `EVITE especificamente a seguinte abordagem/enunciado rejeitado #${i + 1}: "${s}"`)
              .join('\n');

            const singlePayload = {
              ...postPayload,
              quantity: 1,
              topics: [top],
              existingQuestionsSummary: formatCompactAntiDuplicationList(
                [
                  ...(postPayload.existingQuestionsSummary ? [postPayload.existingQuestionsSummary] : []),
                  similarityAvoidHint,
                ],
                30
              ),
            };

            const res = await fetch(apiUrl('/api/generate-questions'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(singlePayload),
            });

            if (res.ok) {
              const data = await res.json();
              if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
                const candidateQ = data.questions[0];
                const candStatement = candidateQ.statement || '';
                const candRes = await questionSimilarityEngine.findMaxSimilarity(candStatement, spec, top);

                rejectedStatements.push(candStatement);

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
            }
          } catch (retryErr) {
            console.warn(`[QuestionGenerationService] Regeneration attempt ${attempt} failed:`, retryErr);
          }
        }

        if (maxSimilarity > SIMILARITY_THRESHOLD) {
          // Attempt extra RAG chunk retrieval for saturated topic before accepting high similarity
          try {
            const extraChunks = await ragEngine.retrieveContext(top, { topK: 8 });
            const existingChunks = postPayload.retrievedChunks || [];
            const existingKeys = new Set(
              existingChunks.map((c: any) => `${c.assetId || ''}-${c.chunkIndex ?? ''}`)
            );
            const newChunks = extraChunks.filter(
              (c: any) => !existingKeys.has(`${c.assetId || ''}-${c.chunkIndex ?? ''}`)
            );

            if (newChunks.length > 0) {
              console.warn(
                `[QuestionGenerationService] Found ${newChunks.length} additional RAG chunks for saturated topic "${top}". Attempting 1 final expanded-context regeneration...`
              );
              const expandedPayload = {
                ...postPayload,
                quantity: 1,
                topics: [top],
                retrievedChunks: [...existingChunks, ...newChunks],
              };
              const res = await fetch(apiUrl('/api/generate-questions'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(expandedPayload),
              });
              if (res.ok) {
                const data = await res.json();
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
              }
            } else {
              contentLimitedTopics.add(top);
            }
          } catch (extraErr) {
            console.warn(`[QuestionGenerationService] Failed fetching extra chunks for topic "${top}":`, extraErr);
          }

          if (maxSimilarity > SIMILARITY_THRESHOLD) {
            console.warn(
              `[QuestionGenerationService] Max regeneration attempts (${MAX_REGENERATION_ATTEMPTS}) reached for topic "${top}". Accepting candidate with lowest similarity (${bestSim.toFixed(3)}). Marking topic as saturated.`
            );
            saturatedTopics.add(top);
            contentLimitedTopics.add(top);
            currentQ = bestQ;
            maxSimilarity = bestSim;
            embedding = bestEmb;
          }
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
  contentLimitedTopics: Set<string> = new Set()
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

      const replacementPayload = {
        ...postPayload,
        quantity: deficit,
        topics: replacementTopics,
        avoidTopics: Array.from(saturatedTopics),
        existingQuestionsSummary: formatCompactAntiDuplicationList(
          [
            ...(postPayload.existingQuestionsSummary ? [postPayload.existingQuestionsSummary] : []),
            ...currentValid.map((q) => q.statement || ''),
          ],
          30
        ),
      };

      const res = await fetch(apiUrl('/api/generate-questions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(replacementPayload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.questions)) {
          let replacementValid = data.questions.filter(isValidGeneratedQuestion);
          if (replacementValid.length > 0) {
            replacementValid = await processRawQuestionsWithSimilarityCheck(
              replacementValid,
              postPayload.specialty || 'Medicina',
              (replacementTopics && replacementTopics[0]) || 'Geral',
              replacementPayload,
              saturatedTopics,
              contentLimitedTopics
            );
            replacementValid = replacementValid.filter(isValidGeneratedQuestion);
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
  const normalize = (t: string) => t.toLowerCase().replace(/[^\w\s]/gi, ' ').split(/\s+/).filter(Boolean);
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

async function assemblePrescriptiveQuestionOptions(
  q: any,
  qId: string,
  specialtyStr: string,
  topics: string[],
  fallbackDistractorHints: any[] = []
): Promise<QuestionOption[]> {
  // Se a IA já retornou um array options estruturado (com pelo menos 2 opções), mantém compatibilidade
  if (Array.isArray(q.options) && q.options.length >= 2) {
    return q.options.map((opt: any, oIdx: number) => ({
      id: `opt-${qId}-${opt.letter || String.fromCharCode(65 + oIdx)}`,
      letter: opt.letter || String.fromCharCode(65 + oIdx),
      text: opt.text || '',
      isCorrect: opt.isCorrect ?? (opt.letter === q.correctOptionLetter),
      explanation: opt.explanation || '',
    }));
  }

  const correctAnswerText = (q.correctAnswerText || q.correctAnswer || '').trim();
  const correctAnswerExplanation =
    q.correctAnswerExplanation ||
    (typeof q.commentary === 'string' ? q.commentary : q.commentary?.correta) ||
    'Resposta correta fundamentada nas diretrizes médicas.';

  // 1. Busca distratores específicos via DistractorEngine
  let candidates: any[] = [];
  if (correctAnswerText) {
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
    const normC = cText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!normC || normC === normCorrect || seenCandidateTexts.has(normC)) continue;
    seenCandidateTexts.add(normC);
    uniqueCandidates.push({ text: cText, rationale: c.rationale });
  }

  // 3. Fallback em cascata com pool genérico do lote se houver menos de 3
  if (uniqueCandidates.length < 3 && Array.isArray(fallbackDistractorHints)) {
    for (const h of fallbackDistractorHints) {
      const hText = (h.text || h.label || (typeof h === 'string' ? h : '')).trim();
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
    const MAX_ITEMS_PER_AI_CALL = 8;

    const specialtyStr = config.specialties && config.specialties.length > 0 ? config.specialties.join(' & ') : config.specialty || 'Clínica Médica';
    const mainTopic = config.topics && config.topics.length > 0 ? config.topics.join(' & ') : 'Geral';
    
    const isGeneralMode = !request.mode || request.mode === 'geral' || (!request.bancaName && !request.professorName);
    const selectedOriginName = isGeneralMode ? '' : (request.mode === 'banca' ? request.bancaName || '' : request.professorName || '');

    // Dynamic RAG topK calculation: broader reference context for larger question batches up to a cap of 30 chunks
    const baseTopK = isGeneralMode ? 10 : 8;
    const topK = Math.min(30, baseTopK + Math.ceil(quantity / 3));

    // 1. Retrieve RAG chunks matching all topics & specialties
    const searchQuery = `${specialtyStr} ${mainTopic} ${config.subtopic || ''}`.trim();
    const retrievedChunks = await ragEngine.retrieveContext(searchQuery, {
      banca: isGeneralMode ? undefined : (request.mode === 'banca' ? request.bancaName : undefined),
      professor: isGeneralMode ? undefined : (request.mode === 'professor' ? request.professorName : undefined),
      topK,
    });

    if (retrievedChunks.length < 3 && !ignoreLowChunkWarning) {
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


    // Split quantity into batches of up to MAX_ITEMS_PER_AI_CALL (8)
    const batchQuantities: number[] = [];
    let rem = quantity;
    while (rem > 0) {
      const current = Math.min(rem, MAX_ITEMS_PER_AI_CALL);
      batchQuantities.push(current);
      rem -= current;
    }

    const allRawQuestions: any[] = [];
    const saturatedTopics = new Set<string>();
    const contentLimitedTopics = new Set<string>();

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

      const rawPayload = {
        retrievedChunks: chunksForThisBatch,
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
        customContext: config.customContext,
        existingQuestionsSummary:
          batchIdx > 0 && allRawQuestions.length > 0
            ? formatCompactAntiDuplicationList(allRawQuestions.map((q) => q.statement), 30)
            : undefined,
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

      let batchRawQuestions: any[] = data.questions;

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
                batchRawQuestions = retryData.questions;
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
        contentLimitedTopics
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

    let validRawQuestions = allRawQuestions.filter(isValidGeneratedQuestion);
    if (validRawQuestions.length < quantity) {
      console.warn(
        `[QuestionGenerationService] Filtered out ${allRawQuestions.length - validRawQuestions.length} invalid questions from output. Attempting deficit replacement...`
      );
      const postPayloadForInterdisciplinary = {
        retrievedChunks,
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
      };
      validRawQuestions = await replaceInvalidQuestionsDeficit(
        validRawQuestions,
        quantity,
        postPayloadForInterdisciplinary,
        3,
        saturatedTopics,
        contentLimitedTopics
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
          isAnswered: false,
          createdAt: now,
        };
      })
    );


    const balancedQuestions = balanceAndShuffleQuestionOptions(questions);

    if (balancedQuestions.length === 0) {
      throw new Error('Não foi possível gerar nenhuma questão válida. Tente novamente ou ajuste os tópicos selecionados.');
    }

    const shortfall = balancedQuestions.length < quantity ? {
      requested: quantity,
      actual: balancedQuestions.length,
      reason: `Gerado com ${balancedQuestions.length} de ${quantity} questões solicitadas — algumas questões não passaram no controle de qualidade.`,
    } : undefined;

    const title = `${specialtyStr}: Simulado Interdisciplinar (${balancedQuestions.length} q. - ${originSourceLabel})`;

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
      metrics: {
        maxWordOverlap: overallMaxWordOverlap,
        matchingSequence: overallMatchingSeq,
      },
      shortfall,
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
    const topics = config.topics && config.topics.length > 0 ? config.topics : ['Geral'];
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

    const topicResults = await mapWithConcurrency(topics, QUESTION_GEN_CONCURRENCY, async (singleTopic) => {
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
          error: null,
        };
      }

      const originSpecialty = topicSpecialtyMap[singleTopic] || defaultSpecialty;

      try {
        // Retrieve RAG context specific to THIS single topic & specialty
        const searchQuery = `${originSpecialty} ${singleTopic} ${config.subtopic || ''}`.trim();
        const retrievedChunks = await ragEngine.retrieveContext(searchQuery, {
          banca: isGeneralMode ? undefined : (request.mode === 'banca' ? request.bancaName : undefined),
          professor: isGeneralMode ? undefined : (request.mode === 'professor' ? request.professorName : undefined),
          topK,
        });

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


        // Contexto recortado especificamente para o tópico atual
        const topicContext = extractRelevantContextForTopic(
          config.customContext,
          singleTopic,
          originSpecialty,
          1500
        );

        // Condensação do perfil de professor e examDNA para geração distribuída
        const {
          professorStyleAnalysis: condensedStyle,
          examDNA: condensedDNA,
        } = condenseProfessorProfileForDistribution(professorStyleAnalysis, examDNA);

        const rawPayload = {
          retrievedChunks,
          specialty: originSpecialty,
          topics: [singleTopic],
          quantity: countForThisTopic,
          difficulty: config.difficulty,
          questionType: config.questionType,
          bancaName: request.bancaName,
          professorName: request.professorName,
          professorStyleAnalysis: condensedStyle,
          examDNA: condensedDNA,
          mode: request.mode || 'geral',
          distractorHints,
          customContext: topicContext || undefined,
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

        let rawQuestions: any[] = data.questions;

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
                  rawQuestions = retryData.questions;
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
          contentLimitedTopics
        );

        let validRawQuestions = rawQuestions.filter(isValidGeneratedQuestion);
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
            contentLimitedTopics
          );
        }

        return {
          singleTopic,
          originSpecialty,
          count: countForThisTopic,
          rawQuestions: validRawQuestions,
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

    const shortfall = balancedQuestions.length < totalQuantity ? {
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
      metrics: {
        maxWordOverlap: overallMaxWordOverlap,
        matchingSequence: overallMatchingSeq,
      },
      shortfall,
    };
  }
}
