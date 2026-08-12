import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

if (typeof window !== 'undefined' && !window.localStorage) {
  (window as any).localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

import { QuestionNotifier } from '../../viewmodels/questionRiverpodStore';
import { QuestionGenerationRequest, QuestionSet } from '../../../domain/entities/Question';

describe('Question Generation Shortfall Banner - Tarefa 1 & 2', () => {
  let notifier: QuestionNotifier;

  const mockQuestionSet: QuestionSet = {
    id: 'qset-shortfall-1',
    title: 'Simulado Shortfall',
    request: {
      id: 'req-shortfall',
      createdAt: new Date().toISOString(),
      configuration: {
        specialty: 'Cardiologia',
        topics: ['IAM'],
        quantity: 5,
        difficulty: 'media',
        questionType: 'caso_clinico',
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
      },
    },
    questions: [
      {
        id: 'q-1',
        setId: 'qset-shortfall-1',
        statement: 'Questão 1',
        options: [
          { id: 'a', letter: 'A', text: 'Op 1', isCorrect: true },
          { id: 'b', letter: 'B', text: 'Op 2', isCorrect: false },
          { id: 'c', letter: 'C', text: 'Op 3', isCorrect: false },
          { id: 'd', letter: 'D', text: 'Op 4', isCorrect: false },
        ],
        correctOptionId: 'a',
        commentary: 'Comentário 1',
        specialty: 'Cardiologia',
        topic: 'IAM',
        difficulty: 'media',
        questionType: 'caso_clinico',
        isAnswered: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'q-2',
        setId: 'qset-shortfall-1',
        statement: 'Questão 2',
        options: [
          { id: 'a', letter: 'A', text: 'Op 1', isCorrect: true },
          { id: 'b', letter: 'B', text: 'Op 2', isCorrect: false },
          { id: 'c', letter: 'C', text: 'Op 3', isCorrect: false },
          { id: 'd', letter: 'D', text: 'Op 4', isCorrect: false },
        ],
        correctOptionId: 'a',
        commentary: 'Comentário 2',
        specialty: 'Cardiologia',
        topic: 'IAM',
        difficulty: 'media',
        questionType: 'caso_clinico',
        isAnswered: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'q-3',
        setId: 'qset-shortfall-1',
        statement: 'Questão 3',
        options: [
          { id: 'a', letter: 'A', text: 'Op 1', isCorrect: true },
          { id: 'b', letter: 'B', text: 'Op 2', isCorrect: false },
          { id: 'c', letter: 'C', text: 'Op 3', isCorrect: false },
          { id: 'd', letter: 'D', text: 'Op 4', isCorrect: false },
        ],
        correctOptionId: 'a',
        commentary: 'Comentário 3',
        specialty: 'Cardiologia',
        topic: 'IAM',
        difficulty: 'media',
        questionType: 'caso_clinico',
        isAnswered: false,
        createdAt: new Date().toISOString(),
      },
    ],
    totalQuestions: 3,
    answeredCount: 0,
    correctCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    notifier = new QuestionNotifier();
  });

  it('deve armazenar result.shortfall no estado do notifier quando a geração retornar déficit parcial (3 de 5)', async () => {
    vi.spyOn((notifier as any).generationService, 'generateQuestions').mockResolvedValueOnce({
      questionSet: mockQuestionSet,
      shortfall: {
        requested: 5,
        actual: 3,
        reason: 'Gerado com 3 de 5 questões solicitadas — algumas não passaram no controle de qualidade.',
      },
    });

    vi.spyOn((notifier as any).repository, 'saveQuestionSet').mockResolvedValueOnce(mockQuestionSet);

    const req: QuestionGenerationRequest = {
      id: 'req-shortfall',
      mode: 'geral',
      configuration: {
        specialty: 'Cardiologia',
        topics: ['IAM'],
        quantity: 5,
        difficulty: 'media',
        questionType: 'caso_clinico',
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
      },
      createdAt: new Date().toISOString(),
    };

    const result = await notifier.generateQuestions(req);

    expect(result).toEqual(mockQuestionSet);
    expect(notifier.state.generationShortfall).toBeDefined();
    expect(notifier.state.generationShortfall?.requested).toBe(5);
    expect(notifier.state.generationShortfall?.actual).toBe(3);
    expect(notifier.state.generationShortfall?.setId).toBe('qset-shortfall-1');
  });

  it('NÃO deve armazenar shortfall no estado quando a geração for completa (shortfall === undefined)', async () => {
    vi.spyOn((notifier as any).generationService, 'generateQuestions').mockResolvedValueOnce({
      questionSet: { ...mockQuestionSet, totalQuestions: 5 },
    });

    vi.spyOn((notifier as any).repository, 'saveQuestionSet').mockResolvedValueOnce({
      ...mockQuestionSet,
      totalQuestions: 5,
    });

    const req: QuestionGenerationRequest = {
      id: 'req-full',
      mode: 'geral',
      configuration: {
        specialty: 'Cardiologia',
        topics: ['IAM'],
        quantity: 5,
        difficulty: 'media',
        questionType: 'caso_clinico',
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
      },
      createdAt: new Date().toISOString(),
    };

    await notifier.generateQuestions(req);

    expect(notifier.state.generationShortfall).toBeNull();
  });

  it('deve limpar o shortfall ao chamar clearGenerationShortfall ou trocar de simulado ativo', () => {
    // 1. Inicia com estado contendo shortfall
    (notifier as any).updateState((prev: any) => ({
      ...prev,
      activeQuestionSet: mockQuestionSet,
      generationShortfall: {
        setId: 'qset-shortfall-1',
        requested: 5,
        actual: 3,
        reason: 'Shortfall parcial',
      },
    }));

    expect(notifier.state.generationShortfall).not.toBeNull();

    // 2. Limpa manualmente via action
    notifier.clearGenerationShortfall();
    expect(notifier.state.generationShortfall).toBeNull();

    // 3. Define novo shortfall
    (notifier as any).updateState((prev: any) => ({
      ...prev,
      activeQuestionSet: mockQuestionSet,
      generationShortfall: {
        setId: 'qset-shortfall-1',
        requested: 5,
        actual: 3,
        reason: 'Shortfall parcial',
      },
    }));

    // 4. Troca para outro simulado
    notifier.setActiveQuestionSet({ ...mockQuestionSet, id: 'outro-simulado-id' });
    expect(notifier.state.generationShortfall).toBeNull();
  });
});
