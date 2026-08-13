/**
 * Seed Loader Service
 * Loads pre-processed static seed bundle from public/seed-data/ into Dexie IndexedDB
 * ONLY on user confirmation and when user has 0 existing knowledgeAssets.
 */

import { db } from '../db/database';
import { KnowledgeAsset } from '../../domain/entities/KnowledgeAsset';
import { DocumentEmbedding } from '../../domain/entities/DocumentEmbedding';
import {
  ChunkEntityRecord,
  ChunkRelationRecord,
  CanonicalEntityIndexRecord,
  GraphEdgeRecord,
} from '../../domain/entities/ChunkEntity';

const SEED_STORAGE_KEY = 'MEDANKI_SEED_LOADED_VERSION';
const CURRENT_SEED_VERSION = '1.0.0';
const LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/';

export interface SeedProgressInfo {
  stage: string;
  percent: number;
}

export class SeedLoaderService {
  /**
   * Checks whether seed bundle loading prompt should be presented to the user
   */
  async isSeedNeeded(): Promise<boolean> {
    try {
      const isAlreadyLoaded =
        typeof localStorage !== 'undefined' && localStorage.getItem(SEED_STORAGE_KEY) === CURRENT_SEED_VERSION;
      if (isAlreadyLoaded) return false;

      const existingAssetCount = await db.knowledgeAssets.count();
      return existingAssetCount === 0;
    } catch (err) {
      console.warn('[SeedLoaderService] Error checking if seed is needed:', err);
      return false;
    }
  }

  /**
   * Helper to fetch plain JSON files, checking for Git LFS pointer.
   */
  private async fetchSeedJson<T>(filename: string): Promise<T[]> {
    const res = await fetch(`/seed-data/${filename}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch /seed-data/${filename} (${res.status})`);
    }
    const text = await res.text();
    if (text.startsWith(LFS_POINTER_PREFIX)) {
      throw new Error(`File /seed-data/${filename} is an unresolved Git LFS pointer text`);
    }
    return JSON.parse(text);
  }

  /**
   * Helper to fetch .gz compressed JSON files using native DecompressionStream.
   */
  private async fetchGzSeedJson<T>(filename: string): Promise<T[]> {
    const res = await fetch(`/seed-data/${filename}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch /seed-data/${filename} (${res.status})`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Check if raw array buffer is a Git LFS pointer text
    const headerSnippet = new TextDecoder().decode(uint8Array.slice(0, 100));
    if (headerSnippet.startsWith(LFS_POINTER_PREFIX)) {
      throw new Error(`File /seed-data/${filename} is an unresolved Git LFS pointer text`);
    }

    let text: string;
    if (uint8Array.length >= 2 && uint8Array[0] === 0x1f && uint8Array[1] === 0x8b) {
      // Native DecompressionStream decompression
      const blob = new Blob([arrayBuffer]);
      const decompressedStream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
      const decompressedResponse = new Response(decompressedStream);
      text = await decompressedResponse.text();
    } else {
      // Fallback for raw text / JSON in test mocks
      text = new TextDecoder().decode(arrayBuffer);
    }

    if (text.startsWith(LFS_POINTER_PREFIX)) {
      throw new Error(`File /seed-data/${filename} is an unresolved Git LFS pointer text`);
    }

    return JSON.parse(text);
  }

  /**
   * Fetches static JSON assets from public/seed-data/ and populates Dexie tables via bulkPut
   */
  async loadSeedBundle(onProgress?: (info: SeedProgressInfo) => void): Promise<boolean> {
    const needed = await this.isSeedNeeded();
    if (!needed) {
      console.log('[SeedLoaderService] Seed loading skipped: user already has assets or seed flag set.');
      return false;
    }

    const failedFiles: string[] = [];

    try {
      onProgress?.({ stage: 'Iniciando download do pacote base...', percent: 5 });

      // 1. knowledge-assets.json (FATAL if fails)
      onProgress?.({ stage: 'Baixando materiais de referência...', percent: 15 });
      let assets: KnowledgeAsset[] = [];
      try {
        assets = await this.fetchSeedJson<KnowledgeAsset>('knowledge-assets.json');
      } catch (err) {
        console.error('[SeedLoaderService] FATAL: Failed to fetch knowledge-assets.json:', err);
        throw new Error(`Erro fatal ao carregar materiais de referência (knowledge-assets.json): ${err instanceof Error ? err.message : String(err)}`);
      }

      // 2. document-embeddings.json.gz (Non-fatal)
      onProgress?.({ stage: 'Baixando embeddings semânticos...', percent: 35 });
      let embeddings: DocumentEmbedding[] = [];
      try {
        embeddings = await this.fetchGzSeedJson<DocumentEmbedding>('document-embeddings.json.gz');
      } catch (err) {
        failedFiles.push('document-embeddings.json.gz');
        console.warn('[SeedLoaderService] Falha ao carregar document-embeddings.json.gz:', err);
      }

      // 3. chunk-entities.json (Non-fatal)
      onProgress?.({ stage: 'Baixando entidades clínicas (NER)...', percent: 55 });
      let chunkEntities: ChunkEntityRecord[] = [];
      try {
        chunkEntities = await this.fetchSeedJson<ChunkEntityRecord>('chunk-entities.json');
      } catch (err) {
        failedFiles.push('chunk-entities.json');
        console.warn('[SeedLoaderService] Falha ao carregar chunk-entities.json:', err);
      }

      // 4. chunk-relations.json (Non-fatal)
      let chunkRelations: ChunkRelationRecord[] = [];
      try {
        chunkRelations = await this.fetchSeedJson<ChunkRelationRecord>('chunk-relations.json');
      } catch (err) {
        failedFiles.push('chunk-relations.json');
        console.warn('[SeedLoaderService] Falha ao carregar chunk-relations.json:', err);
      }

      // 5. canonical-entity-index.json (Non-fatal)
      onProgress?.({ stage: 'Baixando grafo de conhecimento...', percent: 75 });
      let canonicalEntities: CanonicalEntityIndexRecord[] = [];
      try {
        canonicalEntities = await this.fetchSeedJson<CanonicalEntityIndexRecord>('canonical-entity-index.json');
      } catch (err) {
        failedFiles.push('canonical-entity-index.json');
        console.warn('[SeedLoaderService] Falha ao carregar canonical-entity-index.json:', err);
      }

      // 6. graph-edges.json (Non-fatal)
      let graphEdges: GraphEdgeRecord[] = [];
      try {
        graphEdges = await this.fetchSeedJson<GraphEdgeRecord>('graph-edges.json');
      } catch (err) {
        failedFiles.push('graph-edges.json');
        console.warn('[SeedLoaderService] Falha ao carregar graph-edges.json:', err);
      }

      if (failedFiles.length > 0) {
        console.warn(`[SeedLoaderService] Carregamento parcial do seed concluído. Arquivos com falha: ${failedFiles.join(', ')}`);
      }

      onProgress?.({ stage: 'Gravando dados na biblioteca local...', percent: 85 });

      await db.transaction(
        'rw',
        [
          db.knowledgeAssets,
          db.documentEmbeddings,
          db.chunkEntities,
          db.chunkRelations,
          db.canonicalEntityIndex,
          db.graphEdges,
        ],
        async () => {
          if (assets.length > 0) await db.knowledgeAssets.bulkPut(assets);
          if (embeddings.length > 0) await db.documentEmbeddings.bulkPut(embeddings);
          if (chunkEntities.length > 0) await db.chunkEntities.bulkPut(chunkEntities);
          if (chunkRelations.length > 0) await db.chunkRelations.bulkPut(chunkRelations);
          if (canonicalEntities.length > 0) await db.canonicalEntityIndex.bulkPut(canonicalEntities);
          if (graphEdges.length > 0) await db.graphEdges.bulkPut(graphEdges);
        }
      );

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SEED_STORAGE_KEY, CURRENT_SEED_VERSION);
      }
      onProgress?.({ stage: 'Biblioteca base pronta!', percent: 100 });

      console.log(
        `[SeedLoaderService] Seed bundle successfully loaded: ${assets.length} assets, ${embeddings.length} embeddings.`
      );
      return true;
    } catch (err) {
      console.error('[SeedLoaderService] Failed to load seed bundle:', err);
      throw err;
    }
  }

  /**
   * Dismisses the seed prompt without loading, setting the flag so it won't ask again
   */
  dismissSeedPrompt(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SEED_STORAGE_KEY, CURRENT_SEED_VERSION);
    }
  }
}

export const seedLoaderService = new SeedLoaderService();
