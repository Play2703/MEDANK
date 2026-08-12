export type DocumentFormat = 'pdf' | 'docx' | 'txt' | 'epub' | 'html' | 'pptx' | 'image' | 'unknown';

export interface DocumentContent {
  rawText?: string;
  binaryData?: ArrayBuffer;
  base64Data?: string;
  format: DocumentFormat;
  encoding?: string;
  charCount?: number;
  byteLength: number;
}
