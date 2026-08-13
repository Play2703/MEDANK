import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

import { OfflineFirstCardRepository } from './OfflineFirstCardRepository';
import { OfflineFirstQuestionRepository } from './OfflineFirstQuestionRepository';
import { OfflineFirstStudyHistoryRepository } from './OfflineFirstStudyHistoryRepository';
import { OfflineFirstStudyStatsRepository } from './OfflineFirstStudyStatsRepository';
import { NativeSQLiteService } from '../../core/services/NativeSQLiteService';
import { SyncService } from '../../core/services/SyncService';
import { FlashCard } from '../../../src/domain/entities/Card';
import { createInitialSM2State } from '../../../src/core/algorithm/sm2';

describe('Offline-First Repositories (Cache-then-Network Strategy)', () => {
  let sqlite: NativeSQLiteService;
  let syncService: SyncService;
  let cardRepo: OfflineFirstCardRepository;
  let questionRepo: OfflineFirstQuestionRepository;
  let historyRepo: OfflineFirstStudyHistoryRepository;
  let statsRepo: OfflineFirstStudyStatsRepository;

  beforeEach(async () => {
    sqlite = new NativeSQLiteService();
    await sqlite.initialize();
    syncService = new SyncService(sqlite);
    cardRepo = new OfflineFirstCardRepository(undefined as any, sqlite, syncService);
    questionRepo = new OfflineFirstQuestionRepository(sqlite, syncService);
    historyRepo = new OfflineFirstStudyHistoryRepository(undefined as any, sqlite, syncService);
    statsRepo = new OfflineFirstStudyStatsRepository(undefined as any, sqlite, syncService);
  });

  it('deve salvar card no cache SQLite e registrar na fila de ações do SyncService', async () => {
    const card: FlashCard = {
      id: 'card_unit_1',
      deckId: 'deck_cardio',
      type: 'basic',
      front: 'O que causa IAM?',
      back: 'Oclusão coronariana aguda.',
      tags: ['cardiologia'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sm2State: createInitialSM2State(),
    };



    await cardRepo.saveCard(card);

    // 1. Deve ler instantaneamente do SQLite
    const cachedCard = await cardRepo.getCardById('card_unit_1');
    expect(cachedCard).not.toBeNull();
    expect(cachedCard?.front).toBe('O que causa IAM?');

    // 2. Deve existir na fila de ações do SQLite
    const actions = await sqlite.getAllActions();
    const saveAction = actions.find((p) => p.action_type === 'SAVE_CARD');
    expect(saveAction).toBeDefined();
  });

  it('deve registrar respostas de questões diretamente no SQLite Action Queue', async () => {
    await questionRepo.recordAnswer('q_123', 'set_abc', 'opt_2', true);

    const actions = await sqlite.getAllActions();
    const answerAction = actions.find((p) => p.action_type === 'ANSWER_QUESTION');
    expect(answerAction).toBeDefined();

    const payload = JSON.parse(answerAction!.payload);
    expect(payload.questionId).toBe('q_123');
    expect(payload.isCorrect).toBe(true);
  });

  it('deve gravar log de revisão de estudo no cache SQLite e na Action Queue', async () => {
    const log = await historyRepo.addReviewLog({
      cardId: 'card_unit_1',
      deckId: 'deck_cardio',
      rating: 4 as any,
      timeSpentSeconds: 12,
      reviewedAt: new Date().toISOString(),
      previousInterval: 1,
      newInterval: 6,
    });

    expect(log.id).toBeDefined();

    const cachedLogs = await historyRepo.getLogsByDeckId('deck_cardio');
    expect(cachedLogs.length).toBeGreaterThanOrEqual(1);

    const actions = await sqlite.getAllActions();
    const logAction = actions.find((p) => p.action_type === 'SAVE_STUDY_LOG');
    expect(logAction).toBeDefined();
  });


  it('deve atualizar e ler estatísticas do deck instantaneamente do cache SQLite', async () => {
    const stats = await statsRepo.getDeckStats('deck_cardio');
    expect(stats.deckId).toBe('deck_cardio');

    await statsRepo.updateDeckStats({
      ...stats,
      totalReviewsToday: 25,
      retentionRate: 94.5,
    });

    const updated = await statsRepo.getDeckStats('deck_cardio');
    expect(updated.totalReviewsToday).toBe(25);
    expect(updated.retentionRate).toBe(94.5);
  });
});
