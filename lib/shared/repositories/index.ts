/**
 * Shared Repositories (Interface de Repositórios e Persistência de Dados)
 */
export { DeckRepositoryImpl } from '@/src/data/repositories_impl/DeckRepositoryImpl';
export { CardRepositoryImpl } from '@/src/data/repositories_impl/CardRepositoryImpl';
export { FolderRepositoryImpl } from '@/src/data/repositories_impl/FolderRepositoryImpl';
export { TagRepositoryImpl } from '@/src/data/repositories_impl/TagRepositoryImpl';
export { StudyHistoryRepositoryImpl } from '@/src/data/repositories_impl/StudyHistoryRepositoryImpl';
export { StudyStatsRepositoryImpl } from '@/src/data/repositories_impl/StudyStatsRepositoryImpl';
export { db, MedAnkiDexieDB } from '@/src/data/db/database';
