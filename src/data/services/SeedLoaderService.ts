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
   * Fetches static JSON assets from public/seed-data/ and populates Dexie tables via bulkPut
   */
  async loadSeedBundle(onProgress?: (info: SeedProgressInfo) => void): Promise<boolean> {
    const needed = await this.isSeedNeeded();
    if (!needed) {
      console.log('[SeedLoaderService] Seed loading skipped: user already has assets or seed flag set.');
      return false;
    }

    try {
      onProgress?.({ stage: 'Iniciando download do pacote base...', percent: 5 });

      const fetchJson = async <T>(filename: string): Promise<T[]> => {
        const res = await fetch(`/seed-data/${filename}`);
        if (!res.ok) {
          throw new Error(`Failed to fetch /seed-data/${filename} (${res.status})`);
        }
        return await res.json();
      };

      onProgress?.({ stage: 'Baixando materiais de referência...', percent: 15 });
      const assets = await fetchJson<KnowledgeAsset>('knowledge-assets.json');

      onProgress?.({ stage: 'Baixando embeddings semânticos...', percent: 35 });
      const embeddings = await fetchJson<DocumentEmbedding>('document-embeddings.json');

      onProgress?.({ stage: 'Baixando entidades clínicas (NER)...', percent: 55 });
      const chunkEntities = await fetchJson<ChunkEntityRecord>('chunk-entities.json');
      const chunkRelations = await fetchJson<ChunkRelationRecord>('chunk-relations.json');

      onProgress?.({ stage: 'Baixando grafo de conhecimento...', percent: 75 });
      const canonicalEntities = await fetchJson<CanonicalEntityIndexRecord>('canonical-entity-index.json');
      const graphEdges = await fetchJson<GraphEdgeRecord>('graph-edges.json');

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

      console.log(`[SeedLoaderService] Seed bundle successfully loaded: ${assets.length} assets, ${embeddings.length} embeddings.`);
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
