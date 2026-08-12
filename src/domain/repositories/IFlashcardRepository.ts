import { FlashCard } from '../entities/Card';
import { DocumentImportRecord } from '../entities/DocumentImport';

export interface IFlashcardRepository {
  saveMultipleCards(cards: FlashCard[]): Promise<void>;
  saveImportRecord(record: DocumentImportRecord): Promise<void>;
  getImportRecords(deckId?: string): Promise<DocumentImportRecord[]>;
  recalculateDeckCounts(deckId: string): Promise<void>;
}
