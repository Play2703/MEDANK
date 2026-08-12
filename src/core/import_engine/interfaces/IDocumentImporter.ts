import { ImportItem } from '../models/ImportModels';

export interface IDocumentImporter {
  import(file: File | Blob, metadata?: Record<string, any>): Promise<ImportItem>;
}
