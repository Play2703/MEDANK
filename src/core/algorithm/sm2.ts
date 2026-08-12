import { reviewSchedulerService, AnkiSM2Config } from '../../data/services/ReviewSchedulerService';

export type ReviewRating = 1 | 2 | 3 | 4; // 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
export type CardStatus = 'new' | 'learning' | 'review' | 'relearning';

export interface SM2State {
  interval: number;      // Current interval in days (0 = learning/minutes)
  easeFactor: number;    // Ease factor (default 2.50, min 1.30)
  repetitions: number;   // Number of consecutive successful reviews
  lapses: number;        // Number of times card lapsed (Review -> Relearning)
  learningStep: number;  // Current step index in learningSteps
  relearningStep: number;// Current step index in relearningSteps
  dueDate: string;       // ISO Date string for next review
  lastReviewedAt?: string;
  status: CardStatus;
}

export interface ReviewCalculationResult {
  nextState: SM2State;
  estimatedNextIntervalText: string;
}

/**
 * Creates initial SM-2 state using ReviewSchedulerService
 */
export function createInitialSM2State(config?: Partial<AnkiSM2Config>): SM2State {
  return reviewSchedulerService.createInitialState(config);
}

/**
 * Calculates the next state given a review rating using ReviewSchedulerService
 */
export function calculateSM2(
  currentState: SM2State,
  rating: ReviewRating,
  now: Date = new Date(),
  config?: Partial<AnkiSM2Config>
): SM2State {
  return reviewSchedulerService.calculateNextState(currentState, rating, now, config);
}

/**
 * Helper to display interval preview strings for buttons using ReviewSchedulerService
 */
export function getIntervalPreviewText(
  currentState: SM2State,
  rating: ReviewRating,
  now: Date = new Date(),
  config?: Partial<AnkiSM2Config>
): string {
  return reviewSchedulerService.getIntervalPreviewText(currentState, rating, now, config);
}

export { ReviewSchedulerService, reviewSchedulerService, DEFAULT_ANKI_SM2_CONFIG } from '../../data/services/ReviewSchedulerService';
