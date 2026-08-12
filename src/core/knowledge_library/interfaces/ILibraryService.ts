/**
 * Knowledge Library Module - ILibraryService
 *
 * Domain service contract for querying, filtering, updating, duplicating, and deleting documents.
 */

import {
  KnowledgeLibraryItem,
  KnowledgeLibraryFilterOptions,
  KnowledgeLibraryItemUpdateDTO,
} from '../models/KnowledgeLibraryItem';
import { KnowledgeCategory } from '../models/KnowledgeCategory';

export interface LibraryStats {
  totalItems: number;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  itemsByCategory: Record<KnowledgeCategory, number>;
  itemsByStatus: Record<string, number>;
}

export interface ILibraryService {
  /** Get all items matching filters */
  getItems(filter?: KnowledgeLibraryFilterOptions): Promise<KnowledgeLibraryItem[]>;

  /** Get single item details by ID */
  getItemDetails(id: string): Promise<KnowledgeLibraryItem | null>;

  /** Edit metadata / attributes of a document item */
  updateItemMetadata(id: string, dto: KnowledgeLibraryItemUpdateDTO): Promise<KnowledgeLibraryItem>;

  /** Update tags associated with a document item */
  updateItemTags(id: string, tags: string[]): Promise<KnowledgeLibraryItem>;

  /** Move a document item to a new category */
  moveCategory(id: string, newCategory: KnowledgeCategory): Promise<KnowledgeLibraryItem>;

  /** Duplicate a document registration entry */
  duplicateItem(id: string): Promise<KnowledgeLibraryItem>;

  /** Delete a document item from the library */
  deleteItem(id: string): Promise<boolean>;

  /** Calculate library metrics and statistics */
  getLibraryStats(): Promise<LibraryStats>;
}
