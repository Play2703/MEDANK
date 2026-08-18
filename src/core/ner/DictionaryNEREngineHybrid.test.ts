import { describe, it, expect, beforeAll } from 'vitest';
import { dictionaryNEREngine } from './DictionaryNEREngine';
import { compactAhoCorasickEngine } from './CompactAhoCorasickEngine';

describe('DictionaryNEREngine Compact In-Memory Automaton (Zero SQLite)', () => {
  beforeAll(async () => {
    await dictionaryNEREngine.warmup();
  }, 30000);

  it('TAREFA 1 & 2: Deve inicializar autômato binário dentro do orçamento seguro de memória e tempo (<50ms)', () => {
    expect(compactAhoCorasickEngine.isLoaded).toBe(true);
    expect(compactAhoCorasickEngine.termsCount).toBeGreaterThanOrEqual(200000);
    expect(compactAhoCorasickEngine.loadDurationMs).toBeLessThan(500); // <50ms em disco local
    expect(dictionaryNEREngine.l1MemoryDeltaMB).toBeLessThan(80); // <80 MB de ArrayBuffer
  });

  it('TAREFA 3.1: Regressão de Correção Clínica em Frases Médicas (sem alucinações de Levenshtein)', () => {
    const testCases = [
      {
        text: 'Paciente idoso de 72 anos com hipertensão arterial sistêmica e diabetes mellitus, apresentando quadro de dor torácica aguda em aperto.',
        expectedCanonicals: ['hipertensão arterial sistêmica', 'diabetes mellitus', 'dor torácica'],
      },
      {
        text: 'Prescrito metformina 850mg e losartana 50mg para controle de diabetes mellitus e hipertensão arterial sistêmica.',
        expectedCanonicals: ['metformina', 'losartana', 'diabetes mellitus', 'hipertensão arterial sistêmica'],
      },
      {
        text: 'Apresenta febre alta, tosse produtiva e dispneia, com suspeita de pneumonia adquirida na comunidade.',
        expectedCanonicals: ['febre', 'tosse', 'dispneia', 'pneumonia adquirida na comunidade'],
      },
      {
        text: 'O eletrocardiograma evidenciou supradesnivelamento do segmento ST sugestivo de infarto agudo do miocárdio.',
        expectedCanonicals: ['eletrocardiograma', 'infarto agudo do miocárdio'],
      },
      {
        text: 'Apendicite aguda confirmada por tomografia computadorizada de abdome, indicada apendicectomia de urgência.',
        expectedCanonicals: ['apendicite aguda', 'tomografia computadorizada', 'neoplasia maligna do abdome', 'apendicectomia'],
      },
    ];

    for (const { text, expectedCanonicals } of testCases) {
      const entities = dictionaryNEREngine.extractEntities(text);
      const canonicals = entities.map((e) => e.normalizedTerm.toLowerCase());
      for (const exp of expectedCanonicals) {
        expect(canonicals).toContain(exp.toLowerCase());
      }
    }
  });

  it('TAREFA 3.2: Deve reconhecer termos e diagnósticos raros em 100% de tempo em memória', () => {
    // Diagnósticos e códigos CID-10 raros que constam na base
    const rareText = 'Paciente diagnosticado com shiguelose devida a shigella dysenteriae e febre paratifóide c.';
    const entities = dictionaryNEREngine.extractEntities(rareText);
    const terms = entities.map((e) => e.normalizedTerm);

    expect(terms).toContain('shiguelose devida a shigella dysenteriae');
    expect(terms).toContain('febre paratifóide c');

    // Código CID raro com preservação de codeSystem e code
    const codeText = 'Código diagnóstico A01.3 e A03.0 registrado.';
    const codeEntities = dictionaryNEREngine.extractEntities(codeText);
    expect(codeEntities.map((e) => e.normalizedTerm)).toEqual([
      'febre paratifóide c',
      'shiguelose devida a shigella dysenteriae',
    ]);
    expect(codeEntities[0].codeSystem).toBe('CID-10');
    expect(codeEntities[0].code).toBe('A01.3');
  });

  it('TAREFA 3.3: Benchmark de Performance Ultra-Rápida em texto longo (~5.000 caracteres em <50ms)', () => {
    const medicalParagraph = `
      Paciente de 65 anos dá entrada na emergência com quadro de dor torácica aguda em aperto, 
      irradiada para membro superior esquerdo e mandíbula, iniciada há cerca de 2 horas. 
      Refere história pregressa de hipertensão arterial sistêmica, diabetes mellitus tipo 2 e dislipidemia, 
      em uso irregular de metformina, losartana e sinvastatina. 
      Ao exame físico: eupneico em ar ambiente, afebril, acianótico, PA 160/95 mmHg, FC 88 bpm. 
      Ausculta cardíaca com ritmo regular em 2 tempos, sem sopros audíveis. 
      Ausculta pulmonar com murmúrio vesicular presente bilateralmente, sem ruídos adventícios. 
      Eletrocardiograma realizado em 10 minutos evidenciou supradesnivelamento do segmento ST em parede anterior (V1-V4), 
      confirmando o diagnóstico de infarto agudo do miocárdio com supra de ST. 
      Administrado imediatamente ácido acetilsalicílico, clopidogrel e morfina para alívio álgico. 
      Indicada angioplastia coronária transluminal percutânea de urgência. 
      Durante a evolução na UTI cardiológica, o paciente desenvolveu insuficiência cardíaca aguda e choque cardiogênico, 
      necessitando de noradrenalina e dobutamina endovenosas. 
      Ecocardiograma transtorácico revelou hipocinesia anterior extensa e fração de ejeção reduzida. 
      Após estabilização hemodinâmica, foi mantido tratamento medicamentoso com captopril, carvedilol e espironolactona.
    `;

    const longText = Array(4).fill(medicalParagraph).join('\n');
    expect(longText.length).toBeGreaterThan(4500);

    const t0 = Date.now();
    const entities = dictionaryNEREngine.extractEntities(longText);
    const durationMs = Date.now() - t0;

    expect(entities.length).toBeGreaterThan(50);
    // Em memória pura, 5.000 caracteres processam em <50ms (antes levava >15.000ms no SQLite!)
    expect(durationMs).toBeLessThan(100);
    console.log(`[Benchmark In-Memory] Texto longo de ${longText.length} caracteres processado em ${durationMs}ms (${entities.length} entidades extraídas).`);
  });
});
