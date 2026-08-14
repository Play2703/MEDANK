/**
 * Token Budgeting & Payload Pruning Service
 *
 * Centralizes token estimation (4 chars ~ 1 token) and priority-based pruning
 * for both semantic chunks and full generation request payloads (Gemini AI API calls).
 */

import { SemanticChunkResult } from './RealSemanticSearchService';

export const MAX_CONTEXT_TOKENS_PER_CALL = 6000;
export const MAX_TOTAL_PAYLOAD_TOKENS = 9000;

/**
 * Estimates token count for raw strings, objects, or arrays using character heuristic (~4 chars/token).
 */
export function estimateTokenCount(input: any): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === 'string') {
    return Math.ceil(input.length / 4);
  }
  try {
    const jsonStr = JSON.stringify(input);
    return Math.ceil(jsonStr.length / 4);
  } catch {
    return 0;
  }
}

/**
 * Prunes an array of semantic chunks to fit within a specific token budget.
 */
export function pruneChunksByTokenBudget(
  chunks: SemanticChunkResult[],
  maxTokens = MAX_CONTEXT_TOKENS_PER_CALL
): SemanticChunkResult[] {
  if (!chunks || chunks.length === 0) return [];
  let accumulatedTokens = 0;
  const pruned: SemanticChunkResult[] = [];

  for (const chunk of chunks) {
    const chunkTokens = estimateTokenCount(chunk.content);
    if (accumulatedTokens + chunkTokens > maxTokens && pruned.length > 0) {
      break;
    }
    pruned.push(chunk);
    accumulatedTokens += chunkTokens;
  }

  return pruned;
}

/**
 * Default pruning order: least critical auxiliary metadata first,
 * scientific evidence chunks (retrievedChunks) last.
 */
const DEFAULT_PAYLOAD_PRUNING_ORDER = [
  'existingQuestionsSummary',
  'existingCardsSummary',
  'distractorHints',
  'professorStyleAnalysis',
  'examDNA',
  'customContext',
  'retrievedChunks',
];

/**
 * Helper to prune a single field of a payload progressively.
 */
function pruneField(value: any, fieldKey: string, allowedBudget?: number): any {
  if (value === null || value === undefined) return value;

  // Array pruning (e.g. distractorHints, retrievedChunks)
  if (Array.isArray(value)) {
    if (fieldKey === 'retrievedChunks') {
      if (typeof allowedBudget === 'number') {
        const pruned = pruneChunksByTokenBudget(value, Math.max(100, allowedBudget));
        if (pruned.length > 0) return pruned;
      }
      if (value.length <= 1) return value;
      return value.slice(0, Math.max(1, Math.floor(value.length / 2)));
    }
    if (value.length <= 2) return [];
    return value.slice(0, Math.max(2, Math.floor(value.length / 2)));
  }

  // Object pruning (e.g. professorStyleAnalysis, examDNA)
  if (typeof value === 'object') {
    const cloned = { ...value };
    if (fieldKey === 'professorStyleAnalysis') {
      if (Array.isArray(cloned.pegadinhasRecorrentes) && cloned.pegadinhasRecorrentes.length > 2) {
        cloned.pegadinhasRecorrentes = cloned.pegadinhasRecorrentes.slice(0, 2);
      } else if (Array.isArray(cloned.temasFavoritos) && cloned.temasFavoritos.length > 3) {
        cloned.temasFavoritos = cloned.temasFavoritos.slice(0, 3);
      } else if (typeof cloned.resumoEstiloGeral === 'string' && cloned.resumoEstiloGeral.length > 150) {
        cloned.resumoEstiloGeral = cloned.resumoEstiloGeral.slice(0, 150) + '...';
      } else {
        delete cloned.examDNA;
      }
      return cloned;
    }
    return cloned;
  }

  // String pruning (e.g. existingQuestionsSummary, customContext)
  if (typeof value === 'string') {
    if (value.length <= 100) return value;
    return value.slice(0, Math.floor(value.length / 2)) + '...';
  }

  return value;
}

/**
 * Prunes an entire generation payload (e.g. for /api/generate-questions or /api/generate-cards)
 * by progressively trimming fields in priorityOrder until the total payload fits maxTokens.
 *
 * Preserves retrievedChunks until the very last resort to protect medical evidence quality.
 */
export function pruneObjectByTokenBudget<T extends Record<string, any>>(
  payload: T,
  maxTokens = MAX_TOTAL_PAYLOAD_TOKENS,
  priorityOrder?: (keyof T)[]
): T {
  if (!payload || typeof payload !== 'object') return payload;

  let currentTokens = estimateTokenCount(payload);
  if (currentTokens <= maxTokens) {
    return payload;
  }

  const order = (priorityOrder && priorityOrder.length > 0)
    ? priorityOrder
    : (DEFAULT_PAYLOAD_PRUNING_ORDER as (keyof T)[]);

  const clonedPayload: T = { ...payload };
  const MAX_ITERATIONS_PER_FIELD = 10;

  for (const field of order) {
    if (clonedPayload[field] === undefined || clonedPayload[field] === null) {
      continue;
    }

    let iterations = 0;
    while (currentTokens > maxTokens && iterations < MAX_ITERATIONS_PER_FIELD) {
      const beforeTokens = estimateTokenCount(clonedPayload[field]);

      // Calculate how many tokens other fields currently take
      const otherTokens = currentTokens - beforeTokens;
      const allowedBudgetForField = Math.max(50, maxTokens - otherTokens);

      const prunedVal = pruneField(clonedPayload[field], String(field), allowedBudgetForField);
      const afterTokens = estimateTokenCount(prunedVal);

      // If no further reduction occurred, move to next field
      if (beforeTokens === afterTokens) {
        break;
      }

      clonedPayload[field] = prunedVal;
      currentTokens = estimateTokenCount(clonedPayload);
      iterations++;

      console.warn(
        `[TokenBudget] Total payload exceeded budget (${currentTokens} > ${maxTokens} tokens). Pruned field '${String(
          field
        )}' from ~${beforeTokens} to ~${afterTokens} tokens.`
      );

      if (currentTokens <= maxTokens) {
        return clonedPayload;
      }
    }
  }

  return clonedPayload;
}
