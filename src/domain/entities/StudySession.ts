import { ReviewRating } from '../../core/algorithm/sm2';

export interface ReviewLog {
  id: string;
  cardId: string;
  deckId: string;
  rating: ReviewRating;
  timeSpentSeconds: number;
  reviewedAt: string;
  previousInterval: number;
  newInterval: number;
}

export interface DeckStats {
  deckId: string;
  totalReviewsToday: number;
  retentionRate: number;       // Percentage e.g. 88.5%
  averageTimePerCard: number;  // Seconds
  dailyStreak: number;
  lastStudiedAt?: string;
  heatmapData: Record<string, number>; // "YYYY-MM-DD" -> count
  contentMastery?: number;
}
