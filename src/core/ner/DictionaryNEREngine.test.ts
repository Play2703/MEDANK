import { describe, it, expect } from 'vitest';
import { dictionaryNEREngine, estimateCoverage, MIN_COVERAGE_THRESHOLD, getTerminology } from './DictionaryNEREngine';

describe('DictionaryNEREngine', () => {
  describe('PARTE 1 — Multi-entity relation extraction (extractRelations)', () => {
    it('should correctly extract 3 relations for sentence with 3+ entities and multiple triggers', () => {
      const sentence = 'A hipertensão e o diabetes tipo 2 são fatores de risco para o AVC, que causa dispneia.';
      const entities = dictionaryNEREngine.extractEntities(sentence);

      // Verify entities found in order (using canonical terms from medicalTerminologyPt.json)
      expect(entities.map((e) => e.normalizedTerm)).toEqual([
        'hipertensão arterial sistêmica',
        'diabetes mellitus tipo 2',
        'acidente vascular cerebral',
        'dispneia',
      ]);

      const relations = dictionaryNEREngine.extractRelations(sentence, entities);

      expect(relations).toHaveLength(3);

      expect(relations[0]).toEqual({
        sourceEntity: 'hipertensão arterial sistêmica',
        targetEntity: 'acidente vascular cerebral',
        relationType: 'FATOR_DE_RISCO',
        triggerPhrase: 'fatores de risco para',
        sentence: sentence,
      });

      expect(relations[1]).toEqual({
        sourceEntity: 'diabetes mellitus tipo 2',
        targetEntity: 'acidente vascular cerebral',
        relationType: 'FATOR_DE_RISCO',
        triggerPhrase: 'fatores de risco para',
        sentence: sentence,
      });

      expect(relations[2]).toEqual({
        sourceEntity: 'acidente vascular cerebral',
        targetEntity: 'dispneia',
        relationType: 'CAUSA',
        triggerPhrase: 'causa',
        sentence: sentence,
      });
    });

    it('should ignore self-relations when source and target have identical normalizedTerm', () => {
      const sentence = 'A hipertensão pode causar hipertensão.';
      const entities = dictionaryNEREngine.extractEntities(sentence);
      expect(entities).toHaveLength(2);
      expect(entities[0].normalizedTerm).toBe('hipertensão arterial sistêmica');
      expect(entities[1].normalizedTerm).toBe('hipertensão arterial sistêmica');

      const relations = dictionaryNEREngine.extractRelations(sentence, entities);
      expect(relations).toHaveLength(0);
    });

    it('should capture real triggerPhrase instead of raw regex pattern source', () => {
      const text = 'O captopril é indicado para hipertensão.';
      const entities = dictionaryNEREngine.extractEntities(text);
      const relations = dictionaryNEREngine.extractRelations(text, entities);

      expect(relations).toHaveLength(1);
      expect(relations[0].triggerPhrase).toBe('indicado para');
      expect(relations[0].relationType).toBe('TRATAMENTO');
    });

    it('should detect simple negation and prefix relationType with NEGACAO_ (não causa -> NEGACAO_CAUSA)', () => {
      const sentence = 'A metformina não causa hipoglicemia.';
      const entities = dictionaryNEREngine.extractEntities(sentence);
      const relations = dictionaryNEREngine.extractRelations(sentence, entities);

      expect(relations).toHaveLength(1);
      expect(relations[0].sourceEntity).toBe('metformina');
      expect(relations[0].targetEntity).toBe('hipoglicemia');
      expect(relations[0].relationType).toBe('NEGACAO_CAUSA');
      expect(relations[0].relationType).not.toBe('CAUSA');
      expect(relations[0].triggerPhrase).toBe('causa');
    });

    it('should not negate relations when negation marker is distant or belongs to a prior clause', () => {
      const sentence = 'O paciente não apresenta febre, mas a amoxicilina trata a sinusite.';
      const entities = dictionaryNEREngine.extractEntities(sentence);
      const relations = dictionaryNEREngine.extractRelations(sentence, entities);

      const amoxRelation = relations.find((r) => r.sourceEntity === 'amoxicilina' && r.targetEntity === 'sinusite');
      expect(amoxRelation).toBeDefined();
      expect(amoxRelation?.relationType).toBe('TRATAMENTO');
      expect(amoxRelation?.relationType).not.toBe('NEGACAO_TRATAMENTO');
    });

    it('should preserve normal positive relations when no negation marker is present', () => {
      const sentence = 'O infarto agudo do miocárdio causa insuficiência cardíaca.';
      const entities = dictionaryNEREngine.extractEntities(sentence);
      const relations = dictionaryNEREngine.extractRelations(sentence, entities);

      expect(relations).toHaveLength(1);
      expect(relations[0].sourceEntity).toBe('infarto agudo do miocárdio');
      expect(relations[0].targetEntity).toBe('insuficiência cardíaca');
      expect(relations[0].relationType).toBe('CAUSA');
      expect(relations[0].relationType).not.toContain('NEGACAO_');
    });

    it('should extract relations for new categories: CLASSIFICACAO, EPIDEMIOLOGIA, COMPLICACAO, and PROGNOSTICO', () => {
      // 1. CLASSIFICACAO
      const textClass = 'O diabetes mellitus subdivide-se em diabetes tipo 1 e diabetes tipo 2.';
      const entitiesClass = dictionaryNEREngine.extractEntities(textClass);
      const relClass = dictionaryNEREngine.extractRelations(textClass, entitiesClass);
      expect(relClass.length).toBeGreaterThanOrEqual(1);
      expect(relClass[0].relationType).toBe('CLASSIFICACAO');
      expect(relClass[0].triggerPhrase).toBe('subdivide-se em');

      // 2. EPIDEMIOLOGIA
      const textEpidem = 'A hipertensão arterial é prevalente no diabetes mellitus.';
      const entitiesEpidem = dictionaryNEREngine.extractEntities(textEpidem);
      const relEpidem = dictionaryNEREngine.extractRelations(textEpidem, entitiesEpidem);
      expect(relEpidem.length).toBeGreaterThanOrEqual(1);
      expect(relEpidem[0].relationType).toBe('EPIDEMIOLOGIA');
      expect(relEpidem[0].triggerPhrase).toBe('prevalente no');

      // 3. COMPLICACAO
      const textCompl = 'O diabetes mellitus pode evoluir para insuficiência cardíaca.';
      const entitiesCompl = dictionaryNEREngine.extractEntities(textCompl);
      const relCompl = dictionaryNEREngine.extractRelations(textCompl, entitiesCompl);
      expect(relCompl.length).toBeGreaterThanOrEqual(1);
      expect(relCompl[0].relationType).toBe('COMPLICACAO');
      expect(relCompl[0].triggerPhrase).toBe('pode evoluir para');

      // 4. PROGNOSTICO
      const textProg = 'O choque cardiogênico apresenta prognóstico reservado no infarto agudo do miocárdio.';
      const entitiesProg = dictionaryNEREngine.extractEntities(textProg);
      const relProg = dictionaryNEREngine.extractRelations(textProg, entitiesProg);
      expect(relProg.length).toBeGreaterThanOrEqual(1);
      expect(relProg[0].relationType).toBe('PROGNOSTICO');
      expect(relProg[0].triggerPhrase).toBe('prognostico reservado');
    });
  });

  describe('PARTE 2 — Aho-Corasick entity extraction (extractEntities)', () => {
    it('should extract entities accurately across multiple test sentences', () => {
      const testSentences = [
        'O infarto agudo do miocárdio pode causar insuficiência cardíaca. O tratamento inclui ácido acetilsalicílico e captopril.',
        'O paciente com diabetes tipo 2 e hipertensão arterial apresenta febre e dispneia.',
        'A taquicardia supraventricular necessita de eletrocardiograma e tratamento com propranolol.',
      ];

      const results = testSentences.map((s) => dictionaryNEREngine.extractEntities(s));

      // Sentence 1 entities
      expect(results[0].map((e) => e.normalizedTerm)).toEqual([
        'infarto agudo do miocárdio',
        'insuficiência cardíaca',
        'ácido acetilsalicílico',
        'captopril',
      ]);

      // Sentence 2 entities
      expect(results[1].map((e) => e.normalizedTerm)).toEqual([
        'diabetes mellitus tipo 2',
        'hipertensão',
        'febre',
        'dispneia',
      ]);

      // Sentence 3 entities
      expect(results[2].map((e) => e.normalizedTerm)).toEqual([
        'taquicardia supraventricular',
        'eletrocardiograma',
        'propranolol',
      ]);
    });

    it('should prioritize longer compound terms over shorter contained sub-terms', () => {
      const text = 'Paciente apresentou infarto agudo do miocárdio.';
      const entities = dictionaryNEREngine.extractEntities(text);

      expect(entities).toHaveLength(1);
      expect(entities[0].normalizedTerm).toBe('infarto agudo do miocárdio');
      expect(entities[0].text).toBe('infarto agudo do miocárdio');
    });
  });

  describe('Full End-to-End NER Pipeline', () => {
    it('should extract new terms from expanded dictionary (choque cardiogênico, noradrenalina)', () => {
      const text = 'O paciente com choque cardiogênico cursa com hipotensão e taquicardia. A noradrenalina trata a hipotensão.';
      const entities = dictionaryNEREngine.extractEntities(text);

      const entityTexts = entities.map((e) => e.text);
      expect(entityTexts).toContain('choque cardiogênico');
      expect(entityTexts).toContain('hipotensão');
      expect(entityTexts).toContain('taquicardia');
      expect(entityTexts).toContain('noradrenalina');

      const canonicalTerms = entities.map((e) => e.normalizedTerm);
      expect(canonicalTerms).toContain('choque cardiogênico');
      expect(canonicalTerms).toContain('noradrenalina');

      const relations = dictionaryNEREngine.extractRelations(text, entities);
      expect(relations.length).toBeGreaterThan(0);
      expect(relations.some((r) => r.sourceEntity === 'noradrenalina' && r.targetEntity === 'hipotensão' && r.relationType === 'TRATAMENTO')).toBe(true);
      expect(relations.some((r) => r.sourceEntity === 'choque cardiogênico' && r.targetEntity === 'taquicardia' && r.relationType === 'MANIFESTACAO')).toBe(true);
    });


    it('should recognize restored cardiac/renal physiology terms (nó sinoatrial, átrio direito, feixe de His)', () => {
      const text = 'O nó sinoatrial despolariza o átrio direito e o feixe de His conduz o estímulo aos ventrículos.';
      const entities = dictionaryNEREngine.extractEntities(text);

      const entityTexts = entities.map((e) => e.text);
      expect(entityTexts).toContain('nó sinoatrial');
      expect(entityTexts).toContain('átrio direito');
      expect(entityTexts).toContain('feixe de His');

      const canonicalTerms = entities.map((e) => e.normalizedTerm);
      expect(canonicalTerms).toContain('nó sinoatrial');
      expect(canonicalTerms).toContain('átrio direito');
      expect(canonicalTerms).toContain('feixe de His');
    });

    it('should process sample medical paragraph correctly', () => {
      const text = 'Para a insuficiência cardíaca, o tratamento inclui ácido acetilsalicílico e captopril.';
      const entities = dictionaryNEREngine.extractEntities(text);
      const relations = dictionaryNEREngine.extractRelations(text, entities);

      expect(entities).toHaveLength(3);
      expect(entities.map((e) => e.normalizedTerm)).toEqual([
        'insuficiência cardíaca',
        'ácido acetilsalicílico',
        'captopril',
      ]);

      expect(relations).toHaveLength(2);

      expect(relations[0]).toMatchObject({
        sourceEntity: 'insuficiência cardíaca',
        targetEntity: 'ácido acetilsalicílico',
        relationType: 'TRATAMENTO',
        triggerPhrase: 'tratamento inclui',
      });

      expect(relations[1]).toMatchObject({
        sourceEntity: 'insuficiência cardíaca',
        targetEntity: 'captopril',
        relationType: 'TRATAMENTO',
        triggerPhrase: 'tratamento inclui',
      });
    });
  });

  describe('PARTE 3 — Sanidade e Integridade do Dicionário (CID-10)', () => {
    it('deve possuir mais de 10.000 termos principais e nenhuma duplicata exata de normalizedTerm', () => {
      const terminology = getTerminology();
      const normalizedMap = new Map<string, number>();
      let duplicateCount = 0;

      for (const entry of terminology as any[]) {
        const norm = entry.term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const count = (normalizedMap.get(norm) || 0) + 1;
        normalizedMap.set(norm, count);
        if (count > 1) duplicateCount++;
      }

      expect(terminology.length).toBeGreaterThan(10000);
      expect(duplicateCount).toBe(0);
    });

    it('deve reconhecer diagnósticos específicos e códigos CID-10 importados do DATASUS', () => {
      const text = 'O paciente apresentou shiguelose devida a shigella dysenteriae e febre paratifóide a.';
      const entities = dictionaryNEREngine.extractEntities(text);

      const normalizedTerms = entities.map((e) => e.normalizedTerm);
      expect(normalizedTerms).toContain('shiguelose devida a shigella dysenteriae');
      expect(normalizedTerms).toContain('febre paratifóide a');

      // Test searching by CID code directly
      const codeText = 'Hipótese diagnóstica: A03.0 e A01.1.';
      const codeEntities = dictionaryNEREngine.extractEntities(codeText);
      expect(codeEntities.map((e) => e.normalizedTerm)).toEqual([
        'shiguelose devida a shigella dysenteriae',
        'febre paratifóide a',
      ]);
    });
  });

  describe('PARTE 4 — Cobertura e Limiar de Fallback (estimateCoverage)', () => {
    it('deve calcular alta cobertura para texto rico em termos médicos e superam MIN_COVERAGE_THRESHOLD (>= 0.03)', () => {
      const medicalText = 'O paciente com hipertensão arterial sistêmica e diabetes mellitus tipo 2 apresenta febre e dispneia.';
      const entities = dictionaryNEREngine.extractEntities(medicalText);
      const coverage = estimateCoverage(medicalText, entities);

      expect(coverage).toBeGreaterThanOrEqual(MIN_COVERAGE_THRESHOLD);
      expect(coverage).toBeGreaterThan(0.3); // > 30% de cobertura
    });

    it('deve calcular baixa cobertura (0.0) para texto genérico/não-médico e ficar abaixo do limiar MIN_COVERAGE_THRESHOLD (< 0.03)', () => {
      const genericText = 'A reunião de negócios sobre planejamento estratégico financeiro ocorreu na segunda-feira pela manhã.';
      const entities = dictionaryNEREngine.extractEntities(genericText);
      const coverage = estimateCoverage(genericText, entities);

      expect(coverage).toBeLessThan(MIN_COVERAGE_THRESHOLD);
      expect(coverage).toBe(0);
    });

    it('deve retornar 0 para texto vazio ou lista de entidades vazia (edge cases)', () => {
      expect(estimateCoverage('', [])).toBe(0);
      expect(estimateCoverage('   ', [])).toBe(0);
      expect(estimateCoverage('Algum texto aleatório', [])).toBe(0);
    });
  });

  describe('PARTE 5 — Resiliência do NER (Normalização + Levenshtein / Typo Tolerance)', () => {
    it('deve reconhecer termos sem acento via busca exata normalizada (Passo A)', () => {
      const textWithoutAccents = 'Paciente com hipertensao e diabetes mellitus apresentando dor toracica.';
      const entities = dictionaryNEREngine.extractEntities(textWithoutAccents);

      const terms = entities.map((e) => e.normalizedTerm);
      expect(terms).toContain('hipertensão arterial sistêmica');
      expect(terms).toContain('diabetes mellitus');
      expect(terms).toContain('dor torácica');
    });

    it('deve reconhecer termos com variações de digitação (typos) via Levenshtein (Passo B)', () => {
      // "pneunomia" (typo de pneumonia) e "cefaleya" (typo de cefaleia)
      const textWithTypos = 'Quadro sugestivo de pneunomia bacteriana com cefaleya intensa.';
      const entities = dictionaryNEREngine.extractEntities(textWithTypos);

      const terms = entities.map((e) => e.normalizedTerm);
      expect(terms).toContain('pneumonia');
      expect(terms).toContain('cefaleia');
    });

    it('deve associar corretamente códigos clínicos mesmo em matches com typo', () => {
      const match = dictionaryNEREngine.lookup('pneunomia');
      expect(match).toBeDefined();
      expect(match?.canonical_term).toBe('pneumonia');
      expect(match?.code).toBeDefined();
    });
  });


  describe('PARTE 7 — Irmãos de Categoria DeCS/CID-10 (getSiblingsByCategory)', () => {
    it('deve retornar termos irmãos da mesma categoria excluindo o próprio termo', () => {
      const siblings = dictionaryNEREngine.getSiblingsByCategory('captopril', 8);
      expect(Array.isArray(siblings)).toBe(true);
      expect(siblings.length).toBeGreaterThan(0);
      expect(siblings.map((s) => s.toLowerCase())).not.toContain('captopril');
    });

    it('deve retornar array vazio para termos inexistentes ou inválidos de forma graciosa', () => {
      const empty1 = dictionaryNEREngine.getSiblingsByCategory('');
      expect(empty1).toEqual([]);

      const empty2 = dictionaryNEREngine.getSiblingsByCategory('termo_totalmente_inexistente_xyz_123');
      expect(empty2).toEqual([]);
    });
  });
});



