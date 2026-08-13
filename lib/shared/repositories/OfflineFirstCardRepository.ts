import { ICardRepository } from '../../../src/domain/repositories/ICardRepository';
import { FlashCard } from '../../../src/domain/entities/Card';
import { db, MedAnkiDexieDB } from '../../../src/data/db/database';

import {
  nativeSQLiteService,
  NativeSQLiteService,
  CachedFlashcardRow,
} from '../../core/services/NativeSQLiteService';
import { syncService, SyncService } from '../../core/services/SyncService';

/**
 * Cache-then-Network Card Repository
 * 1. Reads local native SQLite cache FIRST for instant sub-millisecond data retrieval.
 * 2. Immediately persists card changes to SQLite local cache.
 * 3. Dispatches actions to the SQLite Action Queue for silent background cloud sync.
 */
export class OfflineFirstCardRepository implements ICardRepository {
  constructor(
    private database: MedAnkiDexieDB = db,
    private sqlite: NativeSQLiteService = nativeSQLiteService,
    private sync: SyncService = syncService
  ) {}

  private mapRowToFlashCard(row: CachedFlashcardRow): FlashCard {
    try {
      return JSON.parse(row.data_json);
    } catch {
      return {
        id: row.id,
        deckId: row.deck_id,
        type: 'basic',
        front: row.front,
        back: row.back,
        tags: [],
        createdAt: row.updated_at,
        updatedAt: row.updated_at,
        sm2State: row.sm2_state ? JSON.parse(row.sm2_state) : { interval: 1, repetition: 0, easeFactor: 2.5, dueDate: row.due_date },
      };
    }
  }

  private mapCardToRow(card: FlashCard): CachedFlashcardRow {
    return {
      id: card.id,
      deck_id: card.deckId,
      front: card.front,
      back: card.back,
      due_date: card.sm2State?.dueDate || '',
      sm2_state: JSON.stringify(card.sm2State || {}),
      updated_at: card.updatedAt || new Date().toISOString(),
      data_json: JSON.stringify(card),
    };
  }

  async getCardsByDeckId(deckId: string): Promise<FlashCard[]> {
    // 1. Read SQLite Cache FIRST (< 1ms)
    const cachedRows = await this.sqlite.getCachedCardsByDeck(deckId);
    if (cachedRows.length > 0) {
      const cards = cachedRows.map((row) => this.mapRowToFlashCard(row));
      // Background revalidation with Dexie/Remote
      this.revalidateDeckCache(deckId).catch(() => {});
      return cards;
    }

    // 2. Fallback to Dexie and hydrate SQLite
    const dexieCards = await this.database.flashcards.where('deckId').equals(deckId).toArray();
    for (const card of dexieCards) {
      await this.sqlite.upsertCachedCard(this.mapCardToRow(card));
    }
    return dexieCards;
  }

  private async revalidateDeckCache(deckId: string): Promise<void> {
    const dexieCards = await this.database.flashcards.where('deckId').equals(deckId).toArray();
    for (const card of dexieCards) {
      await this.sqlite.upsertCachedCard(this.mapCardToRow(card));
    }
  }

  async getDueCardsByDeckId(deckId: string): Promise<FlashCard[]> {
    const nowISO = new Date().toISOString();

    // 1. Read SQLite Cache FIRST
    const cachedRows = await this.sqlite.getCachedCardsByDeck(deckId);
    if (cachedRows.length > 0) {
      return cachedRows
        .map((r) => this.mapRowToFlashCard(r))
        .filter((card) => {
          if (!card.sm2State?.dueDate) return true;
          return card.sm2State.dueDate <= nowISO;
        });
    }

    // 2. Dexie retrieval
    return await this.database.flashcards
      .where('deckId')
      .equals(deckId)
      .filter((card) => {
        if (!card.sm2State?.dueDate) return true;
        return card.sm2State.dueDate <= nowISO;
      })
      .toArray();
  }

  async getCardById(id: string): Promise<FlashCard | null> {
    // 1. Read SQLite Cache FIRST
    const cachedRow = await this.sqlite.getCachedCardById(id);
    if (cachedRow) {
      return this.mapRowToFlashCard(cachedRow);
    }

    // 2. Dexie lookup & hydrate
    const card = await this.database.flashcards.get(id);
    if (card) {
      await this.sqlite.upsertCachedCard(this.mapCardToRow(card));
      return card;
    }
    return null;
  }

  async saveCard(card: FlashCard): Promise<FlashCard> {
    // 1. Write to Native SQLite cache immediately
    await this.sqlite.upsertCachedCard(this.mapCardToRow(card));

    // 2. Write to Dexie
    await this.database.flashcards.put(card);

    // 3. Enqueue to Action Queue for background sync
    await this.sync.enqueueAction('SAVE_CARD', { card });

    return card;
  }

  async updateCard(card: FlashCard): Promise<FlashCard> {
    const updatedCard: FlashCard = {
      ...card,
      updatedAt: new Date().toISOString(),
    };

    // 1. Write to Native SQLite cache immediately
    await this.sqlite.upsertCachedCard(this.mapCardToRow(updatedCard));

    // 2. Write to Dexie
    await this.database.flashcards.put(updatedCard);

    // 3. Enqueue to Action Queue for background sync
    await this.sync.enqueueAction('UPDATE_CARD', { card: updatedCard });

    return updatedCard;
  }

  async deleteCard(id: string): Promise<boolean> {
    // 1. Delete from SQLite cache immediately
    await this.sqlite.deleteCachedCard(id);

    // 2. Delete from Dexie
    await this.database.flashcards.delete(id);

    // 3. Enqueue delete action for sync
    await this.sync.enqueueAction('DELETE_CARD', { cardId: id });

    return true;
  }

  async saveMultipleCards(cards: FlashCard[]): Promise<FlashCard[]> {
    for (const card of cards) {
      await this.sqlite.upsertCachedCard(this.mapCardToRow(card));
    }
    await this.database.bulkSaveCardsInChunks(cards, 5000);
    for (const card of cards) {
      await this.sync.enqueueAction('SAVE_CARD', { card });
    }
    return cards;
  }
}
