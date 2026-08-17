import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../../data/db/database';
import { DeterministicExamStatsCalculator } from './DeterministicExamStatsCalculator';
import { professorEngine } from './ProfessorEngine';
import { aiOrchestrator } from '../ai_orchestrator/AIOrchestrator';
import {
  ExamDNA,
  ExtractedExamQuestionRecord,
  ProfessorProfile,
} from '../../../domain/entities/Question';

describe('DeterministicExamStatsCalculator - Estatísticas Determinísticas Reais pro Banca DNA (Sem IA)', () => {
  beforeEach(async () => {
    await db.extractedExamQuestions.clear();
  });

  it('deve calcular distribuição real de gabarito, contagem de palavras, vinhetas clínicas e pegadinhas', () => {
    const mockQuestions: ExtractedExamQuestionRecord[] = [
      {
        id: 'q1',
        sourceAssetId: 'doc-usp-1',
        questionNumber: 1,
        statement: 'Paciente masculino, 65 anos, hipertenso, dá entrada na emergência com dor torácica aguda.',
        options: [
          { letter: 'A', text: 'Opção A' },
          { letter: 'B', text: 'Opção B' },
        ],
        correctLetter: 'B',
        confidence: 'high',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'q2',
        sourceAssetId: 'doc-usp-1',
        questionNumber: 2,
        statement: 'Mulher de 42 anos procura ambulatório queixando-se de cefaleia holocraniana há 3 semanas.',
        options: [
          { letter: 'A', text: 'Opção A' },
          { letter: 'B', text: 'Opção B' },
        ],
        correctLetter: 'B',
        confidence: 'high',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'q3',
        sourceAssetId: 'doc-usp-1',
        questionNumber: 3,
        statement: 'Em relação ao mecanismo de ação dos betabloqueadores, assinale a alternativa INCORRETA:',
        options: [
          { letter: 'A', text: 'Opção A' },
          { letter: 'B', text: 'Opção B' },
        ],
        correctLetter: 'B',
        confidence: 'high',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'q4',
        sourceAssetId: 'doc-usp-1',
        questionNumber: 4,
        statement: 'Qual a dose terapêutica preconizada da amoxicilina?',
        options: [
          { letter: 'A', text: 'Opção A' },
          { letter: 'B', text: 'Opção B' },
        ],
        correctLetter: 'A',
        confidence: 'high',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'q5',
        sourceAssetId: 'doc-usp-1',
        questionNumber: 5,
        statement: 'Todas as seguintes drogas são indicadas na IC com fração de ejeção reduzida, EXCETO:',
        options: [
          { letter: 'A', text: 'Opção A' },
          { letter: 'B', text: 'Opção B' },
        ],
        correctLetter: 'C',
        confidence: 'high',
        createdAt: new Date().toISOString(),
      },
    ];

    const stats = DeterministicExamStatsCalculator.calculateStats(mockQuestions);

    expect(stats).toBeDefined();
    expect(stats?.totalQuestions).toBe(5);

    // Distribuição de gabarito: 3 de 5 são B (60%), 1 é A (20%), 1 é C (20%)
    expect(stats?.answerKeyDistribution.B).toBe(0.6);
    expect(stats?.answerKeyDistribution.A).toBe(0.2);
    expect(stats?.answerKeyDistribution.C).toBe(0.2);

    // Vinhetas clínicas (q1 e q2 possuem idade + termo de paciente): 2 de 5 = 0.40
    expect(stats?.clinicalVignetteRatio).toBe(0.4);

    // Pegadinhas (q3 tem INCORRETA, q5 tem EXCETO): 2 de 5 = 0.40
    expect(stats?.trickPatternsFrequency).toBe(0.4);

    // Médias
    expect(stats?.averageStatementWords).toBeGreaterThan(5);
    expect(stats?.averageStatementChars).toBeGreaterThan(20);
  });

  it('deve ancorar e calibrar o ExamDNA com dados empíricos reais', () => {
    const aiEstimatedDNA: ExamDNA = {
      cicloAcademico: 'clinico',
      clinico: {
        contextoClinico: 0.90, // IA supôs 90% de vinhetas
        casosLongos: 0.85,
        pegadinhas: 0.10,      // IA supôs apenas 10% de pegadinhas
        epidemiologia: 0.4,
        farmacologia: 0.5,
        achadosDeImagem: 0.3,
        condutaImediata: 0.7,
        diretrizesOficiais: 0.6,
        comorbidadesMultiplas: 0.4,
      },
      version: 1,
      updatedAt: new Date().toISOString(),
    };

    const realStats = {
      totalQuestions: 10,
      answerKeyDistribution: { A: 0.1, B: 0.6, C: 0.1, D: 0.1, E: 0.1 },
      averageStatementChars: 85,
      averageStatementWords: 15, // Enunciados curtos na realidade
      clinicalVignetteRatio: 0.30, // Apenas 30% na realidade
      trickPatternsFrequency: 0.30, // 30% de pegadinhas
      calculatedAt: new Date().toISOString(),
    };

    const calibrated = DeterministicExamStatsCalculator.anchorExamDNA(aiEstimatedDNA, realStats);

    expect(calibrated.dataSource).toBe('ai-anchored-by-real-data');
    expect(calibrated.deterministicStats).toBeDefined();

    // contextoClinico: 0.3 * 0.90 + 0.7 * 0.30 = 0.27 + 0.21 = 0.48 (puxado pra baixo pela realidade!)
    expect(calibrated.clinico?.contextoClinico).toBeCloseTo(0.48, 2);

    // pegadinhas: puxado pra cima pela presença de pegadinhas reais
    expect(calibrated.clinico?.pegadinhas).toBeGreaterThan(0.40);
  });

  it('deve integrar com ProfessorEngine e marcar dataSource como "ai-anchored-by-real-data"', async () => {
    const now = new Date().toISOString();

    // Popula extractedExamQuestions no Dexie para o doc-cardio-1
    await db.extractedExamQuestions.bulkPut([
      {
        id: 'q_ext_1',
        sourceAssetId: 'doc-cardio-1',
        questionNumber: 1,
        statement: 'Paciente idoso, 72 anos, diabético, dá entrada com dispneia progressiva aos esforços.',
        options: [
          { letter: 'A', text: 'Ecocardiograma transtorácico' },
          { letter: 'B', text: 'Ressonância cardíaca' },
        ],
        correctLetter: 'A',
        confidence: 'high',
        createdAt: now,
      },
      {
        id: 'q_ext_2',
        sourceAssetId: 'doc-cardio-1',
        questionNumber: 2,
        statement: 'Mulher de 55 anos apresenta palpitações e síncope ao esforço.',
        options: [
          { letter: 'A', text: 'Holter 24h' },
          { letter: 'B', text: 'Teste ergométrico' },
        ],
        correctLetter: 'A',
        confidence: 'high',
        createdAt: now,
      },
    ]);

    const mockAi = vi.spyOn(aiOrchestrator, 'generateContent').mockResolvedValue({
      text: JSON.stringify({
        cicloAcademico: 'clinico',
        temasFavoritos: ['Insuficiência Cardíaca', 'Ecocardiograma'],
        estiloDeQuestao: 'Casos clínicos objetivos',
        nivelCognitivo: 'Aplicação',
        pegadinhasRecorrentes: ['Critérios de Framingham'],
        resumoEstiloGeral: 'Cardiologia clínica.',
        examDNA: {
          clinico: {
            contextoClinico: 0.8,
            casosLongos: 0.6,
            pegadinhas: 0.3,
            epidemiologia: 0.4,
            farmacologia: 0.5,
            achadosDeImagem: 0.4,
            condutaImediata: 0.7,
            diretrizesOficiais: 0.6,
            comorbidadesMultiplas: 0.4,
          },
        },
      }),
      modelUsed: 'gemini-3.5-flash-lite',
      provider: 'gemini',
    });

    const fakeProfile: ProfessorProfile = {
      id: 'prof-cardio-real',
      name: 'Prof. Dr. Oliveira - Cardiologia',
      description: 'Docente de Semiologia e Cardiologia',
      documents: [
        {
          id: 'doc-cardio-1',
          fileName: 'Prova_Cardio_2024.pdf',
          fileType: 'pdf',
          fileSize: 500000,
          formattedSize: '500 KB',
          uploadProgress: 100,
          status: 'completed',
          extractedExcerpt: 'Questões de cardiologia...',
          uploadedAt: now,
        },
      ],
      totalExamsCount: 1,
      totalFilesSize: 500000,
      formattedTotalSize: '500 KB',
      elaborationStyle: {
        writingStyle: 'Casos Clínicos',
        averageStatementLength: 'medio',
        difficultyDegree: 'media',
        clinicalCasesFrequency: '80%',
        optionsPattern: '4 opções',
        recurringThemes: ['IC', 'Valvopatias'],
        interdisciplinaryIntegration: 'Média',
      },
      createdAt: now,
      updatedAt: now,
    };

    const analysis = await professorEngine.analyzeProfessorStyle(fakeProfile);

    mockAi.mockRestore();

    expect(analysis.examDNA).toBeDefined();
    expect(analysis.examDNA?.dataSource).toBe('ai-anchored-by-real-data');
    expect(analysis.examDNA?.deterministicStats).toBeDefined();
    expect(analysis.examDNA?.deterministicStats?.totalQuestions).toBe(2);
    expect(analysis.examDNA?.deterministicStats?.answerKeyDistribution.A).toBe(1.0);
  });
});
