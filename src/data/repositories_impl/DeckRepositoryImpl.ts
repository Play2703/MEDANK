import { IDeckRepository } from '../../domain/repositories/IDeckRepository';
import { Deck } from '../../domain/entities/Deck';
import { db, MedAnkiDexieDB } from '../db/database';

export class DeckRepositoryImpl implements IDeckRepository {
  constructor(private database: MedAnkiDexieDB = db) {}

  async getAllDecks(): Promise<Deck[]> {
    return await this.database.decks.toArray();
  }

  async getDeckById(id: string): Promise<Deck | null> {
    const deck = await this.database.decks.get(id);
    return deck || null;
  }

  async createDeck(
    deckData: Omit<Deck, 'id' | 'createdAt' | 'updatedAt' | 'totalCards' | 'newCards' | 'dueCards' | 'learningCards'>
  ): Promise<Deck> {
    const now = new Date().toISOString();
    const newDeck: Deck = {
      ...deckData,
      id: `deck_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      totalCards: 0,
      newCards: 0,
      dueCards: 0,
      learningCards: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.database.decks.put(newDeck);
    return newDeck;
  }

  async updateDeck(deck: Deck): Promise<Deck> {
    const updatedDeck: Deck = {
      ...deck,
      updatedAt: new Date().toISOString(),
    };
    await this.database.decks.put(updatedDeck);
    return updatedDeck;
  }

  async deleteDeck(id: string): Promise<boolean> {
    await this.database.transaction('rw', [this.database.decks, this.database.flashcards], async () => {
      await this.database.flashcards.where('deckId').equals(id).delete();
      await this.database.decks.delete(id);
    });
    return true;
  }

  async duplicateDeck(id: string): Promise<Deck> {
    const originalDeck = await this.getDeckById(id);
    if (!originalDeck) {
      throw new Error(`Original deck not found: ${id}`);
    }

    const now = new Date().toISOString();
    const newDeckId = `deck_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const newDeck: Deck = {
      ...originalDeck,
      id: newDeckId,
      title: `${originalDeck.title} (Cópia)`,
      createdAt: now,
      updatedAt: now,
    };

    // Duplicate all cards in this deck
    const originalCards = await this.database.flashcards.where('deckId').equals(id).toArray();
    const duplicatedCards = originalCards.map((card) => ({
      ...card,
      id: `card_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      deckId: newDeckId,
      createdAt: now,
      updatedAt: now,
    }));

    await this.database.transaction('rw', [this.database.decks, this.database.flashcards], async () => {
      await this.database.decks.put(newDeck);
      if (duplicatedCards.length > 0) {
        await this.database.flashcards.bulkPut(duplicatedCards);
      }
    });

    return await this.recalculateCounts(newDeckId);
  }

  async toggleFavorite(id: string): Promise<Deck> {
    const deck = await this.getDeckById(id);
    if (!deck) {
      throw new Error(`Deck not found: ${id}`);
    }
    const updatedDeck: Deck = {
      ...deck,
      isFavorite: !deck.isFavorite,
      updatedAt: new Date().toISOString(),
    };
    await this.database.decks.put(updatedDeck);
    return updatedDeck;
  }

  async moveDeck(id: string, folderId?: string): Promise<Deck> {
    const deck = await this.getDeckById(id);
    if (!deck) {
      throw new Error(`Deck not found: ${id}`);
    }
    const updatedDeck: Deck = {
      ...deck,
      folderId: folderId || undefined,
      updatedAt: new Date().toISOString(),
    };
    await this.database.decks.put(updatedDeck);
    return updatedDeck;
  }

  async recalculateCounts(deckId: string): Promise<Deck> {
    const deck = await this.getDeckById(deckId);
    if (!deck) {
      throw new Error(`Deck not found: ${deckId}`);
    }

    const cards = await this.database.flashcards.where('deckId').equals(deckId).toArray();
    const nowISO = new Date().toISOString();

    let newCount = 0;
    let dueCount = 0;
    let learningCount = 0;

    for (const card of cards) {
      const rep = card.sm2State?.repetitions ?? 0;
      const dueDate = card.sm2State?.dueDate ?? nowISO;

      if (rep === 0) {
        newCount++;
        dueCount++;
      } else if (dueDate <= nowISO) {
        dueCount++;
        if (rep < 3) {
          learningCount++;
        }
      }
    }

    const updatedDeck: Deck = {
      ...deck,
      totalCards: cards.length,
      newCards: newCount,
      dueCards: dueCount,
      learningCards: learningCount,
      updatedAt: nowISO,
    };

    await this.database.decks.put(updatedDeck);
    return updatedDeck;
  }

  async resetProgress(deckId: string): Promise<Deck> {
    const cards = await this.database.flashcards.where('deckId').equals(deckId).toArray();
    const now = new Date().toISOString();
    for (const card of cards) {
      await this.database.flashcards.update(card.id, {
        sm2State: {
          status: 'new',
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          lapses: 0,
          learningStep: 0,
          relearningStep: 0,
          dueDate: now,
        },
        updatedAt: now,
      });
    }
    return await this.recalculateCounts(deckId);
  }
}
