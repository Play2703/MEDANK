/**
 * Context Segmentation & Profile Condensation Service
 *
 * Provides topic-specific semantic context slicing using 100% local neural embeddings (LocalEmbeddingClient)
 * and cosine similarity, with in-memory caching and fallback for distributed question/flashcard generation.
 */

import { localEmbeddingClient } from './embeddings/LocalEmbeddingClient';
import { cosineSimilarity } from './cosineSimilarity';
import { CoverageUnit } from '../../domain/entities/Question';

export type { CoverageUnit };

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

/**
 * Helper to generate a concise human-readable label from a block/header.
 */
function generateUnitLabel(content: string, index: number, fallbackType: string): string {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return `Tópico ${index + 1}`;

  const firstLine = lines[0]
    .replace(/^#{1,6}\s+/, '')
    .replace(/^(?:(?:\d+|[ivxldcm]+)[\.\)\-:]|\(?\d+\))\s+/i, '')
    .replace(/^[•\-\*—]\s+/, '')
    .replace(/:\s*$/, '')
    .trim();

  if (firstLine.length > 0) {
    if (firstLine.length <= 60) {
      return firstLine;
    }
    return firstLine.slice(0, 57) + '...';
  }

  // Fallback: first sentence or first words
  const firstSentence = content.split(/[.!?]\s+/)[0].trim();
  if (firstSentence.length > 0 && firstSentence.length <= 60) {
    return firstSentence;
  }

  const words = content.split(/\s+/).slice(0, 7).join(' ');
  return words ? `${words}...` : `Tópico ${index + 1}`;
}

/**
 * PASSO 1: Segmenta o customContext em Unidades de Cobertura (Coverage Units)
 * com base na estrutura explícita do usuário (numeração, cabeçalhos, marcadores)
 * ou agrupamento semântico de parágrafos via embeddings locais.
 */
export async function segmentContextIntoCoverageUnits(
  customContext?: string
): Promise<CoverageUnit[]> {
  if (!customContext || typeof customContext !== 'string') {
    return [];
  }

  const trimmed = customContext.trim();
  if (!trimmed) {
    return [];
  }

  // Se texto for muito curto, trata como 1 unidade única
  if (trimmed.length < 50) {
    return [
      {
        id: 'unit-1',
        label: generateUnitLabel(trimmed, 0, 'raw'),
        content: trimmed,
        charCount: trimmed.length,
        wordCount: trimmed.split(/\s+/).filter(Boolean).length,
        sourceType: 'raw',
      },
    ];
  }

  const lines = trimmed.split('\n');

  // Regexes para detecção de estrutura explícita
  const NUMBERED_REGEX = /^(?:(?:\d+|[ivxldcm]+)[\.\)\-:]|\(?\d+\))\s+(.+)/i;
  const MARKDOWN_HEADING_REGEX = /^#{1,6}\s+(.+)/;
  const BULLET_REGEX = /^[\u2022\u25cf\u25cb\u25a0\u25a1\-*—]\s+(.+)/;
  const UPPERCASE_HEADING_REGEX = /^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ0-9\s\-_:().,/]{3,80}$/;
  const TOPIC_COLON_REGEX = /^[A-Za-z0-9ÁÉÍÓÚÂÊÎÔÛÃÕÇáéíóúâêîôûãõç\s\-_().]{3,60}:$/;

  // 1. Testa se há lista numerada com pelo menos 2 itens
  const numberedIndices: number[] = [];
  lines.forEach((line, idx) => {
    if (NUMBERED_REGEX.test(line.trim())) {
      numberedIndices.push(idx);
    }
  });

  if (numberedIndices.length >= 2) {
    const units: CoverageUnit[] = [];
    for (let i = 0; i < numberedIndices.length; i++) {
      const startLine = numberedIndices[i];
      const endLine = i < numberedIndices.length - 1 ? numberedIndices[i + 1] : lines.length;
      const unitContent = lines.slice(startLine, endLine).join('\n').trim();
      if (unitContent) {
        units.push({
          id: `unit-${units.length + 1}`,
          label: generateUnitLabel(lines[startLine], units.length, 'numbered'),
          content: unitContent,
          charCount: unitContent.length,
          wordCount: unitContent.split(/\s+/).filter(Boolean).length,
          sourceType: 'numbered',
        });
      }
    }
    if (units.length >= 2) {
      return units;
    }
  }

  // 2. Testa se há cabeçalhos Markdown (# ou ##) com pelo menos 2 seções
  const markdownIndices: number[] = [];
  lines.forEach((line, idx) => {
    if (MARKDOWN_HEADING_REGEX.test(line.trim())) {
      markdownIndices.push(idx);
    }
  });

  if (markdownIndices.length >= 2) {
    const units: CoverageUnit[] = [];
    for (let i = 0; i < markdownIndices.length; i++) {
      const startLine = markdownIndices[i];
      const endLine = i < markdownIndices.length - 1 ? markdownIndices[i + 1] : lines.length;
      const unitContent = lines.slice(startLine, endLine).join('\n').trim();
      if (unitContent) {
        units.push({
          id: `unit-${units.length + 1}`,
          label: generateUnitLabel(lines[startLine], units.length, 'heading'),
          content: unitContent,
          charCount: unitContent.length,
          wordCount: unitContent.split(/\s+/).filter(Boolean).length,
          sourceType: 'heading',
        });
      }
    }
    if (units.length >= 2) {
      return units;
    }
  }

  // 3. Testa cabeçalhos em MAIÚSCULAS curtas ou terminados em dois-pontos
  const headingIndices: number[] = [];
  lines.forEach((line, idx) => {
    const tLine = line.trim();
    if (!tLine) return;
    const isUpper = UPPERCASE_HEADING_REGEX.test(tLine) && /[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]{3,}/.test(tLine) && !tLine.includes('.');
    const isColonHeader = TOPIC_COLON_REGEX.test(tLine);
    if (isUpper || isColonHeader) {
      headingIndices.push(idx);
    }
  });

  if (headingIndices.length >= 2) {
    const units: CoverageUnit[] = [];
    for (let i = 0; i < headingIndices.length; i++) {
      const startLine = headingIndices[i];
      const endLine = i < headingIndices.length - 1 ? headingIndices[i + 1] : lines.length;
      const unitContent = lines.slice(startLine, endLine).join('\n').trim();
      if (unitContent) {
        units.push({
          id: `unit-${units.length + 1}`,
          label: generateUnitLabel(lines[startLine], units.length, 'heading'),
          content: unitContent,
          charCount: unitContent.length,
          wordCount: unitContent.split(/\s+/).filter(Boolean).length,
          sourceType: 'heading',
        });
      }
    }
    if (units.length >= 2) {
      return units;
    }
  }

  // 4. Testa marcadores bullet (•, -, *) com pelo menos 2 itens
  const bulletIndices: number[] = [];
  lines.forEach((line, idx) => {
    if (BULLET_REGEX.test(line.trim())) {
      bulletIndices.push(idx);
    }
  });

  if (bulletIndices.length >= 2) {
    const units: CoverageUnit[] = [];
    for (let i = 0; i < bulletIndices.length; i++) {
      const startLine = bulletIndices[i];
      const endLine = i < bulletIndices.length - 1 ? bulletIndices[i + 1] : lines.length;
      const unitContent = lines.slice(startLine, endLine).join('\n').trim();
      if (unitContent && unitContent.length > 25) {
        units.push({
          id: `unit-${units.length + 1}`,
          label: generateUnitLabel(lines[startLine], units.length, 'bullet'),
          content: unitContent,
          charCount: unitContent.length,
          wordCount: unitContent.split(/\s+/).filter(Boolean).length,
          sourceType: 'bullet',
        });
      }
    }
    if (units.length >= 2) {
      return units;
    }
  }

  // 5. Sem estrutura explícita: quebra por parágrafos e agrupa semanticamente por similaridade de embeddings
  const rawParagraphs = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (rawParagraphs.length <= 1) {
    return [
      {
        id: 'unit-1',
        label: generateUnitLabel(trimmed, 0, 'raw'),
        content: trimmed,
        charCount: trimmed.length,
        wordCount: trimmed.split(/\s+/).filter(Boolean).length,
        sourceType: 'raw',
      },
    ];
  }

  try {
    const embeddings = await localEmbeddingClient.generateEmbeddings(rawParagraphs);

    if (!embeddings || embeddings.length !== rawParagraphs.length) {
      return rawParagraphs.map((p, idx) => ({
        id: `unit-${idx + 1}`,
        label: generateUnitLabel(p, idx, 'paragraph_semantic'),
        content: p,
        charCount: p.length,
        wordCount: p.split(/\s+/).filter(Boolean).length,
        sourceType: 'paragraph_semantic',
      }));
    }

    // Agrupa parágrafos vizinhos com similaridade de cosseno >= 0.75
    const groupedUnits: { texts: string[]; label: string }[] = [];
    let currentGroup = [rawParagraphs[0]];
    let currentGroupVector = embeddings[0];

    for (let i = 1; i < rawParagraphs.length; i++) {
      const nextParagraph = rawParagraphs[i];
      const nextVector = embeddings[i];
      const sim = currentGroupVector && nextVector ? cosineSimilarity(currentGroupVector, nextVector) : 0;

      // Se for muito similar (>= 0.75) e o grupo atual não estiver gigante (< 800 chars), agrupa
      const currentGroupChars = currentGroup.reduce((sum, t) => sum + t.length, 0);
      if (sim >= 0.75 && currentGroupChars < 800) {
        currentGroup.push(nextParagraph);
      } else {
        groupedUnits.push({
          texts: currentGroup,
          label: generateUnitLabel(currentGroup[0], groupedUnits.length, 'paragraph_semantic'),
        });
        currentGroup = [nextParagraph];
        currentGroupVector = nextVector;
      }
    }

    if (currentGroup.length > 0) {
      groupedUnits.push({
        texts: currentGroup,
        label: generateUnitLabel(currentGroup[0], groupedUnits.length, 'paragraph_semantic'),
      });
    }

    return groupedUnits.map((g, idx) => {
      const content = g.texts.join('\n\n');
      return {
        id: `unit-${idx + 1}`,
        label: g.label,
        content,
        charCount: content.length,
        wordCount: content.split(/\s+/).filter(Boolean).length,
        sourceType: 'paragraph_semantic',
      };
    });
  } catch (err) {
    console.warn('[contextSegmentation] Semantic grouping failed, falling back to per-paragraph units:', err);
    return rawParagraphs.map((p, idx) => ({
      id: `unit-${idx + 1}`,
      label: generateUnitLabel(p, idx, 'paragraph_semantic'),
      content: p,
      charCount: p.length,
      wordCount: p.split(/\s+/).filter(Boolean).length,
      sourceType: 'paragraph_semantic',
    }));
  }
}

export interface CoverageAssignment {
  questionIndex: number;
  unitId: string;
  unitLabel: string;
  unitContent: string;
}

/**
 * PASSO 2: Mapeia a quantidade de questões solicitadas às Unidades de Cobertura.
 * - Se quantity >= units.length: garante que TODAS as unidades recebam pelo menos 1 questão.
 *   As questões excedentes são distribuídas proporcionalmente ao tamanho (charCount) das unidades.
 * - Se quantity < units.length: prioriza as primeiras/maiores unidades e registra quais ficaram de fora.
 */
export function assignCoverageUnitsToQuestions(
  units: CoverageUnit[],
  quantity: number
): { assignments: CoverageAssignment[]; omittedUnitLabels: string[] } {
  if (!units || units.length === 0 || quantity <= 0) {
    return { assignments: [], omittedUnitLabels: [] };
  }

  const assignments: CoverageAssignment[] = [];
  const omittedUnitLabels: string[] = [];

  if (quantity < units.length) {
    const selectedUnits = units.slice(0, quantity);
    const omitted = units.slice(quantity);
    for (const u of omitted) {
      omittedUnitLabels.push(u.label);
    }

    selectedUnits.forEach((unit, idx) => {
      assignments.push({
        questionIndex: idx,
        unitId: unit.id,
        unitLabel: unit.label,
        unitContent: unit.content,
      });
    });
  } else {
    // quantity >= units.length: Cada unidade recebe pelo menos 1
    const counts = units.map(() => 1);
    let remaining = quantity - units.length;

    // Distribuir remanescentes proporcionalmente ao tamanho (charCount)
    const sortedIndices = units
      .map((u, i) => ({ index: i, chars: u.charCount }))
      .sort((a, b) => b.chars - a.chars);

    let cycle = 0;
    while (remaining > 0) {
      const targetUnitIdx = sortedIndices[cycle % sortedIndices.length].index;
      counts[targetUnitIdx]++;
      remaining--;
      cycle++;
    }

    let qIdx = 0;
    units.forEach((unit, uIdx) => {
      const qCountForUnit = counts[uIdx];
      for (let i = 0; i < qCountForUnit; i++) {
        assignments.push({
          questionIndex: qIdx++,
          unitId: unit.id,
          unitLabel: unit.label,
          unitContent: unit.content,
        });
      }
    });
  }

  return { assignments, omittedUnitLabels };
}
