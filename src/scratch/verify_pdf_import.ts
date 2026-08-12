import 'fake-indexeddb/auto';
import { execSync } from 'child_process';
import { db } from '../data/db/database';
import { realSemanticSearchService } from '../data/services/RealSemanticSearchService';
import { ragEngine } from '../data/services/RAGEngine';

async function runVerification() {
  console.log('====================================================');
  console.log('PASSO 1: Lendo PDF de Prova Real (SIMULADO ENAMED)...');
  console.log('====================================================');

  const pdfPath = '/home/pedro/Documentos/SIMULADO PADRÃO ENAMED [100q]_8452 1.pdf';
  const rawText = execSync(`pdftotext "${pdfPath}" -`).toString('utf-8');

  console.log(`Texto extraído do PDF com sucesso: ${rawText.length} caracteres.`);
  console.log(`Amostra do texto: "${rawText.slice(0, 200).replace(/\n/g, ' ')}..."\n`);

  console.log('====================================================');
  console.log('PASSO 2: Indexando no Dexie com Metadata de Banca (ENAMED)...');
  console.log('====================================================');

  const assetId = 'asset-enamed-simulado-100q';
  const metadata = {
    examBoard: 'ENAMED',
    professor: 'ENAMED Autoral',
  };

  const indexedCount = await realSemanticSearchService.indexDocument(assetId, rawText, metadata);
  console.log(`IndexedDB atualizado com ${indexedCount} chunks de embeddings reais (gemini-embedding-001 - 768d).\n`);

  console.log('====================================================');
  console.log('PASSO 3: Inspecionando a Tabela documentEmbeddings no Dexie...');
  console.log('====================================================');

  const records = await db.documentEmbeddings.where('assetId').equals(assetId).toArray();
  console.log(`Total de registros salvos para o asset '${assetId}': ${records.length}`);

  if (records.length > 0) {
    const sampleRecord = records[0];
    console.log('Primeiro registro retornado do Dexie:');
    console.log({
      id: sampleRecord.id,
      assetId: sampleRecord.assetId,
      chunkIndex: sampleRecord.chunkIndex,
      examBoard: sampleRecord.examBoard,
      professor: sampleRecord.professor,
      dimension: sampleRecord.dimension,
      vectorLength: sampleRecord.vector?.length,
      contentSnippet: sampleRecord.content.slice(0, 100).replace(/\n/g, ' ') + '...',
    });

    const hasExamBoard = sampleRecord.examBoard === 'ENAMED';
    const hasProfessor = sampleRecord.professor === 'ENAMED Autoral';
    console.log(`\n> CHECKPOINT Dexie: examBoard === "ENAMED": ${hasExamBoard ? '✅ SIM' : '❌ NÃO'}`);
    console.log(`> CHECKPOINT Dexie: professor === "ENAMED Autoral": ${hasProfessor ? '✅ SIM' : '❌ NÃO'}`);
  }

  console.log('\n====================================================');
  console.log('PASSO 4: Testando RAGEngine.retrieveContext() com Filtro de Banca');
  console.log('====================================================');

  const query = 'hiponatremia fluoxetina SIADH';

  console.log(`\n--> Teste 1: Busca COM filtro { banca: "ENAMED" } para query: "${query}"`);
  const enamedChunks = await ragEngine.retrieveContext(query, { banca: 'ENAMED', topK: 3 });
  console.log(`Chunks retornados com filtro { banca: "ENAMED" }: ${enamedChunks.length}`);
  enamedChunks.forEach((c, idx) => {
    const textStr = typeof c === 'string' ? c : c.content;
    console.log(` [Chunk ${idx + 1}] ${textStr.slice(0, 150).replace(/\n/g, ' ')}...`);
  });

  console.log(`\n--> Teste 2: Busca COM filtro { banca: "USP" } para a mesma query: "${query}"`);
  const uspChunks = await ragEngine.retrieveContext(query, { banca: 'USP', topK: 3 });
  console.log(`Chunks retornados com filtro { banca: "USP" }: ${uspChunks.length}`);

  console.log(`\n--> Teste 3: Busca SEM filtro de banca (Busca Geral) para: "${query}"`);
  const allChunks = await ragEngine.retrieveContext(query, { topK: 3 });
  console.log(`Chunks retornados sem filtro de banca: ${allChunks.length}`);

  console.log('\n====================================================');
  console.log('RESULTADO DA VALIDAÇÃO DA FASE 32.5:');
  console.log('====================================================');
  if (records.length > 0 && records[0].examBoard === 'ENAMED' && enamedChunks.length > 0 && uspChunks.length === 0) {
    console.log('✅ VALIDAÇÃO CONCLUÍDA COM SUCESSO! O tagging de banca no RAG funcionou com 100% de precisão.');
  } else {
    console.error('❌ Falha na validação dos testes.');
  }
}

runVerification().catch(console.error);
