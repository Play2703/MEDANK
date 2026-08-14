import { describe, it, expect, vi } from 'vitest';
import { professorEngine } from './ProfessorEngine';
import { ProfessorProfile } from '../../../domain/entities/Question';
import { aiOrchestrator } from '../ai_orchestrator/AIOrchestrator';

describe('ProfessorEngine - analyzeProfessorStyle', () => {
  it('deve retornar um objeto de análise estruturado (ProfessorStyleAnalysis) com ExamDNA para um perfil de professor', async () => {
    const mockAi = vi.spyOn(aiOrchestrator, 'generateContent').mockResolvedValue({
      text: JSON.stringify({
        cicloAcademico: 'clinico',
        temasFavoritos: ['Infarto agudo', 'ECG', 'Insuficiência Cardíaca'],
        estiloDeQuestao: 'Casos clínicos objetivos',
        nivelCognitivo: 'Aplicação e síntese',
        pegadinhasRecorrentes: ['Troca de derivações no ECG'],
        resumoEstiloGeral: 'Foco em diagnóstico rápido e condutas imediatas de emergência.',
        examDNA: {
          clinico: {
            contextoClinico: 0.85,
            casosLongos: 0.75,
            pegadinhas: 0.5,
            epidemiologia: 0.4,
            farmacologia: 0.6,
            achadosDeImagem: 0.3,
            condutaImediata: 0.8,
            diretrizesOficiais: 0.7,
            comorbidadesMultiplas: 0.4,
          },
        },
      }),
      modelUsed: 'gemini-3.5-flash-lite',
      provider: 'gemini',
    });

    const fakeProfile: ProfessorProfile = {
      id: 'prof-test-1',
      name: 'Prof. Dr. Silva - Cardiologia',
      description: 'Professor de Eletrocardiograma e Insuficiência Cardíaca',
      documents: [
        {
          id: 'doc-1',
          fileName: 'Prova_Cardiologia_2024.pdf',
          fileType: 'pdf',
          fileSize: 1024500,
          formattedSize: '1.0 MB',
          uploadProgress: 100,
          status: 'completed',
          extractedExcerpt: 'Questão 1: Paciente com dor torácica infraesternal e supra de ST nas derivadas DII, DIII e aVF. Qual a conduta imediata? A) Angioplastia primária. B) Fibrinolítico oral.',
          uploadedAt: new Date().toISOString(),
        },
      ],
      totalExamsCount: 1,
      totalFilesSize: 1024500,
      formattedTotalSize: '1.0 MB',
      elaborationStyle: {
        writingStyle: 'Casos Clínicos',
        averageStatementLength: 'longo',
        difficultyDegree: 'dificil',
        clinicalCasesFrequency: '90%',
        optionsPattern: '4 opções',
        recurringThemes: ['Infarto agudo', 'ECG'],
        interdisciplinaryIntegration: 'Alta',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const analysis = await professorEngine.analyzeProfessorStyle(fakeProfile);

    mockAi.mockRestore();

    expect(analysis).toBeDefined();
    expect(Array.isArray(analysis.temasFavoritos)).toBe(true);
    expect(typeof analysis.estiloDeQuestao).toBe('string');
    expect(typeof analysis.nivelCognitivo).toBe('string');
    expect(Array.isArray(analysis.pegadinhasRecorrentes)).toBe(true);
    expect(typeof analysis.resumoEstiloGeral).toBe('string');
    expect(analysis.examDNA).toBeDefined();
    expect(analysis.examDNA?.version).toBe(1);
    expect(['basico', 'clinico', 'misto']).toContain(analysis.examDNA?.cicloAcademico);
  });

  it('deve calcular a média móvel do ExamDNA ao reanalisar um perfil existente', async () => {
    const mockAi = vi.spyOn(aiOrchestrator, 'generateContent').mockResolvedValue({
      text: JSON.stringify({
        cicloAcademico: 'clinico',
        temasFavoritos: ['Exantemas', 'Aleitamento'],
        estiloDeQuestao: 'Casos pediátricos diretos',
        nivelCognitivo: 'Compreensão',
        pegadinhasRecorrentes: ['Diagnóstico diferencial de rash'],
        resumoEstiloGeral: 'Pediatria ambulatorial.',
        examDNA: {
          clinico: {
            contextoClinico: 0.60,
            casosLongos: 0.50,
            pegadinhas: 0.40,
            epidemiologia: 0.30,
            farmacologia: 0.40,
            achadosDeImagem: 0.10,
            condutaImediata: 0.70,
            diretrizesOficiais: 0.60,
            comorbidadesMultiplas: 0.20,
          },
        },
      }),
      modelUsed: 'gemini-3.5-flash-lite',
      provider: 'gemini',
    });

    const fakeProfileWithDNA: ProfessorProfile = {
      id: 'prof-test-2',
      name: 'Prof. Dr. Santos - Pediatria',
      documents: [],
      totalExamsCount: 1,
      totalFilesSize: 500000,
      formattedTotalSize: '0.5 MB',
      elaborationStyle: {
        writingStyle: 'Casos Clínicos Pediátricos',
        averageStatementLength: 'medio',
        difficultyDegree: 'media',
        clinicalCasesFrequency: '80%',
        optionsPattern: '4 opções',
        recurringThemes: ['Exantemas', 'Aleitamento'],
        interdisciplinaryIntegration: 'Média',
      },
      examDNA: {
        cicloAcademico: 'clinico',
        clinico: {
          contextoClinico: 0.90,
          casosLongos: 0.80,
          pegadinhas: 0.60,
          epidemiologia: 0.40,
          farmacologia: 0.50,
          achadosDeImagem: 0.20,
          condutaImediata: 0.80,
          diretrizesOficiais: 0.70,
          comorbidadesMultiplas: 0.30,
        },
        version: 2,
        updatedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const analysis = await professorEngine.analyzeProfessorStyle(fakeProfileWithDNA);

    mockAi.mockRestore();

    expect(analysis.examDNA).toBeDefined();
    expect(analysis.examDNA?.version).toBe(3); // Incremented from 2 to 3
    if (analysis.examDNA?.clinico) {
      // Average of previous (0.90 * 2 + new) / 3 should be between 0 and 1
      expect(analysis.examDNA.clinico.contextoClinico).toBeGreaterThan(0);
      expect(analysis.examDNA.clinico.contextoClinico).toBeLessThanOrEqual(1);
    }
  });


  it('deve fracionar contextos extensos (>4000 chars) em múltiplos blocos e calcular a média dos vetores parciais', async () => {
    // Simula 3 documentos grandes (total ~6000 caracteres)
    const doc1Text = 'Exame 1 Cardiologia '.repeat(100); // ~2000 chars
    const doc2Text = 'Exame 2 Arritmias '.repeat(100);  // ~1800 chars
    const doc3Text = 'Exame 3 Valvopatias '.repeat(120); // ~2400 chars

    const largeProfile: ProfessorProfile = {
      id: 'prof-large-1',
      name: 'Banca Unificada Revalida',
      documents: [
        { id: 'd1', fileName: 'Prova1.pdf', fileType: 'pdf', fileSize: 2000, formattedSize: '2KB', uploadProgress: 100, status: 'completed', extractedExcerpt: doc1Text, uploadedAt: new Date().toISOString() },
        { id: 'd2', fileName: 'Prova2.pdf', fileType: 'pdf', fileSize: 2000, formattedSize: '2KB', uploadProgress: 100, status: 'completed', extractedExcerpt: doc2Text, uploadedAt: new Date().toISOString() },
        { id: 'd3', fileName: 'Prova3.pdf', fileType: 'pdf', fileSize: 2000, formattedSize: '2KB', uploadProgress: 100, status: 'completed', extractedExcerpt: doc3Text, uploadedAt: new Date().toISOString() },
      ],
      totalExamsCount: 3,
      totalFilesSize: 6000,
      formattedTotalSize: '6KB',
      elaborationStyle: { writingStyle: 'Extensa', averageStatementLength: 'longo', difficultyDegree: 'dificil', clinicalCasesFrequency: '100%', optionsPattern: '4 opções', recurringThemes: ['Revalida'], interdisciplinaryIntegration: 'Alta' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let callCount = 0;
    const mockAi = vi.spyOn(aiOrchestrator, 'generateContent').mockImplementation(async () => {
      callCount++;
      const val = callCount === 1 ? 0.9 : callCount === 2 ? 0.6 : 0.3;
      return {
        text: JSON.stringify({
          cicloAcademico: 'clinico',
          temasFavoritos: [`Tema Bloco ${callCount}`],
          estiloDeQuestao: 'Estilo multi-bloco',
          nivelCognitivo: 'Alto',
          pegadinhasRecorrentes: [`Pegadinha ${callCount}`],
          resumoEstiloGeral: 'Resumo',
          examDNA: {
            clinico: {
              contextoClinico: val,
              casosLongos: val,
              pegadinhas: val,
              epidemiologia: val,
              farmacologia: val,
              achadosDeImagem: val,
              condutaImediata: val,
              diretrizesOficiais: val,
              comorbidadesMultiplas: val,
            },
          },
        }),
        modelUsed: 'gemini-3.5-flash-lite',
        provider: 'gemini',
      };
    });

    const analysis = await professorEngine.analyzeProfessorStyle(largeProfile);

    mockAi.mockRestore();

    expect(callCount).toBeGreaterThanOrEqual(2); // Confirmou fracionamento em múltiplos blocos
    expect(analysis.examDNA?.clinico).toBeDefined();
    // Média de 0.9, 0.6, 0.3 = 0.6
    expect(analysis.examDNA?.clinico?.contextoClinico).toBeCloseTo(0.6, 1);
  }, 15000);
});

