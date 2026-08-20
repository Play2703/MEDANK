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
    const directNum = parseInt(clean, 10);
    if (!isNaN(directNum) && directNum > 0 && directNum <= 300) {
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
   * Extrai e desconcatena alternativas de uma questão, identificando marcadores circulares OCR ((O), Ga, etc.).
   */
  public static parseQuestionOptions(rawText: string): {
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
      return /^(?:\([A-Ea-eO0o\?€]\)|\[[A-Ea-e€]\]|\[\([A-Ea-e€]\)|[A-Ea-e][\)\:\-–—]|[A-Ea-e]\.(?!\s+(?:coli|aeruginosa|faecalis|pneumoniae|aureus|sp|spp|difficile|albicans|histolytica|cruzi|mansoni)\b)|[Ⓐ-Ⓔ]|(?:\(\s*[O0o]?\s*\)|\[\s*\]|[◯○●])|[Oo0][\)\.\:\-–—]|G[abG]\))\s+/i.test(
        trimmed
      );
    };

    const cleanMarkerRegex =
      /^(?:\(([A-Ea-eO0o\?€])\)|\[([A-Ea-e€])\]|\[\(([A-Ea-e€])\)|([A-Ea-e])[.\:\-–—\)]|([Ⓐ-Ⓔ])|(?:\(\s*[O0o]?\s*\)|\[\s*\]|[◯○●])|[Oo0][\)\.\:\-–—]|G[abG]\))\s*(.*)$/si;

    const optSplitRegex =
      /(?=(?:^|\s+)(?:\([A-Ea-eO0o\?€]\)|\[[A-Ea-e€]\]|\[\([A-Ea-e€]\)|[A-Ea-e][\)\:\-–—]|[A-Ea-e]\.(?!\s+(?:coli|aeruginosa|faecalis|pneumoniae|aureus|sp|spp|difficile|albicans|histolytica|cruzi|mansoni)\b)|[Ⓐ-Ⓔ]|(?:\(\s*[O0o]?\s*\)|\[\s*\]|[◯○●])|[Oo0][\)\.\:\-–—]|G[abG]\))\s+)/gi;

    const lines = rawText.split(/\r?\n/).map((l) => this.cleanText(l)).filter(Boolean);
    const statementLines: string[] = [];
    const rawOptionChunks: string[] = [];
    let isParsingOptions = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const startsOption = isStartOfOption(line);

      if (startsOption) {
        isParsingOptions = true;
        const subChunks = line.split(optSplitRegex).map((c) => c.trim()).filter(Boolean);
        for (const sc of subChunks) {
          rawOptionChunks.push(sc);
        }
      } else if (isParsingOptions) {
        // Continuação de linha da alternativa atual (remove traço de início se for hífen/em-dash)
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

    // Se nenhuma alternativa foi separada pelas linhas mas o enunciado contém marcadores no meio:
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
        optText = match[6]?.trim() || '';
      }

      // Normaliza Unicode circulado Ⓐ-Ⓔ
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
      statement: statementLines.join(' ').replace(/\s+/g, ' ').trim(),
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
    options?: { extractionMethod?: 'local-ocr' | 'remote-ocr'; totalPages?: number }
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

    const res = this.parseLines(lines, fullRawText);
    res.totalPages = options?.totalPages || ocrPages.length;
    res.processedPages = ocrPages.length;
    res.extractionMethod = options?.extractionMethod || 'local-ocr';

    const avgConfidence =
      ocrPages.reduce((acc, p) => acc + (p.confidence || 85), 0) / Math.max(1, ocrPages.length);

    for (const q of res.questions) {
      q.extractionMethod = res.extractionMethod;
      q.ocrConfidence = Math.round(avgConfidence);
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
   * Extrai o mapa de gabarito caso exista uma seção dedicada no texto.
   */
  private static extractAnswerKey(rawText: string, lines: ReconstitutedLine[]): {
    answerKeyMap: Record<number, string>;
    answerKeyFound: boolean;
  } {
    const answerKeyMap: Record<number, string> = {};
    let answerKeyFound = false;

    const cleanedRawText = this.cleanText(rawText);
    const fullContent = (cleanedRawText + '\n' + lines.map((l) => l.text).join('\n')).trim();

    const gabaritoMatch = fullContent.match(this.GABARITO_HEADER_REGEX);
    if (gabaritoMatch && gabaritoMatch.index !== undefined) {
      const gabaritoText = fullContent.slice(gabaritoMatch.index);
      let match: RegExpExecArray | null;
      const regex = new RegExp(this.GABARITO_ENTRY_REGEX);
      while ((match = regex.exec(gabaritoText)) !== null) {
        const qNum = parseInt(match[1], 10);
        const letter = match[2].toUpperCase();
        if (qNum > 0 && qNum <= 300 && ['A', 'B', 'C', 'D', 'E'].includes(letter)) {
          answerKeyMap[qNum] = letter;
          answerKeyFound = true;
        }
      }
    }

    for (const line of lines) {
      if (this.GABARITO_HEADER_REGEX.test(line.text)) {
        let match: RegExpExecArray | null;
        const regex = new RegExp(this.GABARITO_ENTRY_REGEX);
        while ((match = regex.exec(line.text)) !== null) {
          const qNum = parseInt(match[1], 10);
          const letter = match[2].toUpperCase();
          if (qNum > 0 && qNum <= 300) {
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
  private static parseLines(lines: ReconstitutedLine[], rawText: string): ExamSplitterResult {
    const { answerKeyMap, answerKeyFound } = this.extractAnswerKey(rawText, lines);

    interface DraftQuestion {
      questionNumber: number;
      rawLines: string[];
      topicTags?: string[];
      correctLetter?: string;
      pageNumber: number;
      endPageNumber?: number;
      isExplicit?: boolean;
    }

    const questions: ExtractedExamQuestion[] = [];
    const unparsedQuestionCandidates: Array<{ pageNumber: number; rawSnippet: string; reason?: string }> = [];
    const processingWarnings: string[] = [];

    let currentQ: DraftQuestion | null = null;
    let expectedNextNumber = 1;

    const finalizeCurrentQuestion = () => {
      if (!currentQ) return;

      const rawCombined = currentQ.rawLines.join('\n').trim();

      // Ignora instruções e falsos positivos
      if (this.isInstructionOrFalsePositive(rawCombined)) {
        currentQ = null;
        return;
      }

      // Extrai enunciado e alternativas de forma estruturada
      const { statement, options } = this.parseQuestionOptions(rawCombined);

      // Para marcadores não explícitos (ex: "1.", "2."), exige alternativas estruturadas
      if (!currentQ.isExplicit && options.length === 0) {
        currentQ = null;
        return;
      }

      // Se o enunciado for minúsculo ou sem conteúdo real, descarta
      if (statement.length < 15 && options.length === 0) {
        currentQ = null;
        return;
      }

      const correctLetter = currentQ.correctLetter || answerKeyMap[currentQ.questionNumber];

      // Avaliação de Confiança
      const { confidence, warning } = this.evaluateConfidence(statement, options, correctLetter);

      const parsedQ: ExtractedExamQuestion = {
        questionNumber: currentQ.questionNumber,
        statement,
        options,
        correctLetter,
        pageNumber: currentQ.pageNumber,
        endPageNumber: currentQ.endPageNumber || currentQ.pageNumber,
        confidence,
        warning,
        topicTags: currentQ.topicTags,
      };

      questions.push(parsedQ);

      if (confidence === 'low' && warning) {
        processingWarnings.push(`Questão ${parsedQ.questionNumber}: ${warning}`);
      }

      currentQ = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const lineObj = lines[i];
      const text = this.cleanText(lineObj.text);
      if (!text) continue;

      if (this.isHeaderFooterLine(text)) continue;

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
          rawLines: statementStart ? [statementStart] : [],
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

      currentQ.rawLines.push(text);
    }

    finalizeCurrentQuestion();

    // Deduplicação inteligente de questões repetidas e descarte de fantasmas de ruído gráfico
    const deduplicatedQuestions: ExtractedExamQuestion[] = [];
    const seenMap = new Map<number, ExtractedExamQuestion>();

    for (const q of questions) {
      // Descarta blocos com enunciado vazio / ruído gráfico
      if (!q.statement || (q.statement.length < 15 && q.options.length <= 1)) {
        continue;
      }

      if (!seenMap.has(q.questionNumber)) {
        seenMap.set(q.questionNumber, q);
        deduplicatedQuestions.push(q);
      } else {
        const existing = seenMap.get(q.questionNumber)!;
        // Se a nova versão tiver mais alternativas ou enunciado mais completo, substitui
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

    const totalQuestions = deduplicatedQuestions.length;
    const highConfidenceQuestions = deduplicatedQuestions.filter((q) => q.confidence === 'high');
    const mediumConfidenceQuestions = deduplicatedQuestions.filter((q) => q.confidence === 'medium');
    const lowConfidenceQuestions = deduplicatedQuestions.filter((q) => q.confidence === 'low');
    const highConfidenceCount = highConfidenceQuestions.length;
    const mediumConfidenceCount = mediumConfidenceQuestions.length;
    const lowConfidenceCount = lowConfidenceQuestions.length;
    const lowConfidenceRatio = totalQuestions > 0 ? lowConfidenceCount / totalQuestions : 1.0;

    let generalWarning: string | undefined = undefined;
    let failureReason: SplitterFailureReason | undefined = undefined;

    if (totalQuestions === 0) {
      failureReason = 'NO_QUESTION_MARKERS';
      generalWarning =
        'Nenhuma questão estruturada encontrada. Este arquivo não possui marcadores numéricos convencionais (ex: QUESTÃO 1, 1., Q. 1) ou alternativas A-D/A-E identificáveis.';
    } else if (lowConfidenceRatio > 0.40) {
      generalWarning = `Segmentação automática realizada com baixa confiança para ${Math.round(
        lowConfidenceRatio * 100
      )}% das questões. Revise os enunciados e alternativas antes de salvar.`;
    }

    return {
      success: totalQuestions > 0,
      totalQuestions,
      highConfidenceCount,
      mediumConfidenceCount,
      lowConfidenceCount,
      lowConfidenceRatio: Math.round(lowConfidenceRatio * 100) / 100,
      warning: generalWarning,
      failureReason,
      questions: deduplicatedQuestions,
      detectedQuestions: deduplicatedQuestions,
      lowConfidenceQuestions,
      unparsedQuestionCandidates,
      processingWarnings,
      answerKeyFound,
      answerKeyMap,
    };
  }

  /**
   * Avalia a qualidade e confiança da questão extraída.
   */
  private static evaluateConfidence(
    statement: string,
    options: ExtractedOption[],
    correctLetter?: string
  ): { confidence: 'high' | 'medium' | 'low'; warning?: string } {
    if (!statement || statement.length < 15) {
      return { confidence: 'low', warning: 'Enunciado muito curto ou vazio.' };
    }

    if (options.length === 0) {
      return { confidence: 'low', warning: 'Nenhuma alternativa identificada no bloco.' };
    }

    if (options.length === 1 || options.length === 2) {
      return { confidence: 'low', warning: `Apenas ${options.length} alternativa(s) identificada(s).` };
    }

    if (options.length > 5) {
      return { confidence: 'low', warning: `Número excessivo de alternativas (${options.length}).` };
    }

    const hasEmptyOption = options.some((o) => o.text.trim().length === 0);
    if (hasEmptyOption) {
      return { confidence: 'low', warning: 'Uma ou mais alternativas sem texto.' };
    }

    const hasInferred = options.some((o) => o.inferredLetter);
    if (options.length === 4 || options.length === 5) {
      if (hasInferred) {
        return {
          confidence: 'medium',
          warning: `${options.length} alternativas detectadas; letras inferidas pela ordem visual.`,
        };
      }
      return { confidence: 'high' };
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
          currentLinesCount >= 3 ||
          expectedNumber === 1
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
        if (qNum === expectedNumber || qNum === expectedNumber + 1 || currentLinesCount >= 3 || expectedNumber === 1) {
          return { questionNumber: qNum, statementRemainder: '', isExplicit: false };
        }
      }
    }

    return null;
  }

  /**
   * Filtra linhas de cabeçalho ou rodapé padrão de provas médicas.
   */
  private static isHeaderFooterLine(text: string): boolean {
    const lower = text.toLowerCase();
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
