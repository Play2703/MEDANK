import { useState, useEffect } from 'react';
import { DeckStats } from '../../domain/entities/StudySession';
import { RepositoryFactory } from '../../data/repositories_impl/RepositoryFactory';
import { db } from '../../data/db/database';

const historyRepo = RepositoryFactory.getStudyHistoryRepository();

export function useStatsViewModel() {
  const [stats, setStats] = useState<DeckStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const logs = await historyRepo.getAllLogs(10000);

        const todayStr = new Date().toISOString().split('T')[0];
        const todayLogs = logs.filter((l) => l.reviewedAt && l.reviewedAt.startsWith(todayStr));
        const totalReviewsToday = todayLogs.length;

        // Calculate retention rate (ratings >= 2 count as remembered)
        const remembered = logs.filter((l) => l.rating >= 2).length;
        const retentionRate = logs.length > 0 ? Number(((remembered / logs.length) * 100).toFixed(1)) : 100;

        const totalTimeSeconds = logs.reduce((acc, curr) => acc + (curr.timeSpentSeconds || 0), 0);
        const averageTimePerCard = logs.length > 0 ? Number((totalTimeSeconds / logs.length).toFixed(1)) : 0;

        // Build Heatmap
        const heatmapData: Record<string, number> = {};
        logs.forEach((l) => {
          if (l.reviewedAt) {
            const dayKey = l.reviewedAt.split('T')[0];
            heatmapData[dayKey] = (heatmapData[dayKey] || 0) + 1;
          }
        });

        // Calculate Daily Streak
        let dailyStreak = 0;
        const today = new Date();
        for (let i = 0; i < 365; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateKey = d.toISOString().split('T')[0];
          if (heatmapData[dateKey] && heatmapData[dateKey] > 0) {
            dailyStreak++;
          } else if (i === 0) {
            // If no review today yet, check yesterday
            continue;
          } else {
            break;
          }
        }

        // Calculate Residency Readiness (contentMastery)
        const allCards = await db.flashcards.toArray();
        const highYieldCards = allCards.filter((c) => c.highYield === true);
        const cardsToConsider = highYieldCards.length > 0 ? highYieldCards : allCards;

        let contentMastery = 0;
        if (cardsToConsider.length > 0) {
          const dominatedCount = cardsToConsider.filter(
            (c) => c.sm2State && c.sm2State.repetitions >= 2 && c.sm2State.easeFactor >= 2.0
          ).length;
          contentMastery = Math.round((dominatedCount / cardsToConsider.length) * 100);
        }

        setStats({
          deckId: 'global',
          totalReviewsToday,
          retentionRate,
          averageTimePerCard,
          dailyStreak: dailyStreak || (totalReviewsToday > 0 ? 1 : 0),
          heatmapData,
          contentMastery,
        });
      } catch (err) {
        console.error('Erro ao carregar estatísticas:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return {
    stats,
    loading,
  };
}
