import fs from 'fs';
import path from 'path';
import { dictionaryNEREngine } from '../src/core/ner/DictionaryNEREngine';
import { CompactAhoCorasickEngine } from '../src/core/ner/CompactAhoCorasickEngine';

async function runComparison() {
  console.log('=== TAREFA 3: VALIDAÇÃO DE CORREÇÃO POR COMPARAÇÃO DIRETA ===');
  
  // 1. Inicializa o SQLite NER Engine atual
  console.log('[Setup] Aquecendo DictionaryNEREngine (SQLite L1+L2)...');
  await dictionaryNEREngine.warmup();

  // 2. Inicializa o CompactAhoCorasickEngine novo
  const datPath = path.resolve(process.cwd(), 'src/core/ner/medicalTerminology.automaton.dat');
  console.log('[Setup] Carregando CompactAhoCorasickEngine (Autômato Binário)...');
  const compactEngine = new CompactAhoCorasickEngine(datPath);

  // 3. Carrega o corpus de 11.727 chunks
  const jsonPath = path.resolve(process.cwd(), 'public/seed-data/document-embeddings.json');
  console.log(`[Corpus] Carregando chunks de ${jsonPath}...`);
  const chunks = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`[Corpus] Total de chunks carregados: ${chunks.length}`);

  let totalEntitiesSqlite = 0;
  let totalEntitiesCompact = 0;
  let divergentChunks = 0;
  const sampleDivergences: any[] = [];

  const maxChunksToTest = process.env.MAX_CHUNKS ? parseInt(process.env.MAX_CHUNKS, 10) : chunks.length;
  console.log(`[Comparação] Iniciando teste sobre ${maxChunksToTest} chunks...`);

  const t0 = Date.now();
  let lastLog = Date.now();

  for (let i = 0; i < maxChunksToTest; i++) {
    const chunk = chunks[i];
    const text = chunk.content;
    if (!text || typeof text !== 'string') continue;

    const matchesSqlite = dictionaryNEREngine.extractEntities(text);
    const matchesCompact = compactEngine.extractEntities(text);

    totalEntitiesSqlite += matchesSqlite.length;
    totalEntitiesCompact += matchesCompact.length;

    // Compara conjuntos de entidades
    const keyOf = (m: any) => `${m.startIndex}:${m.endIndex}:${m.text.toLowerCase()}:${(m.normalizedTerm || '').toLowerCase()}:${m.category}:${m.codeSystem || ''}:${m.code || ''}`;
    const setSqlite = new Set(matchesSqlite.map(keyOf));
    const setCompact = new Set(matchesCompact.map(keyOf));

    let hasDiff = false;
    if (setSqlite.size !== setCompact.size) {
      hasDiff = true;
    } else {
      for (const k of setSqlite) {
        if (!setCompact.has(k)) {
          hasDiff = true;
          break;
        }
      }
    }

    if (hasDiff) {
      divergentChunks++;
      if (sampleDivergences.length < 15) {
        sampleDivergences.push({
          chunkIndex: i,
          chunkId: chunk.id,
          sqliteMatches: matchesSqlite,
          compactMatches: matchesCompact,
        });
      }
    }

    if (Date.now() - lastLog > 5000) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[Progresso] Processados ${i + 1}/${maxChunksToTest} chunks em ${elapsed}s (${divergentChunks} divergentes)...`);
      lastLog = Date.now();
    }
  }

  const totalElapsedMs = Date.now() - t0;
  console.log('\n=== RESULTADOS DA COMPARAÇÃO ===');
  console.log(`Chunks processados: ${maxChunksToTest}`);
  console.log(`Tempo total: ${(totalElapsedMs / 1000).toFixed(2)}s (${(totalElapsedMs / maxChunksToTest).toFixed(2)}ms/chunk)`);
  console.log(`Total entidades encontradas (SQLite atual): ${totalEntitiesSqlite}`);
  console.log(`Total entidades encontradas (Autômato Compacto): ${totalEntitiesCompact}`);
  console.log(`Chunks com divergência: ${divergentChunks} (${((divergentChunks / maxChunksToTest) * 100).toFixed(2)}%)`);

  if (sampleDivergences.length > 0) {
    console.log('\n--- Exemplos de divergência: ---');
    for (const d of sampleDivergences.slice(0, 5)) {
      console.log(`\n[Chunk ${d.chunkIndex}] (ID: ${d.chunkId})`);
      console.log('SQLite:');
      for (const m of d.sqliteMatches) {
        console.log(`  - "${m.text}" -> ${m.normalizedTerm} [${m.category}] (${m.codeSystem}: ${m.code}) [${m.startIndex}-${m.endIndex}]`);
      }
      console.log('Compact:');
      for (const m of d.compactMatches) {
        console.log(`  - "${m.text}" -> ${m.normalizedTerm} [${m.category}] (${m.codeSystem}: ${m.code}) [${m.startIndex}-${m.endIndex}]`);
      }
    }
  }
}

runComparison().catch(console.error);
