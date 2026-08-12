import { Deck } from '../entities/Deck';

export interface IDeckRepository {
  getAllDecks(): Promise<Deck[]>;
  getDeckById(id: string): Promise<Deck | null>;
  createDeck(deck: Omit<Deck, 'id' | 'createdAt' | 'updatedAt' | 'totalCards' | 'newCards' | 'dueCards' | 'learningCards'>): Promise<Deck>;
  updateDeck(deck: Deck): Promise<Deck>;
  deleteDeck(id: string): Promise<boolean>;
  duplicateDeck(id: string): Promise<Deck>;
  toggleFavorite(id: string): Promise<Deck>;
  moveDeck(id: string, folderId?: string): Promise<Deck>;
  recalculateCounts(deckId: string): Promise<Deck>;
  resetProgress(deckId: string): Promise<Deck>;
}
