/**
 * Knowledge Library Module - KnowledgeLibraryItem
 *
 * Core domain entity representing an imported or registered document in MedAnki's knowledge base.
 */

import { KnowledgeCategory } from './KnowledgeCategory';
import { KnowledgeStatus } from './KnowledgeStatus';
import { KnowledgeMetadata } from './KnowledgeMetadata';

export type AllowedFileFormat =
  | 'PDF'
  | 'DOCX'
  | 'DOC'
  | 'PPTX'
  | 'PPT'
  | 'TXT'
  | 'MD'
  | 'EPUB'
  | 'HTML'
  | 'CSV'
  | 'JPEG'
  | 'PNG'
  | 'WEBP'
  | 'HEIC'
  | 'TIFF'
  | 'ZIP'
  | string;

export interface KnowledgeLibraryItem {
  /** Unique document identifier */
  id: string;

  /** Document title / name */
  name: string;

  /** Primary category type (Livro, Prova, Professor, Diretriz, Protocolo, Artigo, Apostila, Outro) */
  type: KnowledgeCategory;

  /** File extension / format (PDF, DOCX, PPTX, EPUB, etc.) */
  format: AllowedFileFormat;

  /** Original file name */
  fileName: string;

  /** File size in bytes */
  fileSize: number;

  /** Human-formatted file size (e.g. "14.2 MB") */
  fileSizeFormatted: string;

  /** ISO date string of file registration/import */
  importDate: string;

  /** Multiple medical specialties (e.g., ["Cardiologia", "Pediatria"]) */
  specialties: string[];

  /** Medical discipline (e.g., "Clínica Médica", "Cirurgia Geral") */
  discipline: string;

  /** Subject / Assunto (e.g., "Síndrome Coronariana Aguda") */
  subject: string;

  /** Subtopic / Subtema (e.g., "IAM com Supradesnivelamento de ST") */
  subtopic?: string;

  /** Author or Professor name */
  author?: string;

  /** Associated institution or exam board (e.g., "USP", "SBC", "ENARE") */
  institution?: string;

  /** Publication or exam year */
  year?: number;

  /** Language code (e.g., "pt-BR", "en-US") */
  language: string;

  /** Detailed description or abstract */
  description?: string;

  /** Multi-select tags / keywords */
  tags: string[];

  /** Additional developer notes or observations */
  notes?: string;

  /** Full extracted textual content for RAG & NER Knowledge Graph */
  conteudoTexto?: string;

  /** Source or origin context (e.g., "Upload Direto", "Drive Coletivo", "SBC Portal") */
  origin?: string;

  /** Current lifecycle status (Default: "Importado") */
  status: KnowledgeStatus;

  /** Technical metadata container prepared for future pipeline stages */
  metadata: KnowledgeMetadata;

  /** Parent folder ID if categorized in a subfolder */
  folderId?: string;

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;
}

export interface KnowledgeLibraryItemCreateDTO {
  name: string;
  type: KnowledgeCategory;
  format: AllowedFileFormat;
  fileName: string;
  fileSize: number;
  specialties: string[];
  discipline: string;
  subject: string;
  subtopic?: string;
  author?: string;
  institution?: string;
  year?: number;
  language?: string;
  description?: string;
  tags: string[];
  notes?: string;
  conteudoTexto?: string;
  origin?: string;
  status?: KnowledgeStatus;
  metadata?: Partial<KnowledgeMetadata>;
  folderId?: string;
}

export interface KnowledgeLibraryItemUpdateDTO {
  name?: string;
  type?: KnowledgeCategory;
  specialties?: string[];
  discipline?: string;
  subject?: string;
  subtopic?: string;
  author?: string;
  institution?: string;
  year?: number;
  language?: string;
  description?: string;
  tags?: string[];
  notes?: string;
  conteudoTexto?: string;
  origin?: string;
  status?: KnowledgeStatus;
  folderId?: string;
  metadata?: Partial<KnowledgeMetadata>;
}

export interface KnowledgeLibraryFilterOptions {
  searchQuery?: string;
  type?: KnowledgeCategory | 'Todos';
  specialty?: string;
  discipline?: string;
  status?: KnowledgeStatus | 'Todos';
  format?: string;
  year?: number;
  folderId?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}
