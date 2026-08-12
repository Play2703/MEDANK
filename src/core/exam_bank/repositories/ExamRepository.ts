import { ExamModel, ExamCreateDTO, ExamUpdateDTO } from '../models/ExamModel';
import { medKnowledgeRepository } from '../../../data/repositories_impl/MedKnowledgeRepository';
import { KnowledgeCategory } from '../../medcore_kernel/ontology/KnowledgeCategoryMapper';
import { KnowledgeAsset } from '../../../domain/entities/KnowledgeAsset';
import { realSemanticSearchService } from '../../../data/services/RealSemanticSearchService';

export class ExamRepository {
  private assetToExam(asset: KnowledgeAsset): ExamModel {
    return {
      id: asset.id,
      titulo: asset.title,
      instituição: asset.institution || 'Comissão de Provas',
      professor: asset.professor || 'Banca Examinadora',
      disciplina: asset.discipline,
      especialidade: asset.specialty,
      ano: asset.year || new Date().getFullYear(),
      semestre: asset.semester || '1º Semestre',
      tipo: (asset.board || 'ENARE') as any,
      observacoes: asset.title,
      conteudoTexto: asset.file?.extractedText,
      tags: asset.tags,
      arquivoOriginal: asset.file?.name || `${asset.title}.pdf`,
      tamanhoArquivo: asset.file?.size || 1024 * 1024,
      tamanhoFormatado: asset.file?.size ? `${(asset.file.size / (1024 * 1024)).toFixed(1)} MB` : '1.0 MB',
      gabarito: 'Gabarito Oficial',
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  public async getAllExams(): Promise<ExamModel[]> {
    const residency = await medKnowledgeRepository.getAssetsByCategory(KnowledgeCategory.residencyExam);
    const professor = await medKnowledgeRepository.getAssetsByCategory(KnowledgeCategory.professorExam);
    return [...residency, ...professor].map((a) => this.assetToExam(a));
  }

  public getAll(): ExamModel[] {
    let result: ExamModel[] = [];
    this.getAllExams().then((exams) => {
      result = exams;
    });
    return result;
  }

  public async getExamById(id: string): Promise<ExamModel | null> {
    const asset = await medKnowledgeRepository.getAssetById(id);
    if (!asset) return null;
    return this.assetToExam(asset);
  }

  public async createExam(dto: ExamCreateDTO): Promise<ExamModel> {
    const category = dto.tipo?.toLowerCase().includes('professor')
      ? KnowledgeCategory.professorExam
      : KnowledgeCategory.residencyExam;

    const asset = await medKnowledgeRepository.importAsset({
      title: dto.titulo,
      category,
      institution: dto.instituição,
      professor: dto.professor,
      discipline: dto.disciplina,
      specialty: dto.especialidade,
      year: dto.ano,
      semester: dto.semestre,
      board: dto.tipo,
      tags: dto.tags || [],
      file: {
        name: dto.arquivoOriginal || `${dto.titulo}.pdf`,
        size: dto.tamanhoArquivo,
        extractedText: dto.conteudoTexto && dto.conteudoTexto.trim().length > 0 ? dto.conteudoTexto : undefined,
      },
    });
    return this.assetToExam(asset);
  }

  public async updateExam(id: string, dto: ExamUpdateDTO): Promise<ExamModel | null> {
    const existing = await medKnowledgeRepository.getAssetById(id);
    if (!existing) return null;

    const hasNewContent = dto.conteudoTexto !== undefined && dto.conteudoTexto !== existing.file?.extractedText;
    const newExtractedText = hasNewContent ? dto.conteudoTexto : existing.file?.extractedText;

    const updated = await medKnowledgeRepository.saveAsset({
      ...existing,
      title: dto.titulo || existing.title,
      institution: dto.instituição || existing.institution,
      professor: dto.professor || existing.professor,
      discipline: dto.disciplina || existing.discipline,
      specialty: dto.especialidade || existing.specialty,
      year: dto.ano || existing.year,
      semester: dto.semestre || existing.semester,
      board: dto.tipo || existing.board,
      file: {
        name: existing.file?.name || `${dto.titulo || existing.title}.pdf`,
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
        console.warn('[ExamRepository] Re-indexing updated exam failed:', embErr);
      }
    }

    return this.assetToExam(updated);
  }

  public async deleteExam(id: string): Promise<boolean> {
    return await medKnowledgeRepository.deleteAsset(id);
  }

  public async resetToSeed(): Promise<ExamModel[]> {
    return await this.getAllExams();
  }
}

export const examRepository = new ExamRepository();
