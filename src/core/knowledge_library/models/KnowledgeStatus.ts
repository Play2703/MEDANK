/**
 * Knowledge Library Module - KnowledgeStatus
 *
 * Defines the lifecycle status of a document item in MedAnki's knowledge base.
 * In Phase 15.9, newly registered items default to 'Importado'.
 */

export type KnowledgeStatus =
  | 'Importado'
  | 'Aguardando Processamento'
  | 'Em Processamento'
  | 'Processado'
  | 'Indexado'
  | 'Pronto para IA'
  | 'Erro';

export const KNOWLEDGE_STATUSES: KnowledgeStatus[] = [
  'Importado',
  'Aguardando Processamento',
  'Em Processamento',
  'Processado',
  'Indexado',
  'Pronto para IA',
  'Erro',
];
