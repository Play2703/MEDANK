/**
 * Core Utilities Module
 */
export { parseClozeText, isClozeText } from '@/src/core/utils/clozeParser';
export type { ClozeToken } from '@/src/core/utils/clozeParser';
export { normalizeText, estimateCoverage } from '../engines/ner.worker';

