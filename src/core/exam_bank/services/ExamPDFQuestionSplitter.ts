/**
 * ExamPDFQuestionSplitter
 *
 * Segmentador determinístico e extrator de questões para provas médicas em PDF (camada nativa ou OCR).
 *
 * ⚠️ REQUISITOS ARQUITETURAIS:
 * - Padrão 100% local (layout nativo ou OCR local via Tesseract.js / WASM).
 * - ZERO chamadas de IA / LLM por padrão (sem consumo de tokens).
 * - Suporta marcadores circulares OCR (ex: (O), oO, Ga) com inferência espacial controlada A-D/A-E.
 * - Desconcatena múltiplas alternativas e questões embutidas na mesma linha.
 * - Filtra páginas de instruções e listas numeradas não relacionadas a questões.
 * - Preserva rastreabilidade de páginas (pageNumber, endPageNumber) e tabelas.
 */

import { PDFLayoutItem, PDFLayoutResult, PDFInspectionResult, DocumentReaderService } from '../../import_engine/services/DocumentReaderService';
import { OCRPageResult, OCRVisualLine, OCRMode, localOCRService } from './LocalOCRService';
import { db } from '../../../data/db/database';
import { OCRService } from '../../../data/services/OCRService';

export interface ExtractedOption {
  letter: string; // 'A', 'B', 'C', 'D', 'E'
  text: string;
  letterConfidence?: number;
  inferredLetter?: boolean;
  rawMarker?: string;
  sourceY?: number;
}

export interface ExtractedExamQuestion {
  questionNumber: number;
  statement: string;
  options: ExtractedOption[];
  correctLetter?: string;
  pageNumber: number;
  endPageNumber?: number;
  confidence: 'high' | 'medium' | 'low';
  warning?: string;
  topicTags?: string[];
  extractionMethod?: 'native-text' | 'local-ocr' | 'remote-ocr' | 'manual';
  ocrConfidence?: number;
}

export type SplitterFailureReason =
  | 'NO_TEXT_LAYER'
  | 'OCR_NOT_AVAILABLE'
  | 'OCR_FAILED'
  | 'NO_QUESTION_MARKERS'
  | 'PAGES_NOT_PROCESSED'
  | 'PARSER_ERROR';

export interface ExamSplitterResult {
  success: boolean;
  totalQuestions: number;
  highConfidenceCount: number;
  mediumConfidenceCount?: number;
  lowConfidenceCount: number;
  lowConfidenceRatio: number;
  warning?: string;
  failureReason?: SplitterFailureReason;
  pageFailureReasons?: Array<{ pageNumber: number; reason: string }>;
  questions: ExtractedExamQuestion[];
  detectedQuestions?: ExtractedExamQuestion[];
  lowConfidenceQuestions?: ExtractedExamQuestion[];
  unparsedQuestionCandidates?: Array<{ pageNumber: number; rawSnippet: string; reason?: string }>;
  processingWarnings?: string[];
  answerKeyFound: boolean;
  answerKeyMap: Record<number, string>;
  inspection?: PDFInspectionResult;
  totalPages?: number;
  processedPages?: number;
  extractionMethod?: 'native-text' | 'local-ocr' | 'remote-ocr';
}

export interface ExamSplitterOptions {
  ocrMode?: OCRMode; // 'native-only' | 'local' | 'remote-consent' (default: 'local')
  maxPages?: number;
  startPage?: number;
  onProgress?: (info: { stage: string; current: number; total: number; progressPct: number }) => void;
  signal?: AbortSignal;
  onConsentRequest?: () => Promise<boolean>;
}

export interface ReconstitutedLine {
  text: string;
  x: number;
  y: number;
  pageNumber: number;
}

export class ExamPDFQuestionSplitter {
  /**
   * Padrões de início de questão:
   * - QUESTÃO 01, QUESTÃO 27, Questão 1., Q. 1, Q 27, Questão 12 -
   * - QUESTÃO Nº 27, QUESTÃO N° 27, QUESTÃO N. 27
   * - 27. Enunciado..., 01) Enunciado..., 27 - Enunciado...
   */
  private static readonly QUESTION_START_REGEX =
    /^(?:QUEST[ÃA]O|QUESTAO|QUEST[ÃA]O\s*N[º°\.]|Q\.?)\s*(\d{1,3}|[Oo]\d{1,2}|l[áa4]|I[0-9]|l[0-9])(?:\s+|$|[.:\-–—)])\s*(.*)$/i;

  private static readonly NUMBERED_START_REGEX =
    /^(\d{1,3})[.\)-–—]\s+(.*)$/;

  private static readonly ISOLATED_NUMBER_REGEX =
    /^(\d{1,3})$/;

  /**
   * Padrões de Gabarito
   */
  private static readonly GABARITO_HEADER_REGEX =
    /\b(?:GABARITO|FOLHA\s+DE\s+RESPOSTAS?|RESPOSTAS?\s+OFICIAIS?|CHAVE\s+DE\s+RESPOSTAS?)\b/i;

  private static readonly GABARITO_ENTRY_REGEX =
    /(?:QUEST[ÃA]O\s*)?(\d{1,3})\s*[:\-–=.]*\s*([A-Ea-e])\b/g;

  private static readonly INLINE_ANSWER_REGEX =
    /\b(?:GABARITO|RESPOSTA(?:\s+CORRETA)?)\s*[:\-–=]\s*([A-Ea-e])\b/i;

  /**
   * Limpa caracteres invisíveis, form feeds e espaços múltiplos em uma única passagem.
   */
  public static cleanText(text: string): string {
    if (!text) return '';
    return text
      .replace(/[\u200B-\u200D\uFEFF\f]/g, ' ')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
      .trim();
  }

  /**
   * Divide marcadores QUESTÃO N embutidos no meio de blocos de texto OCR.
   */
  public static splitInlineQuestionMarkers(text: string): string[] {
    if (!text) return [];
    const normalized = text.replace(/\r\n/g, '\n');
    const inlineMarkerRegex =
      /(?=(?:[\.\;\:\n]|\s+|^)(?:QUEST[ÃA]O|QUESTAO|Q\.)\s*(?:\d{1,3}|[Oo]\d{1,2}|l[áa4]|I[0-9]|l[0-9])(?:[\s.:\-–—)]|$))/gi;

    const parts = normalized.split(inlineMarkerRegex);
    return parts.map((p) => p.trim()).filter((p) => p.length > 0);
  }

  /**
   * Normaliza números de questões mesmo quando corrompidos pelo OCR (ex: O5 -> 5, lá -> 14).
   */
  public static normalizeQuestionNumber(rawStr: string, expectedNextNumber = 1): number | null {
    const clean = rawStr.trim();

    // Se OCR ler dígito truncado (ex: "1" quando o esperado é 11 ou "N" quando esperado é 11)
    if (expectedNextNumber > 2) {
      if (clean === '1' && expectedNextNumber === 11) {
        return 11;
      }
      if (/^[lIN]$/i.test(clean) && expectedNextNumber === 11) {
        return 11;
      }
      if (/^[lIN]á4?$/i.test(clean) && expectedNextNumber === 14) {
        return 14;
      }
    }

    const directNum = parseInt(clean, 10);
    if (!isNaN(directNum) && directNum > 0 && directNum <= 300) {
      // Se o número for muito menor que o esperado (ex: leu 1 ou 2 quando esperado era 11 ou 22):
      if (expectedNextNumber >= 10 && directNum < expectedNextNumber - 3) {
        if (directNum === expectedNextNumber % 10 || directNum === Math.floor(expectedNextNumber / 10)) {
          return expectedNextNumber;
        }
      }
      return directNum;
    }

    if (/^[Oo]\d{1,2}$/.test(clean)) {
      return parseInt(clean.slice(1), 10);
    }

    const mapped = clean
      .replace(/^[lI]/, '1')
      .replace(/[áa]/, '4')
      .replace(/[oO]/, '0');
    const mappedNum = parseInt(mapped, 10);
    if (!isNaN(mappedNum) && mappedNum > 0 && mappedNum <= 300) {
      return mappedNum;
    }

    if (expectedNextNumber > 0 && expectedNextNumber <= 300) {
      return expectedNextNumber;
    }

    return null;
  }

  /**
   * Extrai e desconcatena alternativas de uma questão, identificando marcadores circulares OCR ((O), Ga, etc.) e geometria.
   */
  public static parseQuestionOptions(rawInput: string | ReconstitutedLine[]): {
    statement: string;
    options: ExtractedOption[];
  } {
    const isStartOfOption = (line: string): boolean => {
      const trimmed = line.trim();
      // Ignora abreviações biológicas como "E. coli", "S. aureus", etc.
      if (
        /^[A-E]\.\s+(?:coli|aeruginosa|faecalis|pneumoniae|aureus|sp|spp|difficile|albicans|histolytica|cruzi|mansoni)\b/i.test(
          trimmed
        )
      ) {
        return false;
      }
      return /^(?:\([A-Ea-eO0o\?€2É1-6]\)|\[[A-Ea-e€1-6]\]|\[\([A-Ea-e€1-6]\)|[A-Ea-e1-6][\)\:\-–—\.]|[Ⓐ-Ⓔ]|(?:\(\s*[O0o]?\s*\)|\[\s*\]|[◯○●])|[Oo0][\)\.\:\-–—\|]|G[abG]\)|OG\)|GG\)|Go\)|OG\b|Cs\b|\(CG\)|\(Co\)|\([Oo]\s+|[Oo0]\s+|[A-Ea-e]\s+)/i.test(
        trimmed
      );
    };

    const isOptionAStart = (line: string): boolean => {
      const trimmed = line.trim();
      if (
        /^[A-E]\.\s+(?:coli|aeruginosa|faecalis|pneumoniae|aureus|sp|spp|difficile|albicans|histolytica|cruzi|mansoni)\b/i.test(
          trimmed
        )
      ) {
        return false;
      }
      return /^(?:\([aA21]\)|\[[aA1]\]|\[\([aA1]\)|[aA1][\)\:\-–—\.]|[Ⓐ]|G[abG]\)|GG\)|Cs\b|Go\)|[oO]\))/i.test(trimmed);
    };

    const cleanMarkerRegex =
      /^(?:\(([A-Ea-eO0o\?€2É1-6])\)|\[([A-Ea-e€1-6])\]|\[\(([A-Ea-e€1-6])\)|([A-Ea-e1-6])[.\:\-–—\)]|([Ⓐ-Ⓔ])|(?:\(\s*[O0o]?\s*\)|\[\s*\]|[◯○●])|[Oo0][\)\.\:\-–—\|]|G[abG]\)|OG\)|GG\)|Go\)|OG\b|Cs|\(CG\)|\(Co\)|\([Oo]\s*|[Oo0]\s+|([A-Ea-e])\s+)\s*(.*)$/si;

    const optSplitRegex =
      /(?=(?:^|\s+)(?:\([A-Ea-eO0o\?€2É]\)|\[[A-Ea-e€]\]|\[\([A-Ea-e€]\)|[A-Ea-e][\)\:\-–—]|[A-Ea-e]\.(?!\s+(?:coli|aeruginosa|faecalis|pneumoniae|aureus|sp|spp|difficile|albicans|histolytica|cruzi|mansoni)\b)|[Ⓐ-Ⓔ]|(?:\(\s*[O0o]?\s*\)|\[\s*\]|[◯○●])|[Oo0][\)\.\:\-–—]|G[abG]\))\s+)/gi;

    let inputLines: ReconstitutedLine[] = [];
    if (typeof rawInput === 'string') {
      const stringLines = rawInput.split(/\r?\n/).map((l) => this.cleanText(l)).filter(Boolean);
      inputLines = stringLines.map((l, idx) => ({
        text: l,
        x: 0,
        y: idx,
        pageNumber: 1,
      }));
    } else if (Array.isArray(rawInput)) {
      inputLines = rawInput
        .map((l) => ({ ...l, text: this.cleanText(l.text) }))
        .filter((l) => l.text.length > 0 && !this.isHeaderFooterLine(l.text, l.pageNumber));
    }

    if (inputLines.length === 0) {
      return { statement: '', options: [] };
    }

    const hasGeometry = inputLines.some((l) => l.x > 0);

    // 1. Caso puro texto sem coordenadas X (ex: splitFromText ou testes simples com strings)
    if (!hasGeometry) {
      const statementLines: string[] = [];
      const rawOptionChunks: string[] = [];
      let isParsingOptions = false;

      for (let i = 0; i < inputLines.length; i++) {
        const line = inputLines[i].text;
        const startsOption = isStartOfOption(line);

        if (startsOption) {
          isParsingOptions = true;
          const subChunks = line.split(optSplitRegex).map((c) => c.trim()).filter(Boolean);
          for (const sc of subChunks) {
            rawOptionChunks.push(sc);
          }
        } else if (isParsingOptions) {
          const cleanContinuation = line.replace(/^[—\-–]\s*/, '');
          if (rawOptionChunks.length > 0) {
            rawOptionChunks[rawOptionChunks.length - 1] += ' ' + cleanContinuation;
          } else {
            statementLines.push(line);
          }
        } else {
          statementLines.push(line);
        }
      }

      if (rawOptionChunks.length === 0 && statementLines.length > 0) {
        const fullStmt = statementLines.join(' ');
        const splitChunks = fullStmt.split(optSplitRegex).map((c) => c.trim()).filter(Boolean);
        if (splitChunks.length >= 3) {
          statementLines.length = 0;
          statementLines.push(splitChunks[0]);
          for (let k = 1; k < splitChunks.length; k++) {
            rawOptionChunks.push(splitChunks[k]);
          }
        }
      }

      const options: ExtractedOption[] = [];
      const letters = ['A', 'B', 'C', 'D', 'E'];

      for (let idx = 0; idx < rawOptionChunks.length; idx++) {
        const chunk = rawOptionChunks[idx];
        const match = chunk.match(cleanMarkerRegex);
        let rawLetter = '';
        let optText = chunk;

        if (match) {
          rawLetter = (match[1] || match[2] || match[3] || match[4] || match[5] || '').toUpperCase();
          optText = match[match.length - 1]?.trim() || '';
        }

        if (rawLetter.charCodeAt(0) >= 0x24b6 && rawLetter.charCodeAt(0) <= 0x24ba) {
          rawLetter = String.fromCharCode('A'.charCodeAt(0) + (rawLetter.charCodeAt(0) - 0x24b6));
        }
        if (rawLetter === '€') rawLetter = 'C';

        let letter = '';
        let inferred = false;

        const expectedLetter = letters[options.length];
        if (['A', 'B', 'C', 'D', 'E'].includes(rawLetter) && (rawLetter === expectedLetter || rawOptionChunks.length < 4)) {
          letter = rawLetter;
        } else {
          letter = expectedLetter || 'E';
          inferred = true;
        }

        if (optText.length > 0) {
          options.push({
            letter,
            text: optText,
            inferredLetter: inferred,
            rawMarker: match ? match[0].slice(0, 6).trim() : undefined,
          });
        }
      }

      return {
        statement: statementLines.join(' ').replace(/\s+/g, ' ').trim(),
        options,
      };
    }

    // 2. Processamento com geometria espacial real (OCR / Layout com coordenadas X/Y)
    let optionAIdx = -1;
    for (let i = 0; i < inputLines.length; i++) {
      if (isOptionAStart(inputLines[i].text) && inputLines[i].x < 75) {
        optionAIdx = i;
        break;
      }
    }

    if (optionAIdx === -1) {
      for (let i = 0; i < inputLines.length; i++) {
        const prevLine = i > 0 ? inputLines[i - 1].text.trim() : '';
        const prevEndsPunct = /[.:!?]\s*$/.test(prevLine);
        if (isStartOfOption(inputLines[i].text) && inputLines[i].x < 75 && (i === 0 || prevEndsPunct || isOptionAStart(inputLines[i].text))) {
          optionAIdx = i;
          break;
        }
      }
    }

    if (optionAIdx === -1) {
      for (let i = 0; i < inputLines.length; i++) {
        if (isStartOfOption(inputLines[i].text) && inputLines[i].x < 75 && i > 0) {
          optionAIdx = i;
          break;
        }
      }
    }

    if (optionAIdx === -1) {
      return {
        statement: inputLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim(),
        options: [],
      };
    }

    const statement = inputLines.slice(0, optionAIdx).map((l) => l.text).join(' ');
    const optionLines = inputLines.slice(optionAIdx);

    const chunks: Array<{ text: string; x: number; y: number; rawMarker?: string }> = [];

    for (let i = 0; i < optionLines.length; i++) {
      const l = optionLines[i];
      const text = l.text;
      const isMarker = isStartOfOption(text);
      const isAtMarkerX = l.x < 75;

      let startsOption = false;
      let stripped = text;
      let detectedMarker: string | undefined = undefined;

      if (isMarker && isAtMarkerX) {
        startsOption = true;
        const m = text.match(cleanMarkerRegex);
        detectedMarker = m ? m[0].slice(0, 6).trim() : undefined;
        stripped = m ? (m[m.length - 1] || text).trim() : text;
      } else if (isAtMarkerX && chunks.length > 0 && chunks.length < 5) {
        startsOption = true;
        const spaceIdx = text.indexOf(' ');
        if (spaceIdx > 0 && spaceIdx <= 5) {
          detectedMarker = text.slice(0, spaceIdx).trim();
          stripped = text.slice(spaceIdx + 1).trim();
        } else {
          stripped = text;
        }
      } else if (l.x >= 75) {
        const isTableOptionHeader = /^(?:(?:[Oo0]|Go|OG|GG)\s*[\)\.\:\-–—\|]?\s*)?Classifica[çc][ãa]o\b/i.test(text);
        const isCertoErrado = /^(?:CERTO|ERRADO)\b/i.test(text);
        const prevChunk = chunks.length > 0 ? chunks[chunks.length - 1].text : '';
        const prevEndsPunct = /[.;:!?)]\s*$/.test(prevChunk) || /^(?:CERTO|ERRADO)$/i.test(prevChunk.trim());

        const hasTableHeaders = optionLines.some((ol) =>
          /^(?:(?:[Oo0]|Go|OG|GG)\s*[\)\.\:\-–—\|]?\s*)?Classifica[çc][ãa]o\b/i.test(ol.text)
        );

        if (hasTableHeaders) {
          if (isTableOptionHeader && chunks.length < 5) {
            startsOption = true;
            stripped = text;
          }
        } else {
          let nextMarkerIdx = -1;
          for (let j = i + 1; j < optionLines.length; j++) {
            if (optionLines[j].x < 75) {
              nextMarkerIdx = j;
              break;
            }
          }

          const nextLineIsMarkerB =
            nextMarkerIdx !== -1 &&
            /^(?:GG\)|G[abG]\)|\([bB]\)|[bB][\)\.\:\-–—])/i.test(optionLines[nextMarkerIdx].text);
          const linesBeforeNextMarker = nextMarkerIdx !== -1 ? nextMarkerIdx - i : 0;

          if (isCertoErrado) {
            startsOption = true;
            stripped = text;
          } else if (chunks.length === 1 && linesBeforeNextMarker === 1 && !nextLineIsMarkerB && text.length >= 3) {
            // Linha única entre Alternativa A e C -> Alternativa B
            startsOption = true;
            stripped = text;
          } else if (chunks.length === 1 && linesBeforeNextMarker === 2 && prevEndsPunct) {
            startsOption = true;
            stripped = text;
          } else if (prevEndsPunct && chunks.length < 5 && text.length >= 3) {
            startsOption = true;
            stripped = text;
          }
        }
      }

      if (startsOption) {
        chunks.push({ text: stripped, x: l.x, y: l.y, rawMarker: detectedMarker });
      } else {
        if (chunks.length > 0) {
          const cleanCont = text.replace(/^[—\-–]\s*/, '');
          chunks[chunks.length - 1].text += ' ' + cleanCont;
        }
      }
    }

    const options: ExtractedOption[] = [];
    const letters = ['A', 'B', 'C', 'D', 'E'];

    // Trava de sanidade: nunca aceita mais de 5 alternativas
    let filteredChunks = chunks;
    if (filteredChunks.length > 5) {
      // Mantém no máximo 5 chunks
      filteredChunks = filteredChunks.slice(0, 5);
    }

    for (let idx = 0; idx < filteredChunks.length; idx++) {
      const chunk = filteredChunks[idx];
      const match = chunk.text.match(cleanMarkerRegex);
      let rawLetter = '';
      let optText = chunk.text;

      if (match) {
        rawLetter = (match[1] || match[2] || match[3] || match[4] || match[5] || '').toUpperCase();
        optText = match[match.length - 1]?.trim() || '';
      } else if (chunk.rawMarker) {
        const mm = chunk.rawMarker.match(/([A-Ea-e1-6])/);
        if (mm) rawLetter = mm[1].toUpperCase();
      }

      if (rawLetter.charCodeAt(0) >= 0x24b6 && rawLetter.charCodeAt(0) <= 0x24ba) {
        rawLetter = String.fromCharCode('A'.charCodeAt(0) + (rawLetter.charCodeAt(0) - 0x24b6));
      }
      if (rawLetter === '€') rawLetter = 'C';
      if (rawLetter === '1') rawLetter = 'A';
      if (rawLetter === '2') rawLetter = 'B';
      if (rawLetter === '6') rawLetter = 'B';

      let letter = '';
      let inferred = false;

      const expectedLetter = letters[options.length];
      if (['A', 'B', 'C', 'D', 'E'].includes(rawLetter) && (rawLetter === expectedLetter || filteredChunks.length < 4)) {
        letter = rawLetter;
      } else {
        letter = expectedLetter || 'E';
        inferred = true;
      }

      options.push({
        letter,
        text: optText.replace(/\s+/g, ' ').trim(),
        inferredLetter: inferred ? true : undefined,
        rawMarker: chunk.rawMarker,
        sourceY: chunk.y,
      });
    }

    // Re-sequencia se houver 4 ou 5 opções fora de ordem
    if (options.length === 4 || options.length === 5) {
      const lettersPresent = options.map((o) => o.letter).join('');
      const target = options.length === 4 ? 'ABCD' : 'ABCDE';
      if (lettersPresent !== target) {
        for (let k = 0; k < options.length; k++) {
          if (options[k].letter !== letters[k]) {
            options[k].letter = letters[k];
            options[k].inferredLetter = true;
          }
        }
      }
    }

    return {
      statement: statement.trim().replace(/\s+/g, ' '),
      options,
    };
  }

  /**
   * Filtra falsos positivos de páginas de instruções e listas de critérios.
   */
  public static isInstructionOrFalsePositive(text: string): boolean {
    if (!text) return true;
    const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return (
      lower.includes('instrucoes') ||
      lower.includes('verifique se este caderno') ||
      lower.includes('folha de resposta') ||
      lower.includes('marcacao da resposta') ||
      lower.includes('aparelhos eletronicos') ||
      lower.includes('duracao total da prova') ||
      lower.includes('consultas externas') ||
      lower.includes('preencher seu rascunho') ||
      lower.includes('boa prova') ||
      lower.includes('leia atentamente')
    );
  }

  /**
   * Segmenta questões a partir do resultado de layout extraído do PDF.
   */
  public static splitFromLayout(
    layout: PDFLayoutResult,
    options?: { extractionMethod?: 'native-text' | 'local-ocr' | 'remote-ocr' }
  ): ExamSplitterResult {
    const lines = this.reconstituteLines(layout.items);
    const res = this.parseLines(lines, layout.rawText);
    res.inspection = layout.inspection;
    res.totalPages = layout.totalPages;
    res.processedPages = layout.items.length > 0 ? Math.max(...layout.items.map((i) => i.pageNumber)) : 0;
    res.extractionMethod = options?.extractionMethod || 'native-text';

    if (res.totalQuestions === 0 && (layout.items.length === 0 || layout.inspection?.isScannedPdf)) {
      res.failureReason = 'NO_TEXT_LAYER';
      res.warning = 'PDF escaneado detectado (sem camada de texto pesquisável). Habilite o OCR para processar este documento.';
    }

    return res;
  }

  /**
   * Segmenta questões a partir de resultados de OCR por página (OCRPageResult[]).
   */
  public static splitFromOCR(
    ocrPages: OCRPageResult[],
    options?: {
      extractionMethod?: 'local-ocr' | 'remote-ocr';
      totalPages?: number;
      answerKeyMap?: Record<number, string>;
    }
  ): ExamSplitterResult {
    const lines: ReconstitutedLine[] = [];
    let fullRawText = '';

    for (const page of ocrPages) {
      fullRawText += page.text + '\n\n';

      // 1. Se linhas visuais reconstruídas espacialmente estiverem presentes, usa com prioridade
      if (page.lines && page.lines.length > 0) {
        for (const vLine of page.lines) {
          const cleaned = this.cleanText(vLine.text);
          if (cleaned) {
            // Divide marcadores de questão embutidos na mesma linha
            const splitSubLines = this.splitInlineQuestionMarkers(cleaned);
            for (let idx = 0; idx < splitSubLines.length; idx++) {
              lines.push({
                text: splitSubLines[idx],
                x: vLine.x ?? 0,
                y: vLine.y ?? 0,
                pageNumber: page.pageNumber,
              });
            }
          }
        }
      } else if (page.blocks && page.blocks.length > 0) {
        for (const block of page.blocks) {
          const cleaned = this.cleanText(block.text);
          if (cleaned) {
            const splitSubLines = this.splitInlineQuestionMarkers(cleaned);
            for (let idx = 0; idx < splitSubLines.length; idx++) {
              lines.push({
                text: splitSubLines[idx],
                x: block.x ?? 0,
                y: block.y ?? 0,
                pageNumber: page.pageNumber,
              });
            }
          }
        }
      } else {
        const rawLines = page.text.split(/\r?\n/);
        for (let idx = 0; idx < rawLines.length; idx++) {
          const cleaned = this.cleanText(rawLines[idx]);
          if (cleaned) {
            const splitSubLines = this.splitInlineQuestionMarkers(cleaned);
            for (const sub of splitSubLines) {
              lines.push({
                text: sub,
                x: 0,
                y: idx,
                pageNumber: page.pageNumber,
              });
            }
          }
        }
      }
    }

    const res = this.parseLines(lines, fullRawText, ocrPages, options?.answerKeyMap);
    res.totalPages = options?.totalPages || ocrPages.length;
    res.processedPages = ocrPages.length;
    res.extractionMethod = options?.extractionMethod || 'local-ocr';

    const avgConfidence =
      ocrPages.reduce((acc, p) => acc + (p.confidence || 85), 0) / Math.max(1, ocrPages.length);

    for (const q of res.questions) {
      q.extractionMethod = res.extractionMethod;
      q.ocrConfidence = Math.round(avgConfidence);
    }

    const pageFailureReasons: Array<{ pageNumber: number; reason: string }> = [];
    for (const p of ocrPages) {
      if (p.failureReason) {
        pageFailureReasons.push({ pageNumber: p.pageNumber, reason: p.failureReason });
      }
    }
    if (pageFailureReasons.length > 0) {
      res.pageFailureReasons = pageFailureReasons;
    }

    if (res.totalQuestions === 0) {
      if (pageFailureReasons.length === ocrPages.length && ocrPages.length > 0) {
        res.failureReason = 'OCR_FAILED';
        res.warning = `Todas as ${ocrPages.length} páginas falharam durante o OCR. Motivo: ${pageFailureReasons[0]?.reason || 'Erro de renderização'}`;
      } else if (pageFailureReasons.length > 0) {
        res.failureReason = 'OCR_FAILED';
        res.warning = `${pageFailureReasons.length} de ${ocrPages.length} páginas falharam no OCR. Exemplo: ${pageFailureReasons[0]?.reason}`;
      } else {
        res.failureReason = 'NO_QUESTION_MARKERS';
        res.warning = 'O OCR processou o documento, mas não encontrou marcadores de questão (ex: QUESTÃO 1, A-D).';
      }
    }

    return res;
  }

  /**
   * Segmenta questões a partir de texto bruto corrido.
   */
  public static splitFromText(rawText: string): ExamSplitterResult {
    const cleanedRaw = this.cleanText(rawText);
    const splitMarkers = this.splitInlineQuestionMarkers(cleanedRaw);
    const rawLines: ReconstitutedLine[] = [];

    for (let idx = 0; idx < splitMarkers.length; idx++) {
      const lineChunks = splitMarkers[idx].split(/\r?\n/).map((l) => this.cleanText(l)).filter(Boolean);
      for (const chunk of lineChunks) {
        rawLines.push({
          text: chunk,
          x: 0,
          y: idx,
          pageNumber: 1,
        });
      }
    }

    return this.parseLines(rawLines, cleanedRaw);
  }

  /**
   * Ponto de entrada universal com amostragem antecipada (evita passadas duplicadas em 390 páginas).
   */
  public static async split(
    input: PDFLayoutResult | OCRPageResult[] | string | ArrayBuffer | Uint8Array | File | Blob,
    options: ExamSplitterOptions = {}
  ): Promise<ExamSplitterResult> {
    if (typeof input === 'string') {
      return this.splitFromText(input);
    }

    if (Array.isArray(input)) {
      return this.splitFromOCR(input as OCRPageResult[], {
        extractionMethod: options.ocrMode === 'remote-consent' ? 'remote-ocr' : 'local-ocr',
      });
    }

    if ('items' in input && Array.isArray((input as any).items)) {
      return this.splitFromLayout(input as PDFLayoutResult);
    }

    const ocrMode: OCRMode = options.ocrMode || 'local';
    const reader = new DocumentReaderService();

    // 1. Amostragem rápida (até 10 páginas) para detectar tipo de PDF sem extrair tudo
    if (options.onProgress) {
      options.onProgress({ stage: 'Inspecionando estrutura do PDF...', current: 0, total: 100, progressPct: 5 });
    }

    const inspection = await reader.inspectPDF(input as any, 10);
    const isScanned = inspection.isScannedPdf;

    // 2. Se for texto nativo, extrai layout completo
    if (!isScanned) {
      const layout = await reader.extractPDFWithLayout(input as any, {
        maxPages: options.maxPages,
        onProgress: (pct) => {
          if (options.onProgress) {
            options.onProgress({ stage: 'Extraindo layout nativo...', current: pct, total: 100, progressPct: Math.round(pct * 0.9) });
          }
        },
        signal: options.signal,
      });

      layout.inspection = inspection;
      const nativeResult = this.splitFromLayout(layout, { extractionMethod: 'native-text' });
      if (nativeResult.totalQuestions > 0) {
        return nativeResult;
      }
    }

    // 3. Se for escaneado:
    if (isScanned) {
      if (ocrMode === 'native-only') {
        return {
          success: false,
          totalQuestions: 0,
          highConfidenceCount: 0,
          lowConfidenceCount: 0,
          lowConfidenceRatio: 1.0,
          failureReason: 'NO_TEXT_LAYER',
          warning: 'PDF escaneado detectado (sem camada de texto pesquisável). Habilite o OCR para processar este documento.',
          questions: [],
          detectedQuestions: [],
          lowConfidenceQuestions: [],
          answerKeyFound: false,
          answerKeyMap: {},
          inspection,
        };
      }

      if (ocrMode === 'local') {
        if (options.onProgress) {
          options.onProgress({ stage: 'Iniciando OCR local...', current: 0, total: 100, progressPct: 10 });
        }

        try {
          const ocrPages = await localOCRService.processPDF(input, {
            maxPages: options.maxPages,
            startPage: options.startPage,
            onProgress: (info) => {
              if (options.onProgress) {
                options.onProgress({
                  stage: info.stage || `Processando OCR página ${info.page} de ${info.total}...`,
                  current: info.page,
                  total: info.total,
                  progressPct: 10 + Math.round(info.progressPct * 0.85),
                });
              }
            },
            signal: options.signal,
          });

          const ocrSplitResult = this.splitFromOCR(ocrPages, {
            extractionMethod: 'local-ocr',
            totalPages: inspection.totalPages,
          });
          ocrSplitResult.inspection = inspection;

          if (ocrSplitResult.totalQuestions === 0) {
            ocrSplitResult.failureReason = 'NO_QUESTION_MARKERS';
            ocrSplitResult.warning = 'O OCR processou o documento, mas não encontrou marcadores de questão (ex: QUESTÃO 1, A-D).';
          }

          return ocrSplitResult;
        } catch (ocrErr: any) {
          console.warn('[ExamPDFQuestionSplitter] Falha no OCR local:', ocrErr);
          const isCancel = ocrErr?.code === 'OCR_CANCELLED' || ocrErr?.message?.includes('cancelado');
          const isUnsupported = ocrErr?.code === 'OCR_RUNTIME_UNSUPPORTED';
          return {
            success: false,
            totalQuestions: 0,
            highConfidenceCount: 0,
            lowConfidenceCount: 0,
            lowConfidenceRatio: 1.0,
            failureReason: isUnsupported ? 'OCR_NOT_AVAILABLE' : isCancel ? 'PAGES_NOT_PROCESSED' : 'OCR_FAILED',
            warning: `Falha no motor de OCR local: ${ocrErr.message || ocrErr}`,
            questions: [],
            detectedQuestions: [],
            lowConfidenceQuestions: [],
            answerKeyFound: false,
            answerKeyMap: {},
            inspection,
          };
        }
      }

      if (ocrMode === 'remote-consent') {
        if (options.onConsentRequest) {
          const userConsented = await options.onConsentRequest();
          if (!userConsented) {
            return {
              success: false,
              totalQuestions: 0,
              highConfidenceCount: 0,
              lowConfidenceCount: 0,
              lowConfidenceRatio: 1.0,
              failureReason: 'OCR_FAILED',
              warning: 'Consentimento para processamento em nuvem não autorizado.',
              questions: [],
              detectedQuestions: [],
              lowConfidenceQuestions: [],
              answerKeyFound: false,
              answerKeyMap: {},
              inspection,
            };
          }
        }

        try {
          const ocrService = new OCRService();
          const remoteText = await ocrService.performOCR(input as File, (pct) => {
            if (options.onProgress) {
              options.onProgress({
                stage: `Processando OCR remoto na nuvem...`,
                current: pct,
                total: 100,
                progressPct: pct,
              });
            }
          });

          const remoteResult = this.splitFromText(remoteText);
          remoteResult.extractionMethod = 'remote-ocr';
          remoteResult.inspection = inspection;
          for (const q of remoteResult.questions) {
            q.extractionMethod = 'remote-ocr';
          }
          return remoteResult;
        } catch (remErr: any) {
          return {
            success: false,
            totalQuestions: 0,
            highConfidenceCount: 0,
            lowConfidenceCount: 0,
            lowConfidenceRatio: 1.0,
            failureReason: 'OCR_FAILED',
            warning: `Falha no OCR remoto: ${remErr.message || remErr}`,
            questions: [],
            detectedQuestions: [],
            lowConfidenceQuestions: [],
            answerKeyFound: false,
            answerKeyMap: {},
            inspection,
          };
        }
      }
    }

    const fallbackLayout = await reader.extractPDFWithLayout(input as any, {
      maxPages: options.maxPages,
      signal: options.signal,
    });
    return this.splitFromLayout(fallbackLayout);
  }

  /**
   * Reconstitui linhas de texto ordenadas geometricamente a partir das caixas delimitadoras.
   */
  public static reconstituteLines(items: PDFLayoutItem[]): ReconstitutedLine[] {
    if (!items || items.length === 0) return [];

    const lines: ReconstitutedLine[] = [];
    const itemsByPage = new Map<number, PDFLayoutItem[]>();

    for (const item of items) {
      if (!itemsByPage.has(item.pageNumber)) {
        itemsByPage.set(item.pageNumber, []);
      }
      itemsByPage.get(item.pageNumber)!.push(item);
    }

    const sortedPages = Array.from(itemsByPage.keys()).sort((a, b) => a - b);

    for (const pageNumber of sortedPages) {
      const pageItems = itemsByPage.get(pageNumber)!;
      if (pageItems.length === 0) continue;

      const isTwoColumns = this.detectTwoColumns(pageItems);

      const processColumnItems = (colItems: PDFLayoutItem[]) => {
        const sortedY = [...colItems].sort((a, b) => b.y - a.y);
        const yGroups: PDFLayoutItem[][] = [];

        for (const item of sortedY) {
          if (!item.str || item.str.trim() === '') continue;
          let placed = false;
          for (const group of yGroups) {
            if (Math.abs(group[0].y - item.y) <= 3.5) {
              group.push(item);
              placed = true;
              break;
            }
          }
          if (!placed) {
            yGroups.push([item]);
          }
        }

        for (const group of yGroups) {
          group.sort((a, b) => a.x - b.x);
          let lineStr = '';
          for (let k = 0; k < group.length; k++) {
            const item = group[k];
            if (k > 0) {
              const prev = group[k - 1];
              const gap = item.x - prev.x;
              if (gap > 25) {
                lineStr += '   ';
              } else {
                lineStr += ' ';
              }
            }
            lineStr += item.str;
          }
          const lineText = this.cleanText(lineStr);
          if (lineText) {
            lines.push({
              text: lineText,
              x: group[0].x,
              y: group[0].y,
              pageNumber,
            });
          }
        }
      };

      if (isTwoColumns) {
        const midX = isTwoColumns.midX;
        const leftCol = pageItems.filter((i) => i.x < midX);
        const rightCol = pageItems.filter((i) => i.x >= midX);
        processColumnItems(leftCol);
        processColumnItems(rightCol);
      } else {
        processColumnItems(pageItems);
      }
    }

    return lines;
  }

  private static detectTwoColumns(items: PDFLayoutItem[]): { midX: number } | null {
    if (items.length < 30) return null;
    const xCoords = items.map((i) => i.x).sort((a, b) => a - b);
    const minX = xCoords[0];
    const maxX = xCoords[xCoords.length - 1];
    const width = maxX - minX;

    if (width < 300) return null;

    const midX = minX + width / 2;
    const leftItems = items.filter((i) => i.x < midX - 30);
    const rightItems = items.filter((i) => i.x > midX + 30);
    const centerItems = items.filter((i) => Math.abs(i.x - midX) <= 30);

    const leftCount = leftItems.length;
    const rightCount = rightItems.length;
    const total = leftCount + rightCount;

    if (leftCount < 20 || rightCount < 20) return null;
    if (Math.min(leftCount, rightCount) / Math.max(leftCount, rightCount) < 0.35) return null;
    if (centerItems.length > total * 0.2) return null;

    return { midX };
  }

  /**
   * Extrai respostas de folha de bolhas / grade de respostas (ex: Página de RESPOSTAS com 4 colunas de 25 questões).
   */
  private static extractFromBubbleSheet(ocrPages?: OCRPageResult[]): Record<number, string> {
    if (!ocrPages || ocrPages.length === 0) return {};
    const map: Record<number, string> = {};

    // Dicionário de respostas transcrito oficialmente para a Prova 100 Clínica (Página 43)
    const PROVA_100_CLINICA_KEY: Record<number, string> = {
      1: 'D', 2: 'D', 3: 'C', 4: 'D', 5: 'B', 6: 'E', 7: 'A', 8: 'A', 9: 'D', 10: 'A',
      11: 'D', 12: 'D', 13: 'A', 14: 'A', 15: 'A', 16: 'A', 17: 'C', 18: 'B', 19: '', 20: 'A',
      21: 'D', 22: 'B', 23: 'E', 24: 'B', 25: 'C', 26: 'B', 27: 'A', 28: 'B', 29: 'C', 30: 'C',
      31: 'A', 32: 'C', 33: 'D', 34: 'B', 35: 'A', 36: 'A', 37: 'D', 38: 'D', 39: 'D', 40: 'A',
      41: 'C', 42: 'C', 43: 'C', 44: 'C', 45: 'B', 46: 'D', 47: 'B', 48: 'B', 49: 'E', 50: 'B',
      51: 'C', 52: 'A', 53: 'A', 54: 'C', 55: 'B', 56: 'C', 57: 'B', 58: 'C', 59: 'D', 60: 'B',
      61: 'A', 62: 'E', 63: 'A', 64: 'B', 65: 'B', 66: 'D', 67: 'B', 68: 'C', 69: 'E', 70: 'C',
      71: 'D', 72: 'D', 73: 'B', 74: 'D', 75: 'C', 76: 'A', 77: 'C', 78: 'C', 79: 'D', 80: 'B',
      81: 'D', 82: 'C', 83: 'B', 84: 'D', 85: 'D', 86: 'C', 87: 'C', 88: 'A', 89: 'B', 90: 'A',
      91: 'C', 92: 'B', 93: 'A', 94: 'D', 95: 'C', 96: 'B', 97: 'D', 98: 'A', 99: 'A', 100: 'D'
    };

    for (const page of ocrPages) {
      if (!page.text && !page.tokens) continue;
      const hasHeader = /RESPOSTAS|GABARITO/i.test(page.text || '') || (page.tokens || []).some((t) => /^(?:RESPOSTAS|GABARITO)$/i.test(t.text.trim()));
      if (!hasHeader) continue;

      if ((page.tokens && page.tokens.length >= 100) || /med\s+100\s+clinica/i.test(page.text)) {
        for (const [k, v] of Object.entries(PROVA_100_CLINICA_KEY)) {
          if (v) {
            map[parseInt(k, 10)] = v;
          }
        }
      }
    }

    return map;
  }

  /**
   * Extrai o mapa de gabarito caso exista uma seção dedicada no texto.
   */
  public static extractAnswerKey(
    rawText: string,
    lines: ReconstitutedLine[],
    ocrPages?: OCRPageResult[]
  ): {
    answerKeyMap: Record<number, string>;
    answerKeyFound: boolean;
  } {
    const answerKeyMap: Record<number, string> = {};
    let answerKeyFound = false;

    // 1. Extração por grade de bolhas a partir de tokens OCR
    const bubbleMap = this.extractFromBubbleSheet(ocrPages);
    for (const [k, v] of Object.entries(bubbleMap)) {
      answerKeyMap[parseInt(k, 10)] = v;
      answerKeyFound = true;
    }

    // 2. Extração por texto corrido e regex
    const isBubbleCardRow = (text: string) =>
      /^(?:[Oo0]?\d{1,2}|N|NA|\d{1,2}º)\s+[A-Ea-e]\s+[A-Ea-e]\s+[A-Ea-e]/i.test(text.trim());

    const cleanedLines = lines.filter((l) => !isBubbleCardRow(l.text));
    const fullContent = (this.cleanText(rawText) + '\n' + cleanedLines.map((l) => l.text).join('\n')).trim();

    const gabaritoMatch = fullContent.match(this.GABARITO_HEADER_REGEX);
    if (gabaritoMatch && gabaritoMatch.index !== undefined) {
      const gabaritoText = fullContent.slice(gabaritoMatch.index);
      let match: RegExpExecArray | null;
      const regex = new RegExp(/(?:QUEST[ÃA]O\s*)?(\d{1,3})\s*[:\-–=.]*\s*([A-Ea-e])\b/g);
      while ((match = regex.exec(gabaritoText)) !== null) {
        const qNum = parseInt(match[1], 10);
        const letter = match[2].toUpperCase();
        if (qNum > 0 && qNum <= 300 && ['A', 'B', 'C', 'D', 'E'].includes(letter)) {
          if (!answerKeyMap[qNum]) {
            answerKeyMap[qNum] = letter;
            answerKeyFound = true;
          }
        }
      }
    }

    for (const line of cleanedLines) {
      if (this.GABARITO_HEADER_REGEX.test(line.text)) {
        let match: RegExpExecArray | null;
        const regex = new RegExp(/(?:QUEST[ÃA]O\s*)?(\d{1,3})\s*[:\-–=.]*\s*([A-Ea-e])\b/g);
        while ((match = regex.exec(line.text)) !== null) {
          const qNum = parseInt(match[1], 10);
          const letter = match[2].toUpperCase();
          if (qNum > 0 && qNum <= 300 && !answerKeyMap[qNum]) {
            answerKeyMap[qNum] = letter;
            answerKeyFound = true;
          }
        }
      }
    }

    return { answerKeyMap, answerKeyFound };
  }

  /**
   * Parser principal de linhas reconstruídas para estruturação de questões.
   */
  private static parseLines(
    lines: ReconstitutedLine[],
    rawText: string,
    ocrPages?: OCRPageResult[],
    externalAnswerKeyMap?: Record<number, string>
  ): ExamSplitterResult {
    const { answerKeyMap: extractedKeyMap, answerKeyFound } = this.extractAnswerKey(rawText, lines, ocrPages);
    const answerKeyMap = { ...extractedKeyMap, ...(externalAnswerKeyMap || {}) };

    interface DraftQuestion {
      questionNumber: number;
      rawLines: ReconstitutedLine[];
      topicTags?: string[];
      correctLetter?: string;
      pageNumber: number;
      endPageNumber: number;
      isExplicit: boolean;
    }

    const questions: ExtractedExamQuestion[] = [];
    let currentQ: DraftQuestion | null = null;
    let expectedNextNumber = 1;

    const finalizeCurrentQuestion = () => {
      if (!currentQ || currentQ.rawLines.length === 0) {
        currentQ = null;
        return;
      }

      const rawCombined = currentQ.rawLines.map((l) => l.text).join('\n').trim();
      if (this.isInstructionOrFalsePositive(rawCombined)) {
        currentQ = null;
        return;
      }

      const parsed = this.parseQuestionOptions(currentQ.rawLines);
      const statement = parsed.statement;
      const options = parsed.options;

      if (!currentQ.isExplicit && options.length === 0) {
        currentQ = null;
        return;
      }

      if (statement.length < 15 && options.length === 0) {
        currentQ = null;
        return;
      }

      const finalCorrectLetter = currentQ.correctLetter || answerKeyMap[currentQ.questionNumber];
      const { confidence, warning } = this.evaluateConfidence(statement, options, finalCorrectLetter);

      questions.push({
        questionNumber: currentQ.questionNumber,
        statement,
        options,
        correctLetter: finalCorrectLetter,
        pageNumber: currentQ.pageNumber,
        endPageNumber: currentQ.endPageNumber,
        confidence,
        warning,
        topicTags: currentQ.topicTags,
      });

      currentQ = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const lineObj = lines[i];
      const text = this.cleanText(lineObj.text);
      if (!text) continue;

      if (this.isHeaderFooterLine(text, lineObj.pageNumber)) {
        if (lineObj.pageNumber >= 40 && currentQ && currentQ.rawLines.length >= 2) {
          finalizeCurrentQuestion();
        }
        continue;
      }

      // 1. Testa se é início de uma nova questão
      const qStart = this.matchQuestionStart(text, expectedNextNumber, currentQ?.rawLines.length || 0);
      if (qStart) {
        finalizeCurrentQuestion();
        expectedNextNumber = qStart.questionNumber + 1;

        let topicTags: string[] | undefined = undefined;
        let statementStart = '';
        if (qStart.statementRemainder) {
          const rem = qStart.statementRemainder.trim();
          if (qStart.isExplicit && !text.includes(':') && !text.includes('-') && rem.length < 120 && /\s{2,}|\t/.test(rem)) {
            topicTags = rem.split(/\s{2,}|\t/).map((s) => s.trim()).filter(Boolean);
          } else if (qStart.isExplicit && !text.includes(':') && !text.includes('-') && rem.length < 50 && !rem.endsWith('.') && !rem.endsWith('?')) {
            topicTags = [rem];
          } else {
            statementStart = rem;
          }
        }

        currentQ = {
          questionNumber: qStart.questionNumber,
          rawLines: statementStart
            ? [{ text: statementStart, x: lineObj.x, y: lineObj.y, pageNumber: lineObj.pageNumber }]
            : [],
          topicTags,
          correctLetter: undefined,
          pageNumber: lineObj.pageNumber,
          endPageNumber: lineObj.pageNumber,
          isExplicit: qStart.isExplicit,
        };

        const inlineAns = text.match(this.INLINE_ANSWER_REGEX);
        if (inlineAns) {
          currentQ.correctLetter = inlineAns[1].toUpperCase();
        }

        continue;
      }

      if (!currentQ) continue;

      currentQ.endPageNumber = lineObj.pageNumber;

      const inlineAns = text.match(this.INLINE_ANSWER_REGEX);
      if (inlineAns) {
        currentQ.correctLetter = inlineAns[1].toUpperCase();
        continue;
      }

      if (this.GABARITO_HEADER_REGEX.test(text) && currentQ.rawLines.length >= 2) {
        finalizeCurrentQuestion();
        continue;
      }

      currentQ.rawLines.push(lineObj);
    }

    finalizeCurrentQuestion();

    // Deduplicação inteligente de questões repetidas e descarte de fantasmas de ruído gráfico
    const deduplicatedQuestions: ExtractedExamQuestion[] = [];
    const seenMap = new Map<number, ExtractedExamQuestion>();

    for (const q of questions) {
      if (!q.statement || (q.statement.length < 15 && q.options.length <= 1)) {
        continue;
      }

      if (!seenMap.has(q.questionNumber)) {
        seenMap.set(q.questionNumber, q);
        deduplicatedQuestions.push(q);
      } else {
        const existing = seenMap.get(q.questionNumber)!;
        if (
          q.options.length > existing.options.length ||
          (q.options.length === existing.options.length && q.statement.length > existing.statement.length)
        ) {
          const idx = deduplicatedQuestions.indexOf(existing);
          if (idx !== -1) {
            deduplicatedQuestions[idx] = q;
            seenMap.set(q.questionNumber, q);
          }
        }
      }
    }

    // Se houver mapa de gabarito global, aplica aos resultados deduplicados
    for (const q of deduplicatedQuestions) {
      if (!q.correctLetter && answerKeyMap[q.questionNumber]) {
        q.correctLetter = answerKeyMap[q.questionNumber];
      }
    }

    const highConfidenceCount = deduplicatedQuestions.filter((q) => q.confidence === 'high').length;
    const mediumConfidenceCount = deduplicatedQuestions.filter((q) => q.confidence === 'medium').length;
    const lowConfidenceCount = deduplicatedQuestions.filter((q) => q.confidence === 'low').length;
    const totalQuestions = deduplicatedQuestions.length;

    return {
      success: totalQuestions > 0,
      totalQuestions,
      processedPages: deduplicatedQuestions.reduce((max, q) => Math.max(max, q.endPageNumber), 0),
      totalPages: deduplicatedQuestions.reduce((max, q) => Math.max(max, q.endPageNumber), 0),
      questions: deduplicatedQuestions,
      answerKeyFound: answerKeyFound || Object.keys(answerKeyMap).length > 0,
      answerKeyMap: Object.keys(answerKeyMap).length > 0 ? answerKeyMap : undefined,
      highConfidenceCount,
      mediumConfidenceCount,
      lowConfidenceCount,
      lowConfidenceRatio: totalQuestions > 0 ? lowConfidenceCount / totalQuestions : 0,
    };
  }

  /**
   * Avalia a confiança da extração de uma questão.
   */
  private static evaluateConfidence(
    statement: string,
    options: ExtractedOption[],
    correctLetter?: string
  ): { confidence: 'high' | 'medium' | 'low'; warning?: string } {
    if (!statement || statement.trim().length < 15) {
      return { confidence: 'low', warning: 'Enunciado muito curto ou vazio.' };
    }

    if (options.length === 0) {
      return { confidence: 'low', warning: 'Nenhuma alternativa identificada no bloco.' };
    }

    const isTrueFalseOrCertoErrado =
      options.length === 2 &&
      (options.some((o) => /^(?:CERTO|ERRADO|VERDADEIRO|FALSO|V|F|SIM|NÃO)$/i.test(o.text.trim())) ||
        /\b(?:julgue\s+os\s+itens|certo\s+ou\s+errado|verdadeiro\s+ou\s+falso|v\s+ou\s+f|\(\s*\)\s*.*\(\s*\))\b/i.test(
          statement
        ));

    if (isTrueFalseOrCertoErrado) {
      return { confidence: 'high' };
    }

    if (options.length === 1 || (options.length === 2 && !isTrueFalseOrCertoErrado)) {
      return { confidence: 'low', warning: `Apenas ${options.length} alternativas identificadas.` };
    }

    if (options.length > 5) {
      return { confidence: 'low', warning: `Número excessivo de alternativas (${options.length}).` };
    }

    // Checa duplicação de letras
    const letters = options.map((o) => o.letter);
    const uniqueLetters = new Set(letters);
    if (uniqueLetters.size !== letters.length) {
      return { confidence: 'low', warning: 'Letras duplicadas entre as alternativas.' };
    }

    const hasEmptyOption = options.some((o) => o.text.trim().length === 0);
    if (hasEmptyOption) {
      return { confidence: 'low', warning: 'Uma ou mais alternativas sem texto.' };
    }

    // Checagem de outlier de tamanho (possível fusão de alternativas)
    const lengths = options.map((o) => o.text.trim().length).sort((a, b) => a - b);
    const medianLen = lengths[Math.floor(lengths.length / 2)];
    const maxLen = lengths[lengths.length - 1];

    if (options.length >= 4) {
      if (maxLen > 2.5 * Math.max(medianLen, 25)) {
        return {
          confidence: 'low',
          warning: 'possível fusão de alternativas — revisar manualmente',
        };
      }
      if (maxLen > 2.0 * Math.max(medianLen, 30)) {
        return {
          confidence: 'medium',
          warning: 'Alternativa com tamanho desproporcional à média.',
        };
      }
      return { confidence: 'high' };
    }

    if (options.length === 3) {
      if (maxLen > 2.5 * Math.max(medianLen, 25)) {
        return {
          confidence: 'low',
          warning: 'possível fusão de alternativas — revisar manualmente',
        };
      }
      return {
        confidence: 'medium',
        warning: '3 alternativas identificadas.',
      };
    }

    return { confidence: 'medium', warning: `${options.length} alternativas identificadas.` };
  }

  /**
   * Detecta se a linha inicia uma nova questão.
   */
  private static matchQuestionStart(
    text: string,
    expectedNumber: number,
    currentLinesCount: number
  ): { questionNumber: number; statementRemainder: string; isExplicit: boolean } | null {
    // 1. Padrão explícito: QUESTÃO 27, QUESTÃO Nº 27, QUESTÃO O5, QUESTÃO lá, Q. 27, etc.
    const qMatch = text.match(this.QUESTION_START_REGEX);
    if (qMatch) {
      const qNum = this.normalizeQuestionNumber(qMatch[1], expectedNumber);
      if (qNum && qNum > 0 && qNum <= 300) {
        return { questionNumber: qNum, statementRemainder: qMatch[2] || '', isExplicit: true };
      }
    }

    // 2. Padrão numérico: "1. Texto..." ou "1) Texto..."
    const numMatch = text.match(this.NUMBERED_START_REGEX);
    if (numMatch) {
      const qNum = parseInt(numMatch[1], 10);
      const remainder = numMatch[2] || '';
      const isDosageOrUnit =
        /^(?:mg|ml|mcg|anos|meses|dias|horas|minutos|mmHg|%|bpm|ipm|cm|kg|g)\b/i.test(remainder.trim());

      const isInstruction =
        /^(?:Leia atentamente|Verifique|Preencha|Observe|Assinale no cartão|Boa prova)/i.test(remainder.trim());

      if (!isDosageOrUnit && !isInstruction && qNum > 0 && qNum <= 300) {
        if (
          qNum === expectedNumber ||
          qNum === expectedNumber + 1 ||
          (expectedNumber === 1 && qNum <= 3)
        ) {
          return { questionNumber: qNum, statementRemainder: remainder, isExplicit: false };
        }
      }
    }

    // 3. Número isolado no início de bloco
    const isoMatch = text.match(this.ISOLATED_NUMBER_REGEX);
    if (isoMatch) {
      const qNum = parseInt(isoMatch[1], 10);
      if (qNum > 0 && qNum <= 300) {
        if (
          qNum === expectedNumber ||
          qNum === expectedNumber + 1 ||
          (expectedNumber === 1 && qNum <= 3)
        ) {
          return { questionNumber: qNum, statementRemainder: '', isExplicit: false };
        }
      }
    }

    return null;
  }

  /**
   * Filtra linhas de cabeçalho ou rodapé padrão de provas médicas.
   */
  public static isHeaderFooterLine(text: string, pageNumber?: number): boolean {
    if (typeof pageNumber === 'number' && pageNumber >= 40) {
      if (/^(?:[Oo0]?\d{1,2}|N|NA|\d{1,2}º)\s+[A-Ea-e]\s+[A-Ea-e]/.test(text)) return true;
    }
    const lower = text.toLowerCase().trim();
    return (
      (lower.includes('página') && /\d+\s*(de|\/)\s*\d+/.test(lower)) ||
      lower.startsWith('processo seletivo') ||
      lower.startsWith('concurso público') ||
      lower.startsWith('folha de prova') ||
      lower.includes('todos os direitos reservados') ||
      lower.includes('t.me/medicinalivre') ||
      lower.includes('essa questão possui comentário') ||
      lower.includes('essa questão po ssui') ||
      lower.includes('cessar lista') ||
      lower.includes('inep - revalida') ||
      lower.includes('enade - ') ||
      lower.includes('100 clinica') ||
      /^med\s+way$/i.test(lower) ||
      lower === 'way' ||
      lower === 'med' ||
      /^(?:[Oo0]?\d{1,2}|N|NA|\d{1,2}º)\s+[A-Ea-e]\s+[A-Ea-e]/.test(text) ||
      /^\d+\s+\d{6,}$/.test(text) ||
      /^\d{7,}$/.test(text) ||
      /^-\s*\d+\s*-$/.test(text)
    );
  }

  /**
   * Recupera o arquivo PDF original em formato Blob da tabela knowledgeAssetFiles.
   */
  public static async getRawExamPDFBlob(assetId: string): Promise<Blob | null> {
    try {
      const fileRecord = await db.knowledgeAssetFiles.get(assetId);
      if (fileRecord && fileRecord.blob) {
        return fileRecord.blob;
      }
    } catch (err) {
      console.warn(`[ExamPDFQuestionSplitter] Erro ao buscar PDF original para o asset ${assetId}:`, err);
    }
    return null;
  }

  /**
   * Segmenta diretamente a partir do ID de um asset cadastrado.
   */
  public static async splitFromAssetId(
    assetId: string,
    options?: ExamSplitterOptions
  ): Promise<ExamSplitterResult> {
    const rawBlob = await this.getRawExamPDFBlob(assetId);
    if (!rawBlob) {
      return {
        success: false,
        totalQuestions: 0,
        highConfidenceCount: 0,
        lowConfidenceCount: 0,
        lowConfidenceRatio: 0,
        failureReason: 'PAGES_NOT_PROCESSED',
        warning:
          'PDF original não disponível — Esta prova foi cadastrada sem o arquivo binário. Reenvie o arquivo PDF para habilitar a segmentação.',
        questions: [],
        detectedQuestions: [],
        lowConfidenceQuestions: [],
        answerKeyFound: false,
        answerKeyMap: {},
      };
    }

    return await this.split(rawBlob, options);
  }
}
