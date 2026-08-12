/**
 * Knowledge Library Module - IKnowledgeLibraryRepository
 *
 * Repository contract for persisting and retrieving KnowledgeLibraryItems and Folders.
 */

import {
  KnowledgeLibraryItem,
  KnowledgeLibraryItemCreateDTO,
  KnowledgeLibraryItemUpdateDTO,
  KnowledgeLibraryFilterOptions,
} from '../models/KnowledgeLibraryItem';
import {
  KnowledgeLibraryFolder,
  KnowledgeLibraryFolderCreateDTO,
} from '../models/KnowledgeLibraryFolder';
import { KnowledgeTag } from '../models/KnowledgeTag';
import { KnowledgeAuthor } from '../models/KnowledgeAuthor';
import { KnowledgeInstitution } from '../models/KnowledgeInstitution';

export interface IKnowledgeLibraryRepository {
  /** Find document item by unique ID */
  findItemById(id: string): Promise<KnowledgeLibraryItem | null>;

  /** Query document items matching filters */
  findItems(filter?: KnowledgeLibraryFilterOptions): Promise<KnowledgeLibraryItem[]>;

  /** Create and register a new document item */
  createItem(dto: KnowledgeLibraryItemCreateDTO): Promise<KnowledgeLibraryItem>;

  /** Update an existing document item */
  updateItem(id: string, dto: KnowledgeLibraryItemUpdateDTO): Promise<KnowledgeLibraryItem>;

  /** Delete a document item by ID */
  deleteItem(id: string): Promise<boolean>;

  /** Duplicate a document item registration */
  duplicateItem(id: string): Promise<KnowledgeLibraryItem>;

  /** Move document item to a target category folder */
  moveItemCategory(id: string, newCategory: KnowledgeLibraryItem['type']): Promise<KnowledgeLibraryItem>;

  /** Retrieve all folders */
  getFolders(): Promise<KnowledgeLibraryFolder[]>;

  /** Create folder */
  createFolder(dto: KnowledgeLibraryFolderCreateDTO): Promise<KnowledgeLibraryFolder>;

  /** Get available tags */
  getTags(): Promise<KnowledgeTag[]>;

  /** Save new tag */
  createTag(name: string, color?: string): Promise<KnowledgeTag>;

  /** Get authors */
  getAuthors(): Promise<KnowledgeAuthor[]>;

  /** Get institutions */
  getInstitutions(): Promise<KnowledgeInstitution[]>;

  /** Clear all library items (resets to seed data) */
  resetToSeedData(): Promise<KnowledgeLibraryItem[]>;
}
