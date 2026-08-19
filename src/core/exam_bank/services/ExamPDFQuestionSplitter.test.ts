import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExamPDFQuestionSplitter,
  ExamSplitterResult,
} from './ExamPDFQuestionSplitter';
import { OCRPageResult } from './LocalOCRService';
import { PDFLayoutResult } from '../../import_engine/services/DocumentReaderService';
import { db } from '../../../data/db/database';
import { RepositoryFactory } from '../../../data/repositories_impl/RepositoryFactory';

describe('ExamPDFQuestionSplitter - Testes Obrigatórios de Segmentação e OCR', () => {
  beforeEach(async () => {
    await db.extractedExamQuestions.clear();
  });

  // 1. PDF/texto nativo no formato atual
  it('1. deve segmentar perfeitamente PDF/texto nativo com enunciado, alternativas A-E e gabarito oficial', () => {
    const nativeText = `
QUESTÃO 01
Paciente masculino de 58 anos com infarto agudo do miocárdio de parede inferior. Qual a conduta inicial?
A) Realizar angioplastia primária imediata.
B) Iniciar metoprolol intravenoso imediato.
C) Realizar trombólise química com estreptoquinase.
D) Prescrever apenas ácido acetilsalicílico e repouso.
E) Indicar revascularização cirúrgica de urgência.

GABARITO: 1-A
`;
    const result = ExamPDFQuestionSplitter.splitFromText(nativeText);
    expect(result.totalQuestions).toBe(1);
    expect(result.questions[0].questionNumber).toBe(1);
    expect(result.questions[0].options).toHaveLength(5);
    expect(result.questions[0].correctLetter).toBe('A');
    expect(result.questions[0].confidence).toBe('high');
    expect(result.success).toBe(true);
  });

  // 2. OCR de uma página com QUESTÃO 27 e alternativas A-D
  it('2. deve estruturar OCR de uma página com QUESTÃO 27 e 4 alternativas A-D', () => {
    const ocrPages: OCRPageResult[] = [
      {
        pageNumber: 12,
        confidence: 94,
        text: `
INEP - ENADE 2023 - MEDICINA
QUESTÃO 27
Uma paciente de 35 anos, primigesta com 32 semanas de gestação, comparece à consulta de pré-natal com pressão arterial de 150/100 mmHg e proteinúria de fita 2+.
A) Iniciar sulfato de magnésio e metildopa.
B) Prescrever inibidor da ECA e repouso absoluto.
C) Realizar parto cesáreo de emergência imediato.
D) Solicitar apenas repetição de exames em 30 dias.
`,
        blocks: [
          { text: 'INEP - ENADE 2023 - MEDICINA', y: 50 },
          { text: 'QUESTÃO 27', y: 100 },
          { text: 'Uma paciente de 35 anos, primigesta com 32 semanas de gestação, comparece à consulta de pré-natal com pressão arterial de 150/100 mmHg e proteinúria de fita 2+.', y: 150 },
          { text: 'A) Iniciar sulfato de magnésio e metildopa.', y: 220 },
          { text: 'B) Prescrever inibidor da ECA e repouso absoluto.', y: 250 },
          { text: 'C) Realizar parto cesáreo de emergência imediato.', y: 280 },
          { text: 'D) Solicitar apenas repetição de exames em 30 dias.', y: 310 },
        ],
      },
    ];

    const result = ExamPDFQuestionSplitter.splitFromOCR(ocrPages);
    expect(result.totalQuestions).toBe(1);
    const q = result.questions[0];
    expect(q.questionNumber).toBe(27);
    expect(q.statement).toContain('primigesta com 32 semanas');
    expect(q.options).toHaveLength(4);
    expect(q.options[0].letter).toBe('A');
    expect(q.options[3].letter).toBe('D');
    expect(q.confidence).toBe('high');
    expect(q.pageNumber).toBe(12);
  });

  // 3. OCR com alternativas (A), B), C), D)
  it('3. deve suportar OCR com alternativas em formatos variados (A), B), C., D)', () => {
    const ocrPages: OCRPageResult[] = [
      {
        pageNumber: 5,
        text: `
QUESTÃO 15
Em relação ao suporte básico de vida no adulto em PCR, assinale a opção correta:
(A) A frequência recomendada de compressões torácicas é de 100 a 120 por minuto.
B) Deve-se intercalar 15 compressões com 2 ventilações em adultos com 1 socorrista.
C. A profundidade da compressão torácica no adulto deve ser de pelo menos 8 cm.
D) A interrupção das compressões deve ser realizada a cada 30 segundos para checar o pulso.
`,
      },
    ];

    const result = ExamPDFQuestionSplitter.splitFromOCR(ocrPages);
    expect(result.totalQuestions).toBe(1);
    const q = result.questions[0];
    expect(q.questionNumber).toBe(15);
    expect(q.options).toHaveLength(4);
    expect(q.options[0].letter).toBe('A');
    expect(q.options[0].text).toContain('100 a 120 por minuto');
    expect(q.options[1].letter).toBe('B');
    expect(q.options[2].letter).toBe('C');
    expect(q.options[3].letter).toBe('D');
    expect(q.confidence).toBe('high');
  });

  // 4. Questão iniciando no meio da numeração
  it('4. deve aceitar que a numeração inicie em 27 ou outro número sem exigir questão 1 primeiro', () => {
    const textStartingAt27 = `
QUESTÃO 27
Lactente de 6 meses com tosse paroxística e estridor inspiratório (guincho).
A) Coqueluche (Bordetella pertussis).
B) Laringite estridulosa.
C) Epiglotite aguda.
D) Aspiração de corpo estranho.

QUESTÃO 28
Recém-nascido com icterícia às custas de bilirrubina direta no 20º dia de vida com fezes acólicas.
A) Atresia de vias biliares.
B) Icterícia do leite materno.
C) Incompatibilidade ABO.
D) Síndrome de Gilbert.
`;

    const result = ExamPDFQuestionSplitter.splitFromText(textStartingAt27);
    expect(result.totalQuestions).toBe(2);
    expect(result.questions[0].questionNumber).toBe(27);
    expect(result.questions[1].questionNumber).toBe(28);
    expect(result.questions[0].confidence).toBe('high');
    expect(result.questions[1].confidence).toBe('high');
  });

  // 5. Questão quebrada entre duas páginas
  it('5. deve agrupar corretamente uma questão que inicia na página 4 e termina na página 5', () => {
    const ocrPages: OCRPageResult[] = [
      {
        pageNumber: 4,
        text: `
QUESTÃO 42
Homem de 60 anos, etilista crônico, com ascite volumosa e febre. A paracentese diagnóstica revelou líquido ascítico com contagem de polimorfonucleares de 380/mm³. Diante do quadro de Peritonite Bacteriana Espontânea (PBE):
A) Iniciar Cefotaxima intravenosa e albumina humana no 1º e 3º dias.
B) Iniciar Ciprofloxacino oral e diuréticos em doses dobradas.
`,
      },
      {
        pageNumber: 5,
        text: `
C) Realizar paracentese de alívio total imediatamente sem reposição de expansores.
D) Indicar laparotomia exploradora de urgência para lavagem da cavidade peritoneal.
E) Prescrever apenas Norfloxacino profilático por 7 dias.

QUESTÃO 43
Mulher com hipotireoidismo descompensado.
A) Levotiroxina.
B) Metimazol.
C) Propanolol.
D) Iodo.
`,
      },
    ];

    const result = ExamPDFQuestionSplitter.splitFromOCR(ocrPages);
    expect(result.totalQuestions).toBe(2);

    const q42 = result.questions[0];
    expect(q42.questionNumber).toBe(42);
    expect(q42.pageNumber).toBe(4);
    expect(q42.endPageNumber).toBe(5);
    expect(q42.options).toHaveLength(5);
    expect(q42.options[0].letter).toBe('A');
    expect(q42.options[2].letter).toBe('C');
    expect(q42.options[4].letter).toBe('E');
    expect(q42.confidence).toBe('high');

    const q43 = result.questions[1];
    expect(q43.questionNumber).toBe(43);
    expect(q43.pageNumber).toBe(5);
  });

  // 6. Cabeçalho/rodapé repetido
  it('6. deve ignorar linhas repetitivas de cabeçalho e rodapé sem poluir o enunciado', () => {
    const textWithHeaders = `
INEP - Revalida - 2022 - Prova Escrita Objetiva
Página 14 de 35
QUESTÃO 08
Paciente com insuficiência renal aguda oligúrica pós-operatória.
INEP - Revalida - 2022 - Prova Escrita Objetiva
A) Hidratação venosa vigorosa guiada por metas hemodinâmicas.
B) Furosemida em altas doses em infusão contínua.
C) Hemodiálise imediata independente de escórias ou potássio.
D) Dopamina em dose renal vasodilatadora.
Página 14 de 35
`;

    const result = ExamPDFQuestionSplitter.splitFromText(textWithHeaders);
    expect(result.totalQuestions).toBe(1);
    const q = result.questions[0];
    expect(q.statement).not.toContain('INEP - Revalida');
    expect(q.statement).not.toContain('Página 14 de 35');
    expect(q.options).toHaveLength(4);
  });

  // 7. Tabela dentro do enunciado
  it('7. deve preservar tabelas formatadas dentro do enunciado da questão', () => {
    const textWithTable = `
QUESTÃO 10
Considere os resultados laboratoriais de gasometria arterial a seguir:
pH: 7.28 | PaCO2: 28 mmHg | HCO3: 13 mEq/L | BE: -9 mEq/L | Na: 140 mEq/L | Cl: 102 mEq/L
Com base nestes parâmetros e no cálculo do ânion gap, qual o distúrbio ácido-básico primário?
A) Acidose metabólica com ânion gap elevado (ex: cetoacidose ou uremia).
B) Acidose respiratória crônica agudizada por broncoespasmo.
C) Alcalose metabólica compensada por hipoventilação alveolar.
D) Acidose metabólica hiperclorêmica com ânion gap normal.
`;

    const result = ExamPDFQuestionSplitter.splitFromText(textWithTable);
    expect(result.totalQuestions).toBe(1);
    const q = result.questions[0];
    expect(q.statement).toContain('pH: 7.28');
    expect(q.statement).toContain('HCO3: 13 mEq/L');
    expect(q.options).toHaveLength(4);
    expect(q.confidence).toBe('high');
  });

  // 8. PDF sem camada de texto acionando o fallback OCR
  it('8. deve detectar PDF escaneado (sem texto) e retornar diagnóstico claro quando OCR native-only for usado', async () => {
    const emptyLayoutMock: PDFLayoutResult = {
      totalPages: 10,
      rawText: '',
      items: [],
      inspection: {
        totalPages: 10,
        processablePages: 10,
        textItemsCount: 0,
        extractedCharsCount: 0,
        emptyPagesCount: 10,
        emptyPagesRatio: 1.0,
        isScannedPdf: true,
      },
    };

    const result = await ExamPDFQuestionSplitter.split(emptyLayoutMock, { ocrMode: 'native-only' });
    expect(result.totalQuestions).toBe(0);
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('NO_TEXT_LAYER');
    expect(result.warning).toContain('PDF escaneado detectado');
  });

  // 9. Falha do OCR retornando diagnóstico útil
  it('9. deve fornecer código de falha e diagnóstico observável caso ocorra erro no OCR', async () => {
    const badInput = new ArrayBuffer(10);
    const result = await ExamPDFQuestionSplitter.split(badInput, {
      ocrMode: 'native-only',
    });

    expect(result.totalQuestions).toBe(0);
    expect(result.failureReason).toBe('NO_TEXT_LAYER');
    expect(result.warning).toBeDefined();
  });

  // 10. Documento realmente sem questões continuando como texto RAG
  it('10. deve retornar 0 questões com failureReason NO_QUESTION_MARKERS para textos médicos narrativos', () => {
    const narrativeText = `
Diretriz Brasileira de Insuficiência Cardíaca Crônica e Aguda.
A insuficiência cardíaca com fração de ejeção reduzida deve ser tratada com terapia quádrupla:
- Inibidor de SGLT2 (Dapagliflozina ou Empagliflozina)
- Sacubitril/Valsartana ou IECA
- Betabloqueador (Carvedilol, Bisoprolol ou Succinato de Metoprolol)
- Antagonista de Receptor Mineralocorticoide (Espironolactona)
`;

    const result = ExamPDFQuestionSplitter.splitFromText(narrativeText);
    expect(result.totalQuestions).toBe(0);
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('NO_QUESTION_MARKERS');
  });

  // 11. Não transformar listas numeradas de um capítulo em questões
  it('11. não deve transformar listas numeradas de diagnósticos ou dosagens em falsas questões', () => {
    const listText = `
Critérios diagnósticos de Febre Reumática (Critérios de Jones modificados):
Critérios maiores:
1. Cardite clínica ou subclínica.
2. Poliartrite migratória de grandes articulações.
3. Coreia de Sydenham.
4. Eritema marginado.
5. Nódulos subcutâneos.

Critérios menores:
1. Febre (temperatura >= 38.5 °C).
2. Artralgia.
3. VHS ou PCR elevados.
4. Intervalo PR alargado no ECG.
`;

    const result = ExamPDFQuestionSplitter.splitFromText(listText);
    // Não possui alternativas A-D/A-E, portanto não deve gerar questões de alta confiança
    expect(result.highConfidenceCount).toBe(0);
  });

  // 12. Idempotência da persistência
  it('12. deve garantir persistência idempotente sem duplicar registros para o mesmo sourceAssetId', async () => {
    const assetId = 'asset-enade-2023-test';
    const repo = RepositoryFactory.getExtractedExamQuestionRepository();

    const questionsToSave = [
      {
        id: `ext_q_${assetId}_1`,
        sourceAssetId: assetId,
        questionNumber: 1,
        statement: 'Questão 1 sobre sepse e choque séptico.',
        options: [
          { letter: 'A', text: 'Cristaloides 30 ml/kg' },
          { letter: 'B', text: 'Noradrenalina imediata' },
          { letter: 'C', text: 'Corticosteroide' },
          { letter: 'D', text: 'Bicarbonato' },
        ],
        confidence: 'high' as const,
        createdAt: new Date().toISOString(),
      },
      {
        id: `ext_q_${assetId}_2`,
        sourceAssetId: assetId,
        questionNumber: 2,
        statement: 'Questão 2 sobre tromboembolismo pulmonar.',
        options: [
          { letter: 'A', text: 'Angiotomografia' },
          { letter: 'B', text: 'D-dímero' },
          { letter: 'C', text: 'Ecocardiograma' },
          { letter: 'D', text: 'Cintilografia' },
        ],
        confidence: 'high' as const,
        createdAt: new Date().toISOString(),
      },
    ];

    // Primeira gravação
    await repo.deleteByAssetId(assetId);
    await repo.bulkSave(questionsToSave);

    let saved = await repo.getByAssetId(assetId);
    expect(saved).toHaveLength(2);

    // Segunda gravação (re-execução da segmentação)
    await repo.deleteByAssetId(assetId);
    await repo.bulkSave(questionsToSave);

    saved = await repo.getByAssetId(assetId);
    expect(saved).toHaveLength(2);
    expect(saved[0].questionNumber).toBe(1);
    expect(saved[1].questionNumber).toBe(2);
  });
});
