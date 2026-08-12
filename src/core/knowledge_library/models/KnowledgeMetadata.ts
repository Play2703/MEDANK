/**
 * Knowledge Library Module - KnowledgeMetadata
 *
 * Technical and extensible metadata structure attached to library documents.
 * Prepared for future pipeline phases (OCR, Parser, Embeddings, Knowledge Graph, AI Synthesis).
 */

export interface KnowledgeMetadata {
  /** Total page count if document is paged */
  pageCount?: number;

  /** Total estimated word count */
  wordCount?: number;

  /** File MD5 / SHA-256 checksum for deduplication */
  checksum?: string;

  /** Version string or edition */
  version?: string;

  /** Placeholder flag for future Vision OCR preparation */
  ocrPrepared?: boolean;

  /** Placeholder flag for future Document Parser preparation */
  parserPrepared?: boolean;

  /** Placeholder flag for future Vector Embeddings (text-embedding-004) */
  embeddingsPrepared?: boolean;

  /** Placeholder flag for future Knowledge Graph indexing */
  knowledgeGraphPrepared?: boolean;

  /** Placeholder flag for future AI Flashcard/Question generation */
  aiPrepared?: boolean;

  /** Processing log history or status notes */
  processingHistory?: { timestamp: string; step: string; status: string; message?: string }[];

  /** Extensible attributes dictionary */
  extensible?: Record<string, unknown>;
}
