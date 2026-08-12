import { DocumentFormat } from './DocumentContent';

export interface BinaryDocument {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  format: DocumentFormat;
  buffer: ArrayBuffer;
  base64?: string;
  metadata: Record<string, any>;
  createdAt: string;
}
