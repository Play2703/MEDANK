import { MaterialModel, MaterialCreateDTO, MaterialUpdateDTO } from '../models/MaterialModel';
import { medKnowledgeRepository } from '../../../data/repositories_impl/MedKnowledgeRepository';
import { KnowledgeAsset } from '../../../domain/entities/KnowledgeAsset';
import { KnowledgeCategoryMapper } from '../../knowledge_library/models/KnowledgeCategory';
import { realSemanticSearchService } from '../../../data/services/RealSemanticSearchService';

export class MaterialRepository {
  private assetToMaterial(asset: KnowledgeAsset): MaterialModel {
    return {
      id: asset.id,
      titulo: asset.title,
      categoria: asset.category,
      disciplina: asset.discipline,
      especialidade: asset.specialty,
      autor: asset.author,
      ano: asset.year,
      descricao: asset.title,
      idioma: 'Português (BR)',
      tipo: KnowledgeCategoryMapper.toDisplayName(asset.category),
      status: 'Importado',
      dataImportacao: asset.createdAt,
      tags: asset.tags,
      observacoes: asset.title,
      conteudoTexto: asset.file?.extractedText,
      nomeArquivo: asset.file?.name || `${asset.title}.pdf`,
      tamanhoArquivo: asset.file?.size || 1024 * 1024,
      tamanhoFormatado: asset.file?.size ? `${(asset.file.size / (1024 * 1024)).toFixed(1)} MB` : '1.0 MB',
      formato: (asset.file?.extension || 'PDF') as any,
      origem: 'Import Center',
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  public async getAllMaterials(): Promise<MaterialModel[]> {
    const assets = await medKnowledgeRepository.getAssets();
    return assets.map((a) => this.assetToMaterial(a));
  }

  public getAll(): MaterialModel[] {
    let result: MaterialModel[] = [];
    this.getAllMaterials().then((items) => {
      result = items;
    });
    return result;
  }

  public async getMaterialById(id: string): Promise<MaterialModel | null> {
    const asset = await medKnowledgeRepository.getAssetById(id);
    return asset ? this.assetToMaterial(asset) : null;
  }

  public async createMaterial(dto: MaterialCreateDTO): Promise<MaterialModel> {
    const asset = await medKnowledgeRepository.importAsset({
      title: dto.titulo,
      category: dto.categoria,
      discipline: dto.disciplina,
      specialty: dto.especialidade,
      author: dto.autor,
      year: dto.ano,
      tags: dto.tags || [],
      file: {
        name: dto.nomeArquivo,
        size: dto.tamanhoArquivo,
        extension: dto.formato,
        extractedText: dto.conteudoTexto && dto.conteudoTexto.trim().length > 0 ? dto.conteudoTexto : undefined,
      },
    });
    return this.assetToMaterial(asset);
  }

  public async updateMaterial(id: string, dto: MaterialUpdateDTO): Promise<MaterialModel | null> {
    const existing = await medKnowledgeRepository.getAssetById(id);
    if (!existing) return null;

    const hasNewContent = dto.conteudoTexto !== undefined && dto.conteudoTexto !== existing.file?.extractedText;
    const newExtractedText = hasNewContent ? dto.conteudoTexto : existing.file?.extractedText;

    const updated = await medKnowledgeRepository.saveAsset({
      ...existing,
      title: dto.titulo || existing.title,
      category: dto.categoria || existing.category,
      discipline: dto.disciplina || existing.discipline,
      specialty: dto.especialidade || existing.specialty,
      author: dto.autor || existing.author,
      year: dto.ano || existing.year,
      tags: dto.tags || existing.tags,
      file: {
        name: dto.nomeArquivo || existing.file?.name || `${dto.titulo || existing.title}.pdf`,
        size: dto.tamanhoArquivo || existing.file?.size || 1024 * 1024,
        type: existing.file?.type || 'application/pdf',
        extension: dto.formato || existing.file?.extension || 'PDF',
        extractedText: newExtractedText && newExtractedText.trim().length > 0 ? newExtractedText : undefined,
      },
      updatedAt: new Date().toISOString(),
    });

    if (hasNewContent && dto.conteudoTexto && dto.conteudoTexto.trim().length > 30) {
      try {
        await realSemanticSearchService.indexDocument(id, dto.conteudoTexto.trim(), {
          examBoard: updated.board,
          professor: updated.author,
        });
      } catch (embErr) {
        console.warn('[MaterialRepository] Re-indexing updated material failed:', embErr);
      }
    }

    return this.assetToMaterial(updated);
  }

  public async deleteMaterial(id: string): Promise<void> {
    await medKnowledgeRepository.deleteAsset(id);
  }

  public async resetToSeed(): Promise<void> {
    // No-op for MedKnowledgeRepository
  }
}

export const materialRepository = new MaterialRepository();
