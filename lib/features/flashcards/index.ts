/**
 * Feature: Flashcards
 * Modular architecture definition for the Flashcards (Anki / SM-2) feature.
 */
export interface FlashcardsFeatureConfig {
  enabled: boolean;
  algorithm: string;
}

export const FlashcardsFeature: FlashcardsFeatureConfig = {
  enabled: true,
  algorithm: 'SM-2 Anki',
};
