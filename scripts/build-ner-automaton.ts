import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const CATEGORIES = [
  'DOENCA',
  'MEDICAMENTO',
  'SINTOMA',
  'ESTRUTURA_ANATOMICA',
  'EXAME',
  'PROCEDIMENTO',
  'OUTROS',
];

const SYSTEMS = [
  'NONE',
  'DeCS',
  'CID-10',
  'SNOMED CT',
  'RENAME',
  'TUSS',
  'CIAP-2',
];

export function align4(n: number): number {
  return (n + 3) & ~3;
}

export function buildNERAutomaton(
  sqliteDbPath: string,
  outputDatPath: string
): { termsCount: number; nodeCount: number; fileSizeBytes: number; buildTimeMs: number } {
  const t0 = Date.now();
  console.log(`[BuildNERAutomaton] Lendo termos do SQLite: ${sqliteDbPath}...`);
  const db = new Database(sqliteDbPath, { readonly: true });

  const rows = db.prepare(`
    SELECT normalized_term, canonical_term, category, system, code 
    FROM terms 
    WHERE normalized_term IS NOT NULL AND length(normalized_term) > 0
    GROUP BY normalized_term
  `).all() as any[];

  db.close();

  console.log(`[BuildNERAutomaton] ${rows.length} termos carregados.`);

  // 1. String Pool builder com desduplicação
  const stringBuffer: number[] = [];
  const offsetMap = new Map<string, number>();

  function addString(str: string | null | undefined): number {
    if (str === null || str === undefined || str === '') return 0xFFFFFFFF;
    let offset = offsetMap.get(str);
    if (offset !== undefined) return offset;

    offset = stringBuffer.length;
    const utf8Bytes = Buffer.from(str, 'utf-8');
    for (let i = 0; i < utf8Bytes.length; i++) {
      stringBuffer.push(utf8Bytes[i]);
    }
    stringBuffer.push(0); // null terminator
    offsetMap.set(str, offset);
    return offset;
  }

  // 2. Construir Trie
  let nodeCount = 1;
  const children: Map<number, number>[] = [new Map()];
  const outputTermId: number[] = [-1];

  function addTermToTrie(term: string, termId: number) {
    let curr = 0;
    for (let i = 0; i < term.length; i++) {
      const code = term.charCodeAt(i);
      let next = children[curr].get(code);
      if (next === undefined) {
        next = nodeCount++;
        children[curr].set(code, next);
        children.push(new Map());
        outputTermId.push(-1);
      }
      curr = next;
    }
    outputTermId[curr] = termId;
  }

  const termsCount = rows.length;
  const termCategories = new Uint8Array(termsCount);
  const termSystems = new Uint8Array(termsCount);
  const termCanonicalOffsets = new Uint32Array(termsCount);
  const termCodeOffsets = new Uint32Array(termsCount);
  const termNormalizedOffsets = new Uint32Array(termsCount);

  for (let i = 0; i < termsCount; i++) {
    const r = rows[i];
    addTermToTrie(r.normalized_term, i);

    let catIdx = CATEGORIES.indexOf(r.category);
    if (catIdx === -1) catIdx = 0;
    termCategories[i] = catIdx;

    let sysIdx = SYSTEMS.indexOf(r.system);
    if (sysIdx === -1) sysIdx = 0;
    termSystems[i] = sysIdx;

    termCanonicalOffsets[i] = addString(r.canonical_term || r.normalized_term);
    termCodeOffsets[i] = addString(r.code);
    termNormalizedOffsets[i] = addString(r.normalized_term);
  }

  console.log(`[BuildNERAutomaton] Trie construído com ${nodeCount} nós.`);

  // 3. Flattening do Trie em CSR com filhos ordenados
  let totalTransitions = 0;
  for (let i = 0; i < nodeCount; i++) {
    totalTransitions += children[i].size;
  }

  const firstChildOffset = new Uint32Array(nodeCount + 1);
  const transitionChar = new Uint16Array(totalTransitions);
  const transitionTarget = new Uint32Array(totalTransitions);
  const nodeOutputTermId = new Int32Array(nodeCount);

  let edgeIndex = 0;
  for (let i = 0; i < nodeCount; i++) {
    firstChildOffset[i] = edgeIndex;
    nodeOutputTermId[i] = outputTermId[i];

    const sorted = Array.from(children[i].entries()).sort((a, b) => a[0] - b[0]);
    for (const [char, target] of sorted) {
      transitionChar[edgeIndex] = char;
      transitionTarget[edgeIndex] = target;
      edgeIndex++;
    }
  }
  firstChildOffset[nodeCount] = edgeIndex;

  // 4. BFS para calcular failure links e output links
  console.log('[BuildNERAutomaton] Calculando failure links e output links...');
  const failLink = new Int32Array(nodeCount);
  const outputLink = new Int32Array(nodeCount);
  failLink.fill(0);
  outputLink.fill(-1);

  function findChild(node: number, charCode: number): number {
    const start = firstChildOffset[node];
    const end = firstChildOffset[node + 1];
    let left = start;
    let right = end - 1;
    while (left <= right) {
      const mid = (left + right) >> 1;
      const midChar = transitionChar[mid];
      if (midChar === charCode) return transitionTarget[mid];
      if (midChar < charCode) left = mid + 1;
      else right = mid - 1;
    }
    return -1;
  }

  const queue = new Uint32Array(nodeCount);
  let head = 0;
  let tail = 0;

  const rootStart = firstChildOffset[0];
  const rootEnd = firstChildOffset[1];
  for (let e = rootStart; e < rootEnd; e++) {
    const child = transitionTarget[e];
    failLink[child] = 0;
    queue[tail++] = child;
  }

  while (head < tail) {
    const curr = queue[head++];
    const currFail = failLink[curr];

    const cStart = firstChildOffset[curr];
    const cEnd = firstChildOffset[curr + 1];

    for (let e = cStart; e < cEnd; e++) {
      const char = transitionChar[e];
      const child = transitionTarget[e];

      let f = currFail;
      while (f !== 0 && findChild(f, char) === -1) {
        f = failLink[f];
      }
      const targetFail = findChild(f, char);
      failLink[child] = targetFail !== -1 && targetFail !== child ? targetFail : 0;

      const fNode = failLink[child];
      if (nodeOutputTermId[fNode] !== -1) {
        outputLink[child] = fNode;
      } else {
        outputLink[child] = outputLink[fNode];
      }

      queue[tail++] = child;
    }
  }

  // 5. Empacotar com alinhamento estrito de 4 bytes para cada TypedArray
  const stringPoolBytes = new Uint8Array(stringBuffer);
  const headerBytes = 64;

  const sections: { name: string; typedArray: ArrayBufferView }[] = [
    { name: 'failLink', typedArray: failLink },
    { name: 'outputLink', typedArray: outputLink },
    { name: 'nodeOutputTermId', typedArray: nodeOutputTermId },
    { name: 'firstChildOffset', typedArray: firstChildOffset },
    { name: 'transitionChar', typedArray: transitionChar },
    { name: 'transitionTarget', typedArray: transitionTarget },
    { name: 'termCategories', typedArray: termCategories },
    { name: 'termSystems', typedArray: termSystems },
    { name: 'termCanonicalOffsets', typedArray: termCanonicalOffsets },
    { name: 'termCodeOffsets', typedArray: termCodeOffsets },
    { name: 'termNormalizedOffsets', typedArray: termNormalizedOffsets },
    { name: 'stringPoolBytes', typedArray: stringPoolBytes },
  ];

  let totalFileBytes = headerBytes;
  for (const s of sections) {
    totalFileBytes = align4(totalFileBytes) + s.typedArray.byteLength;
  }
  totalFileBytes = align4(totalFileBytes);

  const buffer = Buffer.alloc(totalFileBytes);

  // Escrever Header
  buffer.writeUInt32LE(0x4D454441, 0); // Magic 'MEDA'
  buffer.writeUInt32LE(1, 4); // Version
  buffer.writeUInt32LE(nodeCount, 8);
  buffer.writeUInt32LE(totalTransitions, 12);
  buffer.writeUInt32LE(termsCount, 16);
  buffer.writeUInt32LE(stringPoolBytes.byteLength, 20);

  let currentOffset = headerBytes;
  for (const s of sections) {
    currentOffset = align4(currentOffset);
    const view = Buffer.from(s.typedArray.buffer, s.typedArray.byteOffset, s.typedArray.byteLength);
    view.copy(buffer, currentOffset);
    currentOffset += s.typedArray.byteLength;
  }

  fs.writeFileSync(outputDatPath, buffer);
  const buildTimeMs = Date.now() - t0;
  console.log(`[BuildNERAutomaton] Concluído em ${buildTimeMs}ms. Arquivo: ${(totalFileBytes / 1024 / 1024).toFixed(2)} MB -> ${outputDatPath}`);

  return {
    termsCount,
    nodeCount,
    fileSizeBytes: totalFileBytes,
    buildTimeMs,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dbPath = path.resolve(process.cwd(), 'src/core/ner/medicalTerminology.db');
  const outPath = path.resolve(process.cwd(), 'src/core/ner/medicalTerminology.automaton.dat');
  buildNERAutomaton(dbPath, outPath);
}
