/**
 * Context Segmentation & Profile Condensation Service
 *
 * Provides topic-specific semantic context slicing for distributed question/flashcard generation
 * and condensed professor profiles to minimize redundant token usage across parallel topic batches.
 */

const PT_STOPWORDS = new Set([
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'para', 'com', 'por', 'um', 'uma', 'uns', 'umas', 'os', 'as', 'ao', 'aos', 'a', 'o', 'e', 'ou',
  'se', 'que', 'como', 'mais', 'mas', 'sobre', 'sob', 'entre', 'ate', 'pelo', 'pela',
  'qual', 'quais', 'quando', 'onde', 'porque', 'por que', 'geral', 'gerais',
  'caso', 'clinico', 'clinica', 'medica', 'medico', 'medicina', 'paciente', 'pacientes',
  'especialidade', 'topico', 'tema', 'assunto', 'questao', 'questoes',
]);

/**
 * Normalizes text for matching by removing diacritics, lowercase and non-alphanumeric chars.
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
 * Extracts only the relevant section of a large customContext for a specific topic and specialty.
 * If customContext is small (<= maxChars), returns it intact without modification.
 * If customContext is large, segments into paragraphs/sentences, scores them by lexical/semantic overlap,
 * and compiles the highest-scoring sections within the specified character budget.
 */
export function extractRelevantContextForTopic(
  customContext?: string,
  topic = '',
  specialty = '',
  maxChars = 1500
): string {
  if (!customContext || typeof customContext !== 'string') {
    return '';
  }

  const trimmed = customContext.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  const topicKeywords = extractKeywords(topic);
  const specialtyKeywords = extractKeywords(specialty);
  const normalizedTopic = normalizeKeyword(topic);

  // Split text into paragraphs (blocks separated by 1 or more blank lines)
  let rawBlocks = trimmed
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  // If blocks are few and huge, subdivide by single newlines
  if (rawBlocks.length <= 1) {
    rawBlocks = trimmed
      .split(/\n/)
      .map((b) => b.trim())
      .filter((b) => b.length > 20);
  }

  // If still single block, subdivide by sentences
  if (rawBlocks.length <= 1) {
    rawBlocks = trimmed
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  interface ScoredBlock {
    index: number;
    text: string;
    score: number;
  }

  const scoredBlocks: ScoredBlock[] = rawBlocks.map((text, index) => {
    const normBlock = normalizeKeyword(text);
    let score = 0;

    // Exact topic match (strongest signal)
    if (normalizedTopic.length >= 4 && normBlock.includes(normalizedTopic)) {
      score += 15;
    }

    // Individual topic keywords match
    for (const kw of topicKeywords) {
      if (normBlock.includes(kw)) {
        score += 4;
      }
    }

    // Specialty keywords match
    for (const kw of specialtyKeywords) {
      if (normBlock.includes(kw)) {
        score += 1;
      }
    }

    // Clinical high-yield keywords boost if topic overlaps
    if (score > 0) {
      const clinicalKeywords = [
        'diagnostico',
        'tratamento',
        'conduta',
        'sintomas',
        'fisiopatologia',
        'terapia',
        'farmaco',
        'medicamento',
        'exame',
        'criterio',
      ];
      for (const ckw of clinicalKeywords) {
        if (normBlock.includes(ckw)) {
          score += 0.5;
        }
      }
    }

    return { index, text, score };
  });

  const matchingBlocks = scoredBlocks.filter((b) => b.score > 0);

  // If no block had any match, return the first maxChars with clean truncation
  if (matchingBlocks.length === 0) {
    if (trimmed.length <= maxChars) return trimmed;
    const cut = trimmed.slice(0, maxChars);
    const lastPunctuation = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf(';'), cut.lastIndexOf('\n'));
    if (lastPunctuation > maxChars * 0.7) {
      return cut.slice(0, lastPunctuation + 1).trim() + ' […]';
    }
    return cut.trim() + ' […]';
  }

  // Sort matching blocks by score descending
  matchingBlocks.sort((a, b) => b.score - a.score);

  const selectedBlocks: ScoredBlock[] = [];
  let accumulatedChars = 0;

  for (const block of matchingBlocks) {
    const addedChars = block.text.length + 8; // text length + separator
    if (accumulatedChars + addedChars > maxChars && selectedBlocks.length > 0) {
      break;
    }
    selectedBlocks.push(block);
    accumulatedChars += addedChars;
  }

  // Re-sort selected blocks by original document order to preserve coherent reading flow
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
