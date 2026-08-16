import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../data/db/database';
import { dictionaryNEREngine } from '../ner/DictionaryNEREngine';
import { isBasicCycleAsset, isBasicCycleSpecialty, BASIC_CYCLE_DISCIPLINES } from './basicCycleDisciplines';
import { KnowledgeAsset } from '../../domain/entities/KnowledgeAsset';
import { KnowledgeCategory } from '../medcore_kernel/ontology/KnowledgeCategoryMapper';

describe('Ciclo Básico & Gatilhos Anatômicos', () => {
  beforeEach(async () => {
    await db.knowledgeAssets.clear();
    await db.documentEmbeddings.clear();
    await db.graphEdges.clear();
    await db.chunkEntities.clear();
  });

  describe('PARTE A: Novos Gatilhos de Conectividade Anatômica e Fisiológica', () => {
    it('1. Deve extrair relação IRRIGACAO de frases com vocabulário anatômico (Moore/Guyton)', async () => {
      await dictionaryNEREngine.warmup();
      const text = 'A artéria coronária direita irriga o nó sinoatrial.';
      const entities = await dictionaryNEREngine.extractEntities(text);
      const relations = dictionaryNEREngine.extractRelations(text, entities);

      expect(relations.some((r) => r.relationType === 'IRRIGACAO')).toBe(true);
    });

    it('2. Deve extrair relação INERVACAO', async () => {
      await dictionaryNEREngine.warmup();
      const text = 'O nervo frênico inerva o diafragma.';
      const entities = await dictionaryNEREngine.extractEntities(text);
      const relations = dictionaryNEREngine.extractRelations(text, entities);

      expect(relations.some((r) => r.relationType === 'INERVACAO')).toBe(true);
    });

    it('3. Deve extrair relação DRENAGEM', async () => {
      await dictionaryNEREngine.warmup();
      const text = 'A veia porta drena o estômago.';
      const entities = await dictionaryNEREngine.extractEntities(text);
      const relations = dictionaryNEREngine.extractRelations(text, entities);

      expect(relations.some((r) => r.relationType === 'DRENAGEM')).toBe(true);
    });

    it('4. Deve extrair relação LOCALIZACAO', async () => {
      await dictionaryNEREngine.warmup();
      const text = 'A glândula tireoide localiza-se na laringe.';
      const entities = await dictionaryNEREngine.extractEntities(text);
      const relations = dictionaryNEREngine.extractRelations(text, entities);

      expect(relations.some((r) => r.relationType === 'LOCALIZACAO')).toBe(true);
    });

    it('5. Deve extrair relação COMPOSICAO', async () => {
      await dictionaryNEREngine.warmup();
      const text = 'O miocárdio compõe o ventrículo esquerdo.';
      const entities = dictionaryNEREngine.extractEntities(text);
      const relations = dictionaryNEREngine.extractRelations(text, entities);

      expect(relations.some((r) => r.relationType === 'COMPOSICAO')).toBe(true);
    });

    it('6. Deve extrair relação REGULACAO', async () => {
      await dictionaryNEREngine.warmup();
      const text = 'A insulina regula a glicose.';
      const entities = dictionaryNEREngine.extractEntities(text);
      const relations = dictionaryNEREngine.extractRelations(text, entities);

      expect(relations.some((r) => r.relationType === 'REGULACAO')).toBe(true);
    });
  });

  describe('PARTE B: Classificação de Disciplinas de Ciclo Básico', () => {
    it('1. Deve classificar corretamente disciplinas canônicas do ciclo básico', () => {
      expect(isBasicCycleAsset('Anatomia')).toBe(true);
      expect(isBasicCycleAsset('Fisiologia')).toBe(true);
      expect(isBasicCycleAsset('Bioquímica')).toBe(true);
      expect(isBasicCycleAsset('Histologia')).toBe(true);
      expect(isBasicCycleAsset('Embriologia')).toBe(true);
      expect(isBasicCycleAsset('Farmacologia Básica')).toBe(true);
      expect(isBasicCycleAsset('Patologia Geral')).toBe(true);
      expect(isBasicCycleAsset('Microbiologia')).toBe(true);
      expect(isBasicCycleAsset('Imunologia')).toBe(true);
      expect(isBasicCycleAsset('Genética')).toBe(true);
    });

    it('2. Deve ser tolerante a variações com sufixos ou minúsculas (ex: Fisiologia Humana, farmacologia)', () => {
      expect(isBasicCycleAsset('Fisiologia Humana')).toBe(true);
      expect(isBasicCycleAsset('fisiologia médica')).toBe(true);
      expect(isBasicCycleAsset('ANATOMIA CLÍNICA')).toBe(true);
      expect(isBasicCycleAsset('Farmacologia')).toBe(true);
      expect(isBasicCycleAsset('Bioquímica Médica')).toBe(true);
    });

    it('3. Não deve classificar disciplinas puramente clínicas como ciclo básico', () => {
      expect(isBasicCycleAsset('Cardiologia')).toBe(false);
      expect(isBasicCycleAsset('Pediatria')).toBe(false);
      expect(isBasicCycleAsset('Ginecologia e Obstetrícia')).toBe(false);
      expect(isBasicCycleAsset('Cirurgia Geral')).toBe(false);
      expect(isBasicCycleAsset('Medicina de Família e Comunidade')).toBe(false);
      expect(isBasicCycleAsset('')).toBe(false);
      expect(isBasicCycleAsset(undefined)).toBe(false);
    });
  });

  describe('PARTE C: Enriquecimento de Ciclo Básico via Bancos de Prova Clínicos', () => {
    it('1. getExamBankAssetIds deve retornar apenas assets de provas/bancos de questões', async () => {
      const { getExamBankAssetIds } = await import('../../data/services/QuestionGenerationService');

      await db.knowledgeAssets.bulkPut([
        {
          id: 'asset-book-1',
          uuid: 'u-1',
          title: 'Guyton Fisiologia',
          discipline: 'Fisiologia',
          specialty: 'Fisiologia',
          category: KnowledgeCategory.book,
          subcategory: 'Geral',
          author: 'Guyton',
          institution: 'MedAnki',
          board: '',
          professor: '',
          year: 2021,
          semester: '1',
          tags: [],
          metadata: {},
          file: { name: 'guyton.pdf' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          processingStatus: 'completed',
        },
        {
          id: 'asset-exam-revalida',
          uuid: 'u-2',
          title: 'Prova Revalida INEP 2023',
          discipline: 'Clínica Médica',
          specialty: 'Cardiologia',
          category: KnowledgeCategory.residencyExam,
          subcategory: 'Revalida',
          author: 'INEP',
          institution: 'INEP',
          board: 'REVALIDA',
          professor: '',
          year: 2023,
          semester: '1',
          tags: ['Revalida', 'Cardiologia'],
          metadata: {},
          file: { name: 'revalida_2023.pdf' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          processingStatus: 'completed',
        },
        {
          id: 'asset-exam-prof',
          uuid: 'u-3',
          title: 'Prova Prof. Silva',
          discipline: 'Fisiologia',
          specialty: 'Fisiologia',
          category: KnowledgeCategory.professorExam,
          subcategory: 'Fisiologia',
          author: 'Prof. Silva',
          institution: 'USP',
          board: '',
          professor: 'Silva',
          year: 2023,
          semester: '2',
          tags: [],
          metadata: {},
          file: { name: 'prova_silva.pdf' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          processingStatus: 'completed',
        },
      ]);

      const ids = await getExamBankAssetIds(true);
      expect(ids).toContain('asset-exam-revalida');
      expect(ids).toContain('asset-exam-prof');
      expect(ids).not.toContain('asset-book-1');
    });

    it('2. isBasicCycleSpecialty deve discriminar ciclo básico vs especialidades clínicas', async () => {
      const { isBasicCycleSpecialty } = await import('./basicCycleDisciplines');
      expect(isBasicCycleSpecialty('Fisiologia')).toBe(true);
      expect(isBasicCycleSpecialty('Anatomia Humana')).toBe(true);
      expect(isBasicCycleSpecialty('Bioquímica')).toBe(true);
      expect(isBasicCycleSpecialty('Farmacologia Básica')).toBe(true);

      expect(isBasicCycleSpecialty('Cardiologia')).toBe(false);
      expect(isBasicCycleSpecialty('Cirurgia Geral')).toBe(false);
      expect(isBasicCycleSpecialty('Pediatria')).toBe(false);
    });
  });
});
