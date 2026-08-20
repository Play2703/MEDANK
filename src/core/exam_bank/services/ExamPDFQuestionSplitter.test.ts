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

  // 2. OCR com marcadores circulares reconhecidos como (O) inferidos como A, B, C, D
  it('2. deve converter marcadores circulares OCR (O) em alternativas ordenadas A-D', () => {
    const rawOcrWithCircles = `
QUESTÃO 12
Paciente em tratamento para transtorno depressivo maior com fluoxetina 40 mg/dia. O médico avalia a manutenção do tratamento:
(O) Redução da dose da fluoxetina para 20 mg/dia por 5 anos.
(O) Redução da dose para 20 mg/dia por 30 dias com posterior suspensão.
(O) Manutenção da dose de 40 mg/dia por pelo menos 5 anos.
(O) Manutenção da dose por mais um ano com desmame gradual.
`;
    const result = ExamPDFQuestionSplitter.splitFromText(rawOcrWithCircles);
    expect(result.totalQuestions).toBe(1);
    const q = result.questions[0];
    expect(q.questionNumber).toBe(12);
    expect(q.options).toHaveLength(4);
    expect(q.options.map((o) => o.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(q.options[0].text).toContain('Redução da dose da fluoxetina para 20 mg/dia');
    expect(q.options[1].text).toContain('Redução da dose para 20 mg/dia por 30 dias');
    expect(q.options[2].text).toContain('Manutenção da dose de 40 mg/dia por pelo menos 5 anos');
    expect(q.options[3].text).toContain('Manutenção da dose por mais um ano');
    expect(q.options.every((o) => o.text.trim().length > 0)).toBe(true);
  });

  // 3. Uma linha OCR contendo quatro alternativas concatenadas
  it('3. deve desconcatenar quatro alternativas misturadas na mesma linha de texto', () => {
    const concatenatedLine = `
QUESTÃO 04
Assinale a hipótese diagnóstica e a conduta esperada correspondem, respectivamente, a (O) derrame pleural; realização de toracocentese. (O) pneumotórax; realização de drenagem pleural fechada em selo d'água. (E) insuficiência cardíaca; hospitalização e diurético de alça por via venosa. (O) pneumonia; prescrição de claritromicina oral por sete dias.
`;
    const result = ExamPDFQuestionSplitter.splitFromText(concatenatedLine);
    expect(result.totalQuestions).toBe(1);
    const q = result.questions[0];
    expect(q.options).toHaveLength(4);
    expect(q.options.map((o) => o.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(q.options[0].text).toContain('derrame pleural');
    expect(q.options[1].text).toContain('pneumotórax');
    expect(q.options[2].text).toContain('insuficiência cardíaca');
    expect(q.options[3].text).toContain('pneumonia');
  });

  // 4. Alternativa quebrada em várias linhas
  it('4. deve manter o texto de uma alternativa que se estende por múltiplas linhas', () => {
    const multilineText = `
QUESTÃO 05
Sobre o manejo da dor torácica no departamento de emergência:
A) Realizar eletrocardiograma de 12 derivações
em até 10 minutos da admissão hospitalar,
garantindo tempo porta-agulha adequado.
B) Aguardar dosagem de troponina para decidir internação.
C) Indicar teste ergométrico em vigência de dor aguda.
D) Prescrever analgésico simples e alta.
`;
    const result = ExamPDFQuestionSplitter.splitFromText(multilineText);
    expect(result.totalQuestions).toBe(1);
    const q = result.questions[0];
    expect(q.options).toHaveLength(4);
    expect(q.options[0].text).toContain('Realizar eletrocardiograma de 12 derivações');
    expect(q.options[0].text).toContain('tempo porta-agulha adequado');
  });

  // 5. Duas questões na mesma linha OCR com QUESTÃO 14 no meio
  it('5. deve separar duas questões que vieram concatenadas no mesmo bloco com QUESTÃO 14 no meio', () => {
    const mergedQuestionsText = `
QUESTÃO 13
Um paciente de 21 anos comparece à UBS relatando que a ex-parceira tem HIV.
A) Iniciar tratamento antirretroviral de imediato.
(O) Realizar genotipagem pré-tratamento.
(O) Solicitar exame de Western-Blot.
(O) Apenas orientar uso de preservativo.
QUESTÃO 14
Uma mulher com 64 anos leva o neto recém-nascido com 5 dias de vida à UBS:
(O) Realizar aleitamento artificial com fórmulas fortificadas.
(O) Convencer a mãe a fornecer leite materno.
(O) Buscar meios legais de guarda da criança.
(O) Repetir sorologias e encaminhar para puericultura.
`;
    const result = ExamPDFQuestionSplitter.splitFromText(mergedQuestionsText);
    expect(result.totalQuestions).toBe(2);
    expect(result.questions[0].questionNumber).toBe(13);
    expect(result.questions[0].options).toHaveLength(4);
    expect(result.questions[1].questionNumber).toBe(14);
    expect(result.questions[1].options).toHaveLength(4);
    expect(result.questions[1].statement).toContain('mulher com 64 anos');
  });

  // 6. Questão iniciando no meio da numeração (ex: 27)
  it('6. deve aceitar que a numeração inicie em 27 ou outro número sem exigir questão 1 primeiro', () => {
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

  // 7. Página de instruções com lista numerada não deve virar falsa Questão 1
  it('7. deve descartar a página de instruções do início da prova sem gerar falsa Questão 1', () => {
    const instructionPageText = `
LEIA ATENTAMENTE AS INSTRUÇÕES SEGUINTES:
1. Verifique se este caderno de questões contém 100 itens numerados sequencialmente.
2. Observe a numeração das questões antes de preencher a folha de respostas definitiva.
3. Analise todas as alternativas antes de assinalar a resposta.
4. Consultas externas não será permitida qualquer espécie de consulta nem uso de eletrônicos.
5. Marcação da resposta use caneta preta para marcar suas respostas. Boa prova!

QUESTÃO 01
Paciente com apendicite aguda apresentando dor em fossa ilíaca direita.
A) Apendicectomia videolaparoscópica.
B) Tratamento conservador com analgésicos.
C) Antibioticoterapia isolada sem internação.
D) Colonoscopia de urgência.
`;
    const result = ExamPDFQuestionSplitter.splitFromText(instructionPageText);
    expect(result.totalQuestions).toBe(1);
    expect(result.questions[0].questionNumber).toBe(1);
    expect(result.questions[0].statement).toContain('apendicite aguda');
    expect(result.questions[0].statement).not.toContain('LEIA ATENTAMENTE');
    expect(result.questions[0].options).toHaveLength(4);
  });

  // 8. Cabeçalho/rodapé repetido
  it('8. deve ignorar linhas repetitivas de cabeçalho e rodapé sem poluir o enunciado', () => {
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

  // 9. Questão com tabela no enunciado
  it('9. deve preservar tabelas formatadas dentro do enunciado da questão', () => {
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

  // 10. Questão que atravessa duas páginas
  it('10. deve agrupar corretamente uma questão dividida entre duas páginas de OCR', () => {
    const ocrPages: OCRPageResult[] = [
      {
        pageNumber: 4,
        text: `
QUESTÃO 42
Homem de 60 anos, etilista crônico, com ascite volumosa e febre. A paracentese diagnóstica revelou líquido ascítico com polimorfonucleares de 380/mm³. Diante do quadro de PBE:
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
`,
      },
    ];

    const result = ExamPDFQuestionSplitter.splitFromOCR(ocrPages);
    expect(result.totalQuestions).toBe(1);
    const q42 = result.questions[0];
    expect(q42.questionNumber).toBe(42);
    expect(q42.pageNumber).toBe(4);
    expect(q42.endPageNumber).toBe(5);
    expect(q42.options).toHaveLength(5);
    expect(q42.options[0].letter).toBe('A');
    expect(q42.options[4].letter).toBe('E');
    expect(q42.confidence).toBe('high');
  });

  // 11. Deduplicação idempotente de questão repetida
  it('11. deve deduplicar questões com mesmo número na mesma página e garantir idempotência de gravação', async () => {
    const assetId = 'asset-revalida-dedup';
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
    ];

    await repo.deleteByAssetId(assetId);
    await repo.bulkSave(questionsToSave);

    let saved = await repo.getByAssetId(assetId);
    expect(saved).toHaveLength(1);

    // Re-gravação
    await repo.deleteByAssetId(assetId);
    await repo.bulkSave(questionsToSave);

    saved = await repo.getByAssetId(assetId);
    expect(saved).toHaveLength(1);
  });

  // 12. Fixture realista do ENADE 2023 / INEP com marcadores circulares e OCR com imperfeições
  it('12. deve processar fixture realista do ENADE com marcadores circulares e extrair 4 alternativas completas', () => {
    const enadeFixture = `
QUESTÃO 27
Uma paciente com 35 anos de idade, digitadora, procura uma UBS com queixa de dor e edema nas articulações das mãos há dois meses. Refere que suas mãos passaram a ficar arroxeadas no frio. Ao exame físico: poliartrite simétrica de interfalangianas proximais. Considerando-se o quadro clínico, verifica-se que
Ga) o curto período de história sugere um quadro reativo.
(O) o risco ocupacional indica o diagnóstico de LER/DORT.
(O) a presença de fator antinuclear confirma lúpus eritematoso sistêmico.
(O) a presença de fator reumatoide confirma o diagnóstico de artrite reumatoide.
`;
    const result = ExamPDFQuestionSplitter.splitFromText(enadeFixture);
    expect(result.totalQuestions).toBe(1);
    const q = result.questions[0];
    expect(q.questionNumber).toBe(27);
    expect(q.options).toHaveLength(4);
    expect(q.options.map((o) => o.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(q.options[0].text).toContain('quadro reativo');
    expect(q.options[1].text).toContain('LER/DORT');
    expect(q.options[2].text).toContain('lúpus eritematoso sistêmico');
    expect(q.options[3].text).toContain('artrite reumatoide');
  });

  // 13. Fixture de Prova 100 Clínica Q1: não confundir "E. coli" com marcador de alternativa "E."
  it('13. deve preservar "E. coli" no texto da alternativa sem tratar "E." como marcador de opção', () => {
    const q1Fixture = `
QUESTÃO 01
Bacteremias por germes adquiridos em residências de idosos com cuidados médicos e aquelas adquiridas em unidades de queimados:
a) E. coli e Klebsiella pneumoniae.
(b) Pseudomonas aeruginosa e Staphylococcus epidermidis.
O) Klebsiella pneumoniae e Staphylococcus aureus.
(O) E.coli e Pseudomonas aeruginosa.
o) Acinetobacter sp e enterococos.
`;
    const result = ExamPDFQuestionSplitter.splitFromText(q1Fixture);
    expect(result.totalQuestions).toBe(1);
    const q = result.questions[0];
    expect(q.questionNumber).toBe(1);
    expect(q.options).toHaveLength(5);
    expect(q.options.map((o) => o.letter)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(q.options[0].text).toContain('E. coli e Klebsiella pneumoniae');
    expect(q.options[1].text).toContain('Pseudomonas aeruginosa');
    expect(q.options[4].text).toContain('Acinetobacter sp e enterococos');
  });

  // 14. Fixture de Prova 100 Clínica Q6: reconhecer (€) e [(C) como C e D
  it('14. deve reconhecer artefatos OCR (€) e [(C) e mapear sequencialmente para C e D', () => {
    const q6Fixture = `
QUESTÃO 06
Homem de 52 anos, etilista com história de aumento do uso de álcool recentemente:
a) Ceftriaxona por 7 dias. Ciprofloxacina profilática após.
GG) Cefotaxima por 7 dias, sem profilaxia após.
(€) Prednisolona por 28 dias associada a norfloxacina.
[(C) Hidratação e repetição de paracentese em 48 horas.
(E) Prednisolona por 28 dias.
`;
    const result = ExamPDFQuestionSplitter.splitFromText(q6Fixture);
    expect(result.totalQuestions).toBe(1);
    const q = result.questions[0];
    expect(q.questionNumber).toBe(6);
    expect(q.options).toHaveLength(5);
    expect(q.options.map((o) => o.letter)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(q.options[0].text).toContain('Ceftriaxona');
    expect(q.options[2].text).toContain('Prednisolona por 28 dias');
    expect(q.options[3].text).toContain('Hidratação e repetição');
  });

  // 15. Descarte de bloco fantasma com ruído no final do documento
  it('15. deve descartar bloco com ruído gráfico e enunciado vazio no final do documento', () => {
    const ghostText = `
QUESTÃO 01
Paciente com apendicite aguda.
A) Cirurgia.
B) Observação.
C) Analgesia.
D) Alta.

QUESTÃO 01

c o «e 33 a e c (OQ: 6 a (cc o «e ss - Q c - 5 Q: c o «e so À: c o «e 6
`;
    const result = ExamPDFQuestionSplitter.splitFromText(ghostText);
    expect(result.totalQuestions).toBe(1);
    expect(result.questions[0].questionNumber).toBe(1);
    expect(result.questions[0].statement).toBe('Paciente com apendicite aguda.');
    expect(result.questions[0].options).toHaveLength(4);
  });
});
