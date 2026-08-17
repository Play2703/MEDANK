/**
 * ExamPDFQuestionSplitter
 *
 * Segmentador mecânico/determinístico de provas em formato PDF para extração de questões
 * individuais (número, enunciado, alternativas A-E e gabarito quando presente).
 *
 * ⚠️ REQUISITO ARQUITETURAL FUNDAMENTAL:
 * - 100% local via layout de PDF e regex.
 * - ZERO chamadas de IA / LLM (sem consumo de tokens).
 * - Retorna índice de confiança ('high' | 'low') e alertas para layouts não-padrão.
 */

import { PDFLayoutItem, PDFLayoutResult, DocumentReaderService } from '../../import_engine/services/DocumentReaderService';
import { db } from '../../../data/db/database';

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
  confidence: 'high' | 'low';
  warning?: string;
}

export interface ExamSplitterResult {
  success: boolean;
  totalQuestions: number;
  highConfidenceCount: number;
  lowConfidenceCount: number;
  lowConfidenceRatio: number;
  warning?: string;
  questions: ExtractedExamQuestion[];
  answerKeyFound: boolean;
  answerKeyMap: Record<number, string>;
}

interface ReconstitutedLine {
  text: string;
  x: number;
  y: number;
  pageNumber: number;
}

export class ExamPDFQuestionSplitter {
  /**
   * Padrões de início de questão:
   * - QUESTÃO 01, Questão 1., Q. 1, Questão 12 -
   * - 1. Enunciado..., 01) Enunciado..., 1 - Enunciado...
   */
  private static readonly QUESTION_START_REGEX =
    /^(?:QUEST[ÃA]O|QUESTAO|Q\.)\s*(\d{1,3})\b[.:\-–)]*\s*(.*)$/i;

  private static readonly NUMBERED_START_REGEX =
    /^(\d{1,3})[.\)-]\s+(.*)$/;

  /**
   * Padrões de alternativas:
   * - A) texto, (A) texto, A. texto, a) texto, A - texto
   */
  private static readonly OPTION_START_REGEX =
    /^\(?([A-Ea-e])\)?[.\:\-–\)]\s+(.*)$/;

  /**
   * Padrão inline com múltiplas alternativas na mesma linha
   */
  private static readonly INLINE_OPTIONS_REGEX =
    /\(?([A-Ea-e])\)?[.\:\-–\)]\s+([^A-Ea-e\(\)]+)/g;

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
   * Segmenta questões a partir do resultado de layout extraído do PDF.
   */
  public static splitFromLayout(layout: PDFLayoutResult): ExamSplitterResult {
    const lines = this.reconstituteLines(layout.items);
    return this.parseLines(lines, layout.rawText);
  }

  /**
   * Segmenta questões a partir de texto bruto corrido.
   */
  public static splitFromText(rawText: string): ExamSplitterResult {
    const rawLines = rawText.split(/\r?\n/).map((line, idx) => ({
      text: line.trim(),
      x: 0,
      y: idx,
      pageNumber: 1,
    })).filter((l) => l.text.length > 0);

    return this.parseLines(rawLines, rawText);
  }

  /**
   * Ponto de entrada universal que aceita Buffer, PDFLayoutResult ou string.
   */
  public static async split(
    input: PDFLayoutResult | string | ArrayBuffer | Uint8Array | File | Blob
  ): Promise<ExamSplitterResult> {
    if (typeof input === 'string') {
      return this.splitFromText(input);
    }

    if ('items' in input && Array.isArray((input as any).items)) {
      return this.splitFromLayout(input as PDFLayoutResult);
    }

    // Se for buffer / arquivo binário, extrai com layout primeiro
    const reader = new DocumentReaderService();
    const layout = await reader.extractPDFWithLayout(input as any);
    return this.splitFromLayout(layout);
  }

  /**
   * Reconstitui linhas de texto ordenadas geometricamente a partir das caixas delimitadoras.
   */
  private static reconstituteLines(items: PDFLayoutItem[]): ReconstitutedLine[] {
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

      // Detecta se a página possui 2 colunas separadas por margem X
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
          const lineText = group.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
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
    if (items.length < 20) return null;
    const xCoords = items.map((i) => i.x).sort((a, b) => a - b);
    const minX = xCoords[0];
    const maxX = xCoords[xCoords.length - 1];
    const width = maxX - minX;

    if (width < 300) return null; // Página estreita / coluna única

    const midX = minX + width / 2;
    const leftCount = items.filter((i) => i.x < midX - 30).length;
    const rightCount = items.filter((i) => i.x > midX + 30).length;
    const centerCount = items.filter((i) => Math.abs(i.x - midX) <= 30).length;

    if (leftCount > 10 && rightCount > 10 && centerCount < (leftCount + rightCount) * 0.15) {
      return { midX };
    }

    return null;
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
    const fullContent = (rawText + '\n' + lines.map((l) => l.text).join('\n')).trim();

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
      options: ExtractedOption[];
      correctLetter?: string;
      pageNumber: number;
      currentOptionLetter: string | null;
    }

    const questions: ExtractedExamQuestion[] = [];
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

      questions.push({
        questionNumber: currentQ.questionNumber,
        statement,
        options,
        correctLetter,
        pageNumber: currentQ.pageNumber,
        confidence,
        warning,
      });

      currentQ = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const lineObj = lines[i];
      const text = lineObj.text.trim();
      if (!text) continue;

      // Ignora rodapés / cabeçalhos repetitivos conhecidos
      if (this.isHeaderFooterLine(text)) continue;

      // 1. Testa se é início de uma nova questão
      const qStart = this.matchQuestionStart(text, expectedNextNumber, currentQ?.options.length || 0);
      if (qStart) {
        finalizeCurrentQuestion();
        expectedNextNumber = qStart.questionNumber + 1;

        currentQ = {
          questionNumber: qStart.questionNumber,
          statementParts: qStart.statementRemainder ? [qStart.statementRemainder] : [],
          options: [],
          correctLetter: undefined,
          pageNumber: lineObj.pageNumber,
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

      // 2. Verifica se a linha é um gabarito / resposta pontual da questão ativa (ex: GABARITO: A ou RESPOSTA: B)
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

      // 4. Testa se a linha começa com uma alternativa única (A-E)
      const optMatch = text.match(this.OPTION_START_REGEX);
      if (optMatch) {
        const letter = optMatch[1].toUpperCase();
        const optionText = optMatch[2].trim();
        currentQ.options.push({ letter, text: optionText });
        currentQ.currentOptionLetter = letter;
        continue;
      }

      // 5. Se já estamos dentro das opções, concatena na última opção ativa
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
    const highConfidenceCount = questions.filter((q) => q.confidence === 'high').length;
    const lowConfidenceCount = totalQuestions - highConfidenceCount;
    const lowConfidenceRatio = totalQuestions > 0 ? lowConfidenceCount / totalQuestions : 1.0;

    let generalWarning: string | undefined = undefined;
    if (totalQuestions === 0) {
      generalWarning = 'Nenhuma questão identificada com layout padrão no documento.';
    } else if (lowConfidenceRatio > 0.40) {
      generalWarning = `Este PDF não segue um layout padrão reconhecível — segmentação automática não confiável para ${Math.round(lowConfidenceRatio * 100)}% das questões.`;
    }

    return {
      success: totalQuestions > 0 && lowConfidenceRatio <= 0.40,
      totalQuestions,
      highConfidenceCount,
      lowConfidenceCount,
      lowConfidenceRatio: Math.round(lowConfidenceRatio * 100) / 100,
      warning: generalWarning,
      questions,
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
  ): { questionNumber: number; statementRemainder: string } | null {
    // Padrão explícito: QUESTÃO X
    const qMatch = text.match(this.QUESTION_START_REGEX);
    if (qMatch) {
      const qNum = parseInt(qMatch[1], 10);
      if (qNum > 0 && qNum <= 300) {
        return { questionNumber: qNum, statementRemainder: qMatch[2] || '' };
      }
    }

    // Padrão numérico: "1. Texto..." ou "1) Texto..."
    const numMatch = text.match(this.NUMBERED_START_REGEX);
    if (numMatch) {
      const qNum = parseInt(numMatch[1], 10);

      // Só aceita se for o próximo número esperado ou se a questão atual já possui 3+ alternativas
      if (
        (qNum === expectedNumber || qNum === expectedNumber + 1 || (qNum >= 1 && currentOptionsCount >= 3)) &&
        qNum > 0 &&
        qNum <= 300
      ) {
        return { questionNumber: qNum, statementRemainder: numMatch[2] || '' };
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
      lower.includes('página') && /\d+\s*(de|\/)\s*\d+/.test(lower) ||
      lower.startsWith('processo seletivo') ||
      lower.startsWith('concurso público') ||
      lower.startsWith('folha de prova') ||
      lower.includes('todos os direitos reservados') ||
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
  public static async splitFromAssetId(assetId: string): Promise<ExamSplitterResult> {
    const rawBlob = await this.getRawExamPDFBlob(assetId);
    if (!rawBlob) {
      return {
        success: false,
        totalQuestions: 0,
        highConfidenceCount: 0,
        lowConfidenceCount: 0,
        lowConfidenceRatio: 0,
        warning: 'PDF original não disponível — Esta prova foi cadastrada sem o arquivo binário. Reenvie o arquivo PDF para habilitar a segmentação automática por coordenadas de layout.',
        questions: [],
        answerKeyFound: false,
        answerKeyMap: {},
      };
    }

    return await this.split(rawBlob);
  }
}
