import { ImportItem, ImportQueueState } from '../models/ImportModels';

export interface IDocumentQueue {
  enqueue(item: ImportItem): void;
  dequeue(): ImportItem | undefined;
  peek(): ImportItem | undefined;
  getQueueState(): ImportQueueState;
  clear(): void;
}
