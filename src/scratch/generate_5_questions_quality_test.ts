import 'fake-indexeddb/auto';
import { execSync } from 'child_process';
import { db } from '../data/db/database';
import { realSemanticSearchService } from '../data/services/RealSemanticSearchService';
import { QuestionGenerationService } from '../data/services/QuestionGenerationService';
import { QuestionGenerationRequest } from '../domain/entities/Question';

async function runQualityTest() {
  console.log('====================================================');
  console.log('Fase 33.5 — Teste Prático de Qualidade (5 Questões)');
  console.log('====================================================\n');

  // Index real ENAMED PDF
  const pdfPath = '/home/pedro/Documentos/SIMULADO PADRÃO ENAMED [100q]_8452 1.pdf';
  const pdfText = execSync(`pdftotext "${pdfPath}" -`).toString('utf-8');

  await realSemanticSearchService.indexDocument('asset-enamed-simulado-100q', pdfText, {
    examBoard: 'ENAMED',
    professor: 'ENAMED Autoral',
  });

  const genService = new QuestionGenerationService();

  // Generate 5 questions (3 ENAMED RAG + 2 General RAG)
  const req: QuestionGenerationRequest = {
    id: `req-quality-5q`,
    mode: 'banca',
    bancaName: 'ENAMED',
    configuration: {
      specialty: 'Clínica Médica',
      topics: ['SIADH e Hiponatremia', 'Insuficiência Cardíaca', 'Pneumonia Comunitária'],
      quantity: 5,
      difficulty: 'media',
      questionType: 'caso_clinico',
      includeCommentary: true,
      showReferences: true,
      autoGenerateFlashcards: false,
    },
    createdAt: new Date().toISOString(),
  };

  const res = await genService.generateQuestions(req);
  if (!res.questionSet || res.questionSet.questions.length === 0) {
    throw new Error('Falha ao gerar o lote de 5 questões.');
  }

  const questions = res.questionSet.questions;
  console.log(`✅ Lote de ${questions.length} questões gerado com sucesso!\n`);

  questions.forEach((q, idx) => {
    console.log(`====================================================`);
    console.log(`QUESTÃO ${idx + 1} DE ${questions.length}`);
    console.log(`====================================================`);
    console.log(`Especialidade: ${q.specialty} | Tópico: ${q.topic}`);
    console.log(`Origem: ${q.originSource}`);
    console.log(`\nENUNCIADO:\n${q.statement}\n`);
    console.log('ALTERNATIVAS:');
    q.options.forEach((opt) => {
      console.log(` [${opt.letter}] (${opt.text.length} chars) ${opt.text} ${opt.isCorrect ? '✅ (GABARITO)' : ''}`);
      if (opt.explanation) {
        console.log(`      ↳ Explicação da Opção ${opt.letter}: ${opt.explanation}`);
      }
    });

    console.log(`\nCOMENTÁRIO DA QUESTÃO:\n${q.commentary}\n`);

    // Audit checklist
    const lens = q.options.map((o) => o.text.length);
    const maxDiff = Math.max(...lens) - Math.min(...lens);
    const isSymmetric = maxDiff < 40; // Max character difference < 40 chars

    const hasAllExplanations = q.options.every((o) => o.explanation && o.explanation.trim().length > 10);

    console.log('CHECKLIST DE QUALIDADE (FASE 33.5):');
    console.log(`✓ Simetria de Extensão (Diferença máx: ${maxDiff} chars): ${isSymmetric ? '✅ SIM' : '⚠️ ATENÇÃO'}`);
    console.log(`✓ Explicação das 4 Opções Destrinchadas: ${hasAllExplanations ? '✅ SIM' : '❌ NÃO'}`);
    console.log('\n');
  });
}

runQualityTest().catch(console.error);
