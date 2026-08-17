import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { distractorEngine } from './DistractorEngine';

describe('DistractorEngine - Fonte 0 Distratores Reais de Provas Extraídas', () => {
  beforeEach(async () => {
    await db.extractedExamQuestions.clear();
    await db.graphEdges.clear();
    await db.canonicalEntityIndex.clear();
  });

  it('deve extrair alternativas erradas de questões de alta confiança como candidatos com prioridade máxima', async () => {
    const now = new Date().toISOString();

    // Popula extractedExamQuestions com uma questão de prova de residência (USP/ENARE)
    await db.extractedExamQuestions.bulkPut([
      {
        id: 'q_usp_2024_01',
        sourceAssetId: 'asset-prova-usp-2024',
        questionNumber: 1,
        statement: 'Paciente com IAM com supra de ST em parede anterior...',
        options: [
          { letter: 'A', text: 'Angioplastia coronária primária imediata' },
          { letter: 'B', text: 'Trombólise química com tenecteplase' },
          { letter: 'C', text: 'Anti-inflamatórios não esteroidais em dose plena' },
          { letter: 'D', text: 'Diltiazem intravenoso e observação clínica' },
        ],
        correctLetter: 'A', // Resposta correta: Angioplastia primária
        specialty: 'Cardiologia',
        confidence: 'high',
        createdAt: now,
      },
    ]);

    // Busca candidatos para a resposta correta "Angioplastia coronária primária imediata"
    const candidates = await distractorEngine.getCandidates({
      correctAnswerText: 'Angioplastia coronária primária imediata',
      specialty: 'Cardiologia',
      topics: ['Infarto Agudo do Miocárdio'],
      limit: 5,
    });

    expect(candidates.length).toBeGreaterThanOrEqual(3);

    // O primeiro candidato DEVE ser do tipo 'extracted_exam' (prioridade máxima sobre estático e grafo)
    const realDistractors = candidates.filter((c) => c.source === 'extracted_exam');
    expect(realDistractors.length).toBe(3);

    const distractorTexts = realDistractors.map((c) => c.text);
    expect(distractorTexts).toContain('Trombólise química com tenecteplase');
    expect(distractorTexts).toContain('Anti-inflamatórios não esteroidais em dose plena');
    expect(distractorTexts).toContain('Diltiazem intravenoso e observação clínica');

    // Não deve incluir a própria resposta correta
    expect(distractorTexts).not.toContain('Angioplastia coronária primária imediata');
  });

  it('deve priorizar distratores de provas extraídas sobre candidatos de confusionSets estáticos', async () => {
    const now = new Date().toISOString();

    // Insere questão de prova com distrator de classe real
    await db.extractedExamQuestions.bulkPut([
      {
        id: 'q_enare_2024_05',
        sourceAssetId: 'asset-prova-enare-2024',
        questionNumber: 5,
        statement: 'Paciente hipertenso com tosse seca induzida por IECA...',
        options: [
          { letter: 'A', text: 'Captopril' },
          { letter: 'B', text: 'Sacubitril/Valsartana 49/51mg' },
          { letter: 'C', text: 'Aliscireno 150mg' },
        ],
        correctLetter: 'A', // Correto: Captopril
        specialty: 'Cardiologia',
        confidence: 'high',
        createdAt: now,
      },
    ]);

    const candidates = await distractorEngine.getCandidates({
      correctAnswerText: 'Captopril',
      specialty: 'Cardiologia',
      topics: ['Hipertensão Arterial'],
      limit: 4,
    });

    // Os primeiros candidatos devem ser da prova real
    expect(candidates[0].source).toBe('extracted_exam');
    expect(['Sacubitril/Valsartana 49/51mg', 'Aliscireno 150mg']).toContain(candidates[0].text);
  });

  it('não deve utilizar questões com confidence "low"', async () => {
    const now = new Date().toISOString();

    // Questão com confidence 'low' (ex: layout ruim / não confiável)
    await db.extractedExamQuestions.bulkPut([
      {
        id: 'q_ruim_01',
        sourceAssetId: 'asset-ruim',
        questionNumber: 1,
        statement: 'Texto confuso...',
        options: [
          { letter: 'A', text: 'Aspirina 100mg' },
          { letter: 'B', text: 'Distrator não confiável' },
        ],
        correctLetter: 'A',
        specialty: 'Cardiologia',
        confidence: 'low', // Baixa confiança
        createdAt: now,
      },
    ]);

    const candidates = await distractorEngine.getRealExtractedCandidates('Aspirina 100mg', 'Cardiologia');
    expect(candidates).toHaveLength(0);
  });
});
