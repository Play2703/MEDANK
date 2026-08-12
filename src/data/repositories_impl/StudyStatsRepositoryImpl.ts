import { IStudyStatsRepository } from '../../domain/repositories/IStudyStatsRepository';
import { DeckStats } from '../../domain/entities/StudySession';
import { db, MedAnkiDexieDB } from '../db/database';

export class StudyStatsRepositoryImpl implements IStudyStatsRepository {
  constructor(private database: MedAnkiDexieDB = db) {}

  async getDeckStats(deckId?: string): Promise<DeckStats> {
    const key = deckId || 'global';
    const existing = await this.database.revisionStats.get(key);

    if (existing) {
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
    return defaultStats;
  }

  async updateDeckStats(stats: DeckStats): Promise<DeckStats> {
    await this.database.revisionStats.put(stats);
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

    // Save deck stats
    await this.database.revisionStats.put({
      ...stats,
      totalReviewsToday: stats.totalReviewsToday + 1,
      lastStudiedAt: new Date().toISOString(),
      heatmapData: updatedHeatmap,
    });

    // Save global stats
    await this.database.revisionStats.put({
      ...globalStats,
      totalReviewsToday: globalStats.totalReviewsToday + 1,
      lastStudiedAt: new Date().toISOString(),
      heatmapData: globalHeatmap,
    });
  }
}
