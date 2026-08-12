import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

if (typeof window !== 'undefined' && !window.localStorage) {
  (window as any).localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}
import { QuestionNotifier } from './questionRiverpodStore';
import { QuestionSet } from '../../domain/entities/Question';
import { db } from '../../data/db/database';

describe('QuestionRiverpodNotifier - answerQuestion', () => {
  const fakeSetId = 'qset-unit-test-1';
  const fakeQuestionId = 'q-unit-test-1';
  const correctOptId = 'opt-correct';
  const wrongOptId = 'opt-wrong';

  const mockQuestionSet: QuestionSet = {
    id: fakeSetId,
    title: 'Simulado Teste',
    request: {
      id: 'req-1',
      createdAt: new Date().toISOString(),
      configuration: {
        specialty: 'Cardiologia',
        topics: ['IAM'],
        quantity: 1,
        difficulty: 'media',
        questionType: 'caso_clinico',
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
      },
    },
    questions: [
      {
        id: fakeQuestionId,
        setId: fakeSetId,
        statement: 'Qual o fármaco de escolha no choque anafilático?',
        options: [
          { id: wrongOptId, letter: 'A', text: 'Dipirona IV', isCorrect: false },
          { id: correctOptId, letter: 'B', text: 'Adrenalina IM', isCorrect: true },
        ],
        correctOptionId: correctOptId,
        commentary: 'Adrenalina é a primeira linha.',
        specialty: 'Cardiologia',
        topic: 'Emergência',
        difficulty: 'media',
        questionType: 'caso_clinico',
        isAnswered: false,
        createdAt: new Date().toISOString(),
      },
    ],
    totalQuestions: 1,
    answeredCount: 0,
    correctCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    // Clear and seed Dexie DB for tests
    await db.questionSets.clear();
    await db.questionSets.put(mockQuestionSet);
  });

  it('deve salvar a resposta errada com userAnswerId correto, isAnswered true e isCorrect false', async () => {
    const notifier = new QuestionNotifier();

    // Answer with the wrong option
    await notifier.answerQuestion(fakeSetId, fakeQuestionId, wrongOptId);

    // Verify stored set in Dexie DB
    const savedSet = await db.questionSets.get(fakeSetId);
    expect(savedSet).toBeDefined();
    expect(savedSet?.answeredCount).toBe(1);
    expect(savedSet?.correctCount).toBe(0);

    const answeredQuestion = savedSet?.questions.find((q) => q.id === fakeQuestionId);
    expect(answeredQuestion).toBeDefined();
    expect(answeredQuestion?.userAnswerId).toBe(wrongOptId);
    expect(answeredQuestion?.isAnswered).toBe(true);
    expect(answeredQuestion?.isCorrect).toBe(false);
  });
});
