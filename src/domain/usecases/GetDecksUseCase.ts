import { IDeckRepository } from '../repositories/IDeckRepository';
import { Deck } from '../entities/Deck';

export class GetDecksUseCase {
  constructor(private deckRepo: IDeckRepository) {}

  async execute(): Promise<Deck[]> {
    return this.deckRepo.getAllDecks();
  }
}
