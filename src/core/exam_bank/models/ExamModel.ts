/**
 * MedCore Exam Model - Phase 18.4
 *
 * Domain model for Exam Bank (Banco de Provas).
 */

export type ExamCategory =
  | 'ENARE'
  | 'ENAMED'
  | 'USP'
  | 'UNICAMP'
  | 'UNESP'
  | 'SUS-SP'
  | 'SUS-BA'
  | 'SES-PE'
  | 'SES-GO'
  | 'Revalida'
  | 'Professor Particular'
  | 'Outro';

export interface ExamModel {
  id: string;
  titulo: string;
  instituição: string;
  professor: string;
  disciplina: string;
  especialidade: string;
  ano: number;
  semestre: string; // '1º Semestre', '2º Semestre', 'Anual'
  tipo: ExamCategory;
  observacoes: string;
  conteudoTexto?: string;
  tags: string[];
  arquivoOriginal: string;
  tamanhoArquivo: number;
  tamanhoFormatado: string;
  gabarito: string; // Opcional (texto ou link do gabarito)
  hasRawPdf?: boolean;
  rawFileBlob?: Blob;
  createdAt: string;
  updatedAt: string;
}

export interface ExamCreateDTO {
  titulo: string;
  instituição: string;
  professor: string;
  disciplina: string;
  especialidade: string;
  ano: number;
  semestre: string;
  tipo: ExamCategory;
  observacoes: string;
  conteudoTexto?: string;
  tags: string[];
  arquivoOriginal: string;
  tamanhoArquivo: number;
  gabarito?: string;
  rawFile?: Blob | File;
}

export interface ExamUpdateDTO {
  titulo?: string;
  instituição?: string;
  professor?: string;
  disciplina?: string;
  especialidade?: string;
  ano?: number;
  semestre?: string;
  tipo?: ExamCategory;
  observacoes?: string;
  conteudoTexto?: string;
  tags?: string[];
  gabarito?: string;
  rawFile?: Blob | File;
}

export const EXAM_CATEGORIES: ExamCategory[] = [
  'ENARE',
  'ENAMED',
  'USP',
  'UNICAMP',
  'UNESP',
  'SUS-SP',
  'SUS-BA',
  'SES-PE',
  'SES-GO',
  'Revalida',
  'Professor Particular',
  'Outro',
];
