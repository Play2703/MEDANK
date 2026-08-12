import { GuidelineModel, GuidelineCreateDTO, GuidelineUpdateDTO } from '../models/GuidelineModel';
import { medKnowledgeRepository } from '../../../data/repositories_impl/MedKnowledgeRepository';
import { KnowledgeCategory } from '../../medcore_kernel/ontology/KnowledgeCategoryMapper';
import { KnowledgeAsset } from '../../../domain/entities/KnowledgeAsset';
import { realSemanticSearchService } from '../../../data/services/RealSemanticSearchService';

export class GuidelineRepository {
  private assetToGuideline(asset: KnowledgeAsset): GuidelineModel {
    return {
      id: asset.id,
      titulo: asset.title,
      categoria: (asset.board || 'SBC') as any,
      ano: asset.year || new Date().getFullYear(),
      especialidade: asset.specialty,
      resumo: asset.metadata?.resumo || asset.title,
      conteudoTexto: asset.file?.extractedText,
      arquivo: asset.file?.name || `${asset.title}.pdf`,
      tamanhoArquivo: asset.file?.size || 1024 * 1024,
      tamanhoFormatado: asset.file?.size ? `${(asset.file.size / (1024 * 1024)).toFixed(1)} MB` : '1.0 MB',
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  public async getAllAsync(): Promise<GuidelineModel[]> {
    const assets = await medKnowledgeRepository.getAssetsByCategory(KnowledgeCategory.guideline);
    return assets.map((a) => this.assetToGuideline(a));
  }

  public getAll(): GuidelineModel[] {
    let result: GuidelineModel[] = [];
    this.getAllAsync().then((items) => {
      result = items;
    });
    return result;
  }

  public async create(dto: GuidelineCreateDTO): Promise<GuidelineModel> {
    const asset = await medKnowledgeRepository.importAsset({
      title: dto.titulo,
      category: KnowledgeCategory.guideline,
      board: dto.categoria,
      specialty: dto.especialidade,
      year: dto.ano,
      metadata: {
        resumo: dto.resumo,
      },
      file: {
        name: dto.arquivo || `${dto.titulo}.pdf`,
        size: dto.tamanhoArquivo,
        extractedText: dto.conteudoTexto && dto.conteudoTexto.trim().length > 0 ? dto.conteudoTexto : undefined,
      },
    });
    return this.assetToGuideline(asset);
  }

  public async update(id: string, dto: GuidelineUpdateDTO): Promise<GuidelineModel | null> {
    const existing = await medKnowledgeRepository.getAssetById(id);
    if (!existing) return null;

    const hasNewContent = dto.conteudoTexto !== undefined && dto.conteudoTexto !== existing.file?.extractedText;
    const newExtractedText = hasNewContent ? dto.conteudoTexto : existing.file?.extractedText;

    const updated = await medKnowledgeRepository.saveAsset({
      ...existing,
      title: dto.titulo || existing.title,
      specialty: dto.especialidade || existing.specialty,
      board: dto.categoria || existing.board,
      year: dto.ano || existing.year,
      metadata: {
        ...existing.metadata,
        resumo: dto.resumo || existing.metadata?.resumo,
      },
      file: {
        name: dto.arquivo || existing.file?.name || `${dto.titulo || existing.title}.pdf`,
        size: existing.file?.size || 1024 * 1024,
        type: existing.file?.type || 'application/pdf',
        extension: existing.file?.extension || 'PDF',
        extractedText: newExtractedText && newExtractedText.trim().length > 0 ? newExtractedText : undefined,
      },
      updatedAt: new Date().toISOString(),
    });

    if (hasNewContent && dto.conteudoTexto && dto.conteudoTexto.trim().length > 30) {
      try {
        await realSemanticSearchService.indexDocument(id, dto.conteudoTexto.trim(), {
          examBoard: updated.board,
          professor: updated.professor,
        });
      } catch (embErr) {
        console.warn('[GuidelineRepository] Re-indexing updated guideline failed:', embErr);
      }
    }

    return this.assetToGuideline(updated);
  }

  public async delete(id: string): Promise<boolean> {
    return await medKnowledgeRepository.deleteAsset(id);
  }
}

export const guidelineRepository = new GuidelineRepository();
