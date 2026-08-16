/**
 * BasicCycleBridgeService (Fase 34 - Basic Cycle Bridge)
 * Conecta questões clínicas (REVALIDA, ENARE, USP, UNIFESP) a conceitos fundamentais do Ciclo Básico
 * (Anatomia, Fisiologia, Bioquímica, Histologia, Embriologia, Farmacologia Básica).
 *
 * Arquitetura estritamente compatível com o navegador (Client-Side Safe):
 * - Extrai entidades médicas delegando para MedicalEntityExtractionService (/api/extract-entities ou Web Worker).
 * - Consulta vizinhos no Grafo de Conhecimento (Dexie IndexedDB graphEdges).
 * - Complementa via RAGEngine com busca semântica filtrada por assetIds de ciclo básico.
 * - NUNCA importa módulos Node-only (fs, better-sqlite3).
 */

import { db } from '../db/database';
import { Question } from '../../domain/entities/Question';
import { ExtractedMedicalEntity } from '../../domain/entities/ChunkEntity';
import { medicalEntityExtractionService } from './MedicalEntityExtractionService';
import { knowledgeGraphService } from './KnowledgeGraphService';
import { ragEngine, SemanticChunkResult } from './RAGEngine';
import { isBasicCycleAsset } from '../../core/curriculum/basicCycleDisciplines';
import { pruneChunksByTokenBudget, MAX_CONTEXT_TOKENS_PER_CALL } from './tokenBudget';

export interface BasicCycleContextResult {
  contextMaterial: string;
  chunks: SemanticChunkResult[];
  extractedEntities: ExtractedMedicalEntity[];
  canonicalKeys: string[];
  sourceStrategy: 'graph' | 'rag' | 'hybrid' | 'general_fallback';
  basicAssetCount: number;
}

export class BasicCycleBridgeService {
  /**
   * Constrói o contexto de ciclo básico a partir de uma questão clínica:
   * 1. Extrai entidades e canonicalKeys do enunciado, vinheta e comentários.
   * 2. Consulta o Grafo de Conhecimento (Tentativa 1 - alta precisão estrutural).
   * 3. Complementa com RAGEngine filtrado por assetIds de ciclo básico (Tentativa 2).
   */
  async buildBasicCycleContext(clinicalQuestion: Question): Promise<BasicCycleContextResult> {
    if (!clinicalQuestion) {
      return {
        contextMaterial: 'Base de conhecimento geral em ciências básicas da saúde.',
        chunks: [],
        extractedEntities: [],
        canonicalKeys: [],
        sourceStrategy: 'general_fallback',
        basicAssetCount: 0,
      };
    }

    // Monta o texto representativo da questão clínica
    const commentaryText = typeof clinicalQuestion.commentary === 'string'
      ? clinicalQuestion.commentary
      : clinicalQuestion.commentary
      ? [clinicalQuestion.commentary.correta, clinicalQuestion.commentary.correlacaoClinica].filter(Boolean).join(' ')
      : '';

    const textToExtract = [
      clinicalQuestion.statement,
      clinicalQuestion.clinicalContext,
      commentaryText,
    ]
      .filter(Boolean)
      .join('\n\n');

    // 1. Extração segura de entidades no navegador
    let extractedEntities: ExtractedMedicalEntity[] = [];
    try {
      extractedEntities = await medicalEntityExtractionService.extractEntitiesFromText(textToExtract);
    } catch (err) {
      console.warn('[BasicCycleBridgeService] Entity extraction failed:', err);
    }

    const canonicalKeys = Array.from(
      new Set(extractedEntities.map((e) => e.canonicalKey).filter(Boolean))
    );

    // 2. Localiza todos os KnowledgeAssets do Ciclo Básico cadastrados no Dexie
    let basicAssetIds: string[] = [];
    try {
      const allAssets = await db.knowledgeAssets.toArray();
      const basicAssets = allAssets.filter(
        (a) => isBasicCycleAsset(a.discipline) || isBasicCycleAsset(a.specialty)
      );
      basicAssetIds = basicAssets.map((a) => a.id);
    } catch (err) {
      console.warn('[BasicCycleBridgeService] Failed to load basic cycle assets from Dexie:', err);
    }

    const basicAssetIdSet = new Set(basicAssetIds);

    // 3. TENTATIVA 1: Grafo de Conhecimento (vizinhos de entidades em materiais do ciclo básico)
    const graphAssetIds = new Set<string>();
    for (const key of canonicalKeys) {
      try {
        const { incoming, outgoing } = await knowledgeGraphService.getGraphNeighbors(key);
        const allEdges = [...incoming, ...outgoing];

        for (const edge of allEdges) {
          if (Array.isArray(edge.assetIds)) {
            for (const aId of edge.assetIds) {
              if (basicAssetIdSet.size === 0 || basicAssetIdSet.has(aId)) {
                graphAssetIds.add(aId);
              }
            }
          }
        }
      } catch (graphErr) {
        console.warn(`[BasicCycleBridgeService] Graph neighbor lookup failed for ${key}:`, graphErr);
      }
    }

    let graphChunks: SemanticChunkResult[] = [];
    if (graphAssetIds.size > 0) {
      try {
        const graphAssetArr = Array.from(graphAssetIds);
        const embeddings = await db.documentEmbeddings
          .where('assetId')
          .anyOf(graphAssetArr)
          .limit(8)
          .toArray();

        graphChunks = embeddings.map((emb) => ({
          assetId: emb.assetId,
          chunkIndex: emb.chunkIndex,
          content: emb.content,
          similarity: 1.0,
        }));
      } catch (embErr) {
        console.warn('[BasicCycleBridgeService] Failed to load embeddings for graph assets:', embErr);
      }
    }

    // 4. TENTATIVA 2: RAGEngine direcionado a materiais de ciclo básico (complemento ou fallback)
    let ragChunks: SemanticChunkResult[] = [];
    if (graphChunks.length < 2) {
      const entityTerms = extractedEntities
        .slice(0, 6)
        .map((e) => e.text)
        .join(' ');
      const searchQuery = `${clinicalQuestion.specialty || ''} ${clinicalQuestion.topic || ''} ${entityTerms}`.trim();

      try {
        ragChunks = await ragEngine.retrieveContext(searchQuery || 'Ciências Básicas Médicas', {
          assetIds: basicAssetIds.length > 0 ? basicAssetIds : undefined,
          topK: 6,
        });
      } catch (ragErr) {
        console.warn('[BasicCycleBridgeService] RAG retrieval for basic cycle failed:', ragErr);
      }
    }

    // 5. Consolidação e deduplicação de chunks
    const seenChunkKeys = new Set<string>();
    const combinedChunks: SemanticChunkResult[] = [];

    for (const chunk of [...graphChunks, ...ragChunks]) {
      const key = `${chunk.assetId}-${chunk.chunkIndex}`;
      if (!seenChunkKeys.has(key)) {
        seenChunkKeys.add(key);
        combinedChunks.push(chunk);
      }
    }

    const finalChunks = pruneChunksByTokenBudget(combinedChunks, MAX_CONTEXT_TOKENS_PER_CALL);

    // Formata o texto do contexto RAG/Grafo
    let contextMaterial = '';
    if (finalChunks.length > 0) {
      contextMaterial = finalChunks
        .map((c, i) => `--- TRECHO DE CIÊNCIAS BÁSICAS ${i + 1} ---\n${c.content}`)
        .join('\n\n');
    } else {
      contextMaterial = 'Base de conhecimento geral e diretrizes estruturais de Anatomia, Fisiologia, Bioquímica e Farmacologia Básica.';
    }

    let sourceStrategy: 'graph' | 'rag' | 'hybrid' | 'general_fallback' = 'general_fallback';
    if (graphChunks.length > 0 && ragChunks.length > 0) {
      sourceStrategy = 'hybrid';
    } else if (graphChunks.length > 0) {
      sourceStrategy = 'graph';
    } else if (ragChunks.length > 0) {
      sourceStrategy = 'rag';
    }

    return {
      contextMaterial,
      chunks: finalChunks,
      extractedEntities,
      canonicalKeys,
      sourceStrategy,
      basicAssetCount: basicAssetIds.length,
    };
  }
}

export const basicCycleBridgeService = new BasicCycleBridgeService();
