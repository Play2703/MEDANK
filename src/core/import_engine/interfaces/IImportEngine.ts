import { ImportItem, ImportQueueState } from '../models/ImportModels';
import { ImportStatus } from '../models/ImportStatus';

export interface IImportEngine {
  initialize(): Promise<void>;
  importDocument(file: File | Blob, options?: Record<string, any>): Promise<ImportItem>;
  getImportStatus(importId: string): Promise<ImportStatus>;
  getQueueState(): ImportQueueState;
  cancelImport(importId: string): Promise<void>;
}
