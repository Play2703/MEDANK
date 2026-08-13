/**
 * DeCS/MeSH Tree Number to MedAnki Category Mapper and Quality Filter
 */

export interface CategoryMapping {
  category: string; // 'DOENCA' | 'MEDICAMENTO' | 'SINTOMA' | 'ESTRUTURA_ANATOMICA' | 'EXAME' | 'PROCEDIMENTO'
  priority: number; // Lower is higher priority: C (1) > D (2) > E (3) > A (4) > F (5) > B (6)
}

const GENERIC_DENYLIST = new Set([
  'humanos',
  'animais',
  'masculino',
  'feminino',
  'adulto',
  'idoso',
  'idosos',
  'lactente',
  'crianca',
  'criancas',
  'recem-nascido',
  'gravidez',
  'estudo',
  'estudos',
  'artigo',
  'relato de caso',
  'ensaio clinico',
  'tecnica',
  'metodos',
  'anos',
  'meses',
  'pacientes',
  'paciente',
  'tratamento',
  'diagnostico',
  'resultado',
  'resultados',
  'pesquisa',
  'fator de risco',
  'fatores de risco',
  'fator de risco para',
  'fatores de risco para',
  'risco',
  'riscos',
  'causa',
  'causas',
]);

const GENERIC_REGEX = /^(outros|outra|outras|nao especificado|nao especificada|sem outra especificacao|outras formas|outros tipos)$/i;
const CHEMICAL_SYMBOL_REGEX = /^(na|k|o2|h2o|co2|fe|ca|mg|zn|cl|i|p|s|k\+)$/i;

function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Determines category and priority from a single DeCS tree_number
 */
export function getCategoryFromTreeNumber(treeNumber: string): CategoryMapping | null {
  if (!treeNumber) return null;
  const tn = treeNumber.trim().toUpperCase();

  // C23.888 or Signs and Symptoms -> SINTOMA
  if (tn.startsWith('C23.888')) {
    return { category: 'SINTOMA', priority: 1 };
  }

  // C Diseases -> DOENCA
  if (tn.startsWith('C')) {
    return { category: 'DOENCA', priority: 1 };
  }

  // D Chemicals and Drugs -> MEDICAMENTO
  if (tn.startsWith('D')) {
    return { category: 'MEDICAMENTO', priority: 2 };
  }

  // E01, E05 Diagnosis -> EXAME
  if (tn.startsWith('E01') || tn.startsWith('E05')) {
    return { category: 'EXAME', priority: 3 };
  }

  // E02, E04, E06 Therapeutics / Surgery -> PROCEDIMENTO
  if (tn.startsWith('E02') || tn.startsWith('E04') || tn.startsWith('E06')) {
    return { category: 'PROCEDIMENTO', priority: 3 };
  }

  // E07 Equipment & Supplies -> ESTRUTURA_ANATOMICA (device)
  if (tn.startsWith('E07')) {
    return { category: 'ESTRUTURA_ANATOMICA', priority: 4 };
  }

  // A Anatomy -> ESTRUTURA_ANATOMICA
  if (tn.startsWith('A')) {
    return { category: 'ESTRUTURA_ANATOMICA', priority: 4 };
  }

  // F Mental Disorders / Behavior -> F03: DOENCA, F01: SINTOMA / DOENCA
  if (tn.startsWith('F03')) {
    return { category: 'DOENCA', priority: 5 };
  }
  if (tn.startsWith('F01')) {
    return { category: 'SINTOMA', priority: 5 };
  }

  // Pathogens in B -> B01.050.500, B03, B04 -> DOENCA
  if (tn.startsWith('B01.050.500') || tn.startsWith('B03') || tn.startsWith('B04')) {
    return { category: 'DOENCA', priority: 6 };
  }

  return null;
}

/**
 * Returns the best category mapping out of multiple tree numbers for a descriptor
 */
export function resolveBestCategory(treeNumbers: string[]): string | null {
  let best: CategoryMapping | null = null;

  for (const tn of treeNumbers) {
    const mapped = getCategoryFromTreeNumber(tn);
    if (mapped) {
      if (!best || mapped.priority < best.priority) {
        best = mapped;
      }
    }
  }

  return best ? best.category : null;
}

/**
 * Validates if a term / synonym is suitable for insertion into the NER dictionary
 */
export function shouldSkipTerm(term: string): boolean {
  if (!term) return true;
  const norm = normalizeText(term);

  if (norm.length < 3) return true;
  if (GENERIC_DENYLIST.has(norm)) return true;
  if (GENERIC_REGEX.test(norm)) return true;
  if (CHEMICAL_SYMBOL_REGEX.test(norm)) return true;
  if (/^\d+$/.test(norm)) return true;

  return false;
}
