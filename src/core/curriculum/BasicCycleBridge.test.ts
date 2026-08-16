import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../data/db/database';
import { dictionaryNEREngine } from '../ner/DictionaryNEREngine';
import { isBasicCycleAsset, BASIC_CYCLE_DISCIPLINES } from './basicCycleDisciplines';
import { basicCycleBridgeService } from '../../data/services/BasicCycleBridgeService';
import { Question } from '../../domain/entities/Question';
import { KnowledgeAsset } from '../../domain/entities/KnowledgeAsset';
import { KnowledgeCategory } from '../medcore_kernel/ontology/KnowledgeCategoryMapper';
import { GraphEdgeRecord } from '../../domain/entities/ChunkEntity';

describe('Fase 34 - Basic Cycle Bridge & Anatomical Triggers', () => {
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

  describe('PARTE C: BasicCycleBridgeService (Fluxo Clínico -> Ciclo Básico)', () => {
    const mockClinicalQuestion: Question = {
      id: 'q-enare-cl-1',
      setId: 'set-enare-2024',
      statement: 'Paciente de 58 anos com dor torácica e infarto agudo do miocárdio apresenta alteração na artéria coronária.',
      options: [
        { id: 'opt-1', letter: 'A', text: 'Artéria Coronária Direita', isCorrect: true },
        { id: 'opt-2', letter: 'B', text: 'Artéria Descendente Anterior', isCorrect: false },
        { id: 'opt-3', letter: 'C', text: 'Artéria Circunflexa', isCorrect: false },
        { id: 'opt-4', letter: 'D', text: 'Artéria Marginal Esquerda', isCorrect: false },
      ],
      correctOptionId: 'opt-1',
      commentary: 'O infarto decorre de oclusão da artéria coronária que irriga o miocárdio.',
      specialty: 'Cardiologia',
      topic: 'Síndromes Coronarianas Agudas',
      difficulty: 'media',
      questionType: 'caso_clinico',
      originSource: 'Banca ENARE 2024',
      isAnswered: true,
      createdAt: new Date().toISOString(),
    };

    it('1. Deve extrair contexto via Grafo de Conhecimento quando houver vizinhos em materiais de ciclo básico', async () => {
      // Cria asset de Anatomia no Dexie
      const anatomyAsset: KnowledgeAsset = {
        id: 'asset-anatomy-moore',
        uuid: 'uuid-anat-1',
        title: 'Moore - Anatomia Clínica do Coração',
        discipline: 'Anatomia Humana',
        specialty: 'Anatomia',
        category: KnowledgeCategory.book,
        subcategory: 'Cardiovascular',
        author: 'Keith L. Moore',
        institution: 'MedAnki Library',
        board: '',
        professor: '',
        year: 2022,
        semester: '1',
        tags: ['Anatomia', 'Coração', 'Coronárias'],
        metadata: {},
        file: { name: 'moore_coracao.pdf' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processingStatus: 'completed',
      };
      await db.knowledgeAssets.put(anatomyAsset);

      // Adiciona embedding do chunk correspondente
      await db.documentEmbeddings.put({
        id: 'emb-anat-1',
        assetId: 'asset-anatomy-moore',
        chunkIndex: 0,
        content: 'A artéria coronária direita origina-se do seio aórtico direito e irriga o nó sinoatrial, o nó atrioventricular e a parede inferior do ventrículo esquerdo através do ramo interventricular posterior.',
        vector: new Float32Array(384).fill(0.1),
        dimension: 384,
        model: 'local-minilm',
        embeddingSchemaVersion: '2.0.0',
        createdAt: new Date().toISOString(),
      });

      // Cria aresta no grafo ligando 'DeCS:D003331' ou 'artéria coronária' a 'asset-anatomy-moore'
      const graphEdge: GraphEdgeRecord = {
        id: 'DeCS:D003331::irriga::miocardio',
        subjectCanonicalKey: 'DeCS:D003331',
        predicate: 'irriga',
        objectCanonicalKey: 'miocardio',
        occurrenceCount: 2,
        maxConfidence: 0.95,
        assetIds: ['asset-anatomy-moore'],
        updatedAt: new Date().toISOString(),
      };
      await db.graphEdges.put(graphEdge);

      const graphEdgeFallback: GraphEdgeRecord = {
        id: 'artéria coronária::irriga::miocárdio',
        subjectCanonicalKey: 'artéria coronária',
        predicate: 'irriga',
        objectCanonicalKey: 'miocárdio',
        occurrenceCount: 2,
        maxConfidence: 0.95,
        assetIds: ['asset-anatomy-moore'],
        updatedAt: new Date().toISOString(),
      };
      await db.graphEdges.put(graphEdgeFallback);

      const result = await basicCycleBridgeService.buildBasicCycleContext(mockClinicalQuestion);

      expect(result).toBeDefined();
      expect(result.contextMaterial).toBeDefined();
      expect(result.chunks.length).toBeGreaterThanOrEqual(1);
      expect(result.basicAssetCount).toBe(1);
    });

    it('2. Deve acionar RAG como fallback quando o grafo não possuir arestas cadastradas', async () => {
      // Sem arestas no grafo, apenas o asset de Fisiologia cadastrado
      const physioAsset: KnowledgeAsset = {
        id: 'asset-physio-guyton',
        uuid: 'uuid-phys-1',
        title: 'Guyton & Hall - Fisiologia do Músculo Cardíaco',
        discipline: 'Fisiologia Médica',
        specialty: 'Fisiologia',
        category: KnowledgeCategory.book,
        subcategory: 'Fisiologia Cardiovascular',
        author: 'Guyton & Hall',
        institution: 'MedAnki Library',
        board: '',
        professor: '',
        year: 2021,
        semester: '1',
        tags: ['Fisiologia', 'Potencial de Ação'],
        metadata: {},
        file: { name: 'guyton_cardio.pdf' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processingStatus: 'completed',
      };
      await db.knowledgeAssets.put(physioAsset);

      const result = await basicCycleBridgeService.buildBasicCycleContext(mockClinicalQuestion);

      expect(result).toBeDefined();
      expect(result.basicAssetCount).toBe(1);
      expect(result.sourceStrategy === 'rag' || result.sourceStrategy === 'general_fallback').toBe(true);
    });
  });
});
