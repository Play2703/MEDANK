/**
 * Living Cards (Flashcards Vivos) Domain Types & Contracts
 * Strict Separation:
 * - Real-time Signals (cardSignals): cheap IndexedDB inserts, zero AI calls
 * - Pending Suggestions (cardPendingSuggestions): human approval required for clinical facts
 */

export type CardSignalType = 'wrong_related_question' | 'new_relevant_content' | 'wrong_review';

export interface CardSignalRecord {
  id: string;
  cardId: string;
  signalType: CardSignalType;
  sourceId?: string; // ID da questão ou asset que originou o sinal
  weight: number;    // Peso do sinal para limiar de reavaliação em lote
  createdAt: string;
  consumed: boolean;
}

export type SuggestionType = 'clinical_expansion' | 'new_child_card' | 'safe_link';

export interface SafeLinkDetails {
  contentType: 'question' | 'knowledgeAsset' | 'video' | 'mindmap';
  contentId: string;
  title?: string;
}

export interface ProposedContent {
  field: 'back' | 'hint' | 'newChildFront' | 'safeLink';
  currentValue?: string;
  proposedValue: string;
  reasoning: string;
  newChildFront?: string;
  newChildBack?: string;
  newChildTags?: string[];
  safeLinkDetails?: SafeLinkDetails;
}

export type SuggestionStatus = 'pending' | 'approved' | 'rejected';

export interface CardPendingSuggestionRecord {
  id: string;
  cardId: string;
  suggestionType: SuggestionType;
  proposedContent: ProposedContent;
  sourceSignalIds: string[];
  status: SuggestionStatus;
  createdAt: string;
  reviewedAt?: string;
}
