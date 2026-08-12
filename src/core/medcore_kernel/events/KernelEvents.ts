import { IKernelEventBus, KernelEventCallback } from '../interfaces/IKernelInterfaces';

export enum KernelEventType {
  DocumentImported = 'DocumentImported',
  DocumentUpdated = 'DocumentUpdated',
  DocumentDeleted = 'DocumentDeleted',
  ProcessingStarted = 'ProcessingStarted',
  ProcessingCompleted = 'ProcessingCompleted',
  KnowledgeUpdated = 'KnowledgeUpdated',
  EmbeddingCreated = 'EmbeddingCreated',
  QuestionGenerated = 'QuestionGenerated',
  FlashcardsGenerated = 'FlashcardsGenerated',
  ProfessorProfileUpdated = 'ProfessorProfileUpdated',
  ModuleStateChanged = 'ModuleStateChanged',
  KernelBooted = 'KernelBooted',
  KernelShutdown = 'KernelShutdown',
}

export class KernelEventBus implements IKernelEventBus {
  private listeners: Map<string, Set<KernelEventCallback>> = new Map();

  public publish(event: string, payload: any): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    for (const cb of callbacks) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[KernelEventBus] Error in listener for event [${event}]:`, err);
      }
    }
  }

  public subscribe(event: string, callback: KernelEventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.unsubscribe(event, callback);
    };
  }

  public unsubscribe(event: string, callback: KernelEventCallback): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    callbacks.delete(callback);
    if (callbacks.size === 0) {
      this.listeners.delete(event);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
