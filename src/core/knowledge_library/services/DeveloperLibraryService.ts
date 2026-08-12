/**
 * Knowledge Library Module - DeveloperLibraryService
 *
 * Facade service integrating Library, Registration, and Catalog services for Developer Console operations.
 */

import { IDeveloperLibraryService } from '../interfaces/IDeveloperLibraryService';
import { ILibraryService, LibraryStats } from '../interfaces/ILibraryService';
import { IDocumentRegistrationService, FileImportPayload } from '../interfaces/IDocumentRegistrationService';
import { IKnowledgeCatalogService } from '../interfaces/IKnowledgeCatalogService';
import {
  KnowledgeLibraryItem,
  KnowledgeLibraryFilterOptions,
  KnowledgeLibraryItemUpdateDTO,
} from '../models/KnowledgeLibraryItem';
import { KnowledgeCategory } from '../models/KnowledgeCategory';

export class DeveloperLibraryService implements IDeveloperLibraryService {
  constructor(
    public readonly libraryService: ILibraryService,
    public readonly registrationService: IDocumentRegistrationService,
    public readonly catalogService: IKnowledgeCatalogService
  ) {}

  public async fetchLibraryItems(filter?: KnowledgeLibraryFilterOptions): Promise<KnowledgeLibraryItem[]> {
    return this.libraryService.getItems(filter);
  }

  public async fetchItemById(id: string): Promise<KnowledgeLibraryItem | null> {
    return this.libraryService.getItemDetails(id);
  }

  public async registerBatch(payloads: FileImportPayload[]): Promise<KnowledgeLibraryItem[]> {
    return this.registrationService.registerBatchDocuments(payloads);
  }

  public async editDocument(id: string, dto: KnowledgeLibraryItemUpdateDTO): Promise<KnowledgeLibraryItem> {
    return this.libraryService.updateItemMetadata(id, dto);
  }

  public async moveDocumentCategory(
    id: string,
    newCategory: KnowledgeCategory
  ): Promise<KnowledgeLibraryItem> {
    return this.libraryService.moveCategory(id, newCategory);
  }

  public async duplicateDocument(id: string): Promise<KnowledgeLibraryItem> {
    return this.libraryService.duplicateItem(id);
  }

  public async deleteDocument(id: string): Promise<boolean> {
    return this.libraryService.deleteItem(id);
  }

  public async fetchStats(): Promise<LibraryStats> {
    return this.libraryService.getLibraryStats();
  }
}
