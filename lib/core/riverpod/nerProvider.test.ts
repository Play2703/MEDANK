import { describe, it, expect } from 'vitest';
import { NERStateNotifier } from './nerProvider';

describe('NER Riverpod StateNotifier', () => {
  it('deve inicializar com estado padrão', () => {
    const notifier = new NERStateNotifier();
    expect(notifier.state.isProcessing).toBe(false);
    expect(notifier.state.entities).toEqual([]);
    expect(notifier.state.relations).toEqual([]);
    expect(notifier.state.coverage).toBe(0);
  });

  it('deve analisar o texto e atualizar o estado reativamente sem travar a thread principal', async () => {
    const notifier = new NERStateNotifier();
    const text = 'A aspirina trata infarto agudo do miocárdio.';
    const promise = notifier.analyzeText(text);

    expect(notifier.state.isProcessing).toBe(true);

    const result = await promise;
    expect(notifier.state.isProcessing).toBe(false);
    expect(notifier.state.entities.length).toBeGreaterThanOrEqual(2);
    expect(notifier.state.relations.length).toBeGreaterThanOrEqual(1);
    expect(notifier.state.coverage).toBeGreaterThan(0);
    expect(result.entities).toEqual(notifier.state.entities);
  });

  it('deve extrair entidades médicas de forma rápida via worker notifier', async () => {
    const notifier = new NERStateNotifier();
    const entities = await notifier.extractEntities('Paciente com dispneia e dor torácica.');

    expect(entities.length).toBeGreaterThanOrEqual(2);
    expect(notifier.state.entities.length).toBeGreaterThanOrEqual(2);
  });

  it('deve resetar o estado quando solicitado', async () => {
    const notifier = new NERStateNotifier();
    await notifier.analyzeText('Paciente com asma.');
    expect(notifier.state.entities.length).toBeGreaterThanOrEqual(1);

    notifier.reset();
    expect(notifier.state.entities).toEqual([]);
    expect(notifier.state.text).toBe('');
  });
});
