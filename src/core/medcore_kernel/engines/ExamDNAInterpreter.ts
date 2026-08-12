import { ExamDNA, ClinicalCycleDNA, BasicCycleDNA } from '../../../domain/entities/Question';

const CLINICAL_AXIS_LABELS: Record<keyof ClinicalCycleDNA, string> = {
  contextoClinico: 'uso de vinhetas clínicas (em vez de perguntas conceituais diretas)',
  casosLongos: 'extensão e complexidade dos enunciados de caso clínico',
  pegadinhas: 'armadilhas e distratores sutis nas alternativas',
  epidemiologia: 'dados epidemiológicos e estatísticos',
  farmacologia: 'detalhes farmacológicos específicos (doses, classes, interações)',
  achadosDeImagem: 'achados de imagem/ECG descritos textualmente (sem exibir imagem real)',
  condutaImediata: 'exigência de decisão de conduta imediata (não só diagnóstico)',
  diretrizesOficiais: 'citação e adesão a protocolos/diretrizes de sociedades específicas',
  comorbidadesMultiplas: 'casos com múltiplas comorbidades simultâneas',
};

const BASIC_AXIS_LABELS: Record<keyof BasicCycleDNA, string> = {
  memorizacaoDireta: 'cobrança de definição/nomenclatura direta (vs. raciocínio aplicado)',
  correlacaoAnatomoclinica: 'correlação entre estrutura anatômica e relevância clínica',
  nomenclaturaTecnica: 'precisão de termos técnicos/latinos/epônimos',
  mecanismoFisiopatologico: 'profundidade de mecanismo bioquímico/fisiológico',
  reconhecimentoEstrutural: 'identificação de estrutura em imagem histológica/anatômica descrita textualmente',
  integracaoMultissistemica: 'integração entre sistemas diferentes',
  basesBioquimicas: 'profundidade de vias metabólicas/bioquímicas',
};

function intensityPhrase(value: number): string {
  if (value >= 0.75) return 'SEMPRE inclua, com prioridade alta';
  if (value >= 0.5) return 'inclua preferencialmente';
  if (value >= 0.25) return 'inclua ocasionalmente, sem forçar';
  return 'evite/praticamente não explore';
}

const NEUTRAL_ZONE_MIN = 0.4;
const NEUTRAL_ZONE_MAX = 0.6;

function isNeutral(value: number): boolean {
  return value >= NEUTRAL_ZONE_MIN && value <= NEUTRAL_ZONE_MAX;
}

function buildAxisLines<T extends object>(
  values: T,
  labels: Record<keyof T, string>
): string[] {
  return (Object.keys(labels) as (keyof T)[])
    .filter((key) => !isNeutral((values as Record<keyof T, number>)[key] ?? 0.5))
    .map((key) => {
      const value = (values as Record<keyof T, number>)[key] ?? 0.5;
      return `- ${intensityPhrase(value)}: ${labels[key]} (peso calibrado: ${value.toFixed(2)})`;
    });
}

/**
 * Converte o DNA numérico da banca/professor em instruções textuais graduadas,
 * usando apenas o(s) conjunto(s) de eixos relevante(s) pro ciclo acadêmico detectado.
 */
export function interpretExamDNA(dna: ExamDNA): string {
  if (!dna) return '';
  const sections: string[] = [];

  if (dna.clinico) {
    const lines = buildAxisLines(dna.clinico, CLINICAL_AXIS_LABELS);
    if (lines.length > 0) {
      sections.push(`-- Eixos de Ciclo Clínico --\n${lines.join('\n')}`);
    }
  }
  if (dna.basico) {
    const lines = buildAxisLines(dna.basico, BASIC_AXIS_LABELS);
    if (lines.length > 0) {
      sections.push(`-- Eixos de Ciclo Básico --\n${lines.join('\n')}`);
    }
  }

  if (sections.length === 0) return '';

  return `=== DNA CALIBRADO DA BANCA/PROFESSOR (ciclo: ${dna.cicloAcademico}, baseado em ${dna.version || 1} análise(s) do acervo importado) ===\n${sections.join('\n\n')}\n=== FIM DO DNA CALIBRADO ===`;
}
