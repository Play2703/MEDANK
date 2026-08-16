import { describe, it, expect } from 'vitest';
import { WorkerNEREngine, normalizeText, estimateCoverage } from './ner.worker';
import { NERWorkerClient } from './NERWorkerClient';

describe('Web Worker NER Engine (Background Processing)', () => {
  it('deve normalizar textos corretamente removendo acentos e padronizando espaços', () => {
    expect(normalizeText('INFARTO AGUDO DO MIOCÁRDIO')).toBe('infarto agudo do miocardio');
    expect(normalizeText('  Câncer   de   Pulmão  ')).toBe('cancer de pulmao');
  });

  it('deve extrair entidades médicas com alta precisão a partir do motor do worker', () => {
    const engine = new WorkerNEREngine();
    const text = 'Paciente com infarto agudo do miocárdio e hipertensão arterial sistêmica em uso de captopril.';
    const entities = engine.extractEntities(text);

    expect(entities.length).toBeGreaterThanOrEqual(3);

    const terms = entities.map((e) => e.normalizedTerm.toLowerCase());
    expect(terms).toContain('infarto agudo do miocárdio');
    expect(terms).toContain('hipertensão arterial sistêmica');
    expect(terms).toContain('captopril');
  });

  it('deve extrair relações clínicas entre entidades na mesma sentença', () => {
    const engine = new WorkerNEREngine();
    const text = 'A aspirina trata infarto agudo do miocárdio.';
    const entities = engine.extractEntities(text);
    const relations = engine.extractRelations(text, entities);

    expect(relations.length).toBeGreaterThanOrEqual(1);
    expect(relations[0].relationType).toBe('TRATAMENTO');
    expect(relations[0].sourceEntity.toLowerCase()).toBe('aspirina');
    expect(relations[0].targetEntity.toLowerCase()).toBe('infarto agudo do miocárdio');
  });

  it('deve detectar negação e prefixar relationType com NEGACAO_', () => {
    const engine = new WorkerNEREngine();
    const text = 'O captopril não causa tosse.';
    const entities = engine.extractEntities(text);
    const relations = engine.extractRelations(text, entities);

    expect(relations.length).toBeGreaterThanOrEqual(1);
    expect(relations[0].relationType).toBe('NEGACAO_CAUSA');
    expect(relations[0].relationType).not.toBe('CAUSA');
  });

  it('deve calcular a cobertura de entidades médicas no texto', () => {
    const engine = new WorkerNEREngine();
    const text = 'Paciente com infarto agudo do miocárdio.';
    const entities = engine.extractEntities(text);
    const coverage = estimateCoverage(text, entities);

    expect(coverage).toBeGreaterThan(0.5);
  });

  it('deve analisar o texto completo retornando entidades, relações e cobertura no NERWorkerClient', async () => {
    const client = new NERWorkerClient();
    const result = await client.analyzeText('O captopril trata hipertensão arterial sistêmica.');

    expect(result.entities.length).toBeGreaterThanOrEqual(2);
    expect(result.relations.length).toBeGreaterThanOrEqual(1);
    expect(result.coverage).toBeGreaterThan(0);
    client.terminate();
  });
});
