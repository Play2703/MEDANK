/**
 * Knowledge Library Module - KnowledgeLibraryFolder
 *
 * Represents an organizational folder grouping library items by category or medical domain.
 */

import { KnowledgeCategory } from './KnowledgeCategory';

export interface KnowledgeLibraryFolder {
  id: string;
  name: string;
  category: KnowledgeCategory;
  icon: string;
  description?: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeLibraryFolderCreateDTO {
  name: string;
  category: KnowledgeCategory;
  icon?: string;
  description?: string;
}
