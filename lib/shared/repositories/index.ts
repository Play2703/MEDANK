/**
 * Shared Repositories (Interface de Repositórios e Persistência de Dados)
 */
export { DeckRepositoryImpl } from '@/src/data/repositories_impl/DeckRepositoryImpl';
export { CardRepositoryImpl } from '@/src/data/repositories_impl/CardRepositoryImpl';
export { FolderRepositoryImpl } from '@/src/data/repositories_impl/FolderRepositoryImpl';
export { TagRepositoryImpl } from '@/src/data/repositories_impl/TagRepositoryImpl';
export { StudyHistoryRepositoryImpl } from '@/src/data/repositories_impl/StudyHistoryRepositoryImpl';
export { StudyStatsRepositoryImpl } from '@/src/data/repositories_impl/StudyStatsRepositoryImpl';
export { QuestionRepositoryImpl } from '@/src/data/repositories_impl/QuestionRepositoryImpl';

// High-Performance Native SQLite Offline-First Repositories (Cache-then-Network)
export { OfflineFirstCardRepository } from './OfflineFirstCardRepository';
export { OfflineFirstQuestionRepository } from './OfflineFirstQuestionRepository';
export { OfflineFirstStudyHistoryRepository } from './OfflineFirstStudyHistoryRepository';
export { OfflineFirstStudyStatsRepository } from './OfflineFirstStudyStatsRepository';

export { db, MedAnkiDexieDB } from '@/src/data/db/database';

