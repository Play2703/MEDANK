/**
 * Knowledge Library Module - KnowledgeTag
 *
 * Encapsulates multi-select keyword tags associated with documents for fast categorization.
 */

export interface KnowledgeTag {
  id: string;
  name: string;
  color?: string;
  categoryContext?: string;
  createdAt?: string;
}

export interface KnowledgeTagCreateDTO {
  name: string;
  color?: string;
  categoryContext?: string;
}
