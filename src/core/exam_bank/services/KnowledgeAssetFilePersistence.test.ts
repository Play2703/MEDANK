import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../../data/db/database';
import { medKnowledgeRepository } from '../../../data/repositories_impl/MedKnowledgeRepository';
import { KnowledgeCategory } from '../../medcore_kernel/ontology/KnowledgeCategoryMapper';
import { ExamPDFQuestionSplitter } from './ExamPDFQuestionSplitter';

describe('TAREFA 0: Persistência do Arquivo PDF Original (knowledgeAssetFiles)', () => {
  beforeEach(async () => {
    await db.knowledgeAssets.clear();
    await db.knowledgeAssetFiles.clear();
    await db.extractedExamQuestions.clear();
  });

  it('deve salvar o Blob original na tabela knowledgeAssetFiles quando a categoria for residencyExam ou professorExam', async () => {
    const fakePDFContent = '%PDF-1.4 Fake PDF Content for Residency Exam 2024';
    const fakeBlob = new Blob([fakePDFContent], { type: 'application/pdf' });

    const asset = await medKnowledgeRepository.importAsset({
      title: 'Prova USP 2024',
      category: KnowledgeCategory.residencyExam,
      discipline: 'Clínica Médica',
      specialty: 'Cardiologia',
      institution: 'USP',
      board: 'FUVEST',
      year: 2024,
      file: {
        name: 'prova_usp_2024.pdf',
        size: fakeBlob.size,
        type: 'application/pdf',
      },
      rawFile: fakeBlob,
    });

    expect(asset.id).toBeDefined();
    expect(asset.file.hasRawFileBlob).toBe(true);
    expect(asset.file.rawFileStorageKey).toBe(asset.id);

    // Confirma que o binário foi salvo na tabela separada knowledgeAssetFiles
    const binaryRecord = await db.knowledgeAssetFiles.get(asset.id);
    expect(binaryRecord).toBeDefined();
    expect(binaryRecord?.assetId).toBe(asset.id);
    expect(binaryRecord?.mimeType).toBe('application/pdf');
    expect(binaryRecord?.blob).toBeDefined();
    expect(binaryRecord?.blob.size).toBe(fakeBlob.size);
  });

  it('NÃO deve armazenar o Blob na tabela knowledgeAssetFiles para categorias não-prova (ex: book, guideline)', async () => {
    const fakeBookContent = '%PDF-1.4 Huge Textbook Content';
    const fakeBlob = new Blob([fakeBookContent], { type: 'application/pdf' });

    const asset = await medKnowledgeRepository.importAsset({
      title: 'Tratado de Cardiologia Braunwald',
      category: KnowledgeCategory.book,
      discipline: 'Cardiologia',
      file: {
        name: 'braunwald.pdf',
        size: fakeBlob.size,
        type: 'application/pdf',
      },
      rawFile: fakeBlob,
    });

    expect(asset.id).toBeDefined();
    expect(asset.file.hasRawFileBlob).toBeUndefined();

    // A tabela knowledgeAssetFiles NÃO deve conter esse registro
    const binaryRecord = await db.knowledgeAssetFiles.get(asset.id);
    expect(binaryRecord).toBeUndefined();
  });

  it('deve permitir que o ExamPDFQuestionSplitter recupere o Blob armazenado via getRawExamPDFBlob', async () => {
    const sampleExamText = `
QUESTÃO 01
Paciente com dor precordial e supra de ST. Conduta:
A) Angioplastia primária
B) AAS isolado
GABARITO: A
`;
    const fakeBlob = new Blob([sampleExamText], { type: 'application/pdf' });

    const asset = await medKnowledgeRepository.importAsset({
      title: 'Prova ENARE 2024',
      category: KnowledgeCategory.residencyExam,
      file: {
        name: 'enare_2024.pdf',
        size: fakeBlob.size,
        type: 'application/pdf',
      },
      rawFile: fakeBlob,
    });

    const retrievedBlob = await ExamPDFQuestionSplitter.getRawExamPDFBlob(asset.id);
    expect(retrievedBlob).toBeDefined();
    expect(retrievedBlob?.size).toBe(fakeBlob.size);
  });

  it('deve retornar aviso explicativo quando splitFromAssetId for chamado para uma prova sem PDF binário armazenado', async () => {
    // Cria um asset antigo sem rawFile (caso de provas importadas antes da mudança)
    const asset = await medKnowledgeRepository.importAsset({
      title: 'Prova Antiga 2020',
      category: KnowledgeCategory.residencyExam,
      file: {
        name: 'prova_antiga.pdf',
        size: 500000,
        type: 'application/pdf',
      },
      rawFile: null,
    });

    const result = await ExamPDFQuestionSplitter.splitFromAssetId(asset.id);
    expect(result.success).toBe(false);
    expect(result.warning).toContain('PDF original não disponível');
    expect(result.questions).toHaveLength(0);
  });

  it('deve excluir o registro da tabela knowledgeAssetFiles quando deleteAsset for executado', async () => {
    const fakeBlob = new Blob(['sample pdf binary'], { type: 'application/pdf' });

    const asset = await medKnowledgeRepository.importAsset({
      title: 'Prova Temporária',
      category: KnowledgeCategory.professorExam,
      file: {
        name: 'temp.pdf',
        size: fakeBlob.size,
        type: 'application/pdf',
      },
      rawFile: fakeBlob,
    });

    expect(await db.knowledgeAssetFiles.get(asset.id)).toBeDefined();

    // Deleta o asset
    await medKnowledgeRepository.deleteAsset(asset.id);

    // Confirma limpeza de ambas as tabelas
    expect(await db.knowledgeAssets.get(asset.id)).toBeUndefined();
    expect(await db.knowledgeAssetFiles.get(asset.id)).toBeUndefined();
  });
});
