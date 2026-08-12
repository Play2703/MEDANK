import { DocumentFormat } from './DocumentContent';

export interface DocumentMetadata {
  fileName: string;
  author?: string;
  title?: string;
  language?: string;
  pageCount?: number;
  date?: string;
  format: DocumentFormat | string;
  encoding?: string;
  peso: number; // Tamanho em bytes
  tamanho: string; // Tamanho formatado (ex: "2.4 MB")
  livro?: string;
  capitulo?: string;
  mimeType: string;
  extractedAt: string;
  customAttributes?: Record<string, any>;
}
