/**
 * MedCore Book Model - Phase 18.5
 *
 * Domain model for Books module.
 */

export interface BookModel {
  id: string;
  titulo: string;
  autor: string;
  editora: string;
  edicao: string;
  ano: number;
  isbn: string;
  disciplina: string;
  especialidade: string;
  volume: string;
  idioma: string;
  conteudoTexto?: string;
  arquivo: string;
  tamanhoArquivo: number;
  tamanhoFormatado: string;
  categoria: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookCreateDTO {
  titulo: string;
  autor: string;
  editora: string;
  edicao: string;
  ano: number;
  isbn: string;
  disciplina: string;
  especialidade: string;
  volume: string;
  idioma: string;
  conteudoTexto?: string;
  arquivo: string;
  tamanhoArquivo?: number;
  categoria?: string;
}

export interface BookUpdateDTO {
  titulo?: string;
  autor?: string;
  editora?: string;
  edicao?: string;
  ano?: number;
  isbn?: string;
  disciplina?: string;
  especialidade?: string;
  volume?: string;
  idioma?: string;
  conteudoTexto?: string;
  arquivo?: string;
  categoria?: string;
}
