import { KnowledgeAsset } from '../../domain/entities/KnowledgeAsset';
import { KnowledgeCategory } from '../medcore_kernel/ontology/KnowledgeCategoryMapper';

export type KnowledgeEventType =
  | 'KnowledgeCreated'
  | 'KnowledgeUpdated'
  | 'KnowledgeDeleted'
  | 'KnowledgeImported'
  | 'KnowledgeCategoryChanged';

export interface KnowledgeEventPayload {
  type: KnowledgeEventType;
  asset: KnowledgeAsset;
  previousCategory?: KnowledgeCategory;
  timestamp: string;
}

type EventListener = (payload: KnowledgeEventPayload) => void;

class MedKnowledgeEventBus {
  private listeners: Set<EventListener> = new Set();

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(type: KnowledgeEventType, asset: KnowledgeAsset, previousCategory?: KnowledgeCategory): void {
    const payload: KnowledgeEventPayload = {
      type,
      asset,
      previousCategory,
      timestamp: new Date().toISOString(),
    };
    this.listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.error('[MedKnowledgeEventBus] Listener error:', err);
      }
    });
  }
}

export const medKnowledgeEventBus = new MedKnowledgeEventBus();
