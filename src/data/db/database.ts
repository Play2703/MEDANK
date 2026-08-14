import Dexie, { Table } from 'dexie';
import { DB_NAME } from './schema';
import { applyDatabaseMigrations } from './migrations';
import { Folder } from '../../domain/entities/Folder';
import { Deck } from '../../domain/entities/Deck';
import { FlashCard } from '../../domain/entities/Card';
import { Tag } from '../../domain/entities/Tag';
import { ReviewLog, DeckStats } from '../../domain/entities/StudySession';
import { ProfessorProfile, ExamProfile, QuestionSet, Question } from '../../domain/entities/Question';
import { KnowledgeAsset } from '../../domain/entities/KnowledgeAsset';
import { DocumentEmbedding } from '../../domain/entities/DocumentEmbedding';
import {
  ChunkEntityRecord,
  ChunkRelationRecord,
  CanonicalEntityIndexRecord,
  GraphEdgeRecord,
  GraphContentLinkRecord,
} from '../../domain/entities/ChunkEntity';

import { CardSignalRecord, CardPendingSuggestionRecord } from '../../domain/entities/LivingCard';
import { Note } from '../../domain/entities/Note';

export class MedAnkiDexieDB extends Dexie {
  folders!: Table<Folder, string>;
  decks!: Table<Deck, string>;
  flashcards!: Table<FlashCard, string>;
  tags!: Table<Tag, string>;
  revisionStats!: Table<DeckStats, string>;
  studyHistory!: Table<ReviewLog, string>;
  professorProfiles!: Table<ProfessorProfile, string>;
  examProfiles!: Table<ExamProfile, string>;
  questionSets!: Table<QuestionSet, string>;
  questions!: Table<Question, string>;
  knowledgeAssets!: Table<KnowledgeAsset, string>;
  documentEmbeddings!: Table<DocumentEmbedding, string>;
  chunkEntities!: Table<ChunkEntityRecord, string>;
  chunkRelations!: Table<ChunkRelationRecord, string>;
  canonicalEntityIndex!: Table<CanonicalEntityIndexRecord, string>;
  graphEdges!: Table<GraphEdgeRecord, string>;
  graphContentLinks!: Table<GraphContentLinkRecord, string>;
  questionEmbeddings!: Table<{ id: string; questionId: string; specialty: string; topic: string; embedding: number[]; createdAt: string }, string>;
  cardSignals!: Table<CardSignalRecord, string>;
  cardPendingSuggestions!: Table<CardPendingSuggestionRecord, string>;
  notes!: Table<Note, string>;
  entityEmbeddings!: Table<{ canonicalKey: string; embedding: number[]; updatedAt: string }, string>;


  constructor() {
    super(DB_NAME);
    applyDatabaseMigrations(this);
  }

  /**
   * Optimized Chunked Bulk Insert / Upsert for Flashcards
   */
  async bulkSaveCardsInChunks(cards: FlashCard[], chunkSize = 5000): Promise<void> {
    for (let i = 0; i < cards.length; i += chunkSize) {
      const chunk = cards.slice(i, i + chunkSize);
      await this.transaction('rw', this.flashcards, async () => {
        await this.flashcards.bulkPut(chunk);
      });
    }
  }

  /**
   * Fast indexed pagination query for large card sets
   */
  async getCardsPaginated(deckId: string, page = 1, pageSize = 50): Promise<{ items: FlashCard[]; total: number }> {
    const collection = this.flashcards.where('deckId').equals(deckId);
    const total = await collection.count();
    const items = await collection
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    return { items, total };
  }
}

export const db = new MedAnkiDexieDB();
