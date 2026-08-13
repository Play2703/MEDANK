import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { SyncService } from './SyncService';
import { NativeSQLiteService } from './NativeSQLiteService';


describe('SyncService (Offline-First Action Queue with Native SQLite)', () => {
  let sqlite: NativeSQLiteService;
  let syncService: SyncService;

  beforeEach(async () => {
    sqlite = new NativeSQLiteService();
    await sqlite.initialize();
    syncService = new SyncService(sqlite);
  });

  it('deve gravar uma ação de revisão de flashcard IMEDIATAMENTE no SQLite Action Queue', async () => {
    const actionId = await syncService.recordFlashcardReview(
      'card_123',
      'deck_med_1',
      4,
      { interval: 6, repetition: 2, easeFactor: 2.5, dueDate: new Date().toISOString() },
      15
    );

    expect(actionId).toBeDefined();
    expect(actionId.startsWith('act_')).toBe(true);

    const pending = await sqlite.getPendingActions();
    expect(pending.length).toBeGreaterThanOrEqual(1);

    const target = pending.find((p) => p.id === actionId);
    expect(target).toBeDefined();
    expect(target?.action_type).toBe('REVIEW_FLASHCARD');

    const payload = JSON.parse(target!.payload);
    expect(payload.cardId).toBe('card_123');
    expect(payload.deckId).toBe('deck_med_1');
    expect(payload.rating).toBe(4);
  });

  it('deve gravar uma resposta de questão IMEDIATAMENTE no SQLite Action Queue', async () => {
    const actionId = await syncService.recordQuestionAnswer(
      'q_999',
      'set_cardio_1',
      'opt_b',
      true,
      { specialty: 'Cardiologia', topic: 'IAM' }
    );

    expect(actionId).toBeDefined();

    const pending = await sqlite.getPendingActions();
    const target = pending.find((p) => p.id === actionId);
    expect(target).toBeDefined();
    expect(target?.action_type).toBe('ANSWER_QUESTION');

    const payload = JSON.parse(target!.payload);
    expect(payload.questionId).toBe('q_999');
    expect(payload.setId).toBe('set_cardio_1');
    expect(payload.selectedOptionId).toBe('opt_b');
    expect(payload.isCorrect).toBe(true);
  });

  it('deve processar a fila de ações em background com sucesso', async () => {
    await sqlite.insertAction({
      id: 'act_pending_1',
      action_type: 'REVIEW_FLASHCARD',
      payload: JSON.stringify({ cardId: 'card_test_1', deckId: 'deck_1', rating: 3, sm2State: { interval: 1 } }),
      created_at: new Date().toISOString(),
      status: 'pending',
      retry_count: 0,
    });
    await sqlite.insertAction({
      id: 'act_pending_2',
      action_type: 'ANSWER_QUESTION',
      payload: JSON.stringify({ questionId: 'q_test_1', setId: 'set_1', selectedOptionId: 'opt_a', isCorrect: true, answeredAt: new Date().toISOString() }),
      created_at: new Date().toISOString(),
      status: 'pending',
      retry_count: 0,
    });

    const statsBefore = await sqlite.getActionQueueStats();
    expect(statsBefore.pending).toBe(2);

    const result = await syncService.processQueue();
    expect(result.processed).toBe(2);
    expect(result.succeeded).toBe(2);

    const statsAfter = await sqlite.getActionQueueStats();
    expect(statsAfter.pending).toBe(0);
    expect(statsAfter.synced).toBe(2);
  });

});
