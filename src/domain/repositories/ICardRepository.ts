import { FlashCard } from '../entities/Card';

export interface ICardRepository {
  getCardsByDeckId(deckId: string): Promise<FlashCard[]>;
  getDueCardsByDeckId(deckId: string): Promise<FlashCard[]>;
  getCardById(id: string): Promise<FlashCard | null>;
  saveCard(card: FlashCard): Promise<FlashCard>;
  updateCard(card: FlashCard): Promise<FlashCard>;
  deleteCard(id: string): Promise<boolean>;
  saveMultipleCards(cards: FlashCard[]): Promise<FlashCard[]>;
}
