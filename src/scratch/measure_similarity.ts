import 'fake-indexeddb/auto';
import { execSync } from 'child_process';
import { db } from '../data/db/database';
import { realSemanticSearchService } from '../data/services/RealSemanticSearchService';
import { QuestionGenerationService } from '../data/services/QuestionGenerationService';
import { cosineSimilarity } from '../data/services/cosineSimilarity';
import { QuestionGenerationRequest } from '../domain/entities/Question';
import { apiUrl } from '../lib/apiBaseUrl';

/**
 * Finds the longest consecutive sequence of matching words between two texts
 */
function findLongestConsecutiveWordOverlap(text1: string, text2: string): { maxOverlapLength: number; matchingSequence: string } {
  const normalize = (t: string) => t.toLowerCase().replace(/[^\w\s]/gi, ' ').split(/\s+/).filter(Boolean);
  const words1 = normalize(text1);
  const words2 = normalize(text2);

  let maxLen = 0;
  let maxSeq: string[] = [];

  for (let i = 0; i < words1.length; i++) {
    for (let j = 0; j < words2.length; j++) {
      let k = 0;
      while (i + k < words1.length && j + k < words2.length && words1[i + k] === words2[j + k]) {
        k++;
      }
      if (k > maxLen) {
        maxLen = k;
        maxSeq = words1.slice(i, i + k);
      }
    }
  }

  return {
    maxOverlapLength: maxLen,
    matchingSequence: maxSeq.join(' '),
  };
}

async function runDeterministicMeasurement() {
  console.log('====================================================');
  console.log('Fase 33 — Validação Determinística & Medida de Similaridade');
  console.log('====================================================\n');

  const assetId = 'asset-enamed-simulado-100q';
  const existingCount = await db.documentEmbeddings.where('assetId').equals(assetId).count();

  if (existingCount === 0) {
    console.log('Indexando PDF de prova real no Dexie...');
    const pdfPath = '/home/pedro/Documentos/SIMULADO PADRÃO ENAMED [100q]_8452 1.pdf';
    const pdfText = execSync(`pdftotext "${pdfPath}" -`).toString('utf-8');

    await realSemanticSearchService.indexDocument(assetId, pdfText, {
      examBoard: 'ENAMED',
      professor: 'ENAMED Autoral',
    });
    console.log('✅ Indexação concluída.\n');
  } else {
    console.log(`✅ ${existingCount} chunks já indexados no Dexie. Reutilizando base existente.\n`);
  }

  // Extract the exact original SIADH / fluoxetina chunk from the PDF
  const originalChunks = await realSemanticSearchService.searchTopChunks('hiponatremia fluoxetina SIADH', 3, { banca: 'ENAMED' });
  const primaryOriginalChunk = originalChunks[0]?.content || '';

  console.log('--- TRECHO ORIGINAL DA PROVA ENAMED (RECURSO RAG) ---');
  console.log(primaryOriginalChunk.slice(0, 300).replace(/\n/g, ' ') + '...\n');

  // Generate a new question for SIADH with banca = ENAMED
  const genService = new QuestionGenerationService();
  const req: QuestionGenerationRequest = {
    id: `req-measurement-${Date.now()}`,
    mode: 'banca',
    bancaName: 'ENAMED',
    configuration: {
      specialty: 'Clínica Médica',
      topics: ['SIADH e Hiponatremia'],
      quantity: 1,
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
    throw new Error('Falha ao gerar questão para teste.');
  }

  const generatedQuestion = res.questionSet.questions[0];
  const generatedStatement = generatedQuestion.statement;

  console.log('--- ENUNCIADO DA QUESTÃO INÉDITA GERADA COM IA ---');
  console.log(generatedStatement + '\n');

  // Measure 1: Longest Consecutive Word Overlap (N-gram)
  const overlapResult = findLongestConsecutiveWordOverlap(generatedStatement, primaryOriginalChunk);

  // Measure 2: Real Cosine Similarity using gemini-embedding-001 (768d)
  const embRes = await fetch(apiUrl('/api/embeddings'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [generatedStatement, primaryOriginalChunk] }),
  });

  const embData = await embRes.json();
  const genVec = embData.embeddings[0];
  const origVec = embData.embeddings[1];

  const cosineSimScore = cosineSimilarity(genVec, origVec);

  console.log('====================================================');
  console.log('MÉTRICAS DETERMINÍSTICAS MEDIDAS:');
  console.log('====================================================');
  console.log(`1. Maior sobreposição consecutiva de palavras: ${overlapResult.maxOverlapLength} palavras`);
  if (overlapResult.maxOverlapLength > 0) {
    console.log(`   Sequência coincidente: "${overlapResult.matchingSequence}"`);
  }
  console.log(`2. Similaridade de Cosseno (gemini-embedding-001): ${cosineSimScore.toFixed(4)} (${(cosineSimScore * 100).toFixed(2)}%)\n`);

  const PASS_WORDS = overlapResult.maxOverlapLength < 8;
  const PASS_COSINE = cosineSimScore <= 0.92;

  console.log(`> Status Sobreposição (<8 palavras): ${PASS_WORDS ? '✅ PASSOU' : '❌ FALHOU (muito próximo do texto)'}`);
  console.log(`> Status Cosseno (<= 0.92): ${PASS_COSINE ? '✅ PASSOU' : '❌ FALHOU (similaridade semântica alta)'}`);

  return {
    maxOverlapLength: overlapResult.maxOverlapLength,
    matchingSequence: overlapResult.matchingSequence,
    cosineSimScore,
    passed: PASS_WORDS && PASS_COSINE,
  };
}

runDeterministicMeasurement().catch(console.error);
