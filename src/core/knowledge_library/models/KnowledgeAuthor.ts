/**
 * Knowledge Library Module - KnowledgeAuthor
 *
 * Models author/professor/medical specialist entities attributed to library items.
 */

export interface KnowledgeAuthor {
  id: string;
  name: string;
  title?: string;
  institutionName?: string;
  specialty?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeAuthorCreateDTO {
  name: string;
  title?: string;
  institutionName?: string;
  specialty?: string;
}
