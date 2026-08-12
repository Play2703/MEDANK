import { ICardRepository } from '../repositories/ICardRepository';
import { FlashCard } from '../entities/Card';

export class GetDueCardsUseCase {
  constructor(private cardRepo: ICardRepository) {}

  async execute(deckId: string): Promise<FlashCard[]> {
    return this.cardRepo.getDueCardsByDeckId(deckId);
  }
}
