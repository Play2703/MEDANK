import { KnowledgeCategory } from '../../knowledge_library/models/KnowledgeCategory';

export type MaterialFormat = 'PDF' | 'DOCX' | 'PPTX' | 'TXT' | 'MD' | 'EPUB' | string;

export type MaterialStatus = 'Importado' | 'Processando' | 'Revisado' | 'Erro';

export interface MaterialModel {
  id: string;
  titulo: string;
  categoria: KnowledgeCategory;
  disciplina: string;
  especialidade: string;
  autor: string;
  ano: number;
  descricao: string;
  idioma: string;
  tipo: string;
  status: MaterialStatus;
  dataImportacao: string;
  tags: string[];
  observacoes: string;
  conteudoTexto?: string;

  nomeArquivo: string;
  tamanhoArquivo: number;
  tamanhoFormatado: string;
  formato: MaterialFormat;
  origem: string;

  createdAt: string;
  updatedAt: string;
}

export interface MaterialCreateDTO {
  titulo: string;
  categoria: KnowledgeCategory;
  disciplina: string;
  especialidade: string;
  autor: string;
  ano: number;
  descricao: string;
  idioma: string;
  tipo: string;
  status?: MaterialStatus;
  tags: string[];
  observacoes: string;
  conteudoTexto?: string;
  nomeArquivo: string;
  tamanhoArquivo: number;
  formato: MaterialFormat;
  origem?: string;
}

export interface MaterialUpdateDTO {
  titulo?: string;
  categoria?: KnowledgeCategory;
  disciplina?: string;
  especialidade?: string;
  autor?: string;
  ano?: number;
  descricao?: string;
  idioma?: string;
  tipo?: string;
  status?: MaterialStatus;
  tags?: string[];
  observacoes?: string;
  conteudoTexto?: string;
  nomeArquivo?: string;
  tamanhoArquivo?: number;
  formato?: MaterialFormat;
}
