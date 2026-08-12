/**
 * Medical Knowledge Graph Service
 * Manages aggregated graph edges (graphEdges) and content links (graphContentLinks) in Dexie.
 */

import { db } from '../db/database';
import {
  ExtractedMedicalRelation,
  GraphEdgeRecord,
  GraphContentLinkRecord,
} from '../../domain/entities/ChunkEntity';

export class KnowledgeGraphService {
  /**
   * Aggregates and upserts extracted relations into global graphEdges table
   */
  async upsertGraphEdges(relations: ExtractedMedicalRelation[], assetId: string): Promise<number> {
    if (!relations || relations.length === 0) return 0;

    const now = new Date().toISOString();
    let updatedCount = 0;

    for (const rel of relations) {
      if (!rel.subjectCanonicalKey || !rel.objectCanonicalKey || !rel.predicate) continue;

      const edgeId = `${rel.subjectCanonicalKey}::${rel.predicate}::${rel.objectCanonicalKey}`;
      try {
        const existing = await db.graphEdges.get(edgeId);
        if (existing) {
          const updatedAssetIds = existing.assetIds.includes(assetId)
            ? existing.assetIds
            : [...existing.assetIds, assetId];
          const newMaxConfidence = Math.max(existing.maxConfidence, rel.confidence || 0);

          await db.graphEdges.update(edgeId, {
            occurrenceCount: existing.occurrenceCount + 1,
            maxConfidence: newMaxConfidence,
            assetIds: updatedAssetIds,
            updatedAt: now,
          });
        } else {
          const newEdge: GraphEdgeRecord = {
            id: edgeId,
            subjectCanonicalKey: rel.subjectCanonicalKey,
            predicate: rel.predicate,
            objectCanonicalKey: rel.objectCanonicalKey,
            occurrenceCount: 1,
            maxConfidence: rel.confidence || 0.8,
            assetIds: assetId ? [assetId] : [],
            updatedAt: now,
          };
          await db.graphEdges.put(newEdge);
        }
        updatedCount++;
      } catch (err) {
        console.warn(`[KnowledgeGraphService] Failed to upsert edge ${edgeId}:`, err);
      }
    }

    return updatedCount;
  }

  /**
   * Links generated content (flashcards, questions, knowledge assets) to canonical entity keys
   */
  async linkContentToEntities(
    contentType: 'flashcard' | 'question' | 'knowledgeAsset',
    contentId: string,
    canonicalKeys: string[]
  ): Promise<number> {
    if (!contentId || !canonicalKeys || canonicalKeys.length === 0) return 0;

    const distinctKeys = Array.from(new Set(canonicalKeys.filter(Boolean)));
    const now = new Date().toISOString();

    const records: GraphContentLinkRecord[] = distinctKeys.map((key) => ({
      id: `${key}::${contentType}::${contentId}`,
      canonicalKey: key,
      contentType,
      contentId,
      createdAt: now,
    }));

    try {
      await db.graphContentLinks.bulkPut(records);
      return records.length;
    } catch (err) {
      console.warn(`[KnowledgeGraphService] Failed to link content ${contentId} to entities:`, err);
      return 0;
    }
  }

  /**
   * Retrieves graph neighbors (incoming and outgoing edges) for a given canonical entity key
   */
  async getGraphNeighbors(
    canonicalKey: string
  ): Promise<{ incoming: GraphEdgeRecord[]; outgoing: GraphEdgeRecord[] }> {
    if (!canonicalKey) return { incoming: [], outgoing: [] };

    try {
      const [outgoing, incoming] = await Promise.all([
        db.graphEdges.where('subjectCanonicalKey').equals(canonicalKey).toArray(),
        db.graphEdges.where('objectCanonicalKey').equals(canonicalKey).toArray(),
      ]);
      return { incoming, outgoing };
    } catch (err) {
      console.warn(`[KnowledgeGraphService] Failed to fetch neighbors for ${canonicalKey}:`, err);
      return { incoming: [], outgoing: [] };
    }
  }

  /**
   * Retrieves all content links (flashcards, questions, assets) associated with a canonical entity key
   */
  async getContentForEntity(canonicalKey: string): Promise<GraphContentLinkRecord[]> {
    if (!canonicalKey) return [];

    try {
      return await db.graphContentLinks.where('canonicalKey').equals(canonicalKey).toArray();
    } catch (err) {
      console.warn(`[KnowledgeGraphService] Failed to fetch content links for ${canonicalKey}:`, err);
      return [];
    }
  }

  /**
   * Removes all content links associated with a deleted content item (question, flashcard, document, knowledgeAsset)
   */
  async pruneOrphanedLinks(
    contentType: 'question' | 'flashcard' | 'document' | 'knowledgeAsset',
    contentId: string
  ): Promise<number> {
    if (!contentType || !contentId) return 0;

    try {
      const links = await db.graphContentLinks
        .where('contentType')
        .equals(contentType)
        .and((l) => l.contentId === contentId)
        .toArray();

      if (links.length > 0) {
        const linkIds = links.map((l) => l.id);
        await db.graphContentLinks.bulkDelete(linkIds);
      }
      return links.length;
    } catch (err) {
      console.warn(`[KnowledgeGraphService] Failed to prune links for ${contentType}:${contentId}:`, err);
      return 0;
    }
  }

  /**
   * Sweeps graphContentLinks and graphEdges, pruning orphaned links and unused edges
   */
  async cleanupObsoleteGraphEdges(): Promise<{ edgesRemoved: number; linksRemoved: number }> {
    let linksRemoved = 0;
    let edgesRemoved = 0;

    try {
      // 1. Fetch all graphContentLinks and existing content IDs in DB
      const allLinks = await db.graphContentLinks.toArray();
      const [questions, cards, assets] = await Promise.all([
        db.questions.toArray(),
        db.flashcards.toArray(),
        db.knowledgeAssets.toArray(),
      ]);

      const questionIds = new Set(questions.map((q) => q.id));
      const cardIds = new Set(cards.map((c) => c.id));
      const assetIds = new Set(assets.map((a) => a.id));

      const orphanLinkIds: string[] = [];
      const validCanonicalKeys = new Set<string>();

      for (const link of allLinks) {
        let exists = false;
        if (link.contentType === 'question') {
          exists = questionIds.has(link.contentId);
        } else if (link.contentType === 'flashcard') {
          exists = cardIds.has(link.contentId);
        } else if (link.contentType === 'knowledgeAsset' || (link.contentType as string) === 'document') {
          exists = assetIds.has(link.contentId);
        } else {
          exists = true;
        }

        if (!exists) {
          orphanLinkIds.push(link.id);
        } else {
          validCanonicalKeys.add(link.canonicalKey);
        }
      }

      if (orphanLinkIds.length > 0) {
        await db.graphContentLinks.bulkDelete(orphanLinkIds);
        linksRemoved = orphanLinkIds.length;
      }

      // 2. Fetch all graphEdges and remove those without any active source asset AND without any content links
      const allEdges = await db.graphEdges.toArray();
      const obsoleteEdgeIds: string[] = [];

      for (const edge of allEdges) {
        const hasSourceAsset = Array.isArray(edge.assetIds) && edge.assetIds.some((id) => assetIds.has(id));
        const hasSubjectLink = validCanonicalKeys.has(edge.subjectCanonicalKey);
        const hasObjectLink = validCanonicalKeys.has(edge.objectCanonicalKey);

        if (!hasSourceAsset && !hasSubjectLink && !hasObjectLink) {
          obsoleteEdgeIds.push(edge.id);
        }
      }

      if (obsoleteEdgeIds.length > 0) {
        await db.graphEdges.bulkDelete(obsoleteEdgeIds);
        edgesRemoved = obsoleteEdgeIds.length;
      }
    } catch (err) {
      console.warn('[KnowledgeGraphService] Failed to cleanup obsolete graph edges:', err);
    }

    return { edgesRemoved, linksRemoved };
  }
}

export const knowledgeGraphService = new KnowledgeGraphService();
