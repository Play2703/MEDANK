import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db/database';
import { distractorEngine } from './distractorEngine/DistractorEngine';
import { isValidGeneratedQuestion } from '../../core/utils/contentValidation';

describe('QuestionGenerationService - Montagem Prescritiva de Questões', () => {
  beforeEach(async () => {
    await db.canonicalEntityIndex.clear();
    await db.entityEmbeddings.clear();
    await db.graphEdges.clear();

    const now = new Date().toISOString();

    // Popula com entidades canônicas para o teste
    await db.canonicalEntityIndex.bulkPut([
      {
        canonicalKey: 'CID10:I50',
        type: 'disease',
        displayText: 'Insuficiência Cardíaca',
        code_system: 'CID-10',
        code: 'I50',
        occurrenceCount: 80,
        assetIds: ['a1'],
        seenTexts: ['insuficiência cardíaca'],
        updatedAt: now,
      },
      {
        canonicalKey: 'CID10:I20',
        type: 'disease',
        displayText: 'Angina Instável',
        code_system: 'CID-10',
        code: 'I20',
        occurrenceCount: 70,
        assetIds: ['a1'],
        seenTexts: ['angina'],
        updatedAt: now,
      },
      {
        canonicalKey: 'CID10:I21',
        type: 'disease',
        displayText: 'Infarto Agudo do Miocárdio com supra de ST',
        code_system: 'CID-10',
        code: 'I21',
        occurrenceCount: 95,
        assetIds: ['a1'],
        seenTexts: ['iam com supra'],
        updatedAt: now,
      },
      {
        canonicalKey: 'CID10:I26',
        type: 'disease',
        displayText: 'Tromboembolismo Pulmonar',
        code_system: 'CID-10',
        code: 'I26',
        occurrenceCount: 65,
        assetIds: ['a1'],
        seenTexts: ['tep'],
        updatedAt: now,
      },
    ]);
  });

  it('1. Deve validar objeto de questão com schema prescritivo (sem array options retornado pela IA)', () => {
    const rawQuestionFromAI = {
      statement: 'Paciente de 58 anos dá entrada no PS com dor torácica típica em aperto há 2 horas...',
      clinicalContext: 'Dor torácica aguda em coronariopata',
      correctAnswerText: 'Infarto Agudo do Miocárdio com supra de ST',
      correctAnswerExplanation: 'A elevação do segmento ST em derivações contíguas confirma o diagnóstico.',
      commentary: {
        correta: 'A elevação do segmento ST em derivações contíguas confirma o diagnóstico de IAMCSST.',
        correlacaoClinica: 'Emergência coronariana que exige reperfusão imediata.',
      },
      references: ['Diretriz SBC sobre Síndromes Coronarianas Agudas'],
      specialty: 'Cardiologia',
      topic: 'Síndrome Coronariana Aguda',
      difficulty: 'media',
      questionType: 'caso_clinico',
    };

    const isValid = isValidGeneratedQuestion(rawQuestionFromAI);
    expect(isValid).toBe(true);
  });

  it('2. Deve obter distratores locais via DistractorEngine e montar alternativas equilibradas', async () => {
    const correctAnswer = 'Infarto Agudo do Miocárdio com supra de ST';
    const candidates = await distractorEngine.getCandidates({
      correctAnswerText: correctAnswer,
      specialty: 'Cardiologia',
      topics: ['Síndrome Coronariana Aguda'],
      limit: 5,
    });

    console.log('\n--- SAÍDA: Distratores Prescritivos Montados ---');
    console.log(JSON.stringify(candidates, null, 2));

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((c) => c.text === correctAnswer)).toBe(false);
  });
});
