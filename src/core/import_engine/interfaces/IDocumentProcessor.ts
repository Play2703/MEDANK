import { ImportItem } from '../models/ImportModels';

export interface IDocumentProcessor {
  process(item: ImportItem): Promise<ImportItem>;
}
