/**
 * Knowledge Library Module - KnowledgeInstitution
 *
 * Models academic, hospital, or exam board institutions (e.g., USP, ENARE, SBC, UNIFESP).
 */

export interface KnowledgeInstitution {
  id: string;
  name: string;
  abbreviation?: string;
  region?: string;
  type?: 'university' | 'society' | 'exam_board' | 'hospital' | 'publisher' | 'other';
  website?: string;
}

export interface KnowledgeInstitutionCreateDTO {
  name: string;
  abbreviation?: string;
  region?: string;
  type?: 'university' | 'society' | 'exam_board' | 'hospital' | 'publisher' | 'other';
}
