import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/database';
import { QuestionRepositoryImpl } from './QuestionRepositoryImpl';
import { OfflineFirstQuestionRepository } from '../../../lib/shared/repositories/OfflineFirstQuestionRepository';
import {
  isThirdPartyQuestion,
  formatAdaptationPromptBlock,
} from '../services/QuestionGenerationService';
import { Question, QuestionSet } from '../../domain/entities/Question';

describe('Local Question Matcher & Copyright Rules', () => {
  beforeEach(async () => {
    await db.questionSets.clear();
  });

  const mockQuestionPropria: Question = {
    id: 'q-medanki-1',
    setId: 'set-1',
    statement: 'Qual o achado auscultatório clássico da estenose aórtica severa?',
    options: [
      { id: 'opt-a', letter: 'A', text: 'Sopro sistólico em crescendo-decrescendo com pico tardio e B2 hipofonética', isCorrect: true },
      { id: 'opt-b', letter: 'B', text: 'Sopro diastólico em ruflar com reforço pré-sistólico', isCorrect: false },
    ],
    correctOptionId: 'opt-a',
    commentary: 'Na estenose aórtica severa, o pico do sopro é tardio e a segunda bulha fica diminuída.',
    tags: ['Cardiologia', 'Valvopatias', 'Estenose Aórtica'],
    specialty: 'Cardiologia',
    topic: 'Valvopatias',
    subtopic: 'Estenose Aórtica',
    difficulty: 'media',
    questionType: 'caso_clinico',
    originSource: 'MedAnki IA Local',
    isAnswered: false,
    createdAt: new Date().toISOString(),
  };

  const mockQuestionTerceiroBanca: Question = {
    id: 'q-enare-1',
    setId: 'set-2',
    statement: 'Paciente de 65 anos com angina aos esforços apresenta sopro ejetivo...',
    options: [
      { id: 'opt-1', letter: 'A', text: 'Estenose aórtica', isCorrect: true },
      { id: 'opt-2', letter: 'B', text: 'Insuficiência mitral', isCorrect: false },
    ],
    correctOptionId: 'opt-1',
    commentary: 'Questão do ENARE 2024.',
    tags: ['Cardiologia', 'Valvopatias'],
    specialty: 'Cardiologia',
    topic: 'Valvopatias',
    difficulty: 'dificil',
    questionType: 'caso_clinico',
    originSource: 'Banca ENARE 2024',
    isAnswered: false,
    createdAt: new Date().toISOString(),
  };

  const mockQuestionSet: QuestionSet = {
    id: 'set-1',
    title: 'Simulado Cardiologia Valvopatias',
    request: {
      id: 'req-1',
      mode: 'geral',
      configuration: {
        specialty: 'Cardiologia',
        topics: ['Valvopatias'],
        subtopic: 'Estenose Aórtica',
        quantity: 2,
        difficulty: 'media',
        questionType: 'caso_clinico',
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
      },
      createdAt: new Date().toISOString(),
    },
    questions: [mockQuestionPropria, mockQuestionTerceiroBanca],
    totalQuestions: 2,
    answeredCount: 0,
    correctCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('1. QuestionRepositoryImpl deve encontrar questões salvas pelo tópico e especialidade', async () => {
    await db.questionSets.put(mockQuestionSet);
    const repo = new QuestionRepositoryImpl();

    const results = await repo.findExistingQuestionsByTopic('Cardiologia', 'Valvopatias', 'Estenose Aórtica', 5);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((q) => q.id === 'q-medanki-1')).toBe(true);
  });

  it('2. OfflineFirstQuestionRepository deve encontrar questões locais no SQLite cache ou Dexie fallback', async () => {
    await db.questionSets.put(mockQuestionSet);
    const repo = new OfflineFirstQuestionRepository();

    const results = await repo.findExistingQuestionsByTopic('Cardiologia', 'Valvopatias', '', 5);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.some((q) => q.id === 'q-medanki-1')).toBe(true);
    expect(results.some((q) => q.id === 'q-enare-1')).toBe(true);
  });

  it('3. Regra de Direitos Autorais: isThirdPartyQuestion deve identificar questões de bancas/terceiros', () => {
    expect(isThirdPartyQuestion(mockQuestionTerceiroBanca)).toBe(true);
    expect(isThirdPartyQuestion(mockQuestionPropria)).toBe(false);

    const questionManual: Question = {
      ...mockQuestionPropria,
      originSource: 'Criado Manualmente',
    };
    expect(isThirdPartyQuestion(questionManual)).toBe(false);

    const questionUSP: Question = {
      ...mockQuestionPropria,
      originSource: 'USP-SP 2023',
    };
    expect(isThirdPartyQuestion(questionUSP)).toBe(true);
  });

  it('4. Bloco de Adaptação: formatAdaptationPromptBlock deve instruir a IA a manter conceito clínico sem copiar enunciado verbatim', () => {
    const promptBlock = formatAdaptationPromptBlock(mockQuestionTerceiroBanca);

    expect(promptBlock).toContain('[MODO: ADAPTAÇÃO DE QUESTÃO EXISTENTE DETECTADA]');
    expect(promptBlock).toContain('QUESTÃO-BASE LOCAL:');
    expect(promptBlock).toContain('NÃO copie o enunciado textualmente');
    expect(promptBlock).toContain('Mantenha o CONCEITO CLÍNICO central');
    expect(promptBlock).toContain('Estenose aórtica');
  });
});
