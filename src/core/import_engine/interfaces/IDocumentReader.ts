import { RawDocument } from '../models/RawDocument';
import { BinaryDocument } from '../models/BinaryDocument';
import { DocumentContent, DocumentFormat } from '../models/DocumentContent';

export interface IDocumentReader {
  read(file: File | Blob): Promise<string | ArrayBuffer>;
  readRawDocument(file: File | Blob): Promise<RawDocument>;
  readBinaryDocument(file: File | Blob): Promise<BinaryDocument>;
  readContent(file: File | Blob): Promise<DocumentContent>;
  detectFormat(file: File | Blob): DocumentFormat;
}
