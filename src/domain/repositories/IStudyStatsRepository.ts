import { DeckStats } from '../entities/StudySession';

export interface IStudyStatsRepository {
  getDeckStats(deckId?: string): Promise<DeckStats>;
  updateDeckStats(stats: DeckStats): Promise<DeckStats>;
  getGlobalHeatmap(): Promise<Record<string, number>>;
  recordReviewStats(deckId: string, rating: string, timeSpentSeconds: number): Promise<void>;
}
