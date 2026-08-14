/**
 * Context Segmentation & Profile Condensation Service
 *
 * Provides topic-specific semantic context slicing using 100% local neural embeddings (LocalEmbeddingClient)
 * and cosine similarity, with in-memory caching and fallback for distributed question/flashcard generation.
 */

import { localEmbeddingClient } from './embeddings/LocalEmbeddingClient';
import { cosineSimilarity } from './cosineSimilarity';

const PT_STOPWORDS = new Set([
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'para', 'com', 'por', 'um', 'uma', 'uns', 'umas', 'os', 'as', 'ao', 'aos', 'a', 'o', 'e', 'ou',
  'se', 'que', 'como', 'mais', 'mas', 'sobre', 'sob', 'entre', 'ate', 'pelo', 'pela',
  'qual', 'quais', 'quando', 'onde', 'porque', 'por que', 'geral', 'gerais',
  'caso', 'clinico', 'clinica', 'medica', 'medico', 'medicina', 'paciente', 'pacientes',
  'especialidade', 'topico', 'tema', 'assunto', 'questao', 'questoes',
]);

// In-memory cache for block embeddings of customContext (avoids recalculating blocks across N topic queries)
const blockEmbeddingCache = new Map<string, { blocks: string[]; embeddings: number[][] }>();
const MAX_CACHE_ENTRIES = 20;

function computeTextHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return `${text.length}_${hash}`;
}

export function clearCustomContextEmbeddingCache(): void {
  blockEmbeddingCache.clear();
}

/**
 * Normalizes text for keyword matching fallback.
 */
export function normalizeKeyword(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts meaningful keyword tokens from a topic and specialty string.
 */
export function extractKeywords(text: string): string[] {
  const norm = normalizeKeyword(text);
  if (!norm) return [];
  return norm
    .split(' ')
    .filter((word) => word.length >= 3 && !PT_STOPWORDS.has(word));
}

/**
 * Extracts only the semantically relevant section of customContext for a specific topic and specialty.
 * Uses 100% local neural embeddings (LocalEmbeddingClient) and cosine similarity to find the most pertinent
 * paragraphs/sections, with LRU block caching and lexical fallback.
 */
export async function extractRelevantContextForTopic(
  customContext?: string,
  topic = '',
  specialty = '',
  maxChars = 1500
): Promise<string> {
  if (!customContext || typeof customContext !== 'string') {
    return '';
  }

  const trimmed = customContext.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  // Split text into paragraphs (blocks separated by 1 or more blank lines)
  let rawBlocks = trimmed
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (rawBlocks.length <= 1) {
    rawBlocks = trimmed
      .split(/\n/)
      .map((b) => b.trim())
      .filter((b) => b.length > 20);
  }

  if (rawBlocks.length <= 1) {
    rawBlocks = trimmed
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (rawBlocks.length === 0) {
    return trimmed.slice(0, maxChars);
  }

  try {
    const queryText = `query: ${specialty ? `${specialty} - ` : ''}${topic}`.trim();

    // 1. Obtain block embeddings (using LRU cache for identical customContext across topic calls)
    const contextHash = computeTextHash(trimmed);
    let blockEmbeddings: number[][];

    const cached = blockEmbeddingCache.get(contextHash);
    if (cached && cached.blocks.length === rawBlocks.length && cached.blocks[0] === rawBlocks[0]) {
      blockEmbeddings = cached.embeddings;
    } else {
      // 1 single batch call for all blocks in customContext
      blockEmbeddings = await localEmbeddingClient.generateEmbeddings(rawBlocks);

      if (blockEmbeddingCache.size >= MAX_CACHE_ENTRIES) {
        const firstKey = blockEmbeddingCache.keys().next().value;
        if (firstKey) blockEmbeddingCache.delete(firstKey);
      }
      blockEmbeddingCache.set(contextHash, { blocks: rawBlocks, embeddings: blockEmbeddings });
    }

    // 2. Obtain query embedding (1 call)
    const [queryEmbedding] = await localEmbeddingClient.generateEmbeddings([queryText]);

    if (!queryEmbedding || queryEmbedding.length === 0 || !blockEmbeddings || blockEmbeddings.length === 0) {
      return fallbackLexicalExtraction(trimmed, rawBlocks, topic, specialty, maxChars);
    }

    // 3. Score each block by cosine similarity
    interface ScoredBlock {
      index: number;
      text: string;
      similarity: number;
    }

    const scoredBlocks: ScoredBlock[] = rawBlocks.map((text, index) => {
      const bVec = blockEmbeddings[index];
      const similarity = bVec && bVec.length > 0 ? cosineSimilarity(queryEmbedding, bVec) : 0;
      return { index, text, similarity };
    });

    // 4. Sort by cosine similarity descending
    scoredBlocks.sort((a, b) => b.similarity - a.similarity);

    // 5. Select top semantic blocks up to maxChars budget
    const selectedBlocks: ScoredBlock[] = [];
    let accumulatedChars = 0;

    for (const block of scoredBlocks) {
      const addedChars = block.text.length + 8; // text length + separator
      if (accumulatedChars + addedChars > maxChars && selectedBlocks.length > 0) {
        break;
      }
      selectedBlocks.push(block);
      accumulatedChars += addedChars;
    }

    // 6. Re-sort selected blocks by original document order to preserve coherent reading flow
    selectedBlocks.sort((a, b) => a.index - b.index);

    return selectedBlocks.map((b) => b.text).join('\n\n[...]\n\n');
  } catch (err) {
    console.warn('[contextSegmentation] Semantic embedding similarity failed, using lexical fallback:', err);
    return fallbackLexicalExtraction(trimmed, rawBlocks, topic, specialty, maxChars);
  }
}

/**
 * Fallback extraction based on lexical overlap when embeddings are unavailable.
 */
function fallbackLexicalExtraction(
  trimmed: string,
  rawBlocks: string[],
  topic: string,
  specialty: string,
  maxChars: number
): string {
  const topicKeywords = extractKeywords(topic);
  const specialtyKeywords = extractKeywords(specialty);
  const normalizedTopic = normalizeKeyword(topic);

  interface ScoredBlock {
    index: number;
    text: string;
    score: number;
  }

  const scoredBlocks: ScoredBlock[] = rawBlocks.map((text, index) => {
    const normBlock = normalizeKeyword(text);
    let score = 0;

    if (normalizedTopic.length >= 4 && normBlock.includes(normalizedTopic)) {
      score += 15;
    }
    for (const kw of topicKeywords) {
      if (normBlock.includes(kw)) score += 4;
    }
    for (const kw of specialtyKeywords) {
      if (normBlock.includes(kw)) score += 1;
    }

    return { index, text, score };
  });

  const matchingBlocks = scoredBlocks.filter((b) => b.score > 0);
  if (matchingBlocks.length === 0) {
    if (trimmed.length <= maxChars) return trimmed;
    const cut = trimmed.slice(0, maxChars);
    const lastPunctuation = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf(';'), cut.lastIndexOf('\n'));
    if (lastPunctuation > maxChars * 0.7) {
      return cut.slice(0, lastPunctuation + 1).trim() + ' […]';
    }
    return cut.trim() + ' […]';
  }

  matchingBlocks.sort((a, b) => b.score - a.score);

  const selectedBlocks: ScoredBlock[] = [];
  let accumulatedChars = 0;

  for (const block of matchingBlocks) {
    const addedChars = block.text.length + 8;
    if (accumulatedChars + addedChars > maxChars && selectedBlocks.length > 0) {
      break;
    }
    selectedBlocks.push(block);
    accumulatedChars += addedChars;
  }

  selectedBlocks.sort((a, b) => a.index - b.index);
  return selectedBlocks.map((b) => b.text).join('\n\n[...]\n\n');
}

/**
 * Condenses a professor profile and examDNA for distributed generation calls,
 * keeping only the actionable prompt fields and avoiding bloated repeated payloads.
 */
export function condenseProfessorProfileForDistribution(
  styleAnalysis?: any,
  examDNA?: any
): { professorStyleAnalysis?: any; examDNA?: any } {
  if (!styleAnalysis && !examDNA) {
    return {};
  }

  let condensedAnalysis: any = undefined;
  if (styleAnalysis && typeof styleAnalysis === 'object') {
    condensedAnalysis = {
      estiloDeQuestao: styleAnalysis.estiloDeQuestao || 'Vinhetas clínicas objetivas',
      nivelCognitivo: styleAnalysis.nivelCognitivo || 'Aplicação prática e raciocínio clínico',
      temasFavoritos: Array.isArray(styleAnalysis.temasFavoritos)
        ? styleAnalysis.temasFavoritos.slice(0, 3)
        : undefined,
      pegadinhasRecorrentes: Array.isArray(styleAnalysis.pegadinhasRecorrentes)
        ? styleAnalysis.pegadinhasRecorrentes.slice(0, 2)
        : undefined,
      resumoEstiloGeral:
        typeof styleAnalysis.resumoEstiloGeral === 'string'
          ? styleAnalysis.resumoEstiloGeral.slice(0, 300) + (styleAnalysis.resumoEstiloGeral.length > 300 ? '...' : '')
          : undefined,
    };
  }

  let condensedDNA: any = undefined;
  const sourceDNA = examDNA || styleAnalysis?.examDNA;
  if (sourceDNA && typeof sourceDNA === 'object') {
    condensedDNA = {
      clinicalCaseRatio: sourceDNA.clinicalCaseRatio,
      averageStemLength: sourceDNA.averageStemLength,
      directQuestionRatio: sourceDNA.directQuestionRatio,
      difficultyIndex: sourceDNA.difficultyIndex,
      imageInterpretationRatio: sourceDNA.imageInterpretationRatio,
      interdisciplinaryRatio: sourceDNA.interdisciplinaryRatio,
    };
  }

  return {
    professorStyleAnalysis: condensedAnalysis,
    examDNA: condensedDNA,
  };
}
