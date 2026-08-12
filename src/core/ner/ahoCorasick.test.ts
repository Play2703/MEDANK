import { describe, it, expect } from 'vitest';
import { AhoCorasick } from './ahoCorasick';

describe('AhoCorasick Automaton', () => {
  it('should find single and multiple keyword occurrences correctly', () => {
    const ac = new AhoCorasick<{ id: number }>();
    ac.add('infarto', { id: 1 });
    ac.add('infarto agudo do miocardio', { id: 2 });
    ac.add('miocardio', { id: 3 });
    ac.build();

    const matches = ac.search('paciente com infarto agudo do miocardio grave');

    expect(matches).toEqual([
      {
        startIndex: 13,
        endIndex: 20,
        keyword: 'infarto',
        value: { id: 1 },
      },
      {
        startIndex: 13,
        endIndex: 39,
        keyword: 'infarto agudo do miocardio',
        value: { id: 2 },
      },
      {
        startIndex: 30,
        endIndex: 39,
        keyword: 'miocardio',
        value: { id: 3 },
      },
    ]);
  });

  it('should handle overlapping terms correctly', () => {
    const ac = new AhoCorasick<string>();
    ac.add('he', 'HE');
    ac.add('she', 'SHE');
    ac.add('his', 'HIS');
    ac.add('hers', 'HERS');
    ac.build();

    const matches = ac.search('ushers');
    expect(matches.map((m) => ({ keyword: m.keyword, start: m.startIndex, end: m.endIndex }))).toEqual([
      { keyword: 'she', start: 1, end: 4 },
      { keyword: 'he', start: 2, end: 4 },
      { keyword: 'hers', start: 2, end: 6 },
    ]);
  });

  it('should return empty matches for unmatched text', () => {
    const ac = new AhoCorasick<string>();
    ac.add('diabetes', 'DOENCA');
    ac.build();

    const matches = ac.search('paciente hígido sem sintomas');
    expect(matches).toHaveLength(0);
  });
});
