import { db } from '../db/database';
import { Deck } from '../../domain/entities/Deck';
import { FlashCard } from '../../domain/entities/Card';
import { Question, ExamProfile } from '../../domain/entities/Question';
import { Folder } from '../../domain/entities/Folder';
import { Tag } from '../../domain/entities/Tag';
import { KnowledgeAsset, ProcessingStatus } from '../../domain/entities/KnowledgeAsset';
import { KnowledgeCategory, KnowledgeCategoryMapper } from '../../core/medcore_kernel/ontology/KnowledgeCategoryMapper';
import { medKnowledgeEventBus } from '../../core/events/MedKnowledgeEventBus';
import { calculateSM2, createInitialSM2State, ReviewRating } from '../../core/algorithm/sm2';
import { medKnowledgeService, GenerateQuestionsParams, CloneExamStyleParams } from '../services/medKnowledgeService';

import { SegmentationSyncBridge } from '../../core/exam_bank/services/SegmentationSyncBridge';
import { realSemanticSearchService } from '../services/RealSemanticSearchService';

export class MedKnowledgeRepository {
  private listeners: Set<() => void> = new Set();
  private inMemoryAssets: KnowledgeAsset[] = [];
  private readonly STORAGE_KEY = 'medcore_knowledge_assets_backup';

  constructor() {
    this.inMemoryAssets = this.loadFromLocalStorage();
    // Subscribe to event bus for reactive observer updates
    medKnowledgeEventBus.subscribe(() => {
      this.notify();
    });
  }

  private saveToLocalStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.inMemoryAssets));
    } catch (err) {
      console.warn('[MedKnowledgeRepository] Failed to save to localStorage:', err);
    }
  }

  private loadFromLocalStorage(): KnowledgeAsset[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn('[MedKnowledgeRepository] Failed to load from localStorage:', err);
    }
    return [];
  }

  async recoverFromLocalStorage(): Promise<number> {
    const localAssets = this.loadFromLocalStorage();
    if (localAssets.length > 0) {
      try {
        await db.knowledgeAssets.bulkPut(localAssets);
      } catch (e) {
        console.warn('[MedKnowledgeRepository] Failed to recover assets to IndexedDB:', e);
      }
      this.inMemoryAssets = localAssets;
      this.notify();
      return localAssets.length;
    }
    return 0;
  }

  // Observer Pattern
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => {
      try {
        l();
      } catch (err) {
        console.error('[MedKnowledgeRepository] Listener notification error:', err);
      }
    });
  }



  // --- KNOWLEDGE ASSET OPERATIONS (MEDCORE UNIFIED SOURCE OF TRUTH) ---

  async getAssets(): Promise<KnowledgeAsset[]> {
    try {
      const dbAssets = await db.knowledgeAssets.toArray();
      if (dbAssets && dbAssets.length > 0) {
        this.inMemoryAssets = dbAssets;
        this.saveToLocalStorage();
        return dbAssets;
      }
    } catch (e) {}

    const localAssets = this.loadFromLocalStorage();
    if (localAssets && localAssets.length > 0) {
      this.inMemoryAssets = localAssets;
      return localAssets;
    }

    return this.inMemoryAssets;
  }

  async getAssetById(id: string): Promise<KnowledgeAsset | undefined> {
    try {
      const asset = await db.knowledgeAssets.get(id);
      if (asset) return asset;
    } catch (e) {}
    const inMem = this.inMemoryAssets.find((a) => a.id === id || a.uuid === id);
    if (inMem) return inMem;
    const localAssets = this.loadFromLocalStorage();
    return localAssets.find((a) => a.id === id || a.uuid === id);
  }

  async getAssetsByCategory(category: KnowledgeCategory): Promise<KnowledgeAsset[]> {
    const all = await this.getAssets();
    return all.filter((a) => a.category === category);
  }

  async saveAsset(asset: KnowledgeAsset): Promise<KnowledgeAsset> {
    const existing = await this.getAssetById(asset.id);
    const now = new Date().toISOString();
    const updatedAsset: KnowledgeAsset = {
      ...asset,
      updatedAt: now,
      createdAt: asset.createdAt || now,
    };

    const idx = this.inMemoryAssets.findIndex((a) => a.id === asset.id || a.uuid === asset.uuid);
    if (idx >= 0) {
      this.inMemoryAssets[idx] = updatedAsset;
    } else {
      this.inMemoryAssets.push(updatedAsset);
    }

    try {
      await db.knowledgeAssets.put(updatedAsset);
      // Bridge sync to native SQLite when on mobile (ensures segmentation stats are available)
      SegmentationSyncBridge.syncKnowledgeAsset(updatedAsset).catch(function(e: any) {
        console.trace("[MedKnowledgeRepository] Bridge sync warning (non-fatal):", e);
      });
      this.saveToLocalStorage();
    } catch (e) {
      this.saveToLocalStorage();
    }

    if (!existing) {
      medKnowledgeEventBus.emit('KnowledgeCreated', updatedAsset);
    } else {
      if (existing.category !== updatedAsset.category) {
        medKnowledgeEventBus.emit('KnowledgeCategoryChanged', updatedAsset, existing.category);
      }
      medKnowledgeEventBus.emit('KnowledgeUpdated', updatedAsset);
    }

    this.notify();
    return updatedAsset;
  }

  async deleteAsset(id: string): Promise<boolean> {
    const existing = await this.getAssetById(id);
    if (!existing) return false;

    this.inMemoryAssets = this.inMemoryAssets.filter((a) => a.id !== id && a.uuid !== id);
    this.saveToLocalStorage();

    try {
      await db.knowledgeAssets.delete(id);
      await db.knowledgeAssetFiles.delete(id);
    } catch (e) {}

    medKnowledgeEventBus.emit('KnowledgeDeleted', existing);
    this.notify();
    return true;
  }

  async getRawAssetFileBlob(assetId: string): Promise<Blob | null> {
    try {
      const record = await db.knowledgeAssetFiles.get(assetId);
      if (record && record.blob) {
        return record.blob;
      }
    } catch (err) {
      console.warn(`[MedKnowledgeRepository] Failed to retrieve raw file blob for ${assetId}:`, err);
    }
    return null;
  }

  async saveRawAssetFileBlob(assetId: string, blob: Blob, mimeType = 'application/pdf'): Promise<boolean> {
    try {
      await db.knowledgeAssetFiles.put({
        id: assetId,
        assetId,
        blob,
        mimeType,
        createdAt: new Date().toISOString(),
      });

      const asset = await this.getAssetById(assetId);
      if (asset) {
        asset.file.hasRawFileBlob = true;
        asset.file.rawFileStorageKey = assetId;
        await this.saveAsset(asset);
      }
      return true;
    } catch (err) {
      console.warn(`[MedKnowledgeRepository] Failed to save raw file blob for ${assetId}:`, err);
      return false;
    }
  }

  async importAsset(params: {
    title: string;
    category?: KnowledgeCategory;
    subcategory?: string;
    discipline?: string;
    specialty?: string;
    author?: string;
    institution?: string;
    board?: string;
    professor?: string;
    year?: number;
    semester?: string;
    tags?: string[];
    metadata?: Record<string, any>;
    file: { name: string; url?: string; size?: number; type?: string; extension?: string; extractedText?: string; rawFileStorageKey?: string; hasRawFileBlob?: boolean };
    rawFile?: Blob | File | ArrayBuffer | null;
    thumbnail?: string;
  }): Promise<KnowledgeAsset> {
    const now = new Date().toISOString();
    const id = `asset-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const category = params.category || KnowledgeCategoryMapper.fromFileName(params.file.name);

    // TAREFA 0: Persistir arquivo PDF original APENAS para residencyExam e professorExam
    const isExamCategory =
      category === KnowledgeCategory.residencyExam || category === KnowledgeCategory.professorExam;

    if (isExamCategory && params.rawFile) {
      let fileBlob: Blob | null = null;
      if (params.rawFile instanceof Blob) {
        fileBlob = params.rawFile;
      } else if (params.rawFile instanceof ArrayBuffer) {
        fileBlob = new Blob([params.rawFile], { type: params.file.type || 'application/pdf' });
      }

      if (fileBlob) {
        try {
          await db.knowledgeAssetFiles.put({
            id,
            assetId: id,
            blob: fileBlob,
            mimeType: params.file.type || 'application/pdf',
            createdAt: now,
          });
          params.file.hasRawFileBlob = true;
          params.file.rawFileStorageKey = id;
        } catch (fileErr) {
          console.warn(`[MedKnowledgeRepository] Failed to store raw PDF blob for ${id}:`, fileErr);
        }
      }
    }

    const asset: KnowledgeAsset = {
      id,
      uuid: id,
      title: params.title || params.file.name.replace(/\.[^/.]+$/, ''),
      category,
      subcategory: params.subcategory || 'Geral',
      discipline: params.discipline || params.specialty || 'Medicina Geral',
      specialty: params.specialty || 'Geral',
      author: params.author || 'MedCore System',
      institution: params.institution || 'MedAnki',
      board: params.board ? params.board.trim() : undefined,
      professor: params.professor ? params.professor.trim() : undefined,
      year: params.year || new Date().getFullYear(),
      semester: params.semester || '1º Semestre',
      tags: params.tags || [KnowledgeCategoryMapper.toDisplayName(category), 'Import Center'],
      metadata: params.metadata || {},
      file: params.file,
      thumbnail: params.thumbnail,
      createdAt: now,
      updatedAt: now,
      processingStatus: 'completed',
    };

    const saved = await this.saveAsset(asset);
    medKnowledgeEventBus.emit('KnowledgeImported', saved);

    // Automatic RAG indexing for ALL document categories (exams, books, articles, guidelines, protocols, apostilas)
    try {
      const textToIndex =
        params.file.extractedText && params.file.extractedText.length > 30
          ? params.file.extractedText
          : `Documento: ${asset.title}. Categoria: ${KnowledgeCategoryMapper.toDisplayName(category)}. Disciplina: ${asset.discipline}. Especialidade: ${asset.specialty}. ${asset.board ? `Banca: ${asset.board}. ` : ''}${asset.professor ? `Professor: ${asset.professor}. ` : ''}${params.metadata?.observacoes || ''}`;

      await realSemanticSearchService.indexDocument(saved.id, textToIndex, {
        examBoard: asset.board,
        professor: asset.professor,
      });
    } catch (embErr) {
      console.warn('[MedKnowledgeRepository] Automatic RAG indexing warning:', embErr);
    }

    return saved;
  }

  // --- DECKS OPERATIONS ---
  async getDecks(): Promise<Deck[]> {
    try {
      return await db.decks.toArray();
    } catch (e) {
      return [];
    }
  }

  async getDeckById(id: string): Promise<Deck | undefined> {
    try {
      return await db.decks.get(id);
    } catch (e) {
      return undefined;
    }
  }

  async createDeck(params: {
    title: string;
    description: string;
    category: string;
    icon: string;
    color: string;
    folderId?: string;
    tags?: string[];
  }): Promise<Deck> {
    const now = new Date().toISOString();
    const newDeck: Deck = {
      id: `deck-${Date.now()}`,
      title: params.title,
      description: params.description || '',
      category: params.category || 'Geral',
      icon: params.icon || 'BookOpen',
      color: params.color || '#3B82F6',
      folderId: params.folderId,
      totalCards: 0,
      newCards: 0,
      dueCards: 0,
      learningCards: 0,
      createdAt: now,
      updatedAt: now,
      tags: params.tags || [params.category, 'MedAnki'],
    };

    try {
      await db.decks.put(newDeck);
    } catch (e) {}

    this.notify();
    return newDeck;
  }

  async updateDeck(deck: Deck): Promise<Deck> {
    const updated = { ...deck, updatedAt: new Date().toISOString() };
    try {
      await db.decks.put(updated);
    } catch (e) {}
    this.notify();
    return updated;
  }

  async deleteDeck(id: string): Promise<boolean> {
    try {
      await db.transaction('rw', db.decks, db.flashcards, async () => {
        await db.decks.delete(id);
        await db.flashcards.where('deckId').equals(id).delete();
      });
      this.notify();
      return true;
    } catch (e) {
      return false;
    }
  }

  async duplicateDeck(id: string): Promise<Deck> {
    const original = await this.getDeckById(id);
    if (!original) throw new Error(`Baralho ${id} não encontrado`);

    const newDeck = await this.createDeck({
      title: `${original.title} (Cópia)`,
      description: original.description,
      category: original.category,
      icon: original.icon,
      color: original.color,
      folderId: original.folderId,
      tags: [...original.tags],
    });

    const originalCards = await this.getCardsByDeck(id);
    const duplicatedCards: FlashCard[] = originalCards.map((c) => ({
      ...c,
      id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      deckId: newDeck.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    await this.bulkInsertCards(duplicatedCards);
    await this.updateDeckCounts(newDeck.id);

    return newDeck;
  }

  async moveDeck(id: string, folderId?: string): Promise<Deck> {
    const deck = await this.getDeckById(id);
    if (!deck) throw new Error(`Baralho ${id} não encontrado`);

    deck.folderId = folderId;
    return await this.updateDeck(deck);
  }

  async toggleFavorite(id: string): Promise<Deck> {
    const deck = await this.getDeckById(id);
    if (!deck) throw new Error(`Baralho ${id} não encontrado`);

    deck.isFavorite = !deck.isFavorite;
    return await this.updateDeck(deck);
  }

  async resetProgress(id: string): Promise<Deck> {
    const deck = await this.getDeckById(id);
    if (!deck) throw new Error(`Baralho ${id} não encontrado`);

    const cards = await this.getCardsByDeck(id);
    const resetCards = cards.map((c) => ({
      ...c,
      sm2State: createInitialSM2State(),
      updatedAt: new Date().toISOString(),
    }));

    try {
      await db.flashcards.bulkPut(resetCards);
    } catch (e) {}

    await this.updateDeckCounts(id);
    return deck;
  }

  // --- CARDS & SM-2 OPERATIONS ---
  async getCardsByDeck(deckId: string): Promise<FlashCard[]> {
    try {
      return await db.flashcards.where('deckId').equals(deckId).toArray();
    } catch (e) {
      return [];
    }
  }

  async getAllCards(): Promise<FlashCard[]> {
    try {
      return await db.flashcards.toArray();
    } catch (e) {
      return [];
    }
  }

  async addCard(card: FlashCard): Promise<FlashCard> {
    try {
      await db.flashcards.put(card);
    } catch (e) {}
    await this.updateDeckCounts(card.deckId);
    this.notify();
    return card;
  }

  async bulkInsertCards(cards: FlashCard[]): Promise<void> {
    try {
      await db.bulkSaveCardsInChunks(cards);
    } catch (e) {}

    const deckIds = Array.from(new Set(cards.map((c) => c.deckId)));
    for (const dId of deckIds) {
      await this.updateDeckCounts(dId);
    }
    this.notify();
  }

  async updateCard(card: FlashCard): Promise<FlashCard> {
    const updated = { ...card, updatedAt: new Date().toISOString() };
    try {
      await db.flashcards.put(updated);
    } catch (e) {}
    await this.updateDeckCounts(card.deckId);
    this.notify();
    return updated;
  }

  async deleteCard(id: string, deckId: string): Promise<boolean> {
    try {
      await db.flashcards.delete(id);
      await this.updateDeckCounts(deckId);
      this.notify();
      return true;
    } catch (e) {
      return false;
    }
  }

  async recordCardReview(cardId: string, rating: ReviewRating): Promise<FlashCard> {
    const allCards = await this.getAllCards();
    const card = allCards.find((c) => c.id === cardId);
    if (!card) throw new Error(`Card ${cardId} não encontrado`);

    const newSM2State = calculateSM2(card.sm2State, rating);
    const updatedCard: FlashCard = {
      ...card,
      sm2State: newSM2State,
      updatedAt: new Date().toISOString(),
    };

    await this.updateCard(updatedCard);
    return updatedCard;
  }

  // --- QUESTIONS & AI OPERATIONS ---
  async getQuestions(): Promise<Question[]> {
    try {
      return await db.questions.toArray();
    } catch (e) {
      return [];
    }
  }

  async generateQuestions(params: GenerateQuestionsParams): Promise<any[]> {
    return await medKnowledgeService.generateQuestions(params);
  }

  async cloneExamStyle(params: CloneExamStyleParams): Promise<any> {
    return await medKnowledgeService.cloneExamStyle(params);
  }

  async generateFlashcards(params: any): Promise<any[]> {
    return await medKnowledgeService.generateFlashcards(params);
  }

  async chatNote(params: any): Promise<string> {
    return await medKnowledgeService.chatNote(params);
  }

  // Helper to recalculate deck counts
  private async updateDeckCounts(deckId: string): Promise<void> {
    try {
      const cards = await db.flashcards.where('deckId').equals(deckId).toArray();
      const now = new Date();

      let dueCards = 0;
      let newCards = 0;
      let learningCards = 0;

      cards.forEach((c) => {
        if (!c.sm2State || c.sm2State.repetitions === 0) {
          newCards++;
          dueCards++;
        } else if (new Date(c.sm2State.dueDate) <= now) {
          dueCards++;
          if (c.sm2State.repetitions < 3) {
            learningCards++;
          }
        }
      });

      const deck = await db.decks.get(deckId);
      if (deck) {
        await db.decks.update(deckId, {
          totalCards: cards.length,
          newCards,
          dueCards,
          learningCards,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {}
  }
}

export const medKnowledgeRepository = new MedKnowledgeRepository();
