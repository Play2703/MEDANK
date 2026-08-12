import { IStudyHistoryRepository } from '../../domain/repositories/IStudyHistoryRepository';
import { ReviewLog } from '../../domain/entities/StudySession';
import { db, MedAnkiDexieDB } from '../db/database';

export class StudyHistoryRepositoryImpl implements IStudyHistoryRepository {
  constructor(private database: MedAnkiDexieDB = db) {}

  async addReviewLog(logData: Omit<ReviewLog, 'id'>): Promise<ReviewLog> {
    const log: ReviewLog = {
      ...logData,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    };
    await this.database.studyHistory.put(log);
    return log;
  }

  async getLogsByCardId(cardId: string): Promise<ReviewLog[]> {
    return await this.database.studyHistory.where('cardId').equals(cardId).toArray();
  }

  async getLogsByDeckId(deckId: string, limit = 100): Promise<ReviewLog[]> {
    return await this.database.studyHistory
      .where('deckId')
      .equals(deckId)
      .reverse()
      .limit(limit)
      .toArray();
  }

  async getAllLogs(limit = 500): Promise<ReviewLog[]> {
    return await this.database.studyHistory
      .orderBy('reviewedAt')
      .reverse()
      .limit(limit)
      .toArray();
  }

  async clearHistory(): Promise<void> {
    await this.database.studyHistory.clear();
  }
}
