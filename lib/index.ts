/**
 * Architecture Entry Point
 * Exposes core, features, and shared modules.
 */

// Core Layer
export * as CoreConfig from './core/config';
export * as CoreTheme from './core/theme';
export * as CoreConstants from './core/constants';
export * as CoreUtils from './core/utils';
export * as CoreEngines from './core/engines';
export * as CoreRiverpod from './core/riverpod';
export * as CoreServices from './core/services';
export * as CoreRouter from './core/router';


// Features Layer
export * as HomeFeature from './features/home';
export * as FlashcardsFeature from './features/flashcards';
export * as QuestionsFeature from './features/questions';
export * as SimuladosFeature from './features/simulados';
export * as BooksFeature from './features/books';
export * as StatisticsFeature from './features/statistics';
export * as ProfileFeature from './features/profile';

// Shared Layer
export * as SharedWidgets from './shared/widgets';
export * as SharedModels from './shared/models';
export * as SharedRepositories from './shared/repositories';
export * as SharedViewModels from './shared/viewmodels';
export * as SharedViews from './shared/views';
