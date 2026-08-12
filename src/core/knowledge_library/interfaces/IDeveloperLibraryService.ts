/**
 * Knowledge Library Module - IDeveloperLibraryService
 *
 * Facade service orchestrating Library, Registration, and Catalog operations
 * specifically tailored for Developer Console workflows.
 */

import { ILibraryService, LibraryStats } from './ILibraryService';
import { IDocumentRegistrationService, FileImportPayload } from './IDocumentRegistrationService';
import { IKnowledgeCatalogService } from './IKnowledgeCatalogService';
import { KnowledgeLibraryItem, KnowledgeLibraryFilterOptions, KnowledgeLibraryItemUpdateDTO } from '../models/KnowledgeLibraryItem';
import { KnowledgeCategory } from '../models/KnowledgeCategory';

export interface IDeveloperLibraryService {
  libraryService: ILibraryService;
  registrationService: IDocumentRegistrationService;
  catalogService: IKnowledgeCatalogService;

  /** Comprehensive search and filter method */
  fetchLibraryItems(filter?: KnowledgeLibraryFilterOptions): Promise<KnowledgeLibraryItem[]>;

  /** Single document details lookup */
  fetchItemById(id: string): Promise<KnowledgeLibraryItem | null>;

  /** Register documents batch */
  registerBatch(payloads: FileImportPayload[]): Promise<KnowledgeLibraryItem[]>;

  /** Update document metadata */
  editDocument(id: string, dto: KnowledgeLibraryItemUpdateDTO): Promise<KnowledgeLibraryItem>;

  /** Move document to category */
  moveDocumentCategory(id: string, newCategory: KnowledgeCategory): Promise<KnowledgeLibraryItem>;

  /** Duplicate document entry */
  duplicateDocument(id: string): Promise<KnowledgeLibraryItem>;

  /** Remove document entry */
  deleteDocument(id: string): Promise<boolean>;

  /** Get system library statistics */
  fetchStats(): Promise<LibraryStats>;
}
