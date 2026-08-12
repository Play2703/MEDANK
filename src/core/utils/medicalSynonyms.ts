/**
 * Medical Synonyms Dictionary for Entity Canonicalization
 * Maps normalized variant terms (lowercase, unaccented) to preferred canonical terms.
 */

export const MEDICAL_SYNONYMS: Record<string, string> = {
  'falta de ar': 'dispneia',
  'dor no peito': 'dor toracica',
  'inchaco': 'edema',
  'pressao alta': 'hipertensao',
  'pressao baixa': 'hipotensao',
  'acucar no sangue alto': 'hiperglicemia',
  'infarto': 'infarto agudo do miocardio',
  'derrame': 'acidente vascular cerebral',
  'ave': 'acidente vascular cerebral',
};

/**
 * Resolves a normalized medical entity text to its preferred canonical synonym if available
 */
export function resolveSynonym(normalizedText: string): string {
  if (!normalizedText) return '';
  return MEDICAL_SYNONYMS[normalizedText] || normalizedText;
}
