/**
 * Seed Bundle Generator Script (Offline Build)
 * Run with: npx tsx scripts/build-seed-bundle.ts (ou npm run seed:build)
 *
 * Le os arquivos em scripts/seed-source/, extrai texto, gera embeddings locais (transformers.js 384d),
 * chama API de NER para extração de entidades clínicas, agrega índice canônico e grafo de conhecimento,
 * e gera os arquivos JSON estáticos em public/seed-data/.
 *
 * VARIÁVEIS DE AMBIENTE E FLAGS SUPORTADAS:
 * - SEED_NER_MODEL: [OBSOLETO - Motor de NER é 100% local Aho-Corasick]
 * - ENABLE_9ROUTER_FALLBACK_FOR_NER: [OBSOLETO - Motor de NER é 100% local Aho-Corasick]
 * - SEED_FORCE_RESTART=true ou flag --reset: Força reiniciar o processo do zero, apagando o checkpoint local (scripts/.seed-progress.json).
 *   Ex: npm run seed:build -- --reset ou SEED_FORCE_RESTART=true npm run seed:build
 * - SEED_FORCE_NER_RETRY=arquivo1.pdf,arquivo2.pdf ou flag --retry-ner=...: Limpa apenas os dados de NER dos arquivos especificados no checkpoint (preservando embeddings).
 *   Ex: SEED_FORCE_NER_RETRY=DECOREBAS.pdf,Farmaco.pdf npm run seed:build ou SEED_FORCE_NER_RETRY=suspects npm run seed:build
 * - Flag --audit: Varre o checkpoint existente e exibe relatório de sanidade do NER sem processar nem modificar nada.
 *   Ex: npx tsx scripts/build-seed-bundle.ts --audit
 */

import fs from 'fs';
import path from 'path';
import { chunkText } from '../src/data/services/textChunker';
import { KnowledgeAsset } from '../src/domain/entities/KnowledgeAsset';
import { DocumentEmbedding } from '../src/domain/entities/DocumentEmbedding';
import {
  ChunkEntityRecord,
  ChunkRelationRecord,
  CanonicalEntityIndexRecord,
  GraphEdgeRecord,
} from '../src/domain/entities/ChunkEntity';
import {
  deduplicateEntitiesIntraChunk,
  deduplicateRelationsIntraChunk,
  aggregateCanonicalEntityIndexRecord,
  aggregateGraphEdgeRecord,
} from '../src/core/utils/entityAggregation';

import { KnowledgeCategoryMapper } from '../src/core/medcore_kernel/ontology/KnowledgeCategoryMapper';
import { localEmbeddingClient } from '../src/data/services/embeddings/LocalEmbeddingClient';
import { LOCAL_EMBEDDING_CONFIG } from '../src/data/services/embeddings/localEmbeddingConfig';
import { dictionaryNEREngine, MatchedEntity, ExtractedRelation } from '../src/core/ner/DictionaryNEREngine';
import { MedicalEntityType, RelationType, ExtractedMedicalEntity, ExtractedMedicalRelation } from '../src/domain/entities/ChunkEntity';
import { normalizeEntityText } from '../src/core/utils/entityNormalizer';
import { resolveSynonym } from '../src/core/utils/medicalSynonyms';

function mapCategoryToEntityType(category: string): MedicalEntityType {
  switch (category) {
    case 'DOENCA':
      return 'disease';
    case 'MEDICAMENTO':
      return 'medication';
    case 'SINTOMA':
      return 'symptom';
    case 'ESTRUTURA_ANATOMICA':
      return 'anatomy';
    case 'EXAME':
      return 'exam';
    case 'PROCEDIMENTO':
      return 'procedure';
    default:
      return 'finding';
  }
}

function mapRelationTypeToPredicate(type: string): RelationType {
  switch (type) {
    case 'TRATAMENTO':
      return 'trata';
    case 'CAUSA':
    case 'EFEITO_ADVERSO':
      return 'causa';
    case 'CONTRAINDICACAO':
      return 'contraindica';
    case 'MANIFESTACAO':
      return 'é_sintoma_de';
    case 'DIAGNOSTICO_POR':
      return 'diagnostica';
    case 'PREVENCAO':
      return 'previne';
    case 'FATOR_DE_RISCO':
    case 'ASSOCIACAO':
    case 'MECANISMO_DE_ACAO':
    default:
      return 'associado_a';
  }
}


const SOURCE_DIR = path.resolve(process.cwd(), 'scripts/seed-source');
const OUTPUT_DIR = path.resolve(process.cwd(), 'public/seed-data');
const PROGRESS_FILE = path.resolve(process.cwd(), 'scripts/.seed-progress.json');

interface SeedManifestEntry {
  file: string;
  title: string;
  category?: string;
  subcategory?: string;
  discipline?: string;
  specialty?: string;
  author?: string;
  institution?: string;
  board?: string;
  professor?: string;
  year?: number;
  semester?: string;
  tags?: string[];
}

interface SeedProgressFile {
  status: 'in_progress' | 'completed';
  asset: KnowledgeAsset;
  totalChunks: number;
  embeddings: { [chunkIndex: number]: DocumentEmbedding };
  nerEntities: { [chunkIndex: number]: ChunkEntityRecord };
  nerRelations: { [chunkIndex: number]: ChunkRelationRecord };
  canonicalEntities: { [key: string]: CanonicalEntityIndexRecord };
  graphEdges: { [edgeId: string]: GraphEdgeRecord };
}

interface SeedProgressCheckpoint {
  version: string;
  updatedAt: string;
  completedFiles: string[];
  files: {
    [filename: string]: SeedProgressFile;
  };
}

function loadCheckpoint(): SeedProgressCheckpoint {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const raw = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.files === 'object') {
        return parsed as SeedProgressCheckpoint;
      }
    } catch (err) {
      console.warn('[Checkpoint] Falha ao ler arquivo de progresso existente. Criando novo checkpoint:', err);
    }
  }

  return {
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    completedFiles: [],
    files: {},
  };
}

function saveCheckpoint(cp: SeedProgressCheckpoint): void {
  try {
    cp.updatedAt = new Date().toISOString();
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(cp, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Checkpoint] Erro ao gravar checkpoint em disco:', err);
  }
}

function clearCheckpoint(): void {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      fs.unlinkSync(PROGRESS_FILE);
      console.log('🔄 Checkpoint local (scripts/.seed-progress.json) removido.');
    } catch (err) {
      console.warn('⚠️ Não foi possível remover o arquivo de checkpoint:', err);
    }
  }
}

function getCliArgValue(flagPrefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(flagPrefix));
  if (arg) {
    return arg.split('=')[1] || '';
  }
  return undefined;
}

async function extractTextFromFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const dataBuffer = new Uint8Array(fs.readFileSync(filePath));
      const pdf = await pdfjsLib.getDocument({ data: dataBuffer }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n\n';
      }
      return text;
    } catch (err) {
      console.warn(`[build-seed-bundle] PDF parsing fallback for ${path.basename(filePath)}:`, err);
      const buffer = fs.readFileSync(filePath);
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const fullString = decoder.decode(buffer);
      const printableMatches = fullString.match(/[\x20-\x7E\t\r\n]{4,}/g);
      return printableMatches ? printableMatches.join(' ') : '';
    }
  }

  return fs.readFileSync(filePath, 'utf-8');
}

function runAuditCheckpoint(checkpoint: SeedProgressCheckpoint, manifestEntries: SeedManifestEntry[]): void {
  console.log('\n==================================================');
  console.log('🔍 AUDITORIA DE ENTIDADES E RELAÇÕES NER NO CHECKPOINT SEED');
  console.log('==================================================');
  console.log(`Arquivo de checkpoint: ${PROGRESS_FILE}`);

  let totalFiles = 0;
  let healthyFilesCount = 0;
  let suspiciousFilesCount = 0;
  let unstartedFilesCount = 0;
  const suspiciousFilesList: Array<{ filename: string; totalChunks: number; emptyChunks: number; emptyRatio: number; totalEntities: number; totalRelations: number }> = [];

  const manifestFiles = manifestEntries.map((m) => m.file);
  const checkpointFiles = Object.keys(checkpoint.files);
  const allFiles = Array.from(new Set([...manifestFiles, ...checkpointFiles]));

  allFiles.forEach((filename, idx) => {
    totalFiles++;
    const fileData = checkpoint.files[filename];
    if (!fileData) {
      unstartedFilesCount++;
      console.log(`[${idx + 1}/${allFiles.length}] ⚪ ${filename}: NÃO INICIADO NO CHECKPOINT`);
      return;
    }

    const totalChunks = fileData.totalChunks || Object.keys(fileData.embeddings || {}).length || 0;
    const nerEntitiesMap = fileData.nerEntities || {};
    let emptyChunksCount = 0;
    let totalEntitiesCount = 0;
    let totalRelationsCount = 0;

    for (let cIdx = 0; cIdx < totalChunks; cIdx++) {
      const rec = nerEntitiesMap[cIdx];
      const entities = rec && Array.isArray(rec.entities) ? rec.entities : [];
      if (entities.length === 0) {
        emptyChunksCount++;
      } else {
        totalEntitiesCount += entities.length;
      }
    }

    Object.values(fileData.nerRelations || {}).forEach((relRec) => {
      if (relRec && Array.isArray(relRec.relations)) {
        totalRelationsCount += relRec.relations.length;
      }
    });

    const emptyRatio = totalChunks > 0 ? emptyChunksCount / totalChunks : 0;
    const isSuspicious = (totalChunks >= 5 && emptyRatio > 0.8) || (totalChunks > 0 && totalEntitiesCount === 0);

    if (isSuspicious) {
      suspiciousFilesCount++;
      suspiciousFilesList.push({
        filename,
        totalChunks,
        emptyChunks: emptyChunksCount,
        emptyRatio,
        totalEntities: totalEntitiesCount,
        totalRelations: totalRelationsCount,
      });
      console.log(
        `[${idx + 1}/${allFiles.length}] ⚠️ ${filename} (${totalChunks} chunks) | Entidades: ${totalEntitiesCount} | Relações: ${totalRelationsCount} | Chunks Vazios: ${emptyChunksCount}/${totalChunks} (${(emptyRatio * 100).toFixed(1)}%) | Status: ⚠️ SUSPEITO / FALHA NER`
      );
    } else {
      healthyFilesCount++;
      console.log(
        `[${idx + 1}/${allFiles.length}] ✅ ${filename} (${totalChunks} chunks) | Entidades: ${totalEntitiesCount} | Relações: ${totalRelationsCount} | Chunks Vazios: ${emptyChunksCount}/${totalChunks} (${(emptyRatio * 100).toFixed(1)}%) | Status: ✅ SAUDÁVEL`
      );
    }
  });

  console.log('\n==================================================');
  console.log('📊 RESUMO DA AUDITORIA DO CHECKPOINT:');
  console.log('==================================================');
  console.log(`- Total de arquivos analisados:                 ${totalFiles}`);
  console.log(`- Arquivos com NER saudável (<= 80% vazios):    ${healthyFilesCount}`);
  console.log(`- Arquivos SUSPEITOS (> 80% vazios / 0 ent):     ${suspiciousFilesCount}`);
  console.log(`- Arquivos não iniciados:                       ${unstartedFilesCount}`);

  if (suspiciousFilesList.length > 0) {
    console.warn('\n🔴 LISTA DE ARQUIVOS SUSPEITOS QUE PRECISAM DE REPROCESSAMENTO NER:');
    suspiciousFilesList.forEach((item, index) => {
      console.warn(
        `  ${index + 1}. ${item.filename} (${item.totalChunks} chunks, ${item.totalEntities} entidades extraídas, ${(item.emptyRatio * 100).toFixed(1)}% chunks vazios)`
      );
    });
    console.warn('\n💡 DICA DE COMANDO PARA REPROCESSAR APENAS ESSES ARQUIVOS (PRESERVANDO EMBEDDINGS):');
    const filenameArg = suspiciousFilesList.map((s) => s.filename).join(',');
    console.warn(`  SEED_FORCE_NER_RETRY=${filenameArg} npm run seed:build`);
    console.warn(`  (ou SEED_FORCE_NER_RETRY=suspects npm run seed:build)`);
  } else {
    console.log('\n🎉 Nenhum arquivo com falha/suspeita de NER encontrado no checkpoint!');
  }
  console.log('==================================================\n');
}

async function runBuildSeedBundle() {
  const FORCE_RESET = process.argv.includes('--reset') || process.env.SEED_FORCE_RESTART === 'true';
  const IS_AUDIT_MODE = process.argv.includes('--audit');
  const NER_RETRY_ARG = process.env.SEED_FORCE_NER_RETRY || getCliArgValue('--retry-ner');

  const manifestPath = path.join(SOURCE_DIR, 'manifest.json');
  let manifestEntries: SeedManifestEntry[] = [];
  if (fs.existsSync(manifestPath)) {
    try {
      manifestEntries = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {
      manifestEntries = [];
    }
  }

  if (FORCE_RESET) {
    clearCheckpoint();
  }

  const checkpoint = loadCheckpoint();

  // TAREFA 3: Reset seletivo do NER para arquivos específicos (preservando embeddings 384d)
  if (NER_RETRY_ARG) {
    let targetFiles: string[] = [];
    if (NER_RETRY_ARG.trim() === 'suspects') {
      targetFiles = Object.keys(checkpoint.files).filter((fn) => {
        const fData = checkpoint.files[fn];
        const total = fData.totalChunks || 0;
        let empty = 0;
        let totalEnts = 0;
        for (let cIdx = 0; cIdx < total; cIdx++) {
          const ents = fData.nerEntities[cIdx]?.entities || [];
          if (ents.length === 0) empty++;
          else totalEnts += ents.length;
        }
        const ratio = total > 0 ? empty / total : 0;
        return (total >= 5 && ratio > 0.8) || (total > 0 && totalEnts === 0);
      });
    } else if (NER_RETRY_ARG.trim() === 'all') {
      targetFiles = Object.keys(checkpoint.files);
    } else {
      targetFiles = NER_RETRY_ARG.split(',').map((s) => s.trim()).filter(Boolean);
    }

    if (targetFiles.length > 0) {
      console.log(`\n🔄 [NER Retry] Resetando dados de NER para ${targetFiles.length} arquivo(s): ${targetFiles.join(', ')}`);
      console.log(`   (Os embeddings 384d já calculados foram 100% PRESERVADOS no checkpoint)`);
      targetFiles.forEach((fn) => {
        if (checkpoint.files[fn]) {
          checkpoint.files[fn].nerEntities = {};
          checkpoint.files[fn].nerRelations = {};
          checkpoint.files[fn].canonicalEntities = {};
          checkpoint.files[fn].graphEdges = {};
          checkpoint.files[fn].status = 'in_progress';
        }
        checkpoint.completedFiles = checkpoint.completedFiles.filter((f) => f !== fn);
      });
      saveCheckpoint(checkpoint);
    }
  }

  // TAREFA 2: Comando Utilitário --audit
  if (IS_AUDIT_MODE) {
    runAuditCheckpoint(checkpoint, manifestEntries);
    process.exit(0);
  }

  console.log('🚀 Iniciando o Processo de Build do Seed Bundle MedAnki...');
  console.log(`Diretório de Origem:  ${SOURCE_DIR}`);
  console.log(`Diretório de Saída:   ${OUTPUT_DIR}`);
  console.log(`Motor de Embeddings: Local (transformers.js: ${LOCAL_EMBEDDING_CONFIG.modelName}, ${LOCAL_EMBEDDING_CONFIG.outputDimension}d)`);
  console.log('Motor de NER:        Local (Dicionário Aho-Corasick, determinístico, sem chamada de API)');
  if (process.env.SEED_NER_MODEL || process.env.ENABLE_9ROUTER_FALLBACK_FOR_NER) {
    console.log('ℹ️ Variáveis SEED_NER_MODEL / ENABLE_9ROUTER_FALLBACK_FOR_NER são obsoletas nesta versão (NER é 100% local).');
  }
  console.log(`Modo Forçar Reset:    ${FORCE_RESET ? 'SIM (--reset / SEED_FORCE_RESTART=true)' : 'NÃO (usará checkpoint de progresso se existir)'}`);


  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (!Array.isArray(manifestEntries) || manifestEntries.length === 0) {
    console.warn('⚠️ manifest.json está vazio. Gerando arquivos JSON vazios para o bundle de seed.');
    writeBundleOutputs([], [], [], [], [], [], 0, 0, [], 0, 0, 0, 0);
    return;
  }

  const now = new Date().toISOString();
  const knowledgeAssets: KnowledgeAsset[] = [];
  const documentEmbeddings: DocumentEmbedding[] = [];
  const chunkEntitiesRecords: ChunkEntityRecord[] = [];
  const chunkRelationsRecords: ChunkRelationRecord[] = [];
  const canonicalEntityMap = new Map<string, CanonicalEntityIndexRecord>();
  const graphEdgeMap = new Map<string, GraphEdgeRecord>();

  const BATCH_SIZE = 15;
  const failedFiles: string[] = [];
  let totalChunksProcessed = 0;

  // Estatísticas detalhadas de execução
  let embSuccessCount = 0;
  let embRestoredCount = 0;
  let nerSuccessBatches = 0;
  let nerRestoredBatches = 0;

  for (let idx = 0; idx < manifestEntries.length; idx++) {
    const entry = manifestEntries[idx];
    const filePath = path.join(SOURCE_DIR, entry.file);

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Arquivo de origem não encontrado: ${filePath}. Ignorando.`);
      failedFiles.push(entry.file);
      continue;
    }

    console.log(`\n📄 Processando [${idx + 1}/${manifestEntries.length}] ${entry.file}...`);

    // Verificação de Checkpoint por arquivo completo
    const isFileCompleted = checkpoint.completedFiles.includes(entry.file) && checkpoint.files[entry.file]?.status === 'completed';
    if (isFileCompleted && !FORCE_RESET) {
      console.log(`   ⏩ [Checkpoint] Arquivo ${entry.file} já concluído no checkpoint. Restaurando dados...`);
      const cachedFile = checkpoint.files[entry.file];
      knowledgeAssets.push(cachedFile.asset);
      totalChunksProcessed += cachedFile.totalChunks;

      Object.values(cachedFile.embeddings).forEach((emb) => {
        documentEmbeddings.push(emb);
        embRestoredCount++;
      });

      Object.values(cachedFile.nerEntities).forEach((entRec) => {
        chunkEntitiesRecords.push(entRec);
      });

      Object.values(cachedFile.nerRelations).forEach((relRec) => {
        chunkRelationsRecords.push(relRec);
      });

      Object.values(cachedFile.canonicalEntities).forEach((cEnt) => {
        const existing = canonicalEntityMap.get(cEnt.canonicalKey);
        if (!existing) {
          canonicalEntityMap.set(cEnt.canonicalKey, cEnt);
        } else {
          const mergedAssetIds = Array.from(new Set([...existing.assetIds, ...cEnt.assetIds]));
          const mergedSeenTexts = Array.from(new Set([...existing.seenTexts, ...cEnt.seenTexts]));
          canonicalEntityMap.set(cEnt.canonicalKey, {
            ...existing,
            occurrenceCount: existing.occurrenceCount + cEnt.occurrenceCount,
            assetIds: mergedAssetIds,
            seenTexts: mergedSeenTexts,
            updatedAt: now,
          });
        }
      });

      Object.values(cachedFile.graphEdges).forEach((edge) => {
        const existing = graphEdgeMap.get(edge.id);
        if (!existing) {
          graphEdgeMap.set(edge.id, edge);
        } else {
          const mergedAssetIds = Array.from(new Set([...existing.assetIds, ...edge.assetIds]));
          graphEdgeMap.set(edge.id, {
            ...existing,
            occurrenceCount: existing.occurrenceCount + edge.occurrenceCount,
            maxConfidence: Math.max(existing.maxConfidence, edge.maxConfidence),
            assetIds: mergedAssetIds,
            updatedAt: now,
          });
        }
      });

      nerRestoredBatches += Math.ceil(cachedFile.totalChunks / BATCH_SIZE);
      console.log(`   ✅ Arquivo ${entry.file} restaurado com sucesso do checkpoint (${cachedFile.totalChunks} chunks).`);
      continue;
    }

    try {
      const rawText = await extractTextFromFile(filePath);
      if (!rawText.trim()) {
        console.warn(`⚠️ Arquivo ${entry.file} resultou em texto vazio. Ignorando.`);
        failedFiles.push(entry.file);
        continue;
      }

      const assetId = `seed-asset-${Date.now()}-${idx + 1}`;
      const chunks = chunkText(rawText);
      totalChunksProcessed += chunks.length;

      console.log(`   - Texto extraído: ${rawText.length} caracteres | ${chunks.length} chunks gerados.`);

      const asset: KnowledgeAsset = {
        id: assetId,
        uuid: assetId,
        title: entry.title || entry.file,
        category: KnowledgeCategoryMapper.fromDisplayName(entry.category || 'Apostila'),
        subcategory: entry.subcategory || 'Geral',
        discipline: entry.discipline || 'Medicina',
        specialty: entry.specialty || 'Geral',
        author: entry.author || 'MedAnki',
        institution: 'MedAnki Seed Library',
        board: entry.board || 'Geral',
        professor: entry.professor || 'Geral',
        year: entry.year || new Date().getFullYear(),
        semester: entry.semester || '1',
        tags: entry.tags || [entry.specialty || 'Medicina'],
        metadata: { isSeed: true, sourceFile: entry.file },
        file: {
          name: entry.file,
          size: fs.statSync(filePath).size,
          extractedText: rawText,
        },
        createdAt: now,
        updatedAt: now,
        processingStatus: 'completed',
      };
      knowledgeAssets.push(asset);

      // Inicializa estrutura de checkpoint para o arquivo
      if (!checkpoint.files[entry.file]) {
        checkpoint.files[entry.file] = {
          status: 'in_progress',
          asset,
          totalChunks: chunks.length,
          embeddings: {},
          nerEntities: {},
          nerRelations: {},
          canonicalEntities: {},
          graphEdges: {},
        };
        saveCheckpoint(checkpoint);
      }
      const fileProgress = checkpoint.files[entry.file];
      fileProgress.asset = asset;
      fileProgress.totalChunks = chunks.length;

      // 1. Geração de Embeddings Locais (transformers.js 384d - SEM chamadas ao Gemini)
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batchTexts = chunks.slice(i, i + BATCH_SIZE);
        const batchIndices = batchTexts.map((_, bIdx) => i + bIdx);

        // Verifica se todas as embeddings deste batch já foram salvas no checkpoint
        const allEmbeddingsCached = batchIndices.every((cIdx) => fileProgress.embeddings[cIdx]);

        if (allEmbeddingsCached) {
          batchIndices.forEach((cIdx) => {
            documentEmbeddings.push(fileProgress.embeddings[cIdx]);
            embRestoredCount++;
          });
          continue;
        }

        try {
          const vectors = await localEmbeddingClient.generateEmbeddings(batchTexts);
          if (Array.isArray(vectors) && vectors.length === batchTexts.length) {
            vectors.forEach((vec, batchIdx) => {
              const chunkIdx = i + batchIdx;
              const embRecord: DocumentEmbedding = {
                id: `${assetId}-${chunkIdx}`,
                assetId,
                chunkIndex: chunkIdx,
                content: batchTexts[batchIdx],
                vector: vec,
                dimension: vec.length,
                model: LOCAL_EMBEDDING_CONFIG.modelName,
                embeddingSchemaVersion: LOCAL_EMBEDDING_CONFIG.embeddingSchemaVersion,
                createdAt: now,
              };
              documentEmbeddings.push(embRecord);
              fileProgress.embeddings[chunkIdx] = embRecord;
              embSuccessCount++;
            });
            saveCheckpoint(checkpoint);
          }
        } catch (embErr) {
          console.warn(`   ⚠️ Embeddings locais falharam para ${entry.file} chunks ${i}-${i + batchTexts.length}:`, embErr);
        }
      }

      // 2. Extração de Entidades Médicas NER (Motor Local determinístico Aho-Corasick)
      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        // Verifica se o NER deste chunk já foi salvo no checkpoint
        if (fileProgress.nerEntities[chunkIdx] && fileProgress.nerRelations[chunkIdx]) {
          const entRec = fileProgress.nerEntities[chunkIdx];
          const relRec = fileProgress.nerRelations[chunkIdx];
          chunkEntitiesRecords.push(entRec);
          chunkRelationsRecords.push(relRec);

          if (entRec && Array.isArray(entRec.entities)) {
            for (const ent of entRec.entities) {
              const existingIndex = canonicalEntityMap.get(ent.canonicalKey);
              const updatedIndex = aggregateCanonicalEntityIndexRecord(existingIndex, ent, assetId, now);
              canonicalEntityMap.set(ent.canonicalKey, updatedIndex);
            }
          }

          if (relRec && Array.isArray(relRec.relations)) {
            for (const rel of relRec.relations) {
              const edgeId = `${rel.subjectCanonicalKey}::${rel.predicate}::${rel.objectCanonicalKey}`;
              const existingEdge = graphEdgeMap.get(edgeId);
              const updatedEdge = aggregateGraphEdgeRecord(existingEdge, rel, assetId, now);
              graphEdgeMap.set(edgeId, updatedEdge);
            }
          }
          nerRestoredBatches++;
          continue;
        }

        const text = chunks[chunkIdx];
        const matchedEntities = dictionaryNEREngine.extractEntities(text);
        const extractedRelations = dictionaryNEREngine.extractRelations(text, matchedEntities);

        const rawEntities: ExtractedMedicalEntity[] = matchedEntities.map((m) => {
          const normText = normalizeEntityText(m.normalizedTerm);
          return {
            text: m.text,
            normalizedText: normText,
            canonicalKey: resolveSynonym(normText),
            type: mapCategoryToEntityType(m.category),
            code_system: null,
            code: null,
            confidence: 1.0,
          };
        });

        const rawRelations: ExtractedMedicalRelation[] = extractedRelations.map((rel) => {
          const sourceMatch = matchedEntities.find((e) => e.normalizedTerm === rel.sourceEntity);
          const targetMatch = matchedEntities.find((e) => e.normalizedTerm === rel.targetEntity);

          const subjText = sourceMatch ? sourceMatch.text : rel.sourceEntity;
          const subjNorm = normalizeEntityText(rel.sourceEntity);
          const subjType = sourceMatch ? mapCategoryToEntityType(sourceMatch.category) : 'finding';

          const objText = targetMatch ? targetMatch.text : rel.targetEntity;
          const objNorm = normalizeEntityText(rel.targetEntity);
          const objType = targetMatch ? mapCategoryToEntityType(targetMatch.category) : 'finding';

          return {
            subjectText: subjText,
            subjectNormalized: subjNorm,
            subjectCanonicalKey: resolveSynonym(subjNorm),
            subjectType: subjType,
            predicate: mapRelationTypeToPredicate(rel.relationType),
            objectText: objText,
            objectNormalized: objNorm,
            objectCanonicalKey: resolveSynonym(objNorm),
            objectType: objType,
            confidence: 1.0,
          };
        });

        const deduplicatedEntities = deduplicateEntitiesIntraChunk(rawEntities);
        const deduplicatedRelations = deduplicateRelationsIntraChunk(rawRelations, deduplicatedEntities);

        // Aggregation across seed bundle
        for (const ent of deduplicatedEntities) {
          const existingIndex = canonicalEntityMap.get(ent.canonicalKey);
          const updatedIndex = aggregateCanonicalEntityIndexRecord(existingIndex, ent, assetId, now);
          canonicalEntityMap.set(ent.canonicalKey, updatedIndex);
          fileProgress.canonicalEntities[ent.canonicalKey] = updatedIndex;
        }

        for (const rel of deduplicatedRelations) {
          const edgeId = `${rel.subjectCanonicalKey}::${rel.predicate}::${rel.objectCanonicalKey}`;
          const existingEdge = graphEdgeMap.get(edgeId);
          const updatedEdge = aggregateGraphEdgeRecord(existingEdge, rel, assetId, now);
          graphEdgeMap.set(edgeId, updatedEdge);
          fileProgress.graphEdges[edgeId] = updatedEdge;
        }

        const entRecord: ChunkEntityRecord = {
          id: `${assetId}-${chunkIdx}`,
          assetId,
          chunkIndex: chunkIdx,
          entities: deduplicatedEntities,
          createdAt: now,
        };

        const relRecord: ChunkRelationRecord = {
          id: `${assetId}-${chunkIdx}`,
          assetId,
          chunkIndex: chunkIdx,
          relations: deduplicatedRelations,
          createdAt: now,
        };

        chunkEntitiesRecords.push(entRecord);
        chunkRelationsRecords.push(relRecord);
        fileProgress.nerEntities[chunkIdx] = entRecord;
        fileProgress.nerRelations[chunkIdx] = relRecord;
        nerSuccessBatches++;
      }

      // Grava o progresso do NER imediatamente no disco
      saveCheckpoint(checkpoint);


      // TAREFA 2: Validação de Sanidade NER antes de marcar arquivo como concluído
      let emptyChunksInFile = 0;
      let totalEntitiesInFile = 0;
      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const ents = fileProgress.nerEntities[cIdx]?.entities || [];
        if (ents.length === 0) {
          emptyChunksInFile++;
        } else {
          totalEntitiesInFile += ents.length;
        }
      }

      const emptyRatioInFile = chunks.length > 0 ? emptyChunksInFile / chunks.length : 0;
      const isSanitySuspicious = (chunks.length >= 10 && emptyRatioInFile > 0.8) || (chunks.length > 0 && totalEntitiesInFile === 0);

      if (isSanitySuspicious) {
        console.warn(
          `⚠️ [NER SANITY ALERT] O arquivo ${entry.file} possui ${emptyChunksInFile}/${chunks.length} chunks sem nenhuma entidade (${(emptyRatioInFile * 100).toFixed(1)}% vazios, ${totalEntitiesInFile} entidades extraídas).`
        );
        console.warn(`   👉 O arquivo NÃO será marcado como concluído no checkpoint para exigir re-extração.`);
        fileProgress.status = 'in_progress';
        checkpoint.completedFiles = checkpoint.completedFiles.filter((f) => f !== entry.file);
        failedFiles.push(entry.file);
      } else {
        fileProgress.status = 'completed';
        if (!checkpoint.completedFiles.includes(entry.file)) {
          checkpoint.completedFiles.push(entry.file);
        }
        console.log(`   ✅ Concluído o processamento saudável de ${entry.file}.`);
      }
      saveCheckpoint(checkpoint);
    } catch (fileErr) {
      console.error(`❌ Falha crítica ao processar ${entry.file}:`, fileErr);
      failedFiles.push(entry.file);
    }
  }

  const canonicalEntities = Array.from(canonicalEntityMap.values());
  const graphEdges = Array.from(graphEdgeMap.values());

  writeBundleOutputs(
    knowledgeAssets,
    documentEmbeddings,
    chunkEntitiesRecords,
    chunkRelationsRecords,
    canonicalEntities,
    graphEdges,
    manifestEntries.length - failedFiles.length,
    totalChunksProcessed,
    failedFiles,
    embSuccessCount,
    embRestoredCount,
    nerSuccessBatches,
    nerRestoredBatches
  );
}

function writeBundleOutputs(
  assets: KnowledgeAsset[],
  embeddings: DocumentEmbedding[],
  entities: ChunkEntityRecord[],
  relations: ChunkRelationRecord[],
  canonical: CanonicalEntityIndexRecord[],
  edges: GraphEdgeRecord[],
  processedCount: number,
  totalChunks: number,
  failedFiles: string[],
  embSuccessCount: number,
  embRestoredCount: number,
  nerSuccessBatches: number,
  nerRestoredBatches: number
) {
  fs.writeFileSync(path.join(OUTPUT_DIR, 'knowledge-assets.json'), JSON.stringify(assets, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'document-embeddings.json'), JSON.stringify(embeddings, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'chunk-entities.json'), JSON.stringify(entities, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'chunk-relations.json'), JSON.stringify(relations, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'canonical-entity-index.json'), JSON.stringify(canonical, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'graph-edges.json'), JSON.stringify(edges, null, 2));

  const bundleManifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    assetCount: assets.length,
    embeddingCount: embeddings.length,
    chunkEntityCount: entities.length,
    chunkRelationCount: relations.length,
    canonicalEntityCount: canonical.length,
    graphEdgeCount: edges.length,
    totalChunksProcessed: totalChunks,
    failedFiles,
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(bundleManifest, null, 2));

  console.log('\n🎉 Geração do Seed Bundle concluída!');
  console.log(`   - Knowledge Assets:       ${assets.length}`);
  console.log(`   - Document Embeddings:    ${embeddings.length} (384d local)`);
  console.log(`   - Chunk Entity Records:   ${entities.length}`);
  console.log(`   - Chunk Relation Records: ${relations.length}`);
  console.log(`   - Canonical Entities:     ${canonical.length}`);
  console.log(`   - Graph Edges:            ${edges.length}`);

  // Imprimir resumo detalhado de execução ao final
  console.log('\n==================================================');
  console.log('📊 RESUMO DA EXECUÇÃO DO SEED BUNDLE (COM CHECKPOINT):');
  console.log('==================================================');
  console.log(`- Documentos processados com sucesso: ${processedCount}`);
  console.log(`- Chunks totais extraídos:            ${totalChunks}`);
  console.log(`- Embeddings locais geradas agora:     ${embSuccessCount} chunks`);
  console.log(`- Embeddings salvas restauradas:      ${embRestoredCount} chunks`);
  console.log(`- Chunks NER extraídos localmente agora: ${nerSuccessBatches} chunks (Aho-Corasick local)`);
  console.log(`- Chunks NER salvos restaurados:       ${nerRestoredBatches} chunks`);
  if (failedFiles.length > 0) {
    console.warn(`- Arquivos que falharam/suspeitos (${failedFiles.length}): ${failedFiles.join(', ')}`);
  }
  console.log('==================================================\n');
}

runBuildSeedBundle().catch((err) => {
  console.error('❌ Fatal error in build-seed-bundle script:', err);
  process.exit(1);
});
