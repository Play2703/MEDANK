import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { RepositoryFactory } from './RepositoryFactory';
import { QuestionRepositoryImpl } from './QuestionRepositoryImpl';
import { CardRepositoryImpl } from './CardRepositoryImpl';
import { StudyHistoryRepositoryImpl } from './StudyHistoryRepositoryImpl';
import { StudyStatsRepositoryImpl } from './StudyStatsRepositoryImpl';
import { OfflineFirstQuestionRepository } from '../../../lib/shared/repositories/OfflineFirstQuestionRepository';
import { OfflineFirstCardRepository } from '../../../lib/shared/repositories/OfflineFirstCardRepository';
import { OfflineFirstStudyHistoryRepository } from '../../../lib/shared/repositories/OfflineFirstStudyHistoryRepository';
import { OfflineFirstStudyStatsRepository } from '../../../lib/shared/repositories/OfflineFirstStudyStatsRepository';

describe('RepositoryFactory - Composition Root', () => {
  beforeEach(() => {
    RepositoryFactory.resetForTesting();
    vi.restoreAllMocks();
  });

  it('1. Deve resolver implementações Dexie quando rodando na Web (Capacitor.isNativePlatform() === false)', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);

    const questionRepo = RepositoryFactory.getQuestionRepository();
    const cardRepo = RepositoryFactory.getCardRepository();
    const historyRepo = RepositoryFactory.getStudyHistoryRepository();
    const statsRepo = RepositoryFactory.getStudyStatsRepository();

    expect(questionRepo).toBeInstanceOf(QuestionRepositoryImpl);
    expect(cardRepo).toBeInstanceOf(CardRepositoryImpl);
    expect(historyRepo).toBeInstanceOf(StudyHistoryRepositoryImpl);
    expect(statsRepo).toBeInstanceOf(StudyStatsRepositoryImpl);
  });

  it('2. Deve resolver implementações Offline-First quando rodando em ambiente Nativo (Capacitor.isNativePlatform() === true)', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

    const questionRepo = RepositoryFactory.getQuestionRepository();
    const cardRepo = RepositoryFactory.getCardRepository();
    const historyRepo = RepositoryFactory.getStudyHistoryRepository();
    const statsRepo = RepositoryFactory.getStudyStatsRepository();

    expect(questionRepo).toBeInstanceOf(OfflineFirstQuestionRepository);
    expect(cardRepo).toBeInstanceOf(OfflineFirstCardRepository);
    expect(historyRepo).toBeInstanceOf(OfflineFirstStudyHistoryRepository);
    expect(statsRepo).toBeInstanceOf(OfflineFirstStudyStatsRepository);
  });

  it('3. Deve manter instâncias singleton consistentes entre chamadas subsequentes', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);

    const repo1 = RepositoryFactory.getQuestionRepository();
    const repo2 = RepositoryFactory.getQuestionRepository();

    expect(repo1).toBe(repo2);
  });
});
