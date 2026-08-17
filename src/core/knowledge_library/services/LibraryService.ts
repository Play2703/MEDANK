import { ILibraryService, LibraryStats } from '../interfaces/ILibraryService';
import { IKnowledgeLibraryRepository } from '../interfaces/IKnowledgeLibraryRepository';
import {
  KnowledgeLibraryItem,
  KnowledgeLibraryFilterOptions,
  KnowledgeLibraryItemUpdateDTO,
} from '../models/KnowledgeLibraryItem';
import { KnowledgeCategory } from '../models/KnowledgeCategory';

export class LibraryService implements ILibraryService {
  constructor(private readonly repository: IKnowledgeLibraryRepository) {}

  public async getItems(filter?: KnowledgeLibraryFilterOptions): Promise<KnowledgeLibraryItem[]> {
    return this.repository.findItems(filter);
  }

  public async getItemDetails(id: string): Promise<KnowledgeLibraryItem | null> {
    return this.repository.findItemById(id);
  }

  public async updateItemMetadata(
    id: string,
    dto: KnowledgeLibraryItemUpdateDTO
  ): Promise<KnowledgeLibraryItem> {
    return this.repository.updateItem(id, dto);
  }

  public async updateItemTags(id: string, tags: string[]): Promise<KnowledgeLibraryItem> {
    return this.repository.updateItem(id, { tags });
  }

  public async moveCategory(
    id: string,
    newCategory: KnowledgeCategory
  ): Promise<KnowledgeLibraryItem> {
    return this.repository.moveItemCategory(id, newCategory);
  }

  public async duplicateItem(id: string): Promise<KnowledgeLibraryItem> {
    return this.repository.duplicateItem(id);
  }

  public async deleteItem(id: string): Promise<boolean> {
    return this.repository.deleteItem(id);
  }

  public async getLibraryStats(): Promise<LibraryStats> {
    const allItems = await this.repository.findItems();
    const totalItems = allItems.length;
    const totalSizeBytes = allItems.reduce((acc, curr) => acc + curr.fileSize, 0);

    const itemsByCategory: Record<KnowledgeCategory, number> = {
      [KnowledgeCategory.book]: 0,
      [KnowledgeCategory.residencyExam]: 0,
      [KnowledgeCategory.professorExam]: 0,
      [KnowledgeCategory.guideline]: 0,
      [KnowledgeCategory.article]: 0,
      [KnowledgeCategory.slide]: 0,
      [KnowledgeCategory.summary]: 0,
      [KnowledgeCategory.protocol]: 0,
      [KnowledgeCategory.clinicalCase]: 0,
      [KnowledgeCategory.flashcard]: 0,
      [KnowledgeCategory.manual]: 0,
      [KnowledgeCategory.apostila]: 0,
      [KnowledgeCategory.other]: 0,
    };

    const itemsByStatus: Record<string, number> = {};

    allItems.forEach((item) => {
      if (itemsByCategory[item.type] !== undefined) {
        itemsByCategory[item.type]++;
      } else {
        itemsByCategory[KnowledgeCategory.other] = (itemsByCategory[KnowledgeCategory.other] || 0) + 1;
      }
      itemsByStatus[item.status] = (itemsByStatus[item.status] || 0) + 1;
    });

    return {
      totalItems,
      totalSizeBytes,
      totalSizeFormatted: this.formatBytes(totalSizeBytes),
      itemsByCategory,
      itemsByStatus,
    };
  }

  private formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}
