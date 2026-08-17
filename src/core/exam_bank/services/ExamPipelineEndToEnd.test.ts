import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../../data/db/database';
import { ExamPDFQuestionSplitter } from './ExamPDFQuestionSplitter';
import { distractorEngine } from '../../../data/services/distractorEngine/DistractorEngine';
import { DeterministicExamStatsCalculator } from '../../medcore_kernel/engines/DeterministicExamStatsCalculator';
import { ExamDNA } from '../../../domain/entities/Question';

describe('Pipeline Completo End-to-End: PDF Splitter -> Distractor Engine -> Banca DNA (100% Sem IA no núcleo determinístico)', () => {
  beforeEach(async () => {
    await db.extractedExamQuestions.clear();
    await db.graphEdges.clear();
    await db.canonicalEntityIndex.clear();
  });

  it('deve executar o ciclo completo: segmentar PDF, persistir no Dexie, alimentar DistractorEngine com máxima prioridade e calibrar ExamDNA empiricamente', async () => {
    // 1. Entrada: Documento de prova médica
    const rawExamPDFText = `
PROVA DE RESIDÊNCIA MÉDICA 2024 - BANCA OFICIAL

QUESTÃO 01
Paciente masculino, 62 anos, hipertenso e tabagista, apresenta dor torácica retroesternal com supra de ST em parede inferior (DII, DIII e aVF). Considerando a conduta preconizada de primeira linha, assinale a opção correta:
A) Angioplastia primária imediata com implante de stent
B) Trombólise química intravenosa com alteplase
C) Nitrato sublingual e observação em enfermaria
D) Betabloqueador em dose máxima e alta ambulatorial
E) Cardioversão elétrica sincronizada com 200 Joules
GABARITO: A

QUESTÃO 02
Mulher de 28 anos, previamente hígida, procura pronto atendimento com quadro de tosse seca e febre baixa há 5 dias. Ao exame físico: murmúrio vesicular preservado, sem ruídos adventícios. Qual o esquema terapêutico inicial recomendado?
A) Amoxicilina oral em regime ambulatorial
B) Azitromicina combinada com ceftriaxona hospitalar
C) Levofloxacino intravenoso em unidade de terapia intensiva
D) Vancomicina associada a piperacilina/tazobactam
E) Oseltamivir em dose dobrada
GABARITO: A

QUESTÃO 03
Em relação às arritmias cardíacas na emergência, todas as seguintes são causas de taquicardia de QRS estreito regular, EXCETO:
A) Fibrilação ventricular
B) Taquicardia por reentrada nodal (TRN)
C) Taquicardia atrial unifocal
D) Flutter atrial com condução AV 2:1
E) Taquicardia sinusal
GABARITO: A
`;

    // 2. TAREFAS 1-5: Segmentação determinística de questões pelo ExamPDFQuestionSplitter
    const splitResult = ExamPDFQuestionSplitter.splitFromText(rawExamPDFText);

    expect(splitResult.success).toBe(true);
    expect(splitResult.totalQuestions).toBe(3);
    expect(splitResult.highConfidenceCount).toBe(3);

    // 3. TAREFA 6: Persistência no Dexie (extractedExamQuestions)
    const records = splitResult.questions.map((q) => ({
      id: `ext_q_${q.questionNumber}`,
      sourceAssetId: 'asset-prova-residencia-2024',
      questionNumber: q.questionNumber,
      statement: q.statement,
      options: q.options,
      correctLetter: q.correctLetter,
      specialty: 'Cardiologia',
      confidence: q.confidence,
      createdAt: new Date().toISOString(),
    }));

    await db.extractedExamQuestions.bulkPut(records);

    const savedInDb = await db.extractedExamQuestions.toArray();
    expect(savedInDb).toHaveLength(3);

    // 4. TAREFA 6: Alimentar o DistractorEngine com as alternativas erradas extraídas da Questão 1
    // Resposta correta: "Angioplastia primária imediata com implante de stent"
    const distractorCandidates = await distractorEngine.getCandidates({
      correctAnswerText: 'Angioplastia primária imediata com implante de stent',
      specialty: 'Cardiologia',
      topics: ['Síndrome Coronariana Aguda'],
      limit: 5,
    });

    expect(distractorCandidates.length).toBeGreaterThanOrEqual(4);
    // Deve conter os distratores reais que a banca usou
    const distractorTexts = distractorCandidates.map((c) => c.text);
    expect(distractorTexts).toContain('Trombólise química intravenosa com alteplase');
    expect(distractorTexts).toContain('Nitrato sublingual e observação em enfermaria');
    expect(distractorTexts).toContain('Cardioversão elétrica sincronizada com 200 Joules');
    expect(distractorCandidates[0].source).toBe('extracted_exam');

    // 5. TAREFA 7: Calcular estatísticas determinísticas reais com DeterministicExamStatsCalculator
    const realStats = DeterministicExamStatsCalculator.calculateStats(savedInDb);

    expect(realStats).toBeDefined();
    expect(realStats?.totalQuestions).toBe(3);
    // Gabaritos: 3 questões, todas A (100% A)
    expect(realStats?.answerKeyDistribution.A).toBe(1.0);
    // Vinhetas clínicas (q1 e q2 possuem idade + termo de paciente): 2 de 3 (~67%)
    expect(realStats?.clinicalVignetteRatio).toBeCloseTo(0.67, 2);
    // Pegadinhas (q3 possui EXCETO): 1 de 3 (~33%)
    expect(realStats?.trickPatternsFrequency).toBeCloseTo(0.33, 2);

    // 6. TAREFA 7: Ancoragem de ExamDNA (calibração sem IA)
    const initialAIDNA: ExamDNA = {
      cicloAcademico: 'clinico',
      clinico: {
        contextoClinico: 0.95, // IA supôs 95%
        casosLongos: 0.90,     // IA supôs enunciados gigantescos
        pegadinhas: 0.05,      // IA supôs 5% de pegadinha
        epidemiologia: 0.4,
        farmacologia: 0.5,
        achadosDeImagem: 0.3,
        condutaImediata: 0.8,
        diretrizesOficiais: 0.7,
        comorbidadesMultiplas: 0.4,
      },
      version: 1,
      updatedAt: new Date().toISOString(),
    };

    const calibratedDNA = DeterministicExamStatsCalculator.anchorExamDNA(initialAIDNA, realStats!);

    expect(calibratedDNA.dataSource).toBe('ai-anchored-by-real-data');
    expect(calibratedDNA.deterministicStats).toBeDefined();
    // Contexto clínico ajustado pela realidade empírica
    expect(calibratedDNA.clinico?.contextoClinico).toBeCloseTo(0.3 * 0.95 + 0.7 * 0.67, 2);
    // Pegadinhas aumentadas pela presença do "EXCETO" real na questão 3
    expect(calibratedDNA.clinico?.pegadinhas).toBeGreaterThan(0.20);
  });
});
