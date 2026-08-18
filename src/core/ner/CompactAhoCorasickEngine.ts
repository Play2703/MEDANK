/**
 * Compact Aho-Corasick NER Engine (100% In-Memory / Zero SQLite Reads in Request Path)
 * 
 * Desserializa um autômato compilado em TypedArrays contíguos a partir de
 * medicalTerminology.automaton.dat via fs.readFileSync no boot.
 * 
 * - Footprint: ~60 MB de RAM em ArrayBuffer contíguo
 * - Boot time: <20ms
 * - Complexidade: O(N + M) puro em memória
 * - Zero bloqueio de Event Loop / Zero chamadas síncronas ao SQLite
 */

import fs from 'fs';
import path from 'path';
import { MatchedEntity } from './DictionaryNEREngine';

const CATEGORIES = [
  'DOENCA',
  'MEDICAMENTO',
  'SINTOMA',
  'ESTRUTURA_ANATOMICA',
  'EXAME',
  'PROCEDIMENTO',
  'OUTROS',
] as const;

const SYSTEMS = [
  null,
  'DeCS',
  'CID-10',
  'SNOMED CT',
  'RENAME',
  'TUSS',
  'CIAP-2',
] as const;

export interface TokenSpan {
  text: string;
  startIndex: number;
  endIndex: number;
}

export function align4(n: number): number {
  return (n + 3) & ~3;
}

export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s\-\.\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): TokenSpan[] {
  if (!text) return [];
  const tokens: TokenSpan[] = [];
  const regex = /[\w\u00C0-\u024F\-\.\/]+/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const cleaned = raw.replace(/^[\.\-\/]+|[\.\-\/]+$/g, '');
    if (!cleaned) continue;

    const leadingTrim = raw.indexOf(cleaned);
    const start = match.index + (leadingTrim >= 0 ? leadingTrim : 0);
    const end = start + cleaned.length;

    tokens.push({
      text: cleaned,
      startIndex: start,
      endIndex: end,
    });
  }

  return tokens;
}

const COMMON_STOP_WORDS = new Set([
  'de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'com', 'nao',
  'uma', 'os', 'no', 'se', 'na', 'por', 'mais', 'as', 'dos', 'como', 'mas',
  'ao', 'ele', 'das', 'seu', 'sua', 'ou', 'quando', 'muito', 'nos', 'ja',
  'eu', 'tambem', 'so', 'pelo', 'pela', 'ate', 'isso', 'ela', 'entre',
  'depois', 'sem', 'mesmo', 'aos', 'seus', 'quem', 'nas', 'me', 'esse',
  'eles', 'voce', 'essa', 'num', 'nem', 'suas', 'meu', 'as', 'minha',
  'numa', 'pelos', 'elas', 'qual', 'nos', 'lhe', 'deles', 'essas', 'esses',
  'pelas', 'este', 'dele', 'tu', 'te', 'voces', 'vos', 'lhes', 'meus',
  'minhas', 'teu', 'tua', 'teus', 'tuas', 'nosso', 'nossa', 'nossos',
  'nossas', 'dela', 'delas', 'esta', 'estes', 'estas', 'aquele', 'aquela',
  'aqueles', 'aquelas', 'isto', 'aquilo', 'estou', 'esta', 'estamos',
  'estao', 'estive', 'esteve', 'estivemos', 'estiveram', 'estava',
  'estavamos', 'estavam', 'estivera', 'estiveramos', 'esteja', 'estejamos',
  'estejam', 'estivesse', 'estivessemos', 'estivessem', 'estiver',
  'estivermos', 'estiverem', 'hei', 'ha', 'havemos', 'hao', 'houve',
  'houvemos', 'houveram', 'houvera', 'houveramos', 'haja', 'hajamos',
  'hajam', 'houvesse', 'houvessemos', 'houvessem', 'houver', 'houvermos',
  'houverem', 'houverei', 'houvera', 'houveremos', 'houverao', 'houveria',
  'houveriamos', 'houveriam', 'sou', 'somos', 'sao', 'era', 'eramos',
  'eram', 'fui', 'foi', 'fomos', 'foram', 'fora', 'foramos', 'seja',
  'sejamos', 'sejam', 'fosse', 'fossemos', 'fossem', 'for', 'formos',
  'forem', 'serei', 'sera', 'seremos', 'serao', 'seria', 'seriamos',
  'seriam', 'tenho', 'tem', 'temos', 'tem', 'tinha', 'tinhamos', 'tinham',
  'tive', 'teve', 'tivemos', 'tiveram', 'tivera', 'tiveramos', 'tenha',
  'tenhamos', 'tenham', 'tivesse', 'tivessemos', 'tivessem', 'tiver',
  'tivermos', 'tiverem', 'terei', 'tera', 'teremos', 'terao', 'teria',
  'teriamos', 'teriam', 'paciente', 'pacientes', 'quadro', 'caso', 'sinais',
  'sintomas', 'apresenta', 'apresentou', 'apresentando', 'referindo',
  'relata', 'relatou', 'exame', 'exames', 'historia', 'clinica', 'conduta',
  'diagnostico', 'tratamento', 'terapia', 'dose', 'dias', 'anos', 'meses',
  'horas', 'tempo', 'dia', 'ano', 'mes', 'hora', 'tipo', 'grau', 'nivel',
  'niveis', 'valor', 'valores', 'uso', 'durante', 'apos', 'antes', 'sobre',
]);

export class CompactAhoCorasickEngine {
  private buffer: Buffer | null = null;
  public nodeCount = 0;
  public transitionCount = 0;
  public termsCount = 0;
  public stringPoolLength = 0;
  public isLoaded = false;
  public loadDurationMs = 0;

  private failLink!: Int32Array;
  private outputLink!: Int32Array;
  private nodeOutputTermId!: Int32Array;
  private firstChildOffset!: Uint32Array;
  private transitionChar!: Uint16Array;
  private transitionTarget!: Uint32Array;
  private termCategories!: Uint8Array;
  private termSystems!: Uint8Array;
  private termCanonicalOffsets!: Uint32Array;
  private termCodeOffsets!: Uint32Array;
  private termNormalizedOffsets!: Uint32Array;
  private stringPool!: Uint8Array;

  constructor(customDatPath?: string) {
    if (customDatPath) {
      this.load(customDatPath);
    }
  }

  /**
   * Carrega o arquivo binário .dat na memória em um único ArrayBuffer.
   */
  public load(datFilePath: string): boolean {
    const t0 = Date.now();
    try {
      if (!fs.existsSync(datFilePath)) {
        console.warn(`[CompactAhoCorasickEngine] Arquivo não encontrado: ${datFilePath}`);
        return false;
      }

      this.buffer = fs.readFileSync(datFilePath);

      const magic = this.buffer.readUInt32LE(0);
      if (magic !== 0x4D454441) {
        throw new Error(`Magic number inválido no autômato: ${magic.toString(16)}`);
      }

      const version = this.buffer.readUInt32LE(4);
      if (version !== 1) {
        throw new Error(`Versão não suportada: ${version}`);
      }

      this.nodeCount = this.buffer.readUInt32LE(8);
      this.transitionCount = this.buffer.readUInt32LE(12);
      this.termsCount = this.buffer.readUInt32LE(16);
      this.stringPoolLength = this.buffer.readUInt32LE(20);

      const headerBytes = 64;
      let offset = headerBytes;

      const createTypedArray = <T extends ArrayBufferView>(
        Type: new (buf: ArrayBuffer, byteOffset: number, length: number) => T,
        length: number,
        bytesPerElement: number
      ): T => {
        offset = align4(offset);
        const arr = new Type(this.buffer!.buffer, this.buffer!.byteOffset + offset, length);
        offset += length * bytesPerElement;
        return arr;
      };

      this.failLink = createTypedArray(Int32Array, this.nodeCount, 4);
      this.outputLink = createTypedArray(Int32Array, this.nodeCount, 4);
      this.nodeOutputTermId = createTypedArray(Int32Array, this.nodeCount, 4);
      this.firstChildOffset = createTypedArray(Uint32Array, this.nodeCount + 1, 4);
      this.transitionChar = createTypedArray(Uint16Array, this.transitionCount, 2);
      this.transitionTarget = createTypedArray(Uint32Array, this.transitionCount, 4);
      this.termCategories = createTypedArray(Uint8Array, this.termsCount, 1);
      this.termSystems = createTypedArray(Uint8Array, this.termsCount, 1);
      this.termCanonicalOffsets = createTypedArray(Uint32Array, this.termsCount, 4);
      this.termCodeOffsets = createTypedArray(Uint32Array, this.termsCount, 4);
      this.termNormalizedOffsets = createTypedArray(Uint32Array, this.termsCount, 4);
      this.stringPool = createTypedArray(Uint8Array, this.stringPoolLength, 1);

      this.loadDurationMs = Date.now() - t0;
      this.isLoaded = true;

      console.log(
        `[CompactAhoCorasickEngine] ✅ Autômato binário carregado com sucesso em ${this.loadDurationMs}ms: ${this.termsCount} termos (${this.nodeCount} nós, ${(this.buffer.byteLength / 1024 / 1024).toFixed(2)} MB).`
      );
      return true;
    } catch (err) {
      console.error('[CompactAhoCorasickEngine] ❌ Falha ao carregar autômato binário:', err);
      this.isLoaded = false;
      return false;
    }
  }

  private getString(offset: number): string | null {
    if (offset === 0xFFFFFFFF || !this.stringPool) return null;
    let end = offset;
    while (end < this.stringPool.length && this.stringPool[end] !== 0) {
      end++;
    }
    return Buffer.from(
      this.stringPool.buffer,
      this.stringPool.byteOffset + offset,
      end - offset
    ).toString('utf-8');
  }

  private findChild(node: number, charCode: number): number {
    const start = this.firstChildOffset[node];
    const end = this.firstChildOffset[node + 1];
    let left = start;
    let right = end - 1;
    while (left <= right) {
      const mid = (left + right) >> 1;
      const midChar = this.transitionChar[mid];
      if (midChar === charCode) return this.transitionTarget[mid];
      if (midChar < charCode) left = mid + 1;
      else right = mid - 1;
    }
    return -1;
  }

  /**
   * Extrai entidades médicas do texto em 100% de tempo em memória O(N + M).
   */
  public extractEntities(text: string): MatchedEntity[] {
    if (!this.isLoaded || !text || typeof text !== 'string' || !text.trim()) {
      return [];
    }

    const tokens = tokenize(text);
    if (tokens.length === 0) return [];

    const normTokens = tokens.map((t) => normalizeText(t.text));
    const normJoined = normTokens.join(' ');

    const startTokenMap = new Map<number, number>();
    const endTokenMap = new Map<number, number>();
    let charOffset = 0;
    for (let i = 0; i < normTokens.length; i++) {
      startTokenMap.set(charOffset, i);
      charOffset += normTokens[i].length;
      endTokenMap.set(charOffset, i);
      charOffset += 1;
    }

    const rawMatches: MatchedEntity[] = [];
    let curr = 0;

    for (let i = 0; i < normJoined.length; i++) {
      const code = normJoined.charCodeAt(i);

      let next = this.findChild(curr, code);
      while (curr !== 0 && next === -1) {
        curr = this.failLink[curr];
        next = this.findChild(curr, code);
      }

      curr = next !== -1 ? next : 0;

      // Coleta matches no nó atual e em todo o caminho de outputLink
      let outNode = curr;
      while (outNode > 0) {
        const termId = this.nodeOutputTermId[outNode];
        if (termId !== -1) {
          const normTerm = this.getString(this.termNormalizedOffsets[termId]) || '';
          const matchStartNorm = i - normTerm.length + 1;
          const matchEndNorm = i + 1;

          const firstTokIdx = startTokenMap.get(matchStartNorm);
          const lastTokIdx = endTokenMap.get(matchEndNorm);

          // Verifica se o match coincide exatamente com limites de palavras/tokens
          if (firstTokIdx !== undefined && lastTokIdx !== undefined) {
            if (normTerm.includes(' ') || !COMMON_STOP_WORDS.has(normTerm)) {
              const startIdx = tokens[firstTokIdx].startIndex;
              const endIdx = tokens[lastTokIdx].endIndex;
              const rawText = text.slice(startIdx, endIdx);

              const canonical = this.getString(this.termCanonicalOffsets[termId]) || rawText;
              const codeSystem = SYSTEMS[this.termSystems[termId]];
              const code = this.getString(this.termCodeOffsets[termId]);
              const category = CATEGORIES[this.termCategories[termId]];

              rawMatches.push({
                text: rawText,
                normalizedTerm: canonical,
                category,
                startIndex: startIdx,
                endIndex: endIdx,
                codeSystem: codeSystem ?? null,
                code: code ?? null,
              });
            }
          }
        }
        outNode = this.outputLink[outNode];
      }
    }

    // Resolução de sobreposições (priorizando spans mais longos e início no texto)
    return this.resolveOverlaps(rawMatches);
  }

  private resolveOverlaps(matches: MatchedEntity[]): MatchedEntity[] {
    if (matches.length <= 1) return matches;

    // Ordena por comprimento decrescente, e em caso de empate por posição inicial
    matches.sort((a, b) => {
      const lenA = a.endIndex - a.startIndex;
      const lenB = b.endIndex - b.startIndex;
      if (lenB !== lenA) return lenB - lenA;
      return a.startIndex - b.startIndex;
    });

    const accepted: MatchedEntity[] = [];

    for (const cand of matches) {
      let overlaps = false;
      for (const acc of accepted) {
        // Checagem de sobreposição de intervalo [start, end)
        if (cand.startIndex < acc.endIndex && cand.endIndex > acc.startIndex) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        accepted.push(cand);
      }
    }

    // Retorna ordenado pela posição original no texto
    return accepted.sort((a, b) => a.startIndex - b.startIndex);
  }
}

export const compactAhoCorasickEngine = new CompactAhoCorasickEngine();
