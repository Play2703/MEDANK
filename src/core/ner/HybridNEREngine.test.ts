import { describe, it, expect } from 'vitest';
import {
  HybridNEREngine,
  NullAiNerProvider,
  GeminiAiNerProvider,
  mergeEntities,
  AiNerProvider,
  AiNerEntity,
} from './HybridNEREngine';
import { MatchedEntity } from './DictionaryNEREngine';

class MockAiProvider implements AiNerProvider {
  readonly name = 'mock';
  constructor(private available: boolean, private entities: AiNerEntity[]) {}
  isAvailable(): boolean {
    return this.available;
  }
  async extractEntities(): Promise<AiNerEntity[]> {
    return this.entities;
  }
}

function localEntity(text: string, start: number, end: number, cat = 'DOENCA'): MatchedEntity {
  return {
    text,
    normalizedTerm: text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
    category: cat,
    startIndex: start,
    endIndex: end,
  };
}

describe('mergeEntities (hybrid NER merge)', () => {
  it('adiciona entidade da IA quando não colide com nenhuma local', () => {
    const local = [localEntity('diabetes', 0, 8)];
    const ai: AiNerEntity[] = [
      { text: 'hipertensao', category: 'SINTOMA', codeSystem: 'CID-10', code: 'I10' },
    ];
    const merged = mergeEntities(local, ai, 'diabetes hipertensao');
    expect(merged).toHaveLength(2);
    const hiper = merged.find((e) => e.normalizedTerm === 'hipertensao');
    expect(hiper).toBeDefined();
    expect(hiper!.codeSystem).toBe('CID-10');
    expect(hiper!.code).toBe('I10');
  });

  it('enriquece entidade local com código resolvido pela IA (mesmo termo)', () => {
    const local = [localEntity('diabetes', 0, 8, 'DOENCA')];
    const ai: AiNerEntity[] = [
      { text: 'diabetes', category: 'DOENCA', codeSystem: 'CID-10', code: 'E11' },
    ];
    const merged = mergeEntities(local, ai, 'diabetes');
    expect(merged).toHaveLength(1);
    expect(merged[0].codeSystem).toBe('CID-10');
    expect(merged[0].code).toBe('E11');
  });

  it('local vence em sobreposição de span e ainda assim herda o código da IA', () => {
    // Local reconhece "diabetes mellitus tipo 2" (span maior); IA manda "diabetes" (span menor, contido)
    const local = [localEntity('diabetes mellitus tipo 2', 0, 23, 'DOENCA')];
    const ai: AiNerEntity[] = [
      { text: 'diabetes', category: 'DOENCA', codeSystem: 'CID-10', code: 'E11' },
    ];
    const merged = mergeEntities(local, ai, 'diabetes mellitus tipo 2');
    expect(merged).toHaveLength(1);
    expect(merged[0].normalizedTerm).toBe('diabetes mellitus tipo 2');
    expect(merged[0].code).toBe('E11');
  });

  it('sem entidades da IA, retorna só as locais (modo local-only)', () => {
    const local = [localEntity('diabetes', 0, 8)];
    const merged = mergeEntities(local, [], 'diabetes');
    expect(merged).toEqual(local);
  });
});

describe('HybridNEREngine', () => {
  it('modo "local" quando não há provedor de IA disponível', () => {
    const engine = new HybridNEREngine(new NullAiNerProvider());
    expect(engine.mode).toBe('local');
  });

  it('modo "hybrid" quando o provedor de IA está disponível', () => {
    const engine = new HybridNEREngine(new MockAiProvider(true, []));
    expect(engine.mode).toBe('hybrid');
  });

  it('com NullAiNerProvider, reconhece termos do dicionário (camada local)', async () => {
    const engine = new HybridNEREngine(new NullAiNerProvider());
    const entities = await engine.extractEntities(
      'O paciente com choque cardiogênico cursa com hipotensão.'
    );
    const texts = entities.map((e) => e.text);
    expect(texts).toContain('choque cardiogênico');
    expect(texts).toContain('hipotensão');
  });

  it('com provedor de IA, enriquece entidades locais com os códigos resolvidos pela IA', async () => {
    const provider = new MockAiProvider(true, [
      { text: 'hipotensao', category: 'SINTOMA', codeSystem: 'CID-10', code: 'I95' },
      { text: 'taquicardia', category: 'SINTOMA', codeSystem: 'CID-10', code: 'I49' },
    ]);
    const engine = new HybridNEREngine(provider);
    const entities = await engine.extractEntities('choque cardiogenico com hipotensao e taquicardia');
    // 'hipotensao' já existe no dicionário como 'hipotensão' -> a IA só anexa o código CID-10
    const hipo = entities.find((e) => e.normalizedTerm === 'hipotensão');
    expect(hipo).toBeDefined();
    expect(hipo!.codeSystem).toBeTruthy();
    expect(hipo!.code).toBeTruthy();
    const taq = entities.find((e) => e.normalizedTerm === 'taquicardia');
    expect(taq).toBeDefined();
    expect(taq!.code).toBeTruthy();
    // a entidade base (choque) continua presente, vinda da camada local
    expect(entities.some((e) => e.normalizedTerm === 'choque cardiogênico')).toBe(true);
  });

  it('GeminiAiNerProvider.isAvailable reflete a presença da chave de API', () => {
    const hadKey = Boolean(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY);
    expect(new GeminiAiNerProvider().isAvailable()).toBe(hadKey);
  });

  it('extractRelations delega para a camada local determinística', async () => {
    const engine = new HybridNEREngine(new NullAiNerProvider());
    const text = 'A noradrenalina trata a hipotensão.';
    const entities = await engine.extractEntities(text);
    const relations = engine.extractRelations(text, entities);
    expect(relations.some((r) => r.relationType === 'TRATAMENTO')).toBe(true);
  });
});
