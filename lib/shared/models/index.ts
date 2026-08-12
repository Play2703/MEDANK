/**
 * Shared Models (Entidades do Domínio de Aprendizagem Médica)
 */
export type { FlashCard, CardType, CardDifficulty } from '@/src/domain/entities/Card';
export type { Deck } from '@/src/domain/entities/Deck';
export type { Folder } from '@/src/domain/entities/Folder';
export type { Tag } from '@/src/domain/entities/Tag';
export type { ReviewLog, DeckStats } from '@/src/domain/entities/StudySession';
export type { ReviewRating, SM2State, ReviewCalculationResult } from '@/src/core/algorithm/sm2';
