import { ReviewLog } from '../entities/StudySession';

export interface IStudyHistoryRepository {
  addReviewLog(log: Omit<ReviewLog, 'id'>): Promise<ReviewLog>;
  getLogsByCardId(cardId: string): Promise<ReviewLog[]>;
  getLogsByDeckId(deckId: string, limit?: number): Promise<ReviewLog[]>;
  getAllLogs(limit?: number): Promise<ReviewLog[]>;
  clearHistory(): Promise<void>;
}
