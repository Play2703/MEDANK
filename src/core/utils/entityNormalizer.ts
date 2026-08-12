/**
 * Entity Text Normalizer Utility
 * Normalizes entity strings for deduplication, graph linking, and matching:
 * - Trims whitespace
 * - Converts to lowercase
 * - Strips diacritics/accents (NFD normalization)
 * - Collapses multiple spaces into a single space
 */

export function normalizeEntityText(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}
