import { describe, it, expect, beforeEach } from 'vitest';
import { NativeSQLiteService } from '../../core/services/NativeSQLiteService';
import { OfflineFirstExtractedExamQuestionRepository } from './OfflineFirstExtractedExamQuestionRepository';
import { ExtractedExamQuestionRecord } from '../../../src/domain/entities/Question';

describe('OfflineFirstExtractedExamQuestionRepository - Native SQLite CRUD', () => {
  let sqlite: NativeSQLiteService;
  let repo: OfflineFirstExtractedExamQuestionRepository;

  beforeEach(async () => {
    sqlite = new NativeSQLiteService();
    await sqlite.initialize();
    await sqlite.clearExtractedExamQuestions();
    repo = new OfflineFirstExtractedExamQuestionRepository(sqlite);
  });

  it('deve salvar e recuperar questão extraída individual no SQLite', async () => {
    const question: ExtractedExamQuestionRecord = {
      id: 'ext_q_test_1',
      sourceAssetId: 'asset_usp_2026',
      questionNumber: 1,
      statement: 'Paciente de 45 anos com febre e dor abdominal.',
      options: [
        { letter: 'A', text: 'Apendicite aguda' },
        { letter: 'B', text: 'Colecistite aguda' },
        { letter: 'C', text: 'Pancreatite' },
        { letter: 'D', text: 'Diverticulite' },
      ],
      correctLetter: 'A',
      specialty: 'Cirurgia Geral',
      confidence: 'high',
      createdAt: new Date().toISOString(),
    };

    await repo.save(question);

    const retrieved = await repo.getById('ext_q_test_1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe('ext_q_test_1');
    expect(retrieved?.sourceAssetId).toBe('asset_usp_2026');
    expect(retrieved?.questionNumber).toBe(1);
    expect(retrieved?.statement).toContain('Paciente de 45 anos');
    expect(retrieved?.options.length).toBe(4);
    expect(retrieved?.options[0].text).toBe('Apendicite aguda');
    expect(retrieved?.correctLetter).toBe('A');
    expect(retrieved?.confidence).toBe('high');
  });

  it('deve salvar em lote (bulkSave) e buscar por sourceAssetId ordenado por número', async () => {
    const questions: ExtractedExamQuestionRecord[] = [
      {
        id: 'q_usp_2',
        sourceAssetId: 'asset_usp_2026',
        questionNumber: 2,
        statement: 'Segunda questão...',
        options: [{ letter: 'A', text: 'Opção A' }],
        confidence: 'high',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'q_usp_1',
        sourceAssetId: 'asset_usp_2026',
        questionNumber: 1,
        statement: 'Primeira questão...',
        options: [{ letter: 'A', text: 'Opção A' }],
        confidence: 'high',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'q_unesp_1',
        sourceAssetId: 'asset_unesp_2026',
        questionNumber: 1,
        statement: 'Questão UNESP...',
        options: [{ letter: 'A', text: 'Opção A' }],
        confidence: 'low',
        createdAt: new Date().toISOString(),
      },
    ];

    await repo.bulkSave(questions);

    const uspQuestions = await repo.getByAssetId('asset_usp_2026');
    expect(uspQuestions.length).toBe(2);
    expect(uspQuestions[0].questionNumber).toBe(1);
    expect(uspQuestions[1].questionNumber).toBe(2);

    const unespQuestions = await repo.getByAssetId('asset_unesp_2026');
    expect(unespQuestions.length).toBe(1);
    expect(unespQuestions[0].confidence).toBe('low');
  });

  it('deve deletar por sourceAssetId e por ID', async () => {
    const questions: ExtractedExamQuestionRecord[] = [
      {
        id: 'q_del_1',
        sourceAssetId: 'asset_to_delete',
        questionNumber: 1,
        statement: 'Questão para deletar',
        options: [],
        confidence: 'high',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'q_del_2',
        sourceAssetId: 'asset_to_delete',
        questionNumber: 2,
        statement: 'Questão 2 para deletar',
        options: [],
        confidence: 'high',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'q_keep',
        sourceAssetId: 'asset_keep',
        questionNumber: 1,
        statement: 'Questão para manter',
        options: [],
        confidence: 'high',
        createdAt: new Date().toISOString(),
      },
    ];

    await repo.bulkSave(questions);

    await repo.deleteByAssetId('asset_to_delete');
    const remainingInDeletedAsset = await repo.getByAssetId('asset_to_delete');
    expect(remainingInDeletedAsset.length).toBe(0);

    const remainingKeep = await repo.getByAssetId('asset_keep');
    expect(remainingKeep.length).toBe(1);

    await repo.deleteById('q_keep');
    const afterSingleDelete = await repo.getById('q_keep');
    expect(afterSingleDelete).toBeNull();
  });
});
