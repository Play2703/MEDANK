/**
 * MedCore Guideline Model - Phase 18.6
 */

export type GuidelineCategory = 'AMB' | 'SBM' | 'SBC' | 'FEBRASGO' | 'SBI' | 'CFM' | 'MS' | 'OMS';

export interface GuidelineModel {
  id: string;
  titulo: string;
  categoria: GuidelineCategory;
  ano: number;
  especialidade: string;
  resumo: string;
  conteudoTexto?: string;
  arquivo: string;
  tamanhoArquivo: number;
  tamanhoFormatado: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuidelineCreateDTO {
  titulo: string;
  categoria: GuidelineCategory;
  ano: number;
  especialidade: string;
  resumo: string;
  conteudoTexto?: string;
  arquivo: string;
  tamanhoArquivo?: number;
}

export interface GuidelineUpdateDTO {
  titulo?: string;
  categoria?: GuidelineCategory;
  ano?: number;
  especialidade?: string;
  resumo?: string;
  conteudoTexto?: string;
  arquivo?: string;
}
