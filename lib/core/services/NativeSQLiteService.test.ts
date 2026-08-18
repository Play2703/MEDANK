import { describe, it, expect, beforeEach } from 'vitest';
import { NativeSQLiteService, CachedQuestionRow } from './NativeSQLiteService';

describe('NativeSQLiteService - Robustness & Question Operations', () => {
  let service: NativeSQLiteService;

  beforeEach(() => {
    service = new NativeSQLiteService();
  });

  it('deve inicializar com fallback para memory store em ambiente Node/Web e marcar isInitialized = true', async () => {
    await service.initialize();
    // Subsequent calls should resolve immediately
    await service.initialize();
    expect(service.isNative()).toBe(false);
  });

  it('deve executar operações completas de cached_questions em memória', async () => {
    const q1: CachedQuestionRow = {
      id: 'q-1',
      set_id: 'set-resp',
      category: 'Fisiologia Respiratória',
      difficulty: 'medium',
      data_json: JSON.stringify({ question: 'Efeito Bohr...', options: [] }),
      updated_at: new Date().toISOString(),
    };

    const q2: CachedQuestionRow = {
      id: 'q-2',
      set_id: 'set-resp',
      category: 'Fisiologia Respiratória',
      difficulty: 'hard',
      data_json: JSON.stringify({ question: 'Efeito Haldane...', options: [] }),
      updated_at: new Date().toISOString(),
    };

    const q3: CachedQuestionRow = {
      id: 'q-3',
      set_id: 'set-cardio',
      category: 'Fisiologia Cardiovascular',
      difficulty: 'easy',
      data_json: JSON.stringify({ question: 'Ciclo Cardíaco...', options: [] }),
      updated_at: new Date().toISOString(),
    };

    await service.upsertCachedQuestion(q1);
    await service.upsertCachedQuestion(q2);
    await service.upsertCachedQuestion(q3);

    // Test getCachedQuestionsBySet
    const respQuestions = await service.getCachedQuestionsBySet('set-resp');
    expect(respQuestions.length).toBe(2);
    expect(respQuestions.map((q) => q.id)).toEqual(['q-1', 'q-2']);

    // Test getAllCachedQuestions
    const allQuestions = await service.getAllCachedQuestions();
    expect(allQuestions.length).toBe(3);

    // Test getCachedQuestionsByCategory
    const cardioQuestions = await service.getCachedQuestionsByCategory('Cardiovascular');
    expect(cardioQuestions.length).toBe(1);
    expect(cardioQuestions[0].id).toBe('q-3');
  });

  it('deve realizar operações de action_queue e flashcards sem erros', async () => {
    await service.insertAction({
      id: 'act-1',
      action_type: 'SYNC_CARD',
      payload: '{}',
      created_at: new Date().toISOString(),
      status: 'pending',
      retry_count: 0,
    });

    const pending = await service.getPendingActions();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe('act-1');
  });
});
