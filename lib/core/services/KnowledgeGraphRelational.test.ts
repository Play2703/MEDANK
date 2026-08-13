import { describe, it, expect, beforeEach } from 'vitest';
import { NativeSQLiteService } from './NativeSQLiteService';
import { getRelatedEntitiesFromDb, getGraphNodeByCode } from '@/src/core/ner/DictionaryNEREngine';

describe('Knowledge Graph Relational Queries (SQLite)', () => {
  let service: NativeSQLiteService;

  beforeEach(async () => {
    service = new NativeSQLiteService();
    await service.initialize();
  });

  describe('NativeSQLiteService Graph Operations', () => {
    it('deve inserir e consultar nós do grafo relacionais', async () => {
      await service.upsertGraphNode({
        id: 'infarto agudo do miocardio',
        canonical_code: 'infarto agudo do miocardio',
        code_system: 'CID-10',
        type: 'disease',
        display_text: 'Infarto Agudo do Miocárdio',
        occurrence_count: 15,
      });

      const node = await service.getGraphNodeByCode('infarto agudo do miocardio');
      expect(node).toBeDefined();
      expect(node?.canonical_code).toBe('infarto agudo do miocardio');
      expect(node?.display_text).toBe('Infarto Agudo do Miocárdio');
      expect(node?.code_system).toBe('CID-10');
    });

    it('deve relacionar arestas de grafo e retornar conexões outgoing e incoming', async () => {
      await service.upsertGraphNode({
        id: 'hipertensao',
        canonical_code: 'hipertensao',
        code_system: 'CID-10',
        type: 'disease',
        display_text: 'Hipertensão Arterial',
        occurrence_count: 10,
      });

      await service.upsertGraphNode({
        id: 'avc',
        canonical_code: 'avc',
        code_system: 'CID-10',
        type: 'disease',
        display_text: 'Acidente Vascular Cerebral',
        occurrence_count: 8,
      });

      await service.upsertGraphEdge({
        id: 'hipertensao::fator_de_risco::avc',
        source_code: 'hipertensao',
        target_code: 'avc',
        predicate: 'fator_de_risco',
        occurrence_count: 5,
        confidence: 0.95,
      });

      // Outgoing query from 'hipertensao'
      const outConnections = await service.getRelatedEntities('hipertensao');
      expect(outConnections).toHaveLength(1);
      expect(outConnections[0].direction).toBe('outgoing');
      expect(outConnections[0].relatedCode).toBe('avc');
      expect(outConnections[0].relatedLabel).toBe('Acidente Vascular Cerebral');
      expect(outConnections[0].predicate).toBe('fator_de_risco');

      // Incoming query from 'avc'
      const inConnections = await service.getRelatedEntities('avc');
      expect(inConnections).toHaveLength(1);
      expect(inConnections[0].direction).toBe('incoming');
      expect(inConnections[0].relatedCode).toBe('hipertensao');
      expect(inConnections[0].relatedLabel).toBe('Hipertensão Arterial');
    });

    it('deve filtrar conexões por predicate', async () => {
      await service.upsertGraphEdge({
        id: 'captopril::trata::hipertensao',
        source_code: 'captopril',
        target_code: 'hipertensao',
        predicate: 'trata',
        occurrence_count: 3,
        confidence: 0.9,
      });

      await service.upsertGraphEdge({
        id: 'captopril::efeito_adverso::tosse',
        source_code: 'captopril',
        target_code: 'tosse',
        predicate: 'efeito_adverso',
        occurrence_count: 2,
        confidence: 0.85,
      });

      const treats = await service.getRelatedEntities('captopril', 'trata');
      expect(treats).toHaveLength(1);
      expect(treats[0].predicate).toBe('trata');
      expect(treats[0].relatedCode).toBe('hipertensao');

      const adverse = await service.getRelatedEntities('captopril', 'efeito_adverso');
      expect(adverse).toHaveLength(1);
      expect(adverse[0].predicate).toBe('efeito_adverso');
      expect(adverse[0].relatedCode).toBe('tosse');
    });
  });

  describe('DictionaryNEREngine SQLite Graph Queries', () => {
    it('deve consultar conexões diretamente da base medicalTerminology.db', () => {
      const connections = getRelatedEntitiesFromDb('colecistite aguda');
      expect(Array.isArray(connections)).toBe(true);
    });

    it('deve consultar nós por código canônico no medicalTerminology.db', () => {
      const node = getGraphNodeByCode('colecistite aguda');
      if (node) {
        expect(node.canonical_code).toBe('colecistite aguda');
      }
    });
  });
});
