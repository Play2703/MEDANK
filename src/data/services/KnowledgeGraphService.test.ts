import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db/database';
import { KnowledgeGraphService } from './KnowledgeGraphService';
import { createInitialSM2State } from '../../core/algorithm/sm2';

describe('KnowledgeGraphService (Edge & Link Cleanup Unit Tests)', () => {
  const service = new KnowledgeGraphService();

  beforeEach(async () => {
    await db.graphContentLinks.clear();
    await db.graphEdges.clear();
    await db.questions.clear();
    await db.flashcards.clear();
    await db.knowledgeAssets.clear();
  });

  it('pruneOrphanedLinks - remove links específicos para um contentType e contentId', async () => {
    await db.graphContentLinks.bulkPut([
      { id: 'key1::question::q123', canonicalKey: 'key1', contentType: 'question', contentId: 'q123', createdAt: new Date().toISOString() },
      { id: 'key2::question::q123', canonicalKey: 'key2', contentType: 'question', contentId: 'q123', createdAt: new Date().toISOString() },
      { id: 'key1::flashcard::card456', canonicalKey: 'key1', contentType: 'flashcard', contentId: 'card456', createdAt: new Date().toISOString() },
    ]);

    const removed = await service.pruneOrphanedLinks('question', 'q123');
    expect(removed).toBe(2);

    const remaining = await db.graphContentLinks.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('key1::flashcard::card456');
  });

  it('cleanupObsoleteGraphEdges - remove links órfãos de conteúdo deletado e edges sem links ativos', async () => {
    // 1. Inserir 1 card ativo
    await db.flashcards.put({
      id: 'card_ativo_1',
      deckId: 'deck1',
      type: 'basic',
      front: 'Frente',
      back: 'Verso',
      highYield: true,
      tags: ['cardiologia'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sm2State: createInitialSM2State(),
    });

    // 2. Inserir 2 links: 1 apontando para o card ativo e 1 apontando para uma questão deletada/inexistente
    await db.graphContentLinks.bulkPut([
      { id: 'hipertensao::flashcard::card_ativo_1', canonicalKey: 'hipertensao', contentType: 'flashcard', contentId: 'card_ativo_1', createdAt: new Date().toISOString() },
      { id: 'diabetes::question::q_deletada_99', canonicalKey: 'diabetes', contentType: 'question', contentId: 'q_deletada_99', createdAt: new Date().toISOString() },
    ]);

    // 3. Inserir 2 edges: 1 conectando hipertensao (ativo) e 1 conectando apenas termos obsoletos (sem nenhum link)
    await db.graphEdges.bulkPut([
      {
        id: 'hipertensao::trata::enalapril',
        subjectCanonicalKey: 'hipertensao',
        predicate: 'trata',
        objectCanonicalKey: 'enalapril',
        occurrenceCount: 1,
        maxConfidence: 0.9,
        assetIds: [],
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'termo_obsoleto1::causa::termo_obsoleto2',
        subjectCanonicalKey: 'termo_obsoleto1',
        predicate: 'causa',
        objectCanonicalKey: 'termo_obsoleto2',
        occurrenceCount: 1,
        maxConfidence: 0.8,
        assetIds: [],
        updatedAt: new Date().toISOString(),
      },
    ]);

    // 4. Executar varredura completa de limpeza
    const result = await service.cleanupObsoleteGraphEdges();

    expect(result.linksRemoved).toBe(1); // diabetes::question::q_deletada_99
    expect(result.edgesRemoved).toBe(1); // termo_obsoleto1::causa::termo_obsoleto2

    // 5. Verificar o estado final da base Dexie
    const finalLinks = await db.graphContentLinks.toArray();
    expect(finalLinks).toHaveLength(1);
    expect(finalLinks[0].id).toBe('hipertensao::flashcard::card_ativo_1');

    const finalEdges = await db.graphEdges.toArray();
    expect(finalEdges).toHaveLength(1);
    expect(finalEdges[0].id).toBe('hipertensao::trata::enalapril');
  });

  it('cleanupObsoleteGraphEdges - preserva graphEdge originado de documento-fonte existente (assetId) mesmo sem graphContentLinks', async () => {
    // 1. Inserir um documento-fonte (KnowledgeAsset) importado recentemente no Dexie
    const assetId = 'asset_doc_recente_123';
    await db.knowledgeAssets.put({
      id: assetId,
      uuid: assetId,
      title: 'Diretriz Cardiológica Recente',
      category: 'guideline' as any,
      subcategory: 'Geral',
      discipline: 'Cardiologia',
      specialty: 'Cardiologia',
      author: 'SBC',
      institution: 'SBC',
      board: undefined,
      professor: undefined,
      year: 2026,
      semester: '1º Semestre',
      tags: ['Diretriz'],
      metadata: {},
      file: { name: 'diretriz.pdf' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      processingStatus: 'completed',
    });

    // 2. Inserir um graphEdge extraído desse documento (com assetIds contendo assetId), mas AINDA SEM nenhum flashcard/questão gerado (sem graphContentLink)
    await db.graphEdges.put({
      id: 'insuficiencia_cardiaca::trata::sacubitril_valsartana',
      subjectCanonicalKey: 'insuficiencia_cardiaca',
      predicate: 'trata',
      objectCanonicalKey: 'sacubitril_valsartana',
      occurrenceCount: 1,
      maxConfidence: 0.95,
      assetIds: [assetId],
      updatedAt: new Date().toISOString(),
    });

    // 3. Executar limpeza do grafo
    const result = await service.cleanupObsoleteGraphEdges();

    // 4. Garantir que NENHUM edge foi removido, pois o documento-fonte existe
    expect(result.edgesRemoved).toBe(0);

    const edges = await db.graphEdges.toArray();
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe('insuficiencia_cardiaca::trata::sacubitril_valsartana');
  });
});
