import { IFlashcardRepository } from '../../domain/repositories/IFlashcardRepository';
import { FlashCard } from '../../domain/entities/Card';
import { DocumentImportRecord } from '../../domain/entities/DocumentImport';
import { db } from '../db/database';
import { CardRepositoryImpl } from './CardRepositoryImpl';
import { DeckRepositoryImpl } from './DeckRepositoryImpl';

const IMPORT_LOGS_KEY = 'medanki_document_import_records';

export class FlashcardRepositoryImpl implements IFlashcardRepository {
  private cardRepo = new CardRepositoryImpl();
  private deckRepo = new DeckRepositoryImpl();

  async saveMultipleCards(cards: FlashCard[]): Promise<void> {
    await this.cardRepo.saveMultipleCards(cards);
  }

  async saveImportRecord(record: DocumentImportRecord): Promise<void> {
    const existing = await this.getImportRecords();
    const updated = [record, ...existing];
    localStorage.setItem(IMPORT_LOGS_KEY, JSON.stringify(updated));
  }

  async getImportRecords(deckId?: string): Promise<DocumentImportRecord[]> {
    try {
      const raw = localStorage.getItem(IMPORT_LOGS_KEY);
      if (!raw) return [];
      const records: DocumentImportRecord[] = JSON.parse(raw);
      if (deckId) {
        return records.filter((r) => r.deckId === deckId);
      }
      return records;
    } catch {
      return [];
    }
  }

  async recalculateDeckCounts(deckId: string): Promise<void> {
    await this.deckRepo.recalculateCounts(deckId);
  }
}
