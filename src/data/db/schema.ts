/**
 * MedAnki Database Schema Specifications
 * Prepared for Dexie Local Storage (>500,000 flashcards + Real Semantic Document Embeddings)
 */

export const DB_NAME = 'MedAnki_SQLite_LocalDB';
export const CURRENT_DB_VERSION = 16;

export const SCHEMAS_V1 = {
  folders: 'id, title, parentId, createdAt',
  decks: 'id, folderId, title, category, createdAt',
  flashcards: 'id, deckId, type, highYield, createdAt, updatedAt, *tags, [deckId+sm2State.dueDate]',
  tags: 'id, &name, cardCount',
  revisionStats: 'deckId, dailyStreak',
  studyHistory: 'id, cardId, deckId, reviewedAt, rating',
};

export const SCHEMAS_V2 = {
  ...SCHEMAS_V1,
  flashcards: 'id, deckId, type, highYield, createdAt, updatedAt, *tags, [deckId+sm2State.dueDate], [deckId+sm2State.repetitions]',
};

export const SCHEMAS_V3 = {
  ...SCHEMAS_V2,
  folders: 'id, title, parentId, color, icon, createdAt',
  decks: 'id, folderId, title, category, icon, color, createdAt, updatedAt',
  flashcards: 'id, deckId, type, highYield, createdAt, updatedAt, *tags, [deckId+sm2State.dueDate], [deckId+sm2State.repetitions], [deckId+highYield]',
  studyHistory: 'id, cardId, deckId, reviewedAt, rating, [deckId+reviewedAt]',
};

export const SCHEMAS_V4 = {
  ...SCHEMAS_V3,
  professorProfiles: 'id, name, totalExamsCount, createdAt, updatedAt',
  examProfiles: 'id, code, name, isPredefined, createdAt',
  questionSets: 'id, title, createdAt, updatedAt',
  questions: 'id, setId, specialty, topic, difficulty, questionType, createdAt',
};

export const SCHEMAS_V5 = {
  ...SCHEMAS_V4,
  knowledgeAssets: 'id, uuid, category, discipline, specialty, author, board, professor, year, createdAt, updatedAt, processingStatus, *tags',
};

export const SCHEMAS_V6 = {
  ...SCHEMAS_V5,
  documentEmbeddings: 'id, assetId, examBoard, professor, [assetId+chunkIndex]',
};

export const SCHEMAS_V7 = {
  ...SCHEMAS_V6,
  chunkEntities: 'id, assetId, chunkIndex, [assetId+chunkIndex], *entities.code, createdAt',
};

export const SCHEMAS_V8 = {
  ...SCHEMAS_V7,
  chunkEntities: 'id, assetId, chunkIndex, [assetId+chunkIndex], *entities.code, *entities.normalizedText, createdAt',
  chunkRelations: 'id, assetId, chunkIndex, [assetId+chunkIndex], *relations.predicate, *relations.subjectNormalized, *relations.objectNormalized, createdAt',
};

export const SCHEMAS_V9 = {
  ...SCHEMAS_V8,
  canonicalEntityIndex: 'canonicalKey, type, code_system, *assetIds, occurrenceCount',
  graphEdges: 'id, subjectCanonicalKey, objectCanonicalKey, predicate, occurrenceCount',
  graphContentLinks: 'id, canonicalKey, [contentType+contentId], contentType',
};

export const SCHEMAS_V10 = {
  ...SCHEMAS_V9,
  questionEmbeddings: 'id, questionId, specialty, topic, [specialty+topic], createdAt',
};

export const SCHEMAS_V11 = {
  ...SCHEMAS_V10,
  cardSignals: 'id, cardId, signalType, consumed, [cardId+consumed], createdAt',
  cardPendingSuggestions: 'id, cardId, suggestionType, status, [cardId+status], createdAt',
};

export const SCHEMAS_V12 = {
  ...SCHEMAS_V11,
  notes: 'id, specialty, topic, createdAt, updatedAt',
};

export const SCHEMAS_V13 = {
  ...SCHEMAS_V12,
  entityEmbeddings: 'canonicalKey, updatedAt',
};

export const SCHEMAS_V14 = {
  ...SCHEMAS_V13,
};

export const SCHEMAS_V15 = {
  ...SCHEMAS_V14,
  extractedExamQuestions: 'id, sourceAssetId, questionNumber, correctLetter, specialty, confidence, createdAt',
};

export const SCHEMAS_V16 = {
  ...SCHEMAS_V15,
  knowledgeAssetFiles: 'id, assetId, mimeType, createdAt',
};

