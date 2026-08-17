import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../data/db/database';
import { medKnowledgeRepository } from '../../../data/repositories_impl/MedKnowledgeRepository';
import { ExamRepository } from '../repositories/ExamRepository';
import { calculateSegmentationStats } from '../../../domain/entities/KnowledgeAsset';
import { KnowledgeCategory } from '../../medcore_kernel/ontology/KnowledgeCategoryMapper';

describe('ExamSegmentationPersistence - Persistência e Mapeamento de Estatísticas de Segmentação', () => {
  let examRepo: ExamRepository;

  beforeEach(async () => {
    await db.knowledgeAssets.clear();
    await db.extractedExamQuestions.clear();
    examRepo = new ExamRepository();
  });

  it('deve persistir examSegmentationStats no asset e mapear corretamente para o ExamModel', async () => {
    // 1. Cria um KnowledgeAsset de prova de residência
    const createdAsset = await medKnowledgeRepository.importAsset({
      title: 'Prova USP 2026',
      category: KnowledgeCategory.residencyExam,
      institution: 'USP',
      board: 'USP',
      professor: 'Banca USP',
      discipline: 'Clínica Médica',
      specialty: 'Medicina Geral',
      year: 2026,
      semester: '1º Semestre',
      tags: ['USP', 'Residência'],
      file: {
        name: 'USP.pdf',
        size: 5000000,
        extractedText: 'Questão 1...\nQuestão 2...',
      },
    });

    // 2. Calcula as estatísticas de segmentação (ex: 613 de 633 alta confiança => 96.8% 'otimo')
    const stats = calculateSegmentationStats(633, 613, 20);
    expect(stats.percent).toBe(96.8);
    expect(stats.level).toBe('otimo');

    // 3. Atualiza o asset com os metadados de segmentação
    createdAsset.metadata = {
      ...(createdAsset.metadata || {}),
      examSegmentationStats: stats,
    };
    await medKnowledgeRepository.saveAsset(createdAsset);

    // 4. Recupera através do ExamRepository e verifica mapeamento
    const examModel = await examRepo.getExamById(createdAsset.id);
    expect(examModel).not.toBeNull();
    expect(examModel?.examSegmentationStats).toBeDefined();
    expect(examModel?.examSegmentationStats?.percent).toBe(96.8);
    expect(examModel?.examSegmentationStats?.level).toBe('otimo');
    expect(examModel?.examSegmentationStats?.highConfidenceCount).toBe(613);
    expect(examModel?.examSegmentationStats?.totalQuestions).toBe(633);
  });

  it('deve retornar examSegmentationStats como undefined quando a prova ainda não foi segmentada', async () => {
    const unsegmentedAsset = await medKnowledgeRepository.importAsset({
      title: 'Prova Sem Segmentação',
      category: KnowledgeCategory.residencyExam,
      institution: 'ENARE',
      board: 'ENARE',
      discipline: 'Cirurgia',
      specialty: 'Geral',
      year: 2025,
      semester: '1º Semestre',
      tags: ['ENARE'],
      file: {
        name: 'ENARE.pdf',
        size: 2000000,
      },
    });

    const examModel = await examRepo.getExamById(unsegmentedAsset.id);
    expect(examModel).not.toBeNull();
    expect(examModel?.examSegmentationStats).toBeUndefined();
  });
});
