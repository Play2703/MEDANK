import { IKnowledgeLibraryRepository } from '../interfaces/IKnowledgeLibraryRepository';
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
import { KnowledgeCategory, KnowledgeCategoryMapper } from '../../medcore_kernel/ontology/KnowledgeCategoryMapper';
import { medKnowledgeRepository } from '../../../data/repositories_impl/MedKnowledgeRepository';
import { KnowledgeAsset } from '../../../domain/entities/KnowledgeAsset';
import { realSemanticSearchService } from '../../../data/services/RealSemanticSearchService';

export class KnowledgeLibraryRepository implements IKnowledgeLibraryRepository {
  private assetToItem(asset: KnowledgeAsset): KnowledgeLibraryItem {
    return {
      id: asset.id,
      name: asset.title,
      type: asset.category,
      format: (asset.file?.extension || asset.file?.name.split('.').pop() || 'pdf').toUpperCase() as any,
      fileName: asset.file?.name || asset.title,
      fileSize: asset.file?.size || 0,
      fileSizeFormatted: asset.file?.size ? `${(asset.file.size / (1024 * 1024)).toFixed(2)} MB` : '1.0 MB',
      importDate: asset.createdAt,
      specialties: [asset.specialty],
      discipline: asset.discipline,
      subject: asset.subcategory,
      subtopic: asset.subcategory,
      author: asset.author,
      institution: asset.institution,
      year: asset.year,
      language: 'pt-BR',
      description: asset.title,
      tags: asset.tags,
      notes: '',
      conteudoTexto: asset.file?.extractedText,
      origin: 'MedCore Import Center',
      status: 'Importado',
      metadata: asset.metadata || {},
      folderId: undefined,
      isFavorite: false,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    } as any;
  }

  async findItemById(id: string): Promise<KnowledgeLibraryItem | null> {
    const asset = await medKnowledgeRepository.getAssetById(id);
    return asset ? this.assetToItem(asset) : null;
  }

  async getItemById(id: string): Promise<KnowledgeLibraryItem | null> {
    return this.findItemById(id);
  }

  async findItems(filter?: KnowledgeLibraryFilterOptions): Promise<KnowledgeLibraryItem[]> {
    const assets = await medKnowledgeRepository.getAssets();
    let items = assets.map((a) => this.assetToItem(a));

    if (!filter) return items;

    if (filter.type && filter.type !== ('Todos' as any) && filter.type !== ('Todas' as any)) {
      items = items.filter((i) => {
        if (i.type === filter.type) return true;
        const mapped = KnowledgeCategoryMapper.fromDisplayName(filter.type as string);
        if (mapped !== KnowledgeCategory.other && i.type === mapped) return true;
        const str = String(filter.type).toLowerCase();
        if (str.includes('livro') && i.type === KnowledgeCategory.book) return true;
        if (str.includes('prova') && (i.type === KnowledgeCategory.residencyExam || i.type === KnowledgeCategory.professorExam || i.type === KnowledgeCategory.questionBank)) return true;
        if (str.includes('diretriz') && (i.type === KnowledgeCategory.guideline || i.type === KnowledgeCategory.protocol)) return true;
        if (str.includes('artigo') && i.type === KnowledgeCategory.article) return true;
        if (str.includes('apostila') && (i.type === KnowledgeCategory.apostila || i.type === KnowledgeCategory.manual)) return true;
        if (str.includes('protocolo') && i.type === KnowledgeCategory.protocol) return true;
        return false;
      });
    }

    if (filter.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.author.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return items;
  }

  async getAllItems(filter?: KnowledgeLibraryFilterOptions): Promise<KnowledgeLibraryItem[]> {
    return this.findItems(filter);
  }

  async createItem(dto: KnowledgeLibraryItemCreateDTO): Promise<KnowledgeLibraryItem> {
    const asset = await medKnowledgeRepository.importAsset({
      title: dto.name,
      category: dto.type,
      discipline: dto.discipline || 'Clínica Médica',
      specialty: dto.specialties?.[0] || 'Geral',
      author: dto.author || 'MedCore System',
      institution: dto.institution || 'MedAnki',
      year: dto.year || new Date().getFullYear(),
      tags: dto.tags || [],
      metadata: dto.metadata || {},
      file: {
        name: dto.fileName || `${dto.name}.pdf`,
        size: dto.fileSize || 1024 * 1024,
        type: dto.format || 'PDF',
        extractedText: dto.conteudoTexto && dto.conteudoTexto.trim().length > 0 ? dto.conteudoTexto : undefined,
      },
    });
    return this.assetToItem(asset);
  }

  async updateItem(id: string, dto: KnowledgeLibraryItemUpdateDTO): Promise<KnowledgeLibraryItem> {
    const existing = await medKnowledgeRepository.getAssetById(id);
    if (!existing) throw new Error(`Item ${id} não encontrado`);

    const hasNewContent = dto.conteudoTexto !== undefined && dto.conteudoTexto !== existing.file?.extractedText;
    const newExtractedText = hasNewContent ? dto.conteudoTexto : existing.file?.extractedText;

    const updatedAsset: KnowledgeAsset = {
      ...existing,
      title: dto.name !== undefined ? dto.name : existing.title,
      category: dto.type !== undefined ? dto.type : existing.category,
      discipline: dto.discipline !== undefined ? dto.discipline : existing.discipline,
      specialty: dto.specialties !== undefined ? dto.specialties[0] : existing.specialty,
      author: dto.author !== undefined ? dto.author : existing.author,
      institution: dto.institution !== undefined ? dto.institution : existing.institution,
      year: dto.year !== undefined ? dto.year : existing.year,
      tags: dto.tags !== undefined ? dto.tags : existing.tags,
      file: {
        name: existing.file?.name || `${existing.title}.pdf`,
        size: existing.file?.size || 1024 * 1024,
        type: existing.file?.type || 'application/pdf',
        extension: existing.file?.extension || 'PDF',
        extractedText: newExtractedText && newExtractedText.trim().length > 0 ? newExtractedText : undefined,
      },
      updatedAt: new Date().toISOString(),
    };

    const saved = await medKnowledgeRepository.saveAsset(updatedAsset);

    if (hasNewContent && dto.conteudoTexto && dto.conteudoTexto.trim().length > 30) {
      try {
        await realSemanticSearchService.indexDocument(id, dto.conteudoTexto.trim(), {
          examBoard: saved.board,
          professor: saved.author,
        });
      } catch (embErr) {
        console.warn('[KnowledgeLibraryRepository] Re-indexing updated item failed:', embErr);
      }
    }

    return this.assetToItem(saved);
  }

  async deleteItem(id: string): Promise<boolean> {
    return await medKnowledgeRepository.deleteAsset(id);
  }

  async duplicateItem(id: string): Promise<KnowledgeLibraryItem> {
    const existing = await medKnowledgeRepository.getAssetById(id);
    if (!existing) throw new Error(`Item ${id} não encontrado`);

    const duplicated = await medKnowledgeRepository.importAsset({
      title: `${existing.title} (Cópia)`,
      category: existing.category,
      discipline: existing.discipline,
      specialty: existing.specialty,
      author: existing.author,
      institution: existing.institution,
      year: existing.year,
      tags: [...existing.tags],
      file: { ...existing.file },
    });

    return this.assetToItem(duplicated);
  }

  async moveItemCategory(id: string, newCategory: KnowledgeCategory): Promise<KnowledgeLibraryItem> {
    const existing = await medKnowledgeRepository.getAssetById(id);
    if (!existing) throw new Error(`Item ${id} não encontrado`);

    existing.category = newCategory;
    const saved = await medKnowledgeRepository.saveAsset(existing);
    return this.assetToItem(saved);
  }

  async getFolders(): Promise<KnowledgeLibraryFolder[]> {
    return [];
  }

  async createFolder(dto: KnowledgeLibraryFolderCreateDTO): Promise<KnowledgeLibraryFolder> {
    const now = new Date().toISOString();
    return {
      id: `folder-${Date.now()}`,
      name: dto.name,
      category: dto.category,
      icon: dto.icon || 'Folder',
      description: dto.description || '',
      itemCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getTags(): Promise<KnowledgeTag[]> {
    const items = await this.findItems();
    const tagMap = new Map<string, number>();
    items.forEach((i) =>
      i.tags.forEach((t) => tagMap.set(t, (tagMap.get(t) || 0) + 1))
    );
    return Array.from(tagMap.keys()).map((name) => ({
      id: `tag-${name}`,
      name,
      categoryContext: 'Geral',
    }));
  }

  async createTag(name: string): Promise<KnowledgeTag> {
    return {
      id: `tag-${name}`,
      name,
      categoryContext: 'Geral',
    };
  }

  async getAuthors(): Promise<KnowledgeAuthor[]> {
    const items = await this.findItems();
    const authorMap = new Map<string, number>();
    items.forEach((i) => authorMap.set(i.author, (authorMap.get(i.author) || 0) + 1));
    return Array.from(authorMap.entries()).map(([name, count]) => ({
      id: `author-${name}`,
      name,
      count,
    }));
  }

  async getInstitutions(): Promise<KnowledgeInstitution[]> {
    const items = await this.findItems();
    const instMap = new Map<string, number>();
    items.forEach((i) => instMap.set(i.institution, (instMap.get(i.institution) || 0) + 1));
    return Array.from(instMap.entries()).map(([name, count]) => ({
      id: `inst-${name}`,
      name,
      count,
    }));
  }

  async resetToSeedData(): Promise<KnowledgeLibraryItem[]> {
    return this.findItems();
  }

  async getMetrics(): Promise<any> {
    const assets = await medKnowledgeRepository.getAssets();
    const totalSize = assets.reduce((sum, a) => sum + (a.file?.size || 0), 0);
    return {
      totalItems: assets.length,
      totalStorageBytes: totalSize,
      totalStorageFormatted: `${(totalSize / (1024 * 1024)).toFixed(2)} MB`,
      itemsByCategory: assets.reduce((acc, a) => {
        acc[a.category] = (acc[a.category] || 0) + 1;
        return acc;
      }, {} as Record<KnowledgeCategory, number>),
    };
  }
}

export const knowledgeLibraryRepository = new KnowledgeLibraryRepository();
