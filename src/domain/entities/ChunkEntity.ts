/**
 * Medical Entity Recognition (NER), Canonicalization & Knowledge Graph Domain Types
 * Supports 20 clinical entity types, closed vocabulary relations, CID-10/SNOMED CT,
 * normalized text, canonical keys, canonical index, graph edges, and content links.
 */

export type MedicalEntityType =
  | 'disease'
  | 'finding'
  | 'procedure'
  | 'medication'
  | 'exam'
  | 'symptom'
  | 'anatomy'
  | 'guideline'
  | 'microorganism'
  | 'gene'
  | 'protein'
  | 'hormone'
  | 'enzyme'
  | 'score'
  | 'risk_factor'
  | 'lab_value'
  | 'medical_device'
  | 'vaccination'
  | 'drug_class'
  | 'imaging_finding';

export type CodeSystem = 'CID-10' | 'SNOMED' | null;

export type RelationType =
  | 'trata'
  | 'causa'
  | 'contraindica'
  | 'é_sintoma_de'
  | 'diagnostica'
  | 'complica'
  | 'previne'
  | 'indica'
  | 'classifica_como'
  | 'associado_a';

export interface ExtractedMedicalEntity {
  text: string;              // Original text as appeared in document
  normalizedText: string;    // Lowercase, stripped accents, collapsed whitespace
  canonicalKey: string;      // `${code_system}:${code}` or normalizedText fallback
  type: MedicalEntityType;
  code_system: CodeSystem;
  code: string | null;
  confidence: number;
}

export interface ExtractedMedicalRelation {
  subjectText: string;
  subjectNormalized: string;
  subjectCanonicalKey: string;
  subjectType: MedicalEntityType;
  predicate: RelationType;
  objectText: string;
  objectNormalized: string;
  objectCanonicalKey: string;
  objectType: MedicalEntityType;
  confidence: number;
}

export interface ChunkEntityRecord {
  id: string; // `${assetId}-${chunkIndex}`
  assetId: string;
  chunkIndex: number;
  entities: ExtractedMedicalEntity[];
  createdAt: string;
}

export interface ChunkRelationRecord {
  id: string; // `${assetId}-${chunkIndex}`
  assetId: string;
  chunkIndex: number;
  relations: ExtractedMedicalRelation[];
  createdAt: string;
}

export interface CanonicalEntityIndexRecord {
  canonicalKey: string;        // Primary key
  displayText: string;         // Most confident text variant seen
  type: MedicalEntityType;
  code_system: CodeSystem;
  code: string | null;
  seenTexts: string[];         // Text variations observed
  assetIds: string[];          // Knowledge assets where entity appears
  occurrenceCount: number;     // Global occurrence frequency
  updatedAt: string;
}

export interface GraphEdgeRecord {
  id: string;                  // `${subjectCanonicalKey}::${predicate}::${objectCanonicalKey}`
  subjectCanonicalKey: string;
  predicate: RelationType;
  objectCanonicalKey: string;
  occurrenceCount: number;      // Confirming chunks/documents count
  maxConfidence: number;
  assetIds: string[];           // Source document assetIds
  updatedAt: string;
}

export interface GraphContentLinkRecord {
  id: string;                  // `${canonicalKey}::${contentType}::${contentId}`
  canonicalKey: string;
  contentType: 'flashcard' | 'question' | 'knowledgeAsset';
  contentId: string;
  createdAt: string;
}
