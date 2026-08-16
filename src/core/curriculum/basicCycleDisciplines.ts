/**
 * Classificação e catálogo de disciplinas do Ciclo Básico de Medicina (Fase 34 - Basic Cycle Bridge).
 * Utilizado para filtrar KnowledgeAssets, embeddings e arestas do Grafo de Conhecimento
 * ao derivar questões de ciências básicas (mecanismos, anatomia, fisiologia, bioquímica) a partir de questões clínicas.
 */

export const BASIC_CYCLE_DISCIPLINES = [
  'Anatomia',
  'Anatomia Clínica',
  'Neuroanatomia',
  'Fisiologia',
  'Fisiologia Médica',
  'Fisiologia Humana',
  'Bioquímica',
  'Bioquímica Médica',
  'Bioquímica Clínica',
  'Histologia',
  'Embriologia',
  'Farmacologia Básica',
  'Farmacologia',
  'Farmacologia Médica',
  'Patologia Geral',
  'Microbiologia',
  'Microbiologia Médica',
  'Imunologia',
  'Imunologia Básica',
  'Imunologia Médica',
  'Genética',
  'Genética Médica',
  'Biologia Celular',
  'Biofísica',
  'Parasitologia',
  'Parasitologia Médica',
  'Semiologia Médica',
  'Propedêutica',
] as const;

/**
 * Remove diacríticos, pontuação e normaliza espaços para comparação tolerante.
 */
function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Avalia se uma disciplina ou especialidade informada pertence ao Ciclo Básico.
 * Tolera variações comuns de nomenclatura (ex: "Fisiologia Humana", "Farmacologia Básica", "Anatomia Humana").
 */
export function isBasicCycleAsset(disciplineOrSpecialty?: string): boolean {
  if (!disciplineOrSpecialty || typeof disciplineOrSpecialty !== 'string') return false;

  const normalized = normalizeText(disciplineOrSpecialty);
  if (!normalized) return false;

  return BASIC_CYCLE_DISCIPLINES.some((discipline) => {
    const normDisc = normalizeText(discipline);
    return normalized.includes(normDisc) || normDisc.includes(normalized);
  });
}

export const isBasicCycleSpecialty = isBasicCycleAsset;

