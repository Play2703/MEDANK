/**
 * Feature: Books (Biblioteca & Manuais Médicos)
 * Modular architecture definition for Medical Literature & Manuals.
 */
export interface BooksFeatureConfig {
  enabled: boolean;
  libraryTitle: string;
}

export const BooksFeature: BooksFeatureConfig = {
  enabled: true,
  libraryTitle: 'Biblioteca & Resumos High-Yield',
};
