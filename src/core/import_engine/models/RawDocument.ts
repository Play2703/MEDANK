import { DocumentContent, DocumentFormat } from './DocumentContent';

export interface RawDocument {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  format: DocumentFormat;
  content: DocumentContent;
  metadata: Record<string, any>;
  createdAt: string;
}
