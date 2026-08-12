/**
 * Knowledge Library Module - IDocumentRegistrationService
 *
 * Service contract responsible for converting imported browser File objects or raw file DTOs
 * into registered KnowledgeLibraryItem entries with status "Importado".
 */

import {
  KnowledgeLibraryItem,
  KnowledgeLibraryItemCreateDTO,
  AllowedFileFormat,
} from '../models/KnowledgeLibraryItem';

export interface FileImportPayload {
  file: File | { name: string; size: number; type?: string };
  overrideName?: string;
  category?: KnowledgeLibraryItem['type'];
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
  extractedText?: string;
  origin?: string;
}

export interface IDocumentRegistrationService {
  /** Map browser File object or DTO to KnowledgeLibraryItemCreateDTO */
  prepareRegistrationDTO(payload: FileImportPayload): KnowledgeLibraryItemCreateDTO;

  /** Register single file into knowledge library with default status 'Importado' */
  registerDocument(payload: FileImportPayload): Promise<KnowledgeLibraryItem>;

  /** Register multiple files simultaneously in batch */
  registerBatchDocuments(payloads: FileImportPayload[]): Promise<KnowledgeLibraryItem[]>;

  /** Infer file format extension from file name or MIME type */
  inferFileFormat(fileName: string, mimeType?: string): AllowedFileFormat;
}
