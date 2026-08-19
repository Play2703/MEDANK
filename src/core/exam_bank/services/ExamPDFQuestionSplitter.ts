/**
 * ExamPDFQuestionSplitter
 *
 * Segmentador mecânico/determinístico de provas em formato PDF para extração de questões
 * individuais (número, enunciado, alternativas A-E e gabarito quando presente).
 *
 * ⚠️ REQUISITOS ARQUITETURAIS:
 * - Padrão 100% local (layout nativo ou OCR local via Tesseract.js / WASM).
 * - Zero chamadas de IA / LLM por padrão (sem consumo de tokens).
 * - Fallback remoto explícito via /api/ocr apenas sob consentimento do usuário ('remote-consent').
 * - Preserva rastreabilidade de páginas, tabelas e alternativas A-D ou A-E.
 */

import { PDFLayoutItem, PDFLayoutResult, PDFInspectionResult, DocumentReaderService } from '../../import_engine/services/DocumentReaderService';
import { OCRPageResult, OCRMode, localOCRService } from './LocalOCRService';
import { db } from '../../../data/db/database';
import { OCRService } from '../../../data/services/OCRService';

export interface ExtractedOption {
  letter: string; // 'A', 'B', 'C', 'D', 'E'
  text: string;
}

export interface ExtractedExamQuestion {
  questionNumber: number;
  statement: string;
  options: ExtractedOption[];
  correctLetter?: string;
  pageNumber: number;
  endPageNumber?: number;
  confidence: 'high' | 'low';
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
    /^(?:QUEST[ÃA]O|QUESTAO|QUEST[ÃA]O\s*N[º°\.]|Q\.?)\s*(\d{1,3})\b[.:\-–—)]*\s*(.*)$/i;

  private static readonly NUMBERED_START_REGEX =
    /^(\d{1,3})[.\)-–—]\s+(.*)$/;

  private static readonly ISOLATED_NUMBER_REGEX =
    /^(\d{1,3})$/;

  /**
   * Padrão de alternativa com delimitador explícito:
   * A) texto, a) texto, (A) texto, (a) texto, [A] texto, A. texto, a. texto, A: texto, A - texto, Ⓐ texto
   */
  private static readonly OPTION_DELIM_REGEX =
    /^(?:\(([A-Ea-e])\)|\[([A-Ea-e])\]|([A-Ea-e])[.\:\-–—\)]|([Ⓐ-Ⓔ]))(?:\s+|$)(.*)$/;

  /**
   * Padrão de alternativa estilo checkbox: ( ) texto, [ ] texto, ◯ texto, ○ texto
   */
  private static readonly OPTION_CHECKBOX_REGEX =
    /^(?:\(\s*\)|\[\s*\]|[◯○])\s+(.*)$/;

  /**
   * Padrão de alternativa sem delimitador (apenas letra maiúscula isolada A-E seguida de espaço):
   * A     texto, B     texto
   */
  private static readonly OPTION_NO_DELIM_REGEX =
    /^([A-Ea-e])\s+(.*)$/;

  /**
   * Padrão inline com múltiplas alternativas na mesma linha
   */
  private static readonly INLINE_OPTIONS_REGEX =
    /\(?([A-Ea-e])\)?[.\:\-–—\)]\s+([^A-Ea-e\(\)]+)/g;

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
   * Limpa caracteres invisíveis, form feeds e espaços múltiplos em uma única passagem
   */
  public static cleanText(text: string): string {
    if (!text) return '';
    return text
      .replace(/[\u200B-\u200D\uFEFF\f]/g, ' ')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
      .trim();
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
      if (page.blocks && page.blocks.length > 0) {
        for (const block of page.blocks) {
          const cleaned = this.cleanText(block.text);
          if (cleaned) {
            lines.push({
              text: cleaned,
              x: block.x ?? 0,
              y: block.y ?? 0,
              pageNumber: page.pageNumber,
            });
          }
        }
      } else {
        const rawLines = page.text.split(/\r?\n/);
        for (let idx = 0; idx < rawLines.length; idx++) {
          const cleaned = this.cleanText(rawLines[idx]);
          if (cleaned) {
            lines.push({
              text: cleaned,
              x: 0,
              y: idx,
              pageNumber: page.pageNumber,
            });
          }
        }
      }
    }

    const res = this.parseLines(lines, fullRawText);
    res.totalPages = options?.totalPages || ocrPages.length;
    res.processedPages = ocrPages.length;
    res.extractionMethod = options?.extractionMethod || 'local-ocr';

    // Anexa confiança média de OCR às questões se disponível
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
    const rawLines = rawText.split(/\r?\n/).map((line, idx) => ({
      text: this.cleanText(line),
      x: 0,
      y: idx,
      pageNumber: 1,
    })).filter((l) => l.text.length > 0);

    return this.parseLines(rawLines, cleanedRaw);
  }

  /**
   * Ponto de entrada universal que suporta:
   * 1. PDFLayoutResult (camada nativa)
   * 2. OCRPageResult[] (resultado OCR prévio)
   * 3. string (texto plano)
   * 4. Buffer / Blob / File com detecção de PDF escaneado e fallback para OCR local/remoto.
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

    // 1. Tenta extrair a camada de texto nativa com layout geométrico
    if (options.onProgress) {
      options.onProgress({ stage: 'Inspecionando camada de texto do PDF...', current: 0, total: 100, progressPct: 5 });
    }

    const layout = await reader.extractPDFWithLayout(input as any, {
      maxPages: options.maxPages,
      onProgress: (pct) => {
        if (options.onProgress) {
          options.onProgress({ stage: 'Extraindo layout nativo...', current: pct, total: 100, progressPct: Math.round(pct * 0.3) });
        }
      },
      signal: options.signal,
    });

    const isScanned = layout.inspection?.isScannedPdf || layout.items.length === 0;

    // Se o PDF tem camada de texto nativa, processa determinísticamente
    if (!isScanned && layout.items.length > 0) {
      const nativeResult = this.splitFromLayout(layout, { extractionMethod: 'native-text' });
      if (nativeResult.totalQuestions > 0) {
        return nativeResult;
      }
    }

    // 2. Se for escaneado ou sem texto nativo:
    if (isScanned || layout.items.length === 0) {
      if (ocrMode === 'native-only') {
        return {
          success: false,
          totalQuestions: 0,
          highConfidenceCount: 0,
          lowConfidenceCount: 0,
          lowConfidenceRatio: 1.0,
          failureReason: 'NO_TEXT_LAYER',
          warning: 'PDF escaneado detectado (sem camada de texto pesquisável). Habilite o OCR local para processar.',
          questions: [],
          detectedQuestions: [],
          lowConfidenceQuestions: [],
          answerKeyFound: false,
          answerKeyMap: {},
          inspection: layout.inspection,
        };
      }

      // Modo Local OCR (Padrão: 100% local, 0 tokens)
      if (ocrMode === 'local') {
        if (options.onProgress) {
          options.onProgress({ stage: 'Iniciando OCR local (Tesseract.js)...', current: 0, total: 100, progressPct: 35 });
        }

        let pdfjsLib: any;
        if (typeof window === 'undefined') {
          pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        } else {
          pdfjsLib = await import('pdfjs-dist');
          // @ts-ignore
          const pdfjsWorkerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
          pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
        }

        let buffer: ArrayBuffer;
        if (input instanceof ArrayBuffer) {
          buffer = input;
        } else if (input instanceof Uint8Array) {
          buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
        } else {
          buffer = await (input as any).arrayBuffer();
        }

        try {
          const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
          const ocrPages = await localOCRService.processPDF(pdf, {
            maxPages: options.maxPages,
            startPage: options.startPage,
            onProgress: (info) => {
              if (options.onProgress) {
                options.onProgress({
                  stage: `Processando OCR página ${info.page} de ${info.total}...`,
                  current: info.page,
                  total: info.total,
                  progressPct: 35 + Math.round(info.progressPct * 0.6),
                });
              }
            },
            signal: options.signal,
          });

          const ocrSplitResult = this.splitFromOCR(ocrPages, {
            extractionMethod: 'local-ocr',
            totalPages: pdf.numPages,
          });
          ocrSplitResult.inspection = layout.inspection;

          if (ocrSplitResult.totalQuestions === 0) {
            ocrSplitResult.failureReason = 'NO_QUESTION_MARKERS';
            ocrSplitResult.warning = 'O OCR processou o documento, mas não encontrou marcadores de questão (ex: QUESTÃO 1, A-D).';
          }

          return ocrSplitResult;
        } catch (ocrErr: any) {
          console.warn('[ExamPDFQuestionSplitter] Falha no OCR local:', ocrErr);
          return {
            success: false,
            totalQuestions: 0,
            highConfidenceCount: 0,
            lowConfidenceCount: 0,
            lowConfidenceRatio: 1.0,
            failureReason: 'OCR_FAILED',
            warning: `Falha no motor de OCR local: ${ocrErr.message || ocrErr}`,
            questions: [],
            detectedQuestions: [],
            lowConfidenceQuestions: [],
            answerKeyFound: false,
            answerKeyMap: {},
            inspection: layout.inspection,
          };
        }
      }

      // Modo Remoto com Consentimento Explícito
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
              inspection: layout.inspection,
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
          remoteResult.inspection = layout.inspection;
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
            inspection: layout.inspection,
          };
        }
      }
    }

    return this.splitFromLayout(layout);
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

      // Detecta se a página possui 2 colunas reais separadas por margem X
      const isTwoColumns = this.detectTwoColumns(pageItems);

      const processColumnItems = (colItems: PDFLayoutItem[]) => {
        // Ordena de cima para baixo (em PDF, Y maior costuma ser mais alto na página)
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
          // Ordena itens da mesma linha da esquerda para a direita (X crescente)
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

    if (width < 300) return null; // Página estreita / coluna única

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

    // Combine rawText and reconstituted lines
    const cleanedRawText = this.cleanText(rawText);
    const fullContent = (cleanedRawText + '\n' + lines.map((l) => l.text).join('\n')).trim();

    // 1. Procura por bloco de gabarito explícito
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

    // 2. Scan lines for GABARITO: 1-A, 2-B...
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
      statementParts: string[];
      topicTags?: string[];
      options: ExtractedOption[];
      correctLetter?: string;
      pageNumber: number;
      endPageNumber?: number;
      currentOptionLetter: string | null;
    }

    const questions: ExtractedExamQuestion[] = [];
    const unparsedQuestionCandidates: Array<{ pageNumber: number; rawSnippet: string; reason?: string }> = [];
    const processingWarnings: string[] = [];

    let currentQ: DraftQuestion | null = null;
    let expectedNextNumber = 1;

    const finalizeCurrentQuestion = () => {
      if (!currentQ) return;

      const statement = currentQ.statementParts.join(' ').replace(/\s+/g, ' ').trim();
      const options = currentQ.options.map((opt) => ({
        letter: opt.letter.toUpperCase(),
        text: opt.text.replace(/\s+/g, ' ').trim(),
      }));

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

      // Ignora rodapés / cabeçalhos repetitivos conhecidos
      if (this.isHeaderFooterLine(text)) continue;

      // 1. Testa se é início de uma nova questão
      const qStart = this.matchQuestionStart(text, expectedNextNumber, currentQ?.options.length || 0);
      if (qStart) {
        finalizeCurrentQuestion();
        expectedNextNumber = qStart.questionNumber + 1;

        // Detecção de tags de assunto no cabeçalho
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
          statementParts: statementStart ? [statementStart] : [],
          topicTags,
          options: [],
          correctLetter: undefined,
          pageNumber: lineObj.pageNumber,
          endPageNumber: lineObj.pageNumber,
          currentOptionLetter: null,
        };

        // Verifica se na mesma linha de início já há gabarito embutido
        const inlineAns = text.match(this.INLINE_ANSWER_REGEX);
        if (inlineAns) {
          currentQ.correctLetter = inlineAns[1].toUpperCase();
        }

        continue;
      }

      if (!currentQ) continue;

      // Atualiza a página final da questão ativa
      currentQ.endPageNumber = lineObj.pageNumber;

      // 2. Verifica se a linha é um gabarito / resposta pontual da questão ativa
      const inlineAns = text.match(this.INLINE_ANSWER_REGEX);
      if (inlineAns) {
        currentQ.correctLetter = inlineAns[1].toUpperCase();
        continue;
      }

      // Se for uma seção de gabarito final consolidada (ex: GABARITO OFICIAL / 1-A 2-B), finaliza a questão atual
      if (this.GABARITO_HEADER_REGEX.test(text) && currentQ.options.length >= 2) {
        finalizeCurrentQuestion();
        continue;
      }

      // 3. Testa se a linha possui múltiplas alternativas inline (A)... (B)...
      const inlineOptions = this.extractInlineOptions(text);
      if (inlineOptions && inlineOptions.length >= 2) {
        for (const inOpt of inlineOptions) {
          currentQ.options.push(inOpt);
        }
        currentQ.currentOptionLetter = inlineOptions[inlineOptions.length - 1].letter;
        continue;
      }

      // 4. Testa alternativa com delimitador explícito: a), A), (A), [A], A., A-, A:, Ⓐ, etc.
      const optDelimMatch = text.match(this.OPTION_DELIM_REGEX);
      if (optDelimMatch) {
        let rawLetter = optDelimMatch[1] || optDelimMatch[2] || optDelimMatch[3] || optDelimMatch[4] || '';
        // Normaliza caracteres Unicode circulados Ⓐ-Ⓔ
        if (rawLetter.charCodeAt(0) >= 0x24b6 && rawLetter.charCodeAt(0) <= 0x24ba) {
          rawLetter = String.fromCharCode('A'.charCodeAt(0) + (rawLetter.charCodeAt(0) - 0x24b6));
        }

        const letter = rawLetter.toUpperCase();
        const optText = (optDelimMatch[5] || '').trim();
        const expectedLetter = String.fromCharCode('A'.charCodeAt(0) + currentQ.options.length);

        if (letter === expectedLetter || (currentQ.options.length === 0 && letter === 'A') || currentQ.options.length > 0) {
          currentQ.options.push({ letter, text: optText });
          currentQ.currentOptionLetter = letter;
          continue;
        }
      }

      // 5. Testa alternativa estilo checkbox: ( ) ..., [ ] ..., ◯ ..., ○ ...
      const optCheckboxMatch = text.match(this.OPTION_CHECKBOX_REGEX);
      if (optCheckboxMatch && currentQ.options.length < 5) {
        const letter = String.fromCharCode('A'.charCodeAt(0) + currentQ.options.length);
        const optText = optCheckboxMatch[1].trim();
        currentQ.options.push({ letter, text: optText });
        currentQ.currentOptionLetter = letter;
        continue;
      }

      // 6. Testa alternativa sem delimitador: A ..., B ..., C ... (letras A-E isoladas no início)
      const optNoDelimMatch = text.match(this.OPTION_NO_DELIM_REGEX);
      if (optNoDelimMatch) {
        const letter = optNoDelimMatch[1].toUpperCase();
        const optText = optNoDelimMatch[2].trim();
        const expectedLetter = String.fromCharCode('A'.charCodeAt(0) + currentQ.options.length);

        if (letter === expectedLetter && (currentQ.statementParts.length > 0 || currentQ.options.length > 0)) {
          currentQ.options.push({ letter, text: optText });
          currentQ.currentOptionLetter = letter;
          continue;
        }
      }

      // 7. Se já estamos dentro das opções, concatena na última opção ativa (continuação multiline)
      if (currentQ.currentOptionLetter && currentQ.options.length > 0) {
        const lastOpt = currentQ.options[currentQ.options.length - 1];
        lastOpt.text += ' ' + text;
      } else {
        // Senão, ainda estamos no enunciado
        currentQ.statementParts.push(text);
      }
    }

    // Finaliza a última questão
    finalizeCurrentQuestion();

    // Contabiliza métricas gerais
    const totalQuestions = questions.length;
    const highConfidenceQuestions = questions.filter((q) => q.confidence === 'high');
    const lowConfidenceQuestions = questions.filter((q) => q.confidence === 'low');
    const highConfidenceCount = highConfidenceQuestions.length;
    const lowConfidenceCount = lowConfidenceQuestions.length;
    const lowConfidenceRatio = totalQuestions > 0 ? lowConfidenceCount / totalQuestions : 1.0;

    let generalWarning: string | undefined = undefined;
    let failureReason: SplitterFailureReason | undefined = undefined;

    if (totalQuestions === 0) {
      failureReason = 'NO_QUESTION_MARKERS';
      generalWarning = 'Nenhuma questão estruturada encontrada. Este arquivo não possui marcadores numéricos convencionais (ex: QUESTÃO 1, 1., Q. 1) ou alternativas A-D/A-E identificáveis.';
    } else if (lowConfidenceRatio > 0.40) {
      generalWarning = `Segmentação automática realizada com baixa confiança para ${Math.round(lowConfidenceRatio * 100)}% das questões. Revise os enunciados e alternativas antes de salvar.`;
    }

    return {
      success: totalQuestions > 0,
      totalQuestions,
      highConfidenceCount,
      lowConfidenceCount,
      lowConfidenceRatio: Math.round(lowConfidenceRatio * 100) / 100,
      warning: generalWarning,
      failureReason,
      questions,
      detectedQuestions: questions,
      lowConfidenceQuestions,
      unparsedQuestionCandidates,
      processingWarnings,
      answerKeyFound,
      answerKeyMap,
    };
  }

  /**
   * Avalia a confiança da questão extraída.
   */
  private static evaluateConfidence(
    statement: string,
    options: ExtractedOption[],
    correctLetter?: string
  ): { confidence: 'high' | 'low'; warning?: string } {
    if (!statement || statement.length < 15) {
      return { confidence: 'low', warning: 'Enunciado muito curto ou vazio.' };
    }

    // Provas com 4 alternativas (A, B, C, D) ou 5 alternativas (A, B, C, D, E) são válidas
    if (options.length < 3) {
      return { confidence: 'low', warning: `Apenas ${options.length} alternativa(s) identificada(s).` };
    }

    if (options.length > 5) {
      return { confidence: 'low', warning: `Número excessivo de alternativas (${options.length}).` };
    }

    // Verifica se as letras formam uma sequência válida (ex: A, B, C, D ou A, B, C, D, E)
    const expectedLetters = ['A', 'B', 'C', 'D', 'E'].slice(0, options.length);
    const actualLetters = options.map((o) => o.letter);
    const isSequential = expectedLetters.every((l, idx) => actualLetters[idx] === l);

    if (!isSequential) {
      return { confidence: 'low', warning: `Sequência de alternativas irregular (${actualLetters.join(', ')}).` };
    }

    const hasEmptyOption = options.some((o) => o.text.trim().length === 0);
    if (hasEmptyOption) {
      return { confidence: 'low', warning: 'Uma ou mais alternativas sem texto.' };
    }

    return { confidence: 'high' };
  }

  /**
   * Detecta se a linha inicia uma nova questão.
   */
  private static matchQuestionStart(
    text: string,
    expectedNumber: number,
    currentOptionsCount: number
  ): { questionNumber: number; statementRemainder: string; isExplicit: boolean } | null {
    // 1. Padrão explícito: QUESTÃO 27, QUESTÃO Nº 27, Q. 27, etc.
    const qMatch = text.match(this.QUESTION_START_REGEX);
    if (qMatch) {
      const qNum = parseInt(qMatch[1], 10);
      if (qNum > 0 && qNum <= 300) {
        return { questionNumber: qNum, statementRemainder: qMatch[2] || '', isExplicit: true };
      }
    }

    // 2. Padrão numérico: "1. Texto..." ou "1) Texto..."
    const numMatch = text.match(this.NUMBERED_START_REGEX);
    if (numMatch) {
      const qNum = parseInt(numMatch[1], 10);
      const remainder = numMatch[2] || '';
      const isDosageOrUnit = /^(?:mg|ml|mcg|anos|meses|dias|horas|minutos|mmHg|%|bpm|ipm|cm|kg|g)\b/i.test(remainder.trim());

      if (!isDosageOrUnit && qNum > 0 && qNum <= 300) {
        // Aceita se for o próximo número esperado, ou se a questão anterior já possui 3+ alternativas, ou no início
        if (
          qNum === expectedNumber ||
          qNum === expectedNumber + 1 ||
          currentOptionsCount >= 3 ||
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
        if (qNum === expectedNumber || qNum === expectedNumber + 1 || currentOptionsCount >= 3 || expectedNumber === 1) {
          return { questionNumber: qNum, statementRemainder: '', isExplicit: false };
        }
      }
    }

    return null;
  }

  /**
   * Extrai múltiplas alternativas alinhadas na mesma linha horizontal.
   */
  private static extractInlineOptions(text: string): ExtractedOption[] | null {
    const markerRegex = /(?:^|\s+)(?:\(([A-Ea-e])\)|\b([A-Ea-e])\))\s+/g;
    const markers: { letter: string; startIndex: number; endIndex: number }[] = [];
    let match: RegExpExecArray | null;

    while ((match = markerRegex.exec(text)) !== null) {
      const letter = (match[1] || match[2]).toUpperCase();
      markers.push({
        letter,
        startIndex: match.index + match[0].length,
        endIndex: match.index,
      });
    }

    if (markers.length >= 2 && markers[0].letter === 'A' && markers[1].letter === 'B') {
      const options: ExtractedOption[] = [];
      for (let i = 0; i < markers.length; i++) {
        const curr = markers[i];
        const nextStart = i + 1 < markers.length ? markers[i + 1].endIndex : text.length;
        const optText = text.slice(curr.startIndex, nextStart).trim();
        options.push({
          letter: curr.letter,
          text: optText,
        });
      }
      return options;
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
   * Segmenta diretamente a partir do ID de um asset cadastrado,
   * recuperando o PDF original armazenado na tabela knowledgeAssetFiles.
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
        warning: 'PDF original não disponível — Esta prova foi cadastrada sem o arquivo binário. Reenvie o arquivo PDF para habilitar a segmentação.',
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
