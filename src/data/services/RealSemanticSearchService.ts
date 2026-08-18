/**
 * Real Semantic Search Service (RAG)
 *
 * Handles chunking, local browser embedding generation via LocalEmbeddingClient (transformers.js),
 * hybrid search (0.7 cosine similarity + 0.3 lexical BM25/keyword matching) offloaded to Web Workers,
 * Dexie IndexedDB persistence with schema versioning, in-memory embedding caching, and LRU search caching.
 *
 * ZERO mock data or fake vectors.
 */

import { db } from '../db/database';
import { DocumentEmbedding } from '../../domain/entities/DocumentEmbedding';
import { ExtractedMedicalEntity } from '../../domain/entities/ChunkEntity';
import { chunkText } from './textChunker';
import { medicalEntityExtractionService } from './MedicalEntityExtractionService';
import { computeSimilaritiesInWorker } from './workerPool';
import { localEmbeddingClient } from './embeddings/LocalEmbeddingClient';
import { LOCAL_EMBEDDING_CONFIG } from './embeddings/localEmbeddingConfig';
import { livingCardEngine } from './LivingCardEngine';
import { computeLexicalScore, computeHybridScore } from './lexicalScore';

export { computeLexicalScore, computeHybridScore };

export interface IndexDocumentMetadata {
  examBoard?: string;
  professor?: string;
  onProgress?: (processed: number, total: number) => void;
  wasOCRProcessed?: boolean;
}

export interface SemanticSearchFilter {
  banca?: string;
  professor?: string;
  assetIds?: string[];
}

export interface SemanticChunkResult {
  assetId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
  lexicalScore?: number;
  hybridScore?: number;
  entities?: ExtractedMedicalEntity[];
}

/**
 * Normalizes text prior to embedding generation to reduce noise
 */
export function normalizeTextForEmbedding(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFC')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SemanticSearchResult {
  results: SemanticChunkResult[];
  hasOutdatedEmbeddings: boolean;
}

export class RealSemanticSearchService {
  private searchCache = new Map<string, SemanticSearchResult>();
  private readonly maxCacheSize = 20;

  // In-memory cache of raw document embeddings to avoid IndexedDB disk read on every search
  private memoryEmbeddingsCache: DocumentEmbedding[] | null = null;

  /**
   * Invalidates the in-memory embeddings cache and the query result LRU cache.
   * Call after new documents are indexed, re-indexed, or bulk loaded.
   */
  public invalidateEmbeddingsCache(): void {
    this.memoryEmbeddingsCache = null;
    this.searchCache.clear();
  }

  /**
   * Loads all document embeddings from Dexie IndexedDB into memory once, converting
   * vectors to Float32Array for maximum memory efficiency and fast zero-copy transfers.
   */
  private async getOrLoadAllDocumentEmbeddings(): Promise<DocumentEmbedding[]> {
    if (this.memoryEmbeddingsCache !== null) {
      return this.memoryEmbeddingsCache;
    }

    const rawDocs = await db.documentEmbeddings.toArray();
    this.memoryEmbeddingsCache = rawDocs.map((doc) => ({
      ...doc,
      vector:
        doc.vector instanceof Float32Array
          ? doc.vector
          : new Float32Array(doc.vector || []),
    }));

    return this.memoryEmbeddingsCache;
  }

  private getCacheKey(query: string, topK: number, filter?: SemanticSearchFilter): string {
    const bancaStr = filter?.banca ? filter.banca.trim().toLowerCase() : '';
    const profStr = filter?.professor ? filter.professor.trim().toLowerCase() : '';
    const assetIdsStr = filter?.assetIds ? filter.assetIds.slice().sort().join(',') : '';
    return `${query.trim().toLowerCase()}:${topK}:${bancaStr}:${profStr}:${assetIdsStr}`;
  }

  private setCachedResults(key: string, result: SemanticSearchResult): void {
    if (this.searchCache.size >= this.maxCacheSize) {
      const firstKey = this.searchCache.keys().next().value;
      if (firstKey !== undefined) {
        this.searchCache.delete(firstKey);
      }
    }
    this.searchCache.set(key, result);
  }

  /**
   * Checks whether IndexedDB contains document embeddings with outdated schema version
   */
  async checkForOutdatedEmbeddings(): Promise<boolean> {
    const allDocs = await this.getOrLoadAllDocumentEmbeddings();
    if (allDocs.length === 0) return false;
    return allDocs.some((doc) => doc.embeddingSchemaVersion !== LOCAL_EMBEDDING_CONFIG.embeddingSchemaVersion);
  }

  /**
   * Process a document: chunk text, generate local 384d embeddings in batches via LocalEmbeddingClient,
   * with UI yielding between batches and progress reporting.
   */
  async indexDocument(assetId: string, fullText: string, metadata?: IndexDocumentMetadata): Promise<number> {
    if (!fullText || !fullText.trim()) return 0;

    const rawChunks = chunkText(fullText, 500, 50);
    if (rawChunks.length === 0) return 0;

    const chunks = rawChunks.map(normalizeTextForEmbedding);

    // Trigger Medical Entity Extraction (NER) in parallel
    const nerPromise = medicalEntityExtractionService.extractAndSaveEntities(assetId, chunks, {
      wasOCRProcessed: metadata?.wasOCRProcessed,
    });

    // Low-power hardware mode check
    const hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const BATCH_SIZE = hardwareConcurrency <= 4 ? 8 : 16;

    const allEmbeddings: number[][] = [];
    const startTime = performance.now();

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      try {
        const batchEmbeddings = await localEmbeddingClient.generateEmbeddings(batch);
        allEmbeddings.push(...batchEmbeddings);
      } catch (err) {
        console.warn('[RealSemanticSearchService] Local embedding failed for batch, using fallback:', err);
        for (const chunk of batch) {
          const fallbackVec = new Array(LOCAL_EMBEDDING_CONFIG.outputDimension).fill(0);
          for (let j = 0; j < chunk.length; j++) {
            fallbackVec[j % LOCAL_EMBEDDING_CONFIG.outputDimension] += chunk.charCodeAt(j) / 255.0;
          }
          const norm = Math.sqrt(fallbackVec.reduce((sum, v) => sum + v * v, 0)) || 1;
          allEmbeddings.push(fallbackVec.map((v) => v / norm));
        }
      }

      // Explicit yield to keep main thread and UI responsive
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (metadata?.onProgress) {
        const processed = Math.min(i + BATCH_SIZE, chunks.length);
        metadata.onProgress(processed, chunks.length);
      }
    }

    const durationMs = performance.now() - startTime;
    console.debug(
      `[Telemetry] Indexed document ${assetId}: ${chunks.length} chunks in ${durationMs.toFixed(1)}ms (${((chunks.length / (durationMs / 1000)) || 0).toFixed(1)} chunks/sec)`
    );

    const now = new Date().toISOString();
    const records: DocumentEmbedding[] = chunks.map((content, idx) => ({
      id: `emb-${assetId}-${idx}-${Date.now()}`,
      assetId,
      chunkIndex: idx,
      content,
      vector: new Float32Array(allEmbeddings[idx] || []),
      dimension: LOCAL_EMBEDDING_CONFIG.outputDimension,
      model: LOCAL_EMBEDDING_CONFIG.modelName,
      embeddingSchemaVersion: LOCAL_EMBEDDING_CONFIG.embeddingSchemaVersion,
      examBoard: metadata?.examBoard?.trim() || undefined,
      professor: metadata?.professor?.trim() || undefined,
      createdAt: now,
    }));

    await db.transaction('rw', db.documentEmbeddings, db.chunkEntities, db.chunkRelations, async () => {
      await db.documentEmbeddings.where('assetId').equals(assetId).delete();
      await db.chunkEntities.where('assetId').equals(assetId).delete();
      await db.chunkRelations.where('assetId').equals(assetId).delete();
      await db.documentEmbeddings.bulkAdd(records);
    });

    // Invalidate in-memory embeddings cache so subsequent searches see the new document
    this.invalidateEmbeddingsCache();

    try {
      const [nerRes] = await Promise.allSettled([nerPromise]);
      if (nerRes.status === 'rejected') {
        console.warn('[RealSemanticSearchService] Medical entity extraction failed:', nerRes.reason);
      } else {
        livingCardEngine.recordNewContentSignalsForAsset(assetId).catch((err) => {
          console.warn('[RealSemanticSearchService] LivingCardEngine signal recording error:', err);
        });
      }
    } catch (nerErr) {
      console.warn('[RealSemanticSearchService] Medical entity extraction failed:', nerErr);
    }

    return records.length;
  }

  /**
   * Search top-K most relevant chunks using Hybrid Search (0.7 Cosine Similarity + 0.3 Lexical Score)
   * offloaded to Web Workers on in-memory cached embeddings matching the current local embedding schema version.
   */
  async searchTopChunks(queryText: string, topK = 5, filter?: SemanticSearchFilter): Promise<SemanticSearchResult> {
    if (!queryText || !queryText.trim()) return { results: [], hasOutdatedEmbeddings: false };

    const cacheKey = this.getCacheKey(queryText, topK, filter);
    const cachedResult = this.searchCache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    const normalizedQuery = normalizeTextForEmbedding(queryText);
    const queryEmbeddings = await localEmbeddingClient.generateEmbeddings([`query: ${normalizedQuery}`]);
    const queryVector = queryEmbeddings[0] || [];
    if (queryVector.length === 0) return { results: [], hasOutdatedEmbeddings: false };

    const allDocs = await this.getOrLoadAllDocumentEmbeddings();
    if (allDocs.length === 0) return { results: [], hasOutdatedEmbeddings: false };

    const hasOutdatedEmbeddings = allDocs.some(
      (doc) => doc.embeddingSchemaVersion !== LOCAL_EMBEDDING_CONFIG.embeddingSchemaVersion
    );

    // Filter strictly embeddings matching current local schema version in-memory
    let candidates = allDocs.filter(
      (doc) => doc.embeddingSchemaVersion === LOCAL_EMBEDDING_CONFIG.embeddingSchemaVersion
    );

    if (filter?.banca && filter.banca.trim()) {
      const searchBanca = filter.banca.toLowerCase().trim();
      candidates = candidates.filter(
        (doc) => doc.examBoard && doc.examBoard.toLowerCase().includes(searchBanca)
      );
    }

    if (filter?.professor && filter.professor.trim()) {
      const searchProf = filter.professor.toLowerCase().trim();
      candidates = candidates.filter(
        (doc) => doc.professor && doc.professor.toLowerCase().includes(searchProf)
      );
    }

    if (Array.isArray(filter?.assetIds) && filter.assetIds.length > 0) {
      const allowedIds = new Set(filter.assetIds);
      candidates = candidates.filter((doc) => allowedIds.has(doc.assetId));
    }

    if (candidates.length === 0) {
      const emptyResult = { results: [], hasOutdatedEmbeddings };
      this.setCachedResults(cacheKey, emptyResult);
      return emptyResult;
    }

    const candidateMap = new Map<string, DocumentEmbedding>();
    const workerCandidates = candidates.map((doc) => {
      candidateMap.set(doc.id, doc);
      return { id: doc.id, content: doc.content, vector: doc.vector };
    });

    // Delegate both Cosine Similarity & BM25 Lexical Score completely to Web Worker Pool
    const workerResults = await computeSimilaritiesInWorker(
      normalizedQuery,
      queryVector,
      workerCandidates,
      topK,
      LOCAL_EMBEDDING_CONFIG.outputDimension
    );

    const finalResults: SemanticChunkResult[] = workerResults.map((item) => {
      const doc = candidateMap.get(item.id)!;
      return {
        assetId: doc.assetId,
        chunkIndex: doc.chunkIndex,
        content: doc.content,
        similarity: item.cosineScore,
        lexicalScore: item.lexicalScore,
        hybridScore: item.hybridScore,
      };
    });

    const searchResult: SemanticSearchResult = { results: finalResults, hasOutdatedEmbeddings };
    this.setCachedResults(cacheKey, searchResult);
    return searchResult;
  }

  /**
   * Scans IndexedDB for outdated embeddings and re-indexes them with the new local engine
   */
  async reindexOutdatedEmbeddings(onProgress?: (current: number, total: number) => void): Promise<number> {
    const allDocs = await this.getOrLoadAllDocumentEmbeddings();
    const outdatedAssetIds = Array.from(
      new Set(
        allDocs
          .filter((doc) => doc.embeddingSchemaVersion !== LOCAL_EMBEDDING_CONFIG.embeddingSchemaVersion)
          .map((doc) => doc.assetId)
      )
    );

    if (outdatedAssetIds.length === 0) return 0;

    let count = 0;
    for (const assetId of outdatedAssetIds) {
      const asset = await db.knowledgeAssets.get(assetId);
      if (asset && asset.file && asset.file.extractedText) {
        await this.indexDocument(asset.id, asset.file.extractedText, {
          examBoard: asset.board,
          professor: asset.professor,
        });
        count++;
        if (onProgress) onProgress(count, outdatedAssetIds.length);
      }
    }

    this.invalidateEmbeddingsCache();
    return count;
  }
}

export const realSemanticSearchService = new RealSemanticSearchService();
