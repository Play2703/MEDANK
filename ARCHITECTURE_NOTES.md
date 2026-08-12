# MedAnki Architecture Notes — Pure Real Semantic Search & Clean Architecture

## 1. Scope & Clean Up Summary

In this refactoring phase, all **simulated / mock modules** in `src/core/` and orphan `test_*.ts` test scripts were permanently removed to eliminate dead weight and zero-value scaffolding.

### 🗑️ Removed Simulated Modules (23 Folders/Files Removed)
- `src/core/ai_orchestrator/`
- `src/core/context_builder/`
- `src/core/cross_reference/`
- `src/core/embedding_engine/`
- `src/core/high_yield/`
- `src/core/knowledge_graph/`
- `src/core/knowledge_pipeline/`
- `src/core/medcore/`
- `src/core/medical_classifier/`
- `src/core/medical_entity_extractor/`
- `src/core/medical_index/`
- `src/core/medical_parser/`
- `src/core/medical_processing_engine/`
- `src/core/medical_relationship/`
- `src/core/medical_taxonomy/`
- `src/core/medical_tree/`
- `src/core/ocr_engine/`
- `src/core/ontology/`
- `src/core/ontology_engine/`
- `src/core/phase15_pipeline/`
- `src/core/phase15_integration.ts`
- `src/core/retrieval_engine/`
- `src/core/topic_hierarchy/`

---

## 2. Active Real Architecture

The codebase now operates exclusively on **100% functional components**:

```
Import Center / File Upload (DocumentImportService)
       │
       ▼
Text Chunking (textChunker.ts: ~500 tokens, 50 overlap)
       │
       ├──────────────────────────────────────────┐
       ▼                                          ▼
Real API Embeddings (/api/embeddings)    Medical Entity Recognition (/api/extract-entities)
(gemini-embedding-001, 768d, 15-batch)    (Gemini 3.6 Flash, CID-10 & SNOMED CT, 15-batch)
       │                                          │
       ▼                                          ▼
Dexie Local IndexedDB                     Dexie Local IndexedDB (DB v9)
(Table: documentEmbeddings)                 (Tables: chunkEntities, chunkRelations, canonicalEntityIndex,
                                                     graphEdges, graphContentLinks)
       │                                          │
       └────────────────────┬─────────────────────┘
                            ▼
      Pure JS Cosine Similarity & RAGEngine (RAGEngine.ts)
             (Returns SemanticChunkResult[] with entities & canonical keys)
                            │
                            ▼
    AI Flashcard & Question Generation (server.ts / Gemini 3.6 Flash)
       (Generates High-Yield cards & exam questions, linked to graph via graphContentLinks)
```

### Key Technical Specifications
1. **Embedding Model**: `gemini-embedding-001` via `@google/genai` SDK (`ai.models.embedContent`).
2. **Dimension**: Compressed to **768 dimensions** via `outputDimensionality: 768` config to save local Dexie storage with minimal accuracy drop.
3. **Medical Entity Recognition (NER & 20 Types)**: End-to-end extraction via `/api/extract-entities` mapping clinical terms across 20 entity types (`disease`, `finding`, `procedure`, `medication`, `exam`, `symptom`, `anatomy`, `guideline`, `microorganism`, `gene`, `protein`, `hormone`, `enzyme`, `score`, `risk_factor`, `lab_value`, `medical_device`, `vaccination`, `drug_class`, `imaging_finding`) to **CID-10** and **SNOMED CT** stored in Dexie table `chunkEntities` (DB Version 9).
4. **Clinical Relations Extraction**: Executed within the **same single Gemini API call per 15-chunk batch**. Extracts direct clinical relations between entities in the same chunk using a CLOSED vocabulary of 10 predicates (`trata`, `causa`, `contraindica`, `é_sintoma_de`, `diagnostica`, `complica`, `previne`, `indica`, `classifica_como`, `associado_a`) stored in Dexie table `chunkRelations`.
5. **Entity Canonicalization**: Cross-document entity resolution via `canonicalKey` (`${code_system}:${code}` when available, or `normalizedText` fallback). Upserts global index in `canonicalEntityIndex` tracking `occurrenceCount`, distinct `assetIds`, and `seenTexts`.
6. **Medical Knowledge Graph Layer**:
   - `graphEdges`: Aggregates global entity-predicate-entity relations (`id = ${subjectCanonicalKey}::${predicate}::${objectCanonicalKey}`) across all imported documents in Dexie.
   - `graphContentLinks`: Automatically links generated flashcards and exam questions to entity canonical keys upon creation via `KnowledgeGraphService.ts`.
7. **Explicit Architectural Scope & Limitations**:
   - *(a) Synonym Resolution*: Entities without formal codes (e.g., symptoms or anatomy without CID/SNOMED) fall back to `normalizedText`, which resolves casing/accents but does NOT resolve distinct synonym spellings (e.g., "falta de ar" vs "dispneia" remain separate entries until a dedicated synonym dictionary or embedding resolver is added).
   - *(b) Manual Guidelines Excluded*: Guidelines created manually via the `src/core/guidelines` CRUD module do not pass through file import/NER indexing and do not generate graph nodes. Only guidelines imported as document files via the Import Center generate graph entities and edges.
   - *(c) Pure Data Layer*: The Knowledge Graph is currently a 100% data layer in Dexie (`KnowledgeGraphService.ts`). It is not yet injected into RAG generation prompts nor rendered in a visual UI graph view.
8. **Batching**: Embeddings, NER, and relation extractions are processed in batches of 15 chunks (1 single Gemini API call per 15-chunk batch) to enforce rate-limiting safety and optimize API throughput.
9. **Context Anchoring & CID-10 Tagging**: Flashcards and questions generated via `/api/generate-cards` and `/api/generate-questions` receive top RAG semantic chunks enriched with structured CID-10/SNOMED CT entities, enabling automatic CID-10 and clinical tagging on generated flashcards and exam questions stored in Dexie.

---

## 3. Active Core Modules (`src/core/`)

- `algorithm/`: SM-2 Spaced Repetition Algorithm (`sm2.ts`).
- `books/`: Medical books view models and local repository.
- `dashboard/`: Admin metrics and system dashboard.
- `exam_bank/`: Medical residency exams database.
- `guidelines/`: Medical practice guidelines.
- `import_engine/`: Document import queue notifier and state management.
- `knowledge_library/`: Asset categories and document management.
- `material/`: Study materials repository.
- `responsive/`: Material 3 device context (`DeviceContext.tsx`).
- `riverpod/`: StateNotifier & StateNotifierProvider reactive store infrastructure.
- `router/`: SPA Router (`GoRouter.tsx`).
- `theme/`: Material 3 medical design tokens (`tokens.ts`).
- `utils/`: Cloze deletion text parser (`clozeParser.ts`).

---

## 4. Future Extension Roadmap (Text Specifications Only)

Any future advanced capabilities must be specified here first as documentation before any code is written:

1. **Graph UI Visualization**:
   - Rendering interactive D3/Cytoscape visual graphs for exploring entity relations and connected study materials.
2. **Anki `.apkg` Exporting**:
   - Packaging generated flashcards directly into binary `.apkg` files for native Anki Desktop/Mobile sync.
