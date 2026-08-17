import { describe, it, expect } from 'vitest';
import {
  ExamPDFQuestionSplitter,
  ExamSplitterResult,
} from './ExamPDFQuestionSplitter';
import { PDFLayoutResult } from '../../import_engine/services/DocumentReaderService';

describe('ExamPDFQuestionSplitter - Segmentação Mecânica de Provas em PDF (Sem IA)', () => {
  it('deve segmentar perfeitamente questões estruturadas em formato padrão com enunciado, alternativas A-E e gabarito', () => {
    const sampleExamText = `
PROCESSO SELETIVO DE RESIDÊNCIA MÉDICA 2024 - HOSPITAL UNIVERSITÁRIO

QUESTÃO 01
Paciente masculino, 58 anos, hipertenso e diabético, dá entrada no pronto-socorro com dor torácica retroesternal opressiva iniciada há 2 horas, irradiada para mandíbula e membro superior esquerdo. O eletrocardiograma demonstra supradesnivelamento do segmento ST de 2,5 mm nas derivações DII, DIII e aVF. Considerando a principal hipótese diagnóstica e a conduta imediata preconizada pelas diretrizes atuais, assinale a alternativa correta:
A) Trata-se de infarto agudo do miocárdio de parede anterior; indicar trombólise se o tempo porta-balão for superior a 90 minutos.
B) Trata-se de infarto agudo do miocárdio de parede inferior; realizar angioplastia primária imediata como estratégia de reperfusão preferencial.
C) Trata-se de pericardite aguda; iniciar anti-inflamatórios não esteroidais em doses plenas e colchicina.
D) Trata-se de dissecção aguda de aorta; realizar angiotomografia computadorizada antes de qualquer terapia antitrombótica.
E) Trata-se de espasmo coronariano de Prinzmetal; administrar diltiazem intravenoso e observar em unidade de dor torácica.

QUESTÃO 02
Mulher de 32 anos procura a Unidade Básica de Saúde queixando-se de astenia progressiva, sonolência diurna, ganho ponderal de 4 kg nos últimos 3 meses e constipação intestinal. Ao exame físico: paciente orientada, descorada +/4+, bradicárdica (FC: 52 bpm), pele seca e reflexos tendíneos com fase de relaxamento lentificada. Os exames laboratoriais revelam TSH elevado (18,4 mUI/L) e T4 livre reduzido (0,4 ng/dL). Qual o tratamento de primeira escolha e o mecanismo fisiopatológico principal envolvido?
A) Metimazol, devido à síntese inadequada de imunoglobulinas estimuladoras da tireoide.
B) Propiltiouracila, para inibir a conversão periférica de T4 em T3.
C) Levotiroxina sódica em dose calculada pelo peso corporal, para reposição do hormônio tireoidiano deficiente.
D) Iodo radioativo (I-131), para ablação tecidual e resolução do processo inflamatório tireoidiano.
E) Prednisona em dose imunossupressora para remissão da tireoidite subaguda de De Quervain.

QUESTÃO 03
Lactente de 8 meses é levado à emergência pediátrica com história de febre alta (39,2 °C) há 3 dias, que cessou subitamente hoje, seguida pelo aparecimento de exantema maculopapular róseo no tronco, que se disseminou para pescoço e membros superiores. A criança encontra-se ativa, em bom estado geral e sem outros sinais focais. Qual o diagnóstico mais provável?
A) Sarampo (Vírus do Sarampo)
B) Rubéola (Vírus da Rubéola)
C) Eritema infeccioso (Parvovírus B19)
D) Exantema súbito / Roséola infantum (Herpes-vírus humano tipo 6)
E) Escarlatina (Streptococcus pyogenes)

GABARITO OFICIAL DA PROVA
1 - B
2 - C
3 - D
`;

    const result: ExamSplitterResult = ExamPDFQuestionSplitter.splitFromText(sampleExamText);

    expect(result.totalQuestions).toBe(3);
    expect(result.highConfidenceCount).toBe(3);
    expect(result.lowConfidenceCount).toBe(0);
    expect(result.lowConfidenceRatio).toBe(0);
    expect(result.success).toBe(true);
    expect(result.warning).toBeUndefined();

    // Questão 1
    const q1 = result.questions[0];
    expect(q1.questionNumber).toBe(1);
    expect(q1.statement).toContain('Paciente masculino, 58 anos');
    expect(q1.statement).toContain('supradesnivelamento do segmento ST');
    expect(q1.options).toHaveLength(5);
    expect(q1.options[0].letter).toBe('A');
    expect(q1.options[1].letter).toBe('B');
    expect(q1.options[2].letter).toBe('C');
    expect(q1.options[3].letter).toBe('D');
    expect(q1.options[4].letter).toBe('E');
    expect(q1.options[1].text).toContain('infarto agudo do miocárdio de parede inferior');
    expect(q1.correctLetter).toBe('B');
    expect(q1.confidence).toBe('high');

    // Questão 2
    const q2 = result.questions[1];
    expect(q2.questionNumber).toBe(2);
    expect(q2.statement).toContain('Mulher de 32 anos');
    expect(q2.statement).toContain('TSH elevado');
    expect(q2.options).toHaveLength(5);
    expect(q2.options[2].text).toContain('Levotiroxina sódica');
    expect(q2.correctLetter).toBe('C');
    expect(q2.confidence).toBe('high');

    // Questão 3
    const q3 = result.questions[2];
    expect(q3.questionNumber).toBe(3);
    expect(q3.statement).toContain('Lactente de 8 meses');
    expect(q3.options).toHaveLength(5);
    expect(q3.options[3].text).toContain('Exantema súbito');
    expect(q3.correctLetter).toBe('D');
    expect(q3.confidence).toBe('high');
  });

  it('deve processar corretamente layout geométrico (PDFLayoutResult com coordenadas x, y e fontSize)', () => {
    const layoutMock: PDFLayoutResult = {
      totalPages: 1,
      rawText: 'Questão 1...\nQuestão 2...',
      items: [
        // Questão 1
        { str: 'QUESTÃO 1', x: 50, y: 700, fontSize: 12, pageNumber: 1 },
        { str: 'Homem de 45 anos com tosse produtiva e febre há 4 dias.', x: 50, y: 685, fontSize: 10, pageNumber: 1 },
        { str: 'A)', x: 60, y: 660, fontSize: 10, pageNumber: 1 },
        { str: 'Pneumonia adquirida na comunidade', x: 80, y: 660, fontSize: 10, pageNumber: 1 },
        { str: 'B)', x: 60, y: 645, fontSize: 10, pageNumber: 1 },
        { str: 'Tromboembolismo pulmonar maciço', x: 80, y: 645, fontSize: 10, pageNumber: 1 },
        { str: 'C)', x: 60, y: 630, fontSize: 10, pageNumber: 1 },
        { str: 'Pneumotórax hipertensivo', x: 80, y: 630, fontSize: 10, pageNumber: 1 },
        { str: 'D)', x: 60, y: 615, fontSize: 10, pageNumber: 1 },
        { str: 'Edema agudo de pulmão cardiogênico', x: 80, y: 615, fontSize: 10, pageNumber: 1 },

        // Questão 2
        { str: 'QUESTÃO 2', x: 50, y: 580, fontSize: 12, pageNumber: 1 },
        { str: 'Mulher jovem com dor em fossa ilíaca direita e sinal de Blumberg positivo.', x: 50, y: 565, fontSize: 10, pageNumber: 1 },
        { str: 'A)', x: 60, y: 540, fontSize: 10, pageNumber: 1 },
        { str: 'Apendicite aguda', x: 80, y: 540, fontSize: 10, pageNumber: 1 },
        { str: 'B)', x: 60, y: 525, fontSize: 10, pageNumber: 1 },
        { str: 'Colecistite calculosa', x: 80, y: 525, fontSize: 10, pageNumber: 1 },
        { str: 'C)', x: 60, y: 510, fontSize: 10, pageNumber: 1 },
        { str: 'Pancreatite biliar', x: 80, y: 510, fontSize: 10, pageNumber: 1 },
        { str: 'D)', x: 60, y: 495, fontSize: 10, pageNumber: 1 },
        { str: 'Diverticulite de sigmoide', x: 80, y: 495, fontSize: 10, pageNumber: 1 },

        // Gabarito
        { str: 'GABARITO: 1-A, 2-A', x: 50, y: 400, fontSize: 10, pageNumber: 1 },
      ],
    };

    const result = ExamPDFQuestionSplitter.splitFromLayout(layoutMock);

    expect(result.totalQuestions).toBe(2);
    expect(result.highConfidenceCount).toBe(2);
    expect(result.questions[0].questionNumber).toBe(1);
    expect(result.questions[0].options).toHaveLength(4);
    expect(result.questions[0].correctLetter).toBe('A');
    expect(result.questions[1].questionNumber).toBe(2);
    expect(result.questions[1].options).toHaveLength(4);
    expect(result.questions[1].correctLetter).toBe('A');
  });

  it('deve classificar como confidence "low" e emitir aviso para texto caótico/sem padrão de prova sem travar ou inventar dados', () => {
    const badUnstructuredText = `
Este é um capítulo de livro de cardiologia narrativo.
A insuficiência cardíaca é uma síndrome clínica complexa caracterizada pela incapacidade do coração de bombear sangue de forma adequada.
Não há questões aqui, apenas texto corrido e referências bibliográficas.
1. Tratamento farmacológico com IECA e betabloqueadores.
2. Manejo de congestão com diuréticos de alça.
`;

    const result = ExamPDFQuestionSplitter.splitFromText(badUnstructuredText);

    // Deve retornar 0 questões ou questões com confidence low caso detecte falsos numerais
    expect(result.success).toBe(false);
    expect(result.warning).toBeDefined();
    if (result.totalQuestions > 0) {
      expect(result.lowConfidenceRatio).toBeGreaterThan(0.40);
      result.questions.forEach((q) => {
        expect(q.confidence).toBe('low');
      });
    }
  });

  it('deve extrair alternativas inline quando dispostas na mesma linha', () => {
    const inlineExamText = `
QUESTÃO 01
Em relação ao tratamento da cetoacidose diabética, qual a reposição inicial indicada?
(A) Soro fisiológico 0,9% (B) Ringer Lactato (C) Soro glicosado 5% (D) Bicarbonato de sódio (E) Albumina humana
GABARITO: A
`;

    const result = ExamPDFQuestionSplitter.splitFromText(inlineExamText);

    expect(result.totalQuestions).toBe(1);
    expect(result.questions[0].options).toHaveLength(5);
    expect(result.questions[0].options[0].letter).toBe('A');
    expect(result.questions[0].options[0].text).toContain('Soro fisiológico');
    expect(result.questions[0].options[1].letter).toBe('B');
    expect(result.questions[0].options[1].text).toContain('Ringer Lactato');
    expect(result.questions[0].correctLetter).toBe('A');
    expect(result.questions[0].confidence).toBe('high');
  });

  it('deve reconhecer alternativas sem delimitador (LETRA + espacos + texto) e separar tags de assunto do enunciado', () => {
    const uspFormatText = `
Questão 1      Profilaxia Antibiótica
Homem, 62 anos, com diagnóstico de cirrose hepática por álcool, chegou ao pronto socorro referindo hematêmese.
A     Vitamina K.
B     Norfloxacina.
C     Furosemida.
D     Omeprazol.

Questão 2      Classificação de risco   Infectologia
Com relação à dengue grave, assinale a alternativa correta:
A     diferentemente de outras doenças, a gravidade não está relacionada a fatores de risco individuais.
B     a imunidade adquirida é permanente apenas para o primeiro sorotipo após a infecção.
C     a maioria dos pacientes apresenta formas graves hemorrágicas.
D     o período de viremia se inicia um dia antes da febre.
`;

    const result = ExamPDFQuestionSplitter.splitFromText(uspFormatText);

    expect(result.totalQuestions).toBe(2);
    expect(result.highConfidenceCount).toBe(2);
    expect(result.success).toBe(true);

    const q1 = result.questions[0];
    expect(q1.questionNumber).toBe(1);
    expect(q1.topicTags).toEqual(['Profilaxia Antibiótica']);
    expect(q1.statement).toContain('Homem, 62 anos, com diagnóstico de cirrose hepática');
    expect(q1.statement).not.toContain('Profilaxia Antibiótica');
    expect(q1.options).toHaveLength(4);
    expect(q1.options[0].letter).toBe('A');
    expect(q1.options[0].text).toBe('Vitamina K.');
    expect(q1.options[1].letter).toBe('B');
    expect(q1.options[1].text).toBe('Norfloxacina.');
    expect(q1.options[2].letter).toBe('C');
    expect(q1.options[2].text).toBe('Furosemida.');
    expect(q1.options[3].letter).toBe('D');
    expect(q1.options[3].text).toBe('Omeprazol.');
    expect(q1.confidence).toBe('high');

    const q2 = result.questions[1];
    expect(q2.questionNumber).toBe(2);
    expect(q2.topicTags).toEqual(['Classificação de risco', 'Infectologia']);
    expect(q2.statement).toContain('Com relação à dengue grave');
    expect(q2.options).toHaveLength(4);
    expect(q2.confidence).toBe('high');
  });

  it('deve normalizar zero-width space (U+200B) e form feed (\\f) sem quebrar o parsing de alternativas', () => {
    const dirtyText = `
Questão 1: Procedimento de emergência para vias aéreas em obstrução alta:
a)\u200b     Cartilagem tireoide
b)\u200b     Cartilagem cricóide
\fc)\u200b     Membrana cricotireoide
d)\u200b     Membrana tireo-hioide
e)\u200b     Cartilagem traqueal
`;

    const result = ExamPDFQuestionSplitter.splitFromText(dirtyText);

    expect(result.totalQuestions).toBe(1);
    expect(result.highConfidenceCount).toBe(1);
    const q1 = result.questions[0];
    expect(q1.options).toHaveLength(5);
    expect(q1.options[0].letter).toBe('A');
    expect(q1.options[0].text).toBe('Cartilagem tireoide');
    expect(q1.options[2].letter).toBe('C');
    expect(q1.options[2].text).toBe('Membrana cricotireoide');
    expect(q1.confidence).toBe('high');
  });
});
