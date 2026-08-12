import { DocumentMetadata } from '../models/DocumentMetadata';

export interface IDocumentMetadataExtractor {
  extractMetadata(file: File | Blob, rawContent?: any): Promise<DocumentMetadata>;
}
