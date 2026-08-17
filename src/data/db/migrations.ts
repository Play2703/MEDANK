import Dexie from 'dexie';
import {
  SCHEMAS_V1,
  SCHEMAS_V2,
  SCHEMAS_V3,
  SCHEMAS_V4,
  SCHEMAS_V5,
  SCHEMAS_V6,
  SCHEMAS_V7,
  SCHEMAS_V8,
  SCHEMAS_V9,
  SCHEMAS_V10,
  SCHEMAS_V11,
  SCHEMAS_V12,
  SCHEMAS_V13,
  SCHEMAS_V14,
  SCHEMAS_V15,
  SCHEMAS_V16,
} from './schema';


/**
 * Migration Manager for MedAnki Local Database
 * Handles schema upgrades, index rebuilding, and data integrity checks
 */
export function applyDatabaseMigrations(db: Dexie): void {
  // Version 1: Initial schema setup
  db.version(1).stores(SCHEMAS_V1);

  // Version 2: Add compound index for card repetition queries & pagination optimization
  db.version(2).stores(SCHEMAS_V2).upgrade(async (trans) => {
    console.log('[MedAnki Migration] Upgrading database to Version 2...');
    const cardsTable = trans.table('flashcards');
    await cardsTable.toCollection().modify((card) => {
      if (!card.sm2State) {
        card.sm2State = {
          interval: 0,
          repetition: 0,
          easeFactor: 2.5,
          dueDate: new Date().toISOString(),
        };
      }
    });
  });

  // Version 3: Add High-Yield compound index & Study History index
  db.version(3).stores(SCHEMAS_V3).upgrade(async (trans) => {
    console.log('[MedAnki Migration] Upgrading database to Version 3 for 500k+ Flashcard support...');
    const cardsTable = trans.table('flashcards');
    await cardsTable.toCollection().modify((card) => {
      if (card.highYield === undefined) {
        card.highYield = false;
      }
    });
  });

  // Version 4: Add Questions Module tables
  db.version(4).stores(SCHEMAS_V4).upgrade(async () => {
    console.log('[MedAnki Migration] Upgrading database to Version 4 for Questions Module...');
  });

  // Version 5: Unified MedCore KnowledgeAssets Table
  db.version(5).stores(SCHEMAS_V5).upgrade(async () => {
    console.log('[MedAnki Migration] Upgrading database to Version 5 for KnowledgeAssets...');
  });

  // Version 6: Real Document Embeddings Table for Semantic Search
  db.version(6).stores(SCHEMAS_V6).upgrade(async () => {
    console.log('[MedAnki Migration] Upgrading database to Version 6 for Real Document Embeddings...');
  });

  // Version 7: Chunk Medical Entities Table for NER (CID-10 & SNOMED CT)
  db.version(7).stores(SCHEMAS_V7).upgrade(async () => {
    console.log('[MedAnki Migration] Upgrading database to Version 7 for Chunk Medical Entities (NER)...');
  });

  // Version 8: Chunk Clinical Relations Table & Text Normalized Entities
  db.version(8).stores(SCHEMAS_V8).upgrade(async () => {
    console.log('[MedAnki Migration] Upgrading database to Version 8 for Chunk Clinical Relations (NER)...');
  });

  // Version 9: Canonical Entity Index & Medical Knowledge Graph (graphEdges & graphContentLinks)
  db.version(9).stores(SCHEMAS_V9).upgrade(async () => {
    console.log('[MedAnki Migration] Upgrading database to Version 9 for Canonical Entity Index & Knowledge Graph...');
  });

  // Version 10: Question Embeddings Table for Deduplication & Similarity Engine
  db.version(10).stores(SCHEMAS_V10).upgrade(async () => {
    console.log('[MedAnki Migration] Upgrading database to Version 10 for Question Embeddings...');
  });

  // Version 11: Card Signals & Pending Suggestions Tables for Living Cards
  db.version(11).stores(SCHEMAS_V11).upgrade(async () => {
    console.log('[MedAnki Migration] Upgrading database to Version 11 for Living Cards (cardSignals & cardPendingSuggestions)...');
  });

  // Version 12: Notes Module (Study Notes + AI Chat)
  db.version(12).stores(SCHEMAS_V12).upgrade(async () => {
    console.log('[MedAnki Migration] Upgrading database to Version 12 for Notes Module (Study Notes + AI Chat)...');
  });

  // Version 13: Entity Embeddings Table for Semantic Distractors & Hybrid Graph Retrieval
  db.version(13).stores(SCHEMAS_V13).upgrade(async () => {
    console.log('[MedAnki Migration] Upgrading database to Version 13 for Entity Embeddings...');
  });

  // Version 14: Unify questionBank into residencyExam category
  db.version(14).stores(SCHEMAS_V14).upgrade(async (trans) => {
    console.log('[MedAnki Migration] Upgrading database to Version 14: Unify questionBank into residencyExam category...');
    const assetsTable = trans.table('knowledgeAssets');
    await assetsTable.toCollection().modify((asset: any) => {
      if (asset.category === 'questionBank') {
        asset.category = 'residencyExam';
      }
    });
  });

  // Version 15: Extracted Exam Questions Table for Distractor Engine & Banca DNA
  db.version(15).stores(SCHEMAS_V15).upgrade(async () => {
    console.log('[MedAnki Migration] Upgrading database to Version 15 for Extracted Exam Questions...');
  });

  // Version 16: Knowledge Asset Binary Files Storage (for raw exam PDFs)
  db.version(16).stores(SCHEMAS_V16).upgrade(async () => {
    console.log('[MedAnki Migration] Upgrading database to Version 16 for Knowledge Asset Binary Files...');
  });
}

