import { ReviewLog, DeckStats } from '../entities/StudySession';

export interface IStudyRepository {
  logReview(log: Omit<ReviewLog, 'id'>): Promise<ReviewLog>;
  getLogsByDeckId(deckId: string): Promise<ReviewLog[]>;
  getDeckStats(deckId?: string): Promise<DeckStats>;
  getGlobalHeatmap(): Promise<Record<string, number>>;
}
