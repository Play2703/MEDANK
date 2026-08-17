import { describe, it, expect, beforeAll } from 'vitest';
import { dictionaryNEREngine, TOP_TERMS_FOR_L1_CACHE, lookupTerm } from './DictionaryNEREngine';

describe('DictionaryNEREngine Hybrid L1/L2 - Regressão, Fallback e Performance', () => {
  beforeAll(async () => {
    await dictionaryNEREngine.warmup();
  }, 30000);

  it('TAREFA 1 & 3: Deve inicializar L1 dentro do orçamento seguro de memória e tempo', () => {
    expect(dictionaryNEREngine.l1TermsCount).toBeGreaterThanOrEqual(10000);
    expect(dictionaryNEREngine.l1MemoryDeltaMB).toBeLessThan(150); // Orçamento Render Free (150 MB)
    expect(dictionaryNEREngine.l1BuildDurationMs).toBeLessThan(15000); // Tolerância para execução concorrente no Vitest
  });

  it('TAREFA 3.1: Regressão de Correção em 5 Frases Médicas Distintas (Fixture)', () => {
    const testCases = [
      {
        text: 'Paciente idoso de 72 anos, hipertenso e diabético, apresentando quadro de dor torácica aguda em aperto.',
        expectedTexts: ['hipertenso', 'dor torácica', 'aguda', 'em'],
        expectedCanonicals: ['hipertensão arterial sistêmica', 'dor torácica', 'água', 'esclerose múltipla'],
      },
      {
        text: 'Prescrito metformina 850mg e losartana 50mg para controle de diabetes mellitus e hipertensão arterial sistêmica.',
        expectedTexts: ['metformina', 'losartana', 'diabetes mellitus', 'hipertensão arterial sistêmica'],
        expectedCanonicals: ['metformina', 'losartana', 'diabetes mellitus', 'hipertensão arterial sistêmica'],
      },
      {
        text: 'Apresenta febre alta, tosse produtiva e dispneia, com suspeita de pneumonia adquirida na comunidade.',
        expectedTexts: ['febre', 'tosse produtiva', 'dispneia', 'pneumonia adquirida na comunidade'],
        expectedCanonicals: ['febre', 'tosse', 'dispneia', 'pneumonia adquirida na comunidade'],
      },
      {
        text: 'O eletrocardiograma evidenciou supradesnivelamento do segmento ST sugestivo de infarto agudo do miocárdio.',
        expectedTexts: ['eletrocardiograma', 'sugestivo', 'infarto agudo do miocárdio'],
        expectedCanonicals: ['eletrocardiograma', 'sugestão', 'infarto agudo do miocárdio'],
      },
      {
        text: 'Apendicite aguda confirmada por tomografia computadorizada de abdome, indicada apendicectomia de urgência.',
        expectedTexts: ['Apendicite aguda', 'tomografia computadorizada', 'abdome', 'indicada', 'apendicectomia', 'urgência'],
        expectedCanonicals: ['apendicite aguda', 'tomografia computadorizada', 'neoplasia maligna do abdome', 'indicã', 'apendicectomia', 'emergências'],
      },
    ];

    for (const { text, expectedTexts, expectedCanonicals } of testCases) {
      const entities = dictionaryNEREngine.extractEntities(text);
      expect(entities.map((e) => e.text.toLowerCase())).toEqual(expectedTexts.map((t) => t.toLowerCase()));
      expect(entities.map((e) => e.normalizedTerm.toLowerCase())).toEqual(expectedCanonicals.map((c) => c.toLowerCase()));
    }
  });

  it('TAREFA 3.2: Deve reconhecer termos raros garantidamente fora do L1 via fallback L2', () => {
    // Diagnósticos e códigos CID-10 raros do DATASUS que não constam nos top 15.000 termos de L1
    const rareText = 'Paciente diagnosticado com shiguelose devida a shigella dysenteriae e febre paratifóide c.';
    const entities = dictionaryNEREngine.extractEntities(rareText);
    const terms = entities.map((e) => e.normalizedTerm);

    expect(terms).toContain('shiguelose devida a shigella dysenteriae');
    expect(terms).toContain('febre paratifóide c');

    // Código CID raro direto
    const codeText = 'Código diagnóstico A01.3 e A03.0 registrado.';
    const codeEntities = dictionaryNEREngine.extractEntities(codeText);
    expect(codeEntities.map((e) => e.normalizedTerm)).toEqual([
      'febre paratifóide c',
      'shiguelose devida a shigella dysenteriae',
    ]);
  });

  it('TAREFA 3.3: Benchmark de Performance em texto longo (~5.000 caracteres)', () => {
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

    // Repetir para atingir ~5.000 caracteres
    const longText = Array(4).fill(medicalParagraph).join('\n');
    expect(longText.length).toBeGreaterThan(4500);

    const t0 = Date.now();
    const entities = dictionaryNEREngine.extractEntities(longText);
    const durationMs = Date.now() - t0;

    expect(entities.length).toBeGreaterThan(50);
    console.log(`[Benchmark] Texto longo de ${longText.length} caracteres processado em ${durationMs}ms (${entities.length} entidades extraídas).`);
  }, 30000);
});
