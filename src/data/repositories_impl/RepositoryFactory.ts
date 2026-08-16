import { Capacitor } from '@capacitor/core';
import { IQuestionRepository } from '../../domain/repositories/IQuestionRepository';
import { ICardRepository } from '../../domain/repositories/ICardRepository';
import { IStudyHistoryRepository } from '../../domain/repositories/IStudyHistoryRepository';
import { IStudyStatsRepository } from '../../domain/repositories/IStudyStatsRepository';

import { QuestionRepositoryImpl } from './QuestionRepositoryImpl';
import { CardRepositoryImpl } from './CardRepositoryImpl';
import { StudyHistoryRepositoryImpl } from './StudyHistoryRepositoryImpl';
import { StudyStatsRepositoryImpl } from './StudyStatsRepositoryImpl';

import { OfflineFirstQuestionRepository } from '../../../lib/shared/repositories/OfflineFirstQuestionRepository';
import { OfflineFirstCardRepository } from '../../../lib/shared/repositories/OfflineFirstCardRepository';
import { OfflineFirstStudyHistoryRepository } from '../../../lib/shared/repositories/OfflineFirstStudyHistoryRepository';
import { OfflineFirstStudyStatsRepository } from '../../../lib/shared/repositories/OfflineFirstStudyStatsRepository';

/**
 * Composition root que decide em runtime se usa a camada SQLite nativa + Sync
 * (Capacitor nativo) ou Dexie IndexedDB direto (Web / Render).
 */
export class RepositoryFactory {
  private static questionRepoInstance: IQuestionRepository | null = null;
  private static cardRepoInstance: ICardRepository | null = null;
  private static studyHistoryRepoInstance: IStudyHistoryRepository | null = null;
  private static studyStatsRepoInstance: IStudyStatsRepository | null = null;

  public static getQuestionRepository(): IQuestionRepository {
    if (!this.questionRepoInstance) {
      if (Capacitor.isNativePlatform()) {
        this.questionRepoInstance = new OfflineFirstQuestionRepository();
      } else {
        this.questionRepoInstance = new QuestionRepositoryImpl();
      }
    }
    return this.questionRepoInstance;
  }

  public static getCardRepository(): ICardRepository {
    if (!this.cardRepoInstance) {
      if (Capacitor.isNativePlatform()) {
        this.cardRepoInstance = new OfflineFirstCardRepository();
      } else {
        this.cardRepoInstance = new CardRepositoryImpl();
      }
    }
    return this.cardRepoInstance;
  }

  public static getStudyHistoryRepository(): IStudyHistoryRepository {
    if (!this.studyHistoryRepoInstance) {
      if (Capacitor.isNativePlatform()) {
        this.studyHistoryRepoInstance = new OfflineFirstStudyHistoryRepository();
      } else {
        this.studyHistoryRepoInstance = new StudyHistoryRepositoryImpl();
      }
    }
    return this.studyHistoryRepoInstance;
  }

  public static getStudyStatsRepository(): IStudyStatsRepository {
    if (!this.studyStatsRepoInstance) {
      if (Capacitor.isNativePlatform()) {
        this.studyStatsRepoInstance = new OfflineFirstStudyStatsRepository();
      } else {
        this.studyStatsRepoInstance = new StudyStatsRepositoryImpl();
      }
    }
    return this.studyStatsRepoInstance;
  }

  /**
   * Reseta instâncias para permitir testes unitários de troca de ambiente
   */
  public static resetForTesting(): void {
    this.questionRepoInstance = null;
    this.cardRepoInstance = null;
    this.studyHistoryRepoInstance = null;
    this.studyStatsRepoInstance = null;
  }
}

export const questionRepository = RepositoryFactory.getQuestionRepository();
export const cardRepository = RepositoryFactory.getCardRepository();
export const studyHistoryRepository = RepositoryFactory.getStudyHistoryRepository();
export const studyStatsRepository = RepositoryFactory.getStudyStatsRepository();
