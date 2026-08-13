import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getCategoryFromTreeNumber, resolveBestCategory, shouldSkipTerm } from './decsCategoryMap';
import { parseDecsXml } from './decsXmlParser';
import { DictionaryNEREngine } from '../DictionaryNEREngine';
import { GeminiAiNerProvider, HybridNEREngine } from '../HybridNEREngine';

describe('DeCS / MeSH 2026 Integration Tests', () => {
  describe('1. Category Mapping & Quality Filtering', () => {
    it('should correctly map DeCS tree_number to MedAnki categories', () => {
      expect(getCategoryFromTreeNumber('C14.907.489')?.category).toBe('DOENCA');
      expect(getCategoryFromTreeNumber('D03.438.421.080')?.category).toBe('MEDICAMENTO');
      expect(getCategoryFromTreeNumber('A07.541.510')?.category).toBe('ESTRUTURA_ANATOMICA');
      expect(getCategoryFromTreeNumber('E01.370.370.380')?.category).toBe('EXAME');
      expect(getCategoryFromTreeNumber('E02.520.615')?.category).toBe('PROCEDIMENTO');
      expect(getCategoryFromTreeNumber('C23.888.100')?.category).toBe('SINTOMA');
      expect(getCategoryFromTreeNumber('Z01.107')).toBeNull(); // Geographical non-clinical
    });

    it('should resolve best category by priority when multiple tree numbers are present', () => {
      // C (DOENCA priority 1) should beat D (MEDICAMENTO priority 2)
      expect(resolveBestCategory(['D02.100', 'C14.907'])).toBe('DOENCA');
      // D (MEDICAMENTO priority 2) should beat A (ANATOMY priority 4)
      expect(resolveBestCategory(['A07.100', 'D03.400'])).toBe('MEDICAMENTO');
    });

    it('should filter out generic, short, or invalid check-tag terms', () => {
      expect(shouldSkipTerm('hipertensão')).toBe(false);
      expect(shouldSkipTerm('al')).toBe(true); // < 3 chars
      expect(shouldSkipTerm('humanos')).toBe(true); // Denylisted tag
      expect(shouldSkipTerm('outras formas')).toBe(true); // Generic regex
      expect(shouldSkipTerm('Na')).toBe(true); // Chemical symbol
      expect(shouldSkipTerm('12345')).toBe(true); // Pure numbers
    });
  });

  describe('2. DeCS XML Parser', () => {
    it('should parse descriptors, extract CDATA, and clean synonyms from sample fixture XML', () => {
      const fixturePath = path.resolve(process.cwd(), 'scripts/seed-source/decs/fixtures/sample-decs.xml');
      const xml = fs.readFileSync(fixturePath, 'utf-8');
      const descriptors = parseDecsXml(xml);

      expect(descriptors.length).toBe(5); // 5 clinical descriptors (Brasil ignored)

      const hip = descriptors.find((d) => d.ui === 'D006973');
      expect(hip).toBeDefined();
      expect(hip?.term).toBe('hipertensão');
      expect(hip?.category).toBe('DOENCA');
      expect(hip?.codes).toEqual([
        { system: 'DeCS', code: 'D006973' },
        { system: 'MeSH', code: 'D006973' },
      ]);
      expect(hip?.synonyms).toContain('pressão alta');

      const alo = descriptors.find((d) => d.ui === 'D000404');
      expect(alo).toBeDefined();
      expect(alo?.category).toBe('MEDICAMENTO');
    });
  });

  describe('3. Local Code Emission in DictionaryNEREngine', () => {
    it('should emit codeSystem and code locally when matching entries with DeCS or CID-10 codes', () => {
      const engine = new DictionaryNEREngine();
      const matches = engine.extractEntities('O paciente com alopurinol apresenta shiguelose.');

      const aloMatch = matches.find((m) => m.text.toLowerCase() === 'alopurinol');
      expect(aloMatch).toBeDefined();
      expect(aloMatch?.codeSystem).toBe('DeCS');
      expect(aloMatch?.code).toBe('D000493');

      const shigMatch = matches.find((m) => m.normalizedTerm === 'shiguelose devida a shigella dysenteriae');
      expect(shigMatch).toBeDefined();
      expect(shigMatch?.codeSystem).toBe('CID-10');
      expect(shigMatch?.code).toBe('A03.0');
    });
  });

  describe('4. ENABLE_AI_NER Environment Variable Control', () => {
    it('GeminiAiNerProvider should be disabled when ENABLE_AI_NER is false (default token mitigation)', () => {
      const origKey = process.env.GEMINI_API_KEY;
      const origEnable = process.env.ENABLE_AI_NER;

      process.env.GEMINI_API_KEY = 'test_key';
      process.env.ENABLE_AI_NER = 'false';

      const provider = new GeminiAiNerProvider();
      expect(provider.isAvailable()).toBe(false);

      const hybrid = new HybridNEREngine(provider);
      expect(hybrid.mode).toBe('local');

      process.env.GEMINI_API_KEY = origKey;
      process.env.ENABLE_AI_NER = origEnable;
    });

    it('GeminiAiNerProvider should be enabled when ENABLE_AI_NER is true and GEMINI_API_KEY exists', () => {
      const origKey = process.env.GEMINI_API_KEY;
      const origEnable = process.env.ENABLE_AI_NER;

      process.env.GEMINI_API_KEY = 'test_key';
      process.env.ENABLE_AI_NER = 'true';

      const provider = new GeminiAiNerProvider();
      expect(provider.isAvailable()).toBe(true);

      const hybrid = new HybridNEREngine(provider);
      expect(hybrid.mode).toBe('hybrid');

      process.env.GEMINI_API_KEY = origKey;
      process.env.ENABLE_AI_NER = origEnable;
    });
  });
});
