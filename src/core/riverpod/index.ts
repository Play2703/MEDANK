import { useState, useEffect, useSyncExternalStore } from 'react';

/**
 * Lightweight & Robust Riverpod Pattern for TypeScript / React
 * Implements StateNotifier, StateNotifierProvider, ProviderContainer, and reactive hooks.
 */

export type Listener<T> = (state: T) => void;

export abstract class StateNotifier<T> {
  private _state: T;
  private _listeners: Set<Listener<T>> = new Set();

  constructor(initialState: T) {
    this._state = initialState;
  }

  get state(): T {
    return this._state;
  }

  set state(newState: T) {
    if (this._state !== newState) {
      this._state = newState;
      this.notifyListeners();
    }
  }

  protected updateState(updater: (prev: T) => T): void {
    const nextState = updater(this._state);
    if (this._state !== nextState) {
      this._state = nextState;
      this.notifyListeners();
    }
  }

  addListener(listener: Listener<T>): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  protected notifyListeners(): void {
    const currentState = this._state;
    this._listeners.forEach((listener) => listener(currentState));
  }
}

export class StateNotifierProvider<Notifier extends StateNotifier<State>, State> {
  private _instance: Notifier | null = null;
  private _creator: () => Notifier;

  constructor(creator: () => Notifier) {
    this._creator = creator;
  }

  get notifier(): Notifier {
    if (!this._instance) {
      this._instance = this._creator();
    }
    return this._instance;
  }
}

/**
 * Creates a StateNotifierProvider instance
 */
export function stateNotifierProvider<Notifier extends StateNotifier<State>, State>(
  creator: () => Notifier
): StateNotifierProvider<Notifier, State> {
  return new StateNotifierProvider<Notifier, State>(creator);
}

/**
 * React Hook: Watches state from a StateNotifierProvider reactively.
 * Component re-renders whenever state changes.
 */
export function useRiverpodState<Notifier extends StateNotifier<State>, State>(
  provider: StateNotifierProvider<Notifier, State>
): State {
  const notifier = provider.notifier;

  return useSyncExternalStore(
    (onStoreChange) => notifier.addListener(() => onStoreChange()),
    () => notifier.state,
    () => notifier.state
  );
}

/**
 * React Hook: Returns the notifier instance from a StateNotifierProvider.
 */
export function useRiverpodNotifier<Notifier extends StateNotifier<State>, State>(
  provider: StateNotifierProvider<Notifier, State>
): Notifier {
  return provider.notifier;
}

/**
 * React Hook: Combined state and notifier accessor
 */
export function useRiverpod<Notifier extends StateNotifier<State>, State>(
  provider: StateNotifierProvider<Notifier, State>
): [State, Notifier] {
  const state = useRiverpodState(provider);
  const notifier = useRiverpodNotifier(provider);
  return [state, notifier];
}
