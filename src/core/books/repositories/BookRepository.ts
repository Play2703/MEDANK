import { BookModel, BookCreateDTO, BookUpdateDTO } from '../models/BookModel';
import { medKnowledgeRepository } from '../../../data/repositories_impl/MedKnowledgeRepository';
import { KnowledgeCategory } from '../../medcore_kernel/ontology/KnowledgeCategoryMapper';
import { KnowledgeAsset } from '../../../domain/entities/KnowledgeAsset';
import { realSemanticSearchService } from '../../../data/services/RealSemanticSearchService';

export class BookRepository {
  private assetToBook(asset: KnowledgeAsset): BookModel {
    return {
      id: asset.id,
      titulo: asset.title,
      autor: asset.author,
      editora: asset.institution || 'MedCore',
      edicao: '1ª',
      ano: asset.year || new Date().getFullYear(),
      isbn: '000-0000000000',
      disciplina: asset.discipline,
      especialidade: asset.specialty,
      volume: 'Volume Único',
      idioma: 'Português',
      conteudoTexto: asset.file?.extractedText,
      arquivo: asset.file?.name || `${asset.title}.pdf`,
      tamanhoArquivo: asset.file?.size || 1024 * 1024,
      tamanhoFormatado: asset.file?.size ? `${(asset.file.size / (1024 * 1024)).toFixed(1)} MB` : '1.0 MB',
      categoria: asset.subcategory || asset.specialty,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  public async getAllAsync(): Promise<BookModel[]> {
    const assets = await medKnowledgeRepository.getAssetsByCategory(KnowledgeCategory.book);
    return assets.map((a) => this.assetToBook(a));
  }

  public getAll(): BookModel[] {
    // Synchronous fallback wrapper for existing UI calls
    let result: BookModel[] = [];
    medKnowledgeRepository.getAssetsByCategory(KnowledgeCategory.book).then((assets) => {
      result = assets.map((a) => this.assetToBook(a));
    });
    return result;
  }

  public async create(dto: BookCreateDTO): Promise<BookModel> {
    const asset = await medKnowledgeRepository.importAsset({
      title: dto.titulo,
      category: KnowledgeCategory.book,
      author: dto.autor,
      institution: dto.editora,
      discipline: dto.disciplina,
      specialty: dto.especialidade,
      year: dto.ano,
      file: {
        name: dto.arquivo || `${dto.titulo}.pdf`,
        size: dto.tamanhoArquivo,
        extractedText: dto.conteudoTexto && dto.conteudoTexto.trim().length > 0 ? dto.conteudoTexto : undefined,
      },
    });
    return this.assetToBook(asset);
  }

  public async update(id: string, dto: BookUpdateDTO): Promise<BookModel | null> {
    const existing = await medKnowledgeRepository.getAssetById(id);
    if (!existing) return null;

    const hasNewContent = dto.conteudoTexto !== undefined && dto.conteudoTexto !== existing.file?.extractedText;
    const newExtractedText = hasNewContent ? dto.conteudoTexto : existing.file?.extractedText;

    const updated = await medKnowledgeRepository.saveAsset({
      ...existing,
      title: dto.titulo || existing.title,
      author: dto.autor || existing.author,
      institution: dto.editora || existing.institution,
      discipline: dto.disciplina || existing.discipline,
      specialty: dto.especialidade || existing.specialty,
      year: dto.ano || existing.year,
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
          professor: updated.author,
        });
      } catch (embErr) {
        console.warn('[BookRepository] Re-indexing updated book failed:', embErr);
      }
    }

    return this.assetToBook(updated);
  }

  public async delete(id: string): Promise<boolean> {
    return await medKnowledgeRepository.deleteAsset(id);
  }
}

export const bookRepository = new BookRepository();
