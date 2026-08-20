/**
 * SegmentationSyncBridge
 *
 * Bridges extracted exam questions and knowledge asset segmentation stats
 * between Dexie/IndexedDB and native SQLite, ensuring data is available
 * on both web and mobile (Capacitor) platforms.
 *
 * Problem:
 * - Web saves to Dexie (IndexedDB)
 * - Mobile saves to native SQLite
 * - KnowledgeAsset examSegmentationStats saved to Dexie but NOT to native SQLite
 * - No cross-platform sync mechanism exists
 *
 * This utility ensures dual-write to both storage backends.
 */

import { Capacitor } from '@capacitor/core';
import { db } from '../../../data/db/database';
import {
  nativeSQLiteService,
  CachedKnowledgeAssetRow,
  CachedExtractedExamQuestionRow,
} from '../../../lib/core/services/NativeSQLiteService';
import { ExtractedExamQuestionRecord } from '../../../domain/entities/Question';
import { KnowledgeAsset } from '../../../domain/entities/KnowledgeAsset';

export class SegmentationSyncBridge {

  /**
   * Synchronizes extracted exam questions to the ALTERNATE storage backend.
   * On mobile: writes to Dexie (since OfflineFirst writes to native SQLite).
   * On web: optionally writes to native SQLite if Capacitor available.
   */
  static async syncExtractedQuestions(
    sourceAssetId: string,
    questions: ExtractedExamQuestionRecord[]
  ): Promise<void> {
    if (!sourceAssetId || !questions || questions.length === 0) return;

    const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

    if (isNative) {
      // On mobile: extracted questions go to native SQLite via OfflineFirst...
      // We MUST also write to Dexie for ExamRepository/UI consistency.
      try {
        await db.extractedExamQuestions
          .where('sourceAssetId')
          .equals(sourceAssetId)
          .delete();

        for (const q of questions) {
          await db.extractedExamQuestions.put(q);
        }
      } catch (err) {
        console.warn('[SegmentationSyncBridge] Failed to sync to Dexie:', err);
      }
    } else {
      // On web: try writing to native SQLite as secondary store (if available)
      if (typeof Capacitor !== 'undefined') {
        try {
          await nativeSQLiteService.initialize();
        } catch { /* Capacitor plugin not available */ }

        try {
          const rows: CachedExtractedExamQuestionRow[] = questions.map((q) => ({
            id: q.id,
            source_asset_id: q.sourceAssetId || null,
            question_number: q.questionNumber,
            statement: q.statement,
            options_json: JSON.stringify(q.options || []),
            correct_letter: q.correctLetter || null,
            specialty: q.specialty || null,
            confidence: q.confidence as 'high' | 'medium' | 'low',
            created_at: q.createdAt,
          }));
          await nativeSQLiteService.bulkInsertExtractedExamQuestions(rows);
        } catch {
          // Native SQLite not available on pure web - expected
        }
      }
    }
  }

  /**
   * Synchronizes a KnowledgeAsset (including examSegmentationStats)
   * between Dexie and native SQLite.
   */
  static async syncKnowledgeAsset(asset: KnowledgeAsset): Promise<void> {
    if (!asset || !asset.id) return;

    const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

    if (isNative) {
      // On mobile: save asset metadata (incl. segmentation stats) to native SQLite
      try {
        const row: CachedKnowledgeAssetRow = {
          id: asset.id,
          title: asset.title || '',
          category: String(asset.category || ''),
          subcategory: asset.subcategory || '',
          institution: asset.institution || '',
          board: asset.board || null,
          professor: asset.professor || null,
          discipline: asset.discipline || '',
          specialty: asset.specialty || '',
          year: asset.year || new Date().getFullYear(),
          semester: asset.semester || '',
          tags_json: JSON.stringify(asset.tags || []),
          metadata_json: JSON.stringify(asset.metadata || {}),
          processing_status: asset.processingStatus || 'completed',
          created_at: asset.createdAt || new Date().toISOString(),
          updated_at: asset.updatedAt || new Date().toISOString(),
        };
        await nativeSQLiteService.upsertCachedKnowledgeAsset(row);
      } catch (err) {
        console.warn('[SegmentationSyncBridge] Failed to sync asset to native SQLite:', err);
      }
    } else {
      // On web: try writing to native SQLite if Capacitor plugin available
      if (typeof Capacitor !== 'undefined') {
        try { await nativeSQLiteService.initialize(); } catch {}
        try {
          const row: CachedKnowledgeAssetRow = {
            id: asset.id,
            title: asset.title || '',
            category: String(asset.category || ''),
            subcategory: asset.subcategory || '',
            institution: asset.institution || '',
            board: asset.board || null,
            professor: asset.professor || null,
            discipline: asset.discipline || '',
            specialty: asset.specialty || '',
            year: asset.year || new Date().getFullYear(),
            semester: asset.semester || '',
            tags_json: JSON.stringify(asset.tags || []),
            metadata_json: JSON.stringify(asset.metadata || {}),
            processing_status: asset.processingStatus || 'completed',
            created_at: asset.createdAt || new Date().toISOString(),
            updated_at: asset.updatedAt || new Date().toISOString(),
          };
          await nativeSQLiteService.upsertCachedKnowledgeAsset(row);
        } catch {
          // Native SQLite not available - expected in pure web environment
        }
      }
    }
  }
}