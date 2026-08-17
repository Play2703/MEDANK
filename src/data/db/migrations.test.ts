import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { applyDatabaseMigrations } from './migrations';
import { SCHEMAS_V13 } from './schema';

describe('Database Migrations - Version 14 (Unify questionBank to residencyExam)', () => {
  it('should upgrade knowledgeAssets with category questionBank to residencyExam on version 14 migration', async () => {
    const testDbName = 'MedAnki_Migration_V14_Test_' + Date.now();

    // 1. Create a database at Version 13
    const oldDb = new Dexie(testDbName);
    oldDb.version(13).stores(SCHEMAS_V13);
    await oldDb.open();

    // 2. Insert fake records with category 'questionBank' and other categories
    await oldDb.table('knowledgeAssets').bulkAdd([
      {
        id: 'asset-qb-1',
        uuid: 'uuid-1',
        title: 'Banco de Questões ENARE 2024',
        category: 'questionBank',
        discipline: 'Clínica Médica',
        specialty: 'Cardiologia',
        author: 'ENARE',
        institution: 'MEC',
        board: 'ENARE',
        professor: 'Banca Geral',
        year: 2024,
        semester: '1º Semestre',
        tags: ['questoes', 'cardiologia'],
        metadata: {},
        file: { name: 'enare2024.pdf' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processingStatus: 'completed',
      },
      {
        id: 'asset-res-2',
        uuid: 'uuid-2',
        title: 'Prova USP 2024',
        category: 'residencyExam',
        discipline: 'Cirurgia',
        specialty: 'Geral',
        author: 'USP',
        institution: 'USP',
        board: 'FUVEST',
        professor: 'Banca Geral',
        year: 2024,
        semester: '1º Semestre',
        tags: ['prova', 'usp'],
        metadata: {},
        file: { name: 'usp2024.pdf' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processingStatus: 'completed',
      },
      {
        id: 'asset-prof-3',
        uuid: 'uuid-3',
        title: 'Prova Prof. Silva',
        category: 'professorExam',
        discipline: 'Pediatria',
        specialty: 'Neonatologia',
        author: 'Prof. Silva',
        institution: 'UNIFESP',
        board: 'UNIFESP',
        professor: 'Dr. Silva',
        year: 2023,
        semester: '2º Semestre',
        tags: ['prova', 'professor'],
        metadata: {},
        file: { name: 'profsilva.pdf' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processingStatus: 'completed',
      },
    ]);

    // Verify initial data in V13
    const qbAssetBefore = await oldDb.table('knowledgeAssets').get('asset-qb-1');
    expect(qbAssetBefore?.category).toBe('questionBank');

    // Close the old database connection
    oldDb.close();

    // 3. Open upgraded database with full migrations (including V14)
    const upgradedDb = new Dexie(testDbName);
    applyDatabaseMigrations(upgradedDb);
    await upgradedDb.open();

    // 4. Assert that the record was converted from 'questionBank' to 'residencyExam'
    const qbAssetAfter = await upgradedDb.table('knowledgeAssets').get('asset-qb-1');
    expect(qbAssetAfter?.category).toBe('residencyExam');

    // Assert that other records remain unchanged
    const resAsset = await upgradedDb.table('knowledgeAssets').get('asset-res-2');
    expect(resAsset?.category).toBe('residencyExam');

    const profAsset = await upgradedDb.table('knowledgeAssets').get('asset-prof-3');
    expect(profAsset?.category).toBe('professorExam');

    // Clean up
    upgradedDb.close();
    await Dexie.delete(testDbName);
  });

  it('should create extractedExamQuestions table on version 15 migration and allow operations', async () => {
    const testDbName = 'MedAnki_Migration_V15_Test_' + Date.now();
    const upgradedDb = new Dexie(testDbName);
    applyDatabaseMigrations(upgradedDb);
    await upgradedDb.open();

    const table = upgradedDb.table('extractedExamQuestions');
    expect(table).toBeDefined();

    await table.add({
      id: 'ext_test_1',
      sourceAssetId: 'doc-1',
      questionNumber: 1,
      statement: 'Enunciado de teste',
      options: [{ letter: 'A', text: 'Opcao A' }],
      correctLetter: 'A',
      confidence: 'high',
      createdAt: new Date().toISOString(),
    });

    const retrieved = await table.get('ext_test_1');
    expect(retrieved).toBeDefined();
    expect(retrieved.questionNumber).toBe(1);

    upgradedDb.close();
    await Dexie.delete(testDbName);
  });

  it('should create knowledgeAssetFiles table on version 16 migration and allow binary Blob operations', async () => {
    const testDbName = 'MedAnki_Migration_V16_Test_' + Date.now();
    const upgradedDb = new Dexie(testDbName);
    applyDatabaseMigrations(upgradedDb);
    await upgradedDb.open();

    const table = upgradedDb.table('knowledgeAssetFiles');
    expect(table).toBeDefined();

    const fakeBlob = new Blob(['sample pdf content'], { type: 'application/pdf' });
    await table.add({
      id: 'asset-binary-1',
      assetId: 'asset-1',
      blob: fakeBlob,
      mimeType: 'application/pdf',
      createdAt: new Date().toISOString(),
    });

    const retrieved = await table.get('asset-binary-1');
    expect(retrieved).toBeDefined();
    expect(retrieved.assetId).toBe('asset-1');
    expect(retrieved.blob).toBeDefined();

    upgradedDb.close();
    await Dexie.delete(testDbName);
  });
});
