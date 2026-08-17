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
  topicTags?: string[];
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
   * Padrão de alternativa com delimitador explícito:
   * A) texto, a) texto, (A) texto, (a) texto, A. texto, a. texto, A: texto, A - texto
   */
  private static readonly OPTION_DELIM_REGEX =
    /^(?:\(([A-Ea-e])\)|([A-Ea-e])[.\:\-–\)])(?:\s+|$)(.*)$/;

  /**
   * Padrão de alternativa estilo checkbox: ( ) texto, [ ] texto
   */
  private static readonly OPTION_CHECKBOX_REGEX =
    /^(?:\(\s*\)|\[\s*\])\s+(.*)$/;

  /**
   * Padrão de alternativa sem delimitador (apenas letra maiúscula isolada A-E seguida de espaço):
   * A     texto, B     texto
   */
  private static readonly OPTION_NO_DELIM_REGEX =
    /^([A-E])\s+(.*)$/;

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
  public static splitFromLayout(layout: PDFLayoutResult): ExamSplitterResult {
    const lines = this.reconstituteLines(layout.items);
    return this.parseLines(lines, layout.rawText);
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
        topicTags: currentQ.topicTags,
      });

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

        // Detecção de tags de assunto no cabeçalho (ex: "Questão 1   Classificação de risco   Infectologia")
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

      // 4. Testa alternativa com delimitador explícito: a), A), (A), A., A-, etc.
      const optDelimMatch = text.match(this.OPTION_DELIM_REGEX);
      if (optDelimMatch) {
        const letter = (optDelimMatch[1] || optDelimMatch[2]).toUpperCase();
        const optText = (optDelimMatch[3] || '').trim();
        const expectedLetter = String.fromCharCode('A'.charCodeAt(0) + currentQ.options.length);

        if (letter === expectedLetter || (currentQ.options.length === 0 && letter === 'A') || currentQ.options.length > 0) {
          currentQ.options.push({ letter, text: optText });
          currentQ.currentOptionLetter = letter;
          continue;
        }
      }

      // 5. Testa alternativa estilo checkbox: ( ) ..., [ ] ...
      const optCheckboxMatch = text.match(this.OPTION_CHECKBOX_REGEX);
      if (optCheckboxMatch && currentQ.options.length < 5) {
        const letter = String.fromCharCode('A'.charCodeAt(0) + currentQ.options.length);
        const optText = optCheckboxMatch[1].trim();
        currentQ.options.push({ letter, text: optText });
        currentQ.currentOptionLetter = letter;
        continue;
      }

      // 6. Testa alternativa sem delimitador: A ..., B ..., C ... (apenas maiúsculas A-E no contexto de uma questão)
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
  ): { questionNumber: number; statementRemainder: string; isExplicit: boolean } | null {
    // Padrão explícito: QUESTÃO X
    const qMatch = text.match(this.QUESTION_START_REGEX);
    if (qMatch) {
      const qNum = parseInt(qMatch[1], 10);
      if (qNum > 0 && qNum <= 300) {
        return { questionNumber: qNum, statementRemainder: qMatch[2] || '', isExplicit: true };
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
        return { questionNumber: qNum, statementRemainder: numMatch[2] || '', isExplicit: false };
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
