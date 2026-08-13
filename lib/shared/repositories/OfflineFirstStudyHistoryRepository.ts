import { IStudyHistoryRepository } from '../../../src/domain/repositories/IStudyHistoryRepository';
import { ReviewLog } from '../../../src/domain/entities/StudySession';
import { db, MedAnkiDexieDB } from '../../../src/data/db/database';

import {
  nativeSQLiteService,
  NativeSQLiteService,
  CachedHistoryRow,
} from '../../core/services/NativeSQLiteService';
import { syncService, SyncService } from '../../core/services/SyncService';

/**
 * Cache-then-Network Study History Repository
 * Immediately logs reviews into native SQLite table and synchronizes via Action Queue.
 */
export class OfflineFirstStudyHistoryRepository implements IStudyHistoryRepository {
  constructor(
    private database: MedAnkiDexieDB = db,
    private sqlite: NativeSQLiteService = nativeSQLiteService,
    private sync: SyncService = syncService
  ) {}

  private mapRowToLog(row: CachedHistoryRow): ReviewLog {
    try {
      return JSON.parse(row.data_json);
    } catch {
      return {
        id: row.id,
        cardId: row.card_id,
        deckId: row.deck_id,
        rating: (parseInt(row.rating, 10) || 3) as any,
        timeSpentSeconds: 0,
        reviewedAt: row.reviewed_at,
        previousInterval: 1,
        newInterval: 1,
      };
    }
  }

  async addReviewLog(logData: Omit<ReviewLog, 'id'>): Promise<ReviewLog> {
    const log: ReviewLog = {
      ...logData,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    };

    // 1. Write to SQLite cache immediately
    await this.sqlite.insertCachedHistory({
      id: log.id,
      card_id: log.cardId,
      deck_id: log.deckId,
      rating: String(log.rating),
      reviewed_at: log.reviewedAt,
      data_json: JSON.stringify(log),
    });

    // 2. Write to Dexie
    await this.database.studyHistory.put(log);

    // 3. Enqueue action for background sync
    await this.sync.enqueueAction('SAVE_STUDY_LOG', { log });

    return log;
  }

  async getLogsByCardId(cardId: string): Promise<ReviewLog[]> {
    return await this.database.studyHistory.where('cardId').equals(cardId).toArray();
  }

  async getLogsByDeckId(deckId: string, limit = 100): Promise<ReviewLog[]> {
    // 1. Read SQLite Cache FIRST
    const cached = await this.sqlite.getCachedHistoryByDeck(deckId, limit);
    if (cached.length > 0) {
      return cached.map((r) => this.mapRowToLog(r));
    }

    // 2. Dexie fallback
    const dexieLogs = await this.database.studyHistory
      .where('deckId')
      .equals(deckId)
      .reverse()
      .limit(limit)
      .toArray();

    for (const log of dexieLogs) {
      await this.sqlite.insertCachedHistory({
        id: log.id,
        card_id: log.cardId,
        deck_id: log.deckId,
        rating: String(log.rating),
        reviewed_at: log.reviewedAt,
        data_json: JSON.stringify(log),
      });
    }

    return dexieLogs;
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
