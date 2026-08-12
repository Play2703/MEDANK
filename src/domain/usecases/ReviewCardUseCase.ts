import { ICardRepository } from '../repositories/ICardRepository';
import { IStudyRepository } from '../repositories/IStudyRepository';
import { FlashCard } from '../entities/Card';
import { ReviewRating } from '../../core/algorithm/sm2';
import { reviewSchedulerService, ReviewSchedulerService } from '../../data/services/ReviewSchedulerService';

export class ReviewCardUseCase {
  constructor(
    private cardRepo: ICardRepository,
    private studyRepo: IStudyRepository,
    private scheduler: ReviewSchedulerService = reviewSchedulerService
  ) {}

  async execute(card: FlashCard, rating: ReviewRating, timeSpentSeconds: number): Promise<FlashCard> {
    const prevInterval = card.sm2State.interval;
    const nextSM2State = this.scheduler.calculateNextState(card.sm2State, rating);

    const updatedCard: FlashCard = {
      ...card,
      sm2State: nextSM2State,
      updatedAt: new Date().toISOString(),
    };

    // Save updated card state
    await this.cardRepo.updateCard(updatedCard);

    // Log review session
    await this.studyRepo.logReview({
      cardId: card.id,
      deckId: card.deckId,
      rating,
      timeSpentSeconds,
      reviewedAt: new Date().toISOString(),
      previousInterval: prevInterval,
      newInterval: nextSM2State.interval,
    });

    return updatedCard;
  }
}
