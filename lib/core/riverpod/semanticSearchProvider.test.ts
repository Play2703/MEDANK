import { describe, it, expect, beforeEach } from 'vitest';
import {
  SemanticSearchStateNotifier,
  semanticSearchProvider,
} from './semanticSearchProvider';
import { DocumentEmbeddingItem, NERWorkerClient } from '../engines';

describe('SemanticSearchStateNotifier Riverpod Provider', () => {
  let notifier: SemanticSearchStateNotifier;
  let client: NERWorkerClient;

  const mockDocs: DocumentEmbeddingItem[] = [
    {
      id: 'emb-1',
      assetId: 'asset-1',
      chunkIndex: 0,
      content: 'Cetoacidose diabética',
      vector: [1, 0, 0],
    },
    {
      id: 'emb-2',
      assetId: 'asset-1',
      chunkIndex: 1,
      content: 'Estado hiperosmolar hiperglicêmico',
      vector: [0.9, 0.1, 0],
    },
  ];

  beforeEach(() => {
    client = new NERWorkerClient();
    notifier = new SemanticSearchStateNotifier(client);
  });

  it('deve ter estado inicial limpo', () => {
    const state = notifier.state;
    expect(state.isSearching).toBe(false);
    expect(state.results).toEqual([]);
    expect(state.queryText).toBe('');
    expect(state.error).toBeNull();
    expect(state.embeddingsCount).toBe(0);
  });

  it('deve carregar embeddings e atualizar o contador no estado reativo', async () => {
    const count = await notifier.loadEmbeddings(mockDocs);
    expect(count).toBe(2);
    expect(notifier.state.embeddingsCount).toBe(2);
  });

  it('deve realizar busca semântica e atualizar resultados no estado', async () => {
    await notifier.loadEmbeddings(mockDocs);

    const query = [1, 0, 0];
    const results = await notifier.search(query, 1);

    expect(results.length).toBe(1);
    expect(results[0].id).toBe('emb-1');
    expect(notifier.state.results.length).toBe(1);
    expect(notifier.state.isSearching).toBe(false);
    expect(notifier.state.lastSearchedAt).toBeGreaterThan(0);
  });

  it('deve realizar searchByText e atualizar queryText no estado', async () => {
    const results = await notifier.searchByText('cetoacidose diabética sintomas', 2);
    expect(Array.isArray(results)).toBe(true);
    expect(notifier.state.queryText).toBe('cetoacidose diabética sintomas');
    expect(notifier.state.isSearching).toBe(false);
  });

  it('deve resetar o estado ao chamar reset()', async () => {
    await notifier.loadEmbeddings(mockDocs);
    await notifier.search([1, 0, 0]);

    expect(notifier.state.results.length).toBeGreaterThan(0);

    notifier.reset();
    expect(notifier.state.results).toEqual([]);
    expect(notifier.state.queryText).toBe('');
    expect(notifier.state.isSearching).toBe(false);
  });
});
