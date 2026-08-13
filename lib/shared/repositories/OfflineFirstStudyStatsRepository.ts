import { IStudyStatsRepository } from '../../../src/domain/repositories/IStudyStatsRepository';
import { DeckStats } from '../../../src/domain/entities/StudySession';
import { db, MedAnkiDexieDB } from '../../../src/data/db/database';

import {
  nativeSQLiteService,
  NativeSQLiteService,
} from '../../core/services/NativeSQLiteService';
import { syncService, SyncService } from '../../core/services/SyncService';

/**
 * Cache-then-Network Study Stats Repository
 * Reads statistics directly from SQLite cache for instant dashboard rendering.
 */
export class OfflineFirstStudyStatsRepository implements IStudyStatsRepository {
  constructor(
    private database: MedAnkiDexieDB = db,
    private sqlite: NativeSQLiteService = nativeSQLiteService,
    private sync: SyncService = syncService
  ) {}

  async getDeckStats(deckId?: string): Promise<DeckStats> {
    const key = deckId || 'global';

    // 1. Check SQLite Cache FIRST
    const cached = await this.sqlite.getCachedStats(key);
    if (cached) {
      try {
        return JSON.parse(cached.data_json);
      } catch {}
    }

    // 2. Dexie fallback
    const existing = await this.database.revisionStats.get(key);
    if (existing) {
      await this.sqlite.upsertCachedStats({
        deck_id: key,
        data_json: JSON.stringify(existing),
        updated_at: new Date().toISOString(),
      });
      return existing;
    }

    const defaultStats: DeckStats = {
      deckId: key,
      totalReviewsToday: 0,
      retentionRate: 90.0,
      averageTimePerCard: 12.5,
      dailyStreak: 1,
      lastStudiedAt: new Date().toISOString(),
      heatmapData: {},
    };

    await this.database.revisionStats.put(defaultStats);
    await this.sqlite.upsertCachedStats({
      deck_id: key,
      data_json: JSON.stringify(defaultStats),
      updated_at: new Date().toISOString(),
    });

    return defaultStats;
  }

  async updateDeckStats(stats: DeckStats): Promise<DeckStats> {
    // 1. Write SQLite cache
    await this.sqlite.upsertCachedStats({
      deck_id: stats.deckId,
      data_json: JSON.stringify(stats),
      updated_at: new Date().toISOString(),
    });

    // 2. Write Dexie
    await this.database.revisionStats.put(stats);

    // 3. Enqueue sync action
    await this.sync.enqueueAction('SYNC_METRICS', { stats });

    return stats;
  }

  async getGlobalHeatmap(): Promise<Record<string, number>> {
    const logs = await this.database.studyHistory.toArray();
    const heatmap: Record<string, number> = {};

    for (const log of logs) {
      const dateKey = log.reviewedAt.split('T')[0];
      heatmap[dateKey] = (heatmap[dateKey] || 0) + 1;
    }

    return heatmap;
  }

  async recordReviewStats(deckId: string, rating: string, timeSpentSeconds: number): Promise<void> {
    const todayKey = new Date().toISOString().split('T')[0];
    const stats = await this.getDeckStats(deckId);
    const globalStats = await this.getDeckStats('global');

    // Update heatmap
    const updatedHeatmap = { ...stats.heatmapData };
    updatedHeatmap[todayKey] = (updatedHeatmap[todayKey] || 0) + 1;

    const globalHeatmap = { ...globalStats.heatmapData };
    globalHeatmap[todayKey] = (globalHeatmap[todayKey] || 0) + 1;

    const newDeckStats: DeckStats = {
      ...stats,
      totalReviewsToday: stats.totalReviewsToday + 1,
      lastStudiedAt: new Date().toISOString(),
      heatmapData: updatedHeatmap,
    };

    const newGlobalStats: DeckStats = {
      ...globalStats,
      totalReviewsToday: globalStats.totalReviewsToday + 1,
      lastStudiedAt: new Date().toISOString(),
      heatmapData: globalHeatmap,
    };

    await this.updateDeckStats(newDeckStats);
    await this.updateDeckStats(newGlobalStats);
  }
}
