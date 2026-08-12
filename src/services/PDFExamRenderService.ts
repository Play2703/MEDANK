/**
 * Server-Side PDF Exam Render Service (pdfmake)
 *
 * Renders high-fidelity official medical exam PDFs 100% server-side without headless browser/Puppeteer.
 * Generates vector PDF buffers in memory with exact brand aesthetics, native section banners,
 * precise typographic hierarchy, dynamic quick-answer key grids, and left-accented commentary blocks.
 */

import pdfmake from 'pdfmake';
import { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import { QuestionSet, StructuredCommentary } from '../domain/entities/Question';

// Configure standard built-in PDF fonts (Helvetica)
pdfmake.setFonts({
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
});

export class PDFExamRenderService {
  /**
   * Helper to build elegant native section header banners without unicode square characters
   */
  private static createSectionBanner(titleText: string): Content {
    return {
      table: {
        widths: ['*'],
        body: [
          [
            {
              text: titleText.toUpperCase(),
              fontSize: 10.5,
              bold: true,
              color: '#FFFFFF',
              alignment: 'center',
              fillColor: '#7A1F2B',
              margin: [0, 2, 0, 2],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 12,
        paddingRight: () => 12,
        paddingTop: () => 6,
        paddingBottom: () => 6,
      },
      margin: [0, 8, 0, 16],
    };
  }

  /**
   * Generates a vector PDF Buffer for the given QuestionSet
   */
  public static async generatePDFBuffer(questionSet: QuestionSet): Promise<Buffer> {
    if (!questionSet || !questionSet.questions || questionSet.questions.length === 0) {
      throw new Error('Nenhum simulado válido fornecido para geração de PDF.');
    }

    const title = (questionSet.title || 'SIMULADO DE MEDICINA E CASOS CLÍNICOS').toUpperCase();
    const config = questionSet.request?.configuration;
    const specialty = config?.specialty || 'Medicina Geral';
    const topicsStr = config?.topics && config.topics.length > 0 ? config.topics.join(' · ') : specialty;
    const bancaName = questionSet.request?.bancaName || questionSet.request?.professorName || 'MedAnki — Medicina';
    const totalQ = questionSet.questions.length;

    const content: any[] = [];

    // 1. Top Brand Accent Line (#7A1F2B - Maroon)
    content.push({
      canvas: [
        {
          type: 'rect',
          x: 0,
          y: 0,
          w: 515,
          h: 4,
          color: '#7A1F2B',
        },
      ],
      margin: [0, 0, 0, 12],
    });

    // 2. Main Document Title Header
    content.push({
      text: title,
      fontSize: 16,
      bold: true,
      color: '#0F172A',
      alignment: 'center',
      margin: [0, 0, 0, 5],
    });

    content.push({
      text: topicsStr,
      fontSize: 10,
      italics: true,
      color: '#475569',
      alignment: 'center',
      margin: [0, 0, 0, 8],
    });

    content.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              text: `Baseado nas Diretrizes Médicas Vigentes  |  ${bancaName}`,
              fontSize: 8.5,
              bold: true,
              color: '#334155',
              alignment: 'center',
              fillColor: '#F8FAFC',
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => '#E2E8F0',
        vLineColor: () => '#E2E8F0',
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      margin: [70, 0, 70, 16],
    });

    // 3. Instructions Box with Brand Accent
    content.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                {
                  text: 'INSTRUÇÕES GERAIS PARA O SIMULADO',
                  fontSize: 9.5,
                  bold: true,
                  color: '#7A1F2B',
                  margin: [0, 0, 0, 6],
                },
                {
                  text: '• Leia atentamente o enunciado e os dados clínicos de cada questão antes de assinalar a alternativa.',
                  fontSize: 9,
                  color: '#334155',
                  margin: [0, 0, 0, 3],
                },
                {
                  text: '• Para questões de múltipla escolha, apenas 1 (uma) alternativa está correta de acordo com a literatura médica.',
                  fontSize: 9,
                  color: '#334155',
                  margin: [0, 0, 0, 3],
                },
                {
                  text: '• O Gabarito Rápido e a fundamentação comentada detalhada encontram-se ao final deste caderno.',
                  fontSize: 9,
                  color: '#334155',
                },
              ],
              fillColor: '#F8FAFC',
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => '#CBD5E1',
        vLineColor: () => '#CBD5E1',
        paddingLeft: () => 14,
        paddingRight: () => 14,
        paddingTop: () => 10,
        paddingBottom: () => 10,
      },
      margin: [0, 0, 0, 18],
    });

    // 4. Section Banner: QUESTÕES OBJETIVAS
    content.push(this.createSectionBanner(`QUESTÕES OBJETIVAS (1 a ${totalQ})`));

    // 5. Render Questions (Statements & Options)
    questionSet.questions.forEach((q, index) => {
      const qNum = index + 1;

      // Question Item Layout: Number in Left Column (Brand Maroon, Bold, 11.5pt), Statement + Options in Right Column
      content.push({
        columns: [
          {
            text: `${qNum}.`,
            bold: true,
            fontSize: 11.5,
            color: '#7A1F2B',
            width: 24,
          },
          {
            stack: [
              {
                text: q.statement || '',
                fontSize: 10.5,
                color: '#1E293B',
                alignment: 'justify',
                lineHeight: 1.4,
                margin: [0, 0, 0, 8],
              },
              ...q.options.map((opt) => ({
                text: [
                  { text: `${opt.letter}) `, bold: true, fontSize: 10, color: '#0F172A' },
                  { text: opt.text || '', fontSize: 10, color: '#1E293B' },
                ],
                lineHeight: 1.35,
                margin: [0, 2.5, 0, 2.5],
                unbreakable: true,
              })),
            ],
            width: '*',
          },
        ],
        margin: [0, 0, 0, 18],
        unbreakable: true,
      });
    });

    // 6. Gabarito Section (Page break before Gabarito)
    content.push({
      text: '',
      pageBreak: 'before',
    });

    content.push({
      text: 'GABARITO E CORRELAÇÕES CLÍNICAS',
      fontSize: 15,
      bold: true,
      color: '#0F172A',
      alignment: 'center',
      margin: [0, 0, 0, 3],
    });

    content.push({
      text: 'Respostas fundamentadas nas Diretrizes Médicas e literatura clínica vigente',
      fontSize: 9.5,
      italics: true,
      color: '#475569',
      alignment: 'center',
      margin: [0, 0, 0, 16],
    });

    // Quick Answer Grid (Dynamic width based on exact row count, max 6 per row)
    content.push(this.createSectionBanner(`GABARITO RÁPIDO — Questões 1 a ${totalQ}`));

    for (let i = 0; i < totalQ; i += 6) {
      const slice = questionSet.questions.slice(i, i + 6);
      const numCols = slice.length;
      const colWidthPercent = `${(100 / numCols).toFixed(2)}%`;
      const widths = Array(numCols).fill(colWidthPercent);

      const headerRow: TableCell[] = slice.map((_, idx) => ({
        text: `Q.${i + idx + 1}`,
        fontSize: 9,
        bold: true,
        alignment: 'center',
        fillColor: '#7A1F2B',
        color: '#FFFFFF',
      }));

      const answerRow: TableCell[] = slice.map((q) => {
        const correctOpt = q.options.find((opt) => opt.id === q.correctOptionId || opt.isCorrect);
        return {
          text: correctOpt ? correctOpt.letter : 'A',
          fontSize: 11,
          bold: true,
          alignment: 'center',
          color: '#0F172A',
          fillColor: '#F8FAFC',
        };
      });

      content.push({
        table: {
          widths,
          body: [headerRow, answerRow],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#CBD5E1',
          vLineColor: () => '#CBD5E1',
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
        margin: [0, 0, 0, 10],
        unbreakable: true,
      });
    }

    // 7. Commented Answer Key Banner
    content.push({ text: '', margin: [0, 6, 0, 6] });
    content.push(this.createSectionBanner('GABARITO COMENTADO — QUESTÕES OBJETIVAS'));

    // Render Commented Questions (with left maroon accent bar)
    questionSet.questions.forEach((q, index) => {
      const qNum = index + 1;
      const qFormattedNum = qNum.toString().padStart(2, '0');
      const correctOpt = q.options.find((opt) => opt.id === q.correctOptionId || opt.isCorrect);
      const correctLetter = correctOpt ? correctOpt.letter : 'A';

      const commentaryStack: Content[] = [
        {
          text: [
            { text: `QUESTÃO ${qFormattedNum}  —  GABARITO: `, bold: true, fontSize: 10.5, color: '#0F172A' },
            { text: `ALTERNATIVA ${correctLetter}`, bold: true, fontSize: 10.5, color: '#7A1F2B' },
          ],
          margin: [0, 0, 0, 4],
        },
      ];

      if (typeof q.commentary === 'object' && q.commentary !== null) {
        const comm = q.commentary as StructuredCommentary;

        if (comm.correta) {
          commentaryStack.push({
            text: [
              { text: `Justificativa da Correta (${correctLetter}): `, bold: true, fontSize: 9.5, color: '#0F172A' },
              { text: comm.correta, fontSize: 9.5, color: '#1E293B' },
            ],
            alignment: 'justify',
            lineHeight: 1.35,
            margin: [0, 0, 0, 4],
          });
        }

        const incorrectOptions = q.options.filter((o) => !o.isCorrect && o.id !== q.correctOptionId);
        const incorrectExplanations = incorrectOptions
          .map((opt) => {
            const exp = (comm.porOpcao && comm.porOpcao[opt.letter]) || opt.explanation;
            return exp ? `${exp} (${opt.letter})` : null;
          })
          .filter(Boolean);

        if (incorrectExplanations.length > 0) {
          commentaryStack.push({
            text: [
              { text: 'Demais alternativas (incorretas): ', bold: true, fontSize: 9.5, color: '#0F172A' },
              { text: incorrectExplanations.join('. '), fontSize: 9.5, color: '#1E293B' },
            ],
            alignment: 'justify',
            lineHeight: 1.35,
            margin: [0, 0, 0, 4],
          });
        }

        if (comm.correlacaoClinica) {
          commentaryStack.push({
            text: [
              { text: 'Correlação Clínica: ', bold: true, fontSize: 9.5, color: '#7A1F2B' },
              { text: comm.correlacaoClinica, fontSize: 9.5, color: '#1E293B' },
            ],
            alignment: 'justify',
            lineHeight: 1.35,
            margin: [0, 0, 0, 4],
          });
        }
      } else {
        commentaryStack.push({
          text: typeof q.commentary === 'string' ? q.commentary : JSON.stringify(q.commentary),
          fontSize: 10,
          color: '#1E293B',
          alignment: 'justify',
          lineHeight: 1.4,
          margin: [0, 0, 0, 4],
        });
      }

      if (q.references && q.references.length > 0) {
        commentaryStack.push({
          text: `Referências: ${q.references.join('; ')}`,
          fontSize: 8.5,
          italics: true,
          color: '#64748B',
          margin: [0, 2, 0, 0],
        });
      }

      content.push({
        columns: [
          {
            canvas: [
              {
                type: 'rect',
                x: 0,
                y: 0,
                w: 3.5,
                h: 42,
                color: '#7A1F2B',
              },
            ],
            width: 8,
          },
          {
            stack: commentaryStack,
            width: '*',
          },
        ],
        margin: [0, 0, 0, 14],
        unbreakable: true,
      });
    });

    // Document Definition with 100% Solid White Page Background
    const docDefinition: any = {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [40, 40, 40, 50],
      background: (currentPage, pageSize) => {
        return {
          canvas: [
            {
              type: 'rect',
              x: 0,
              y: 0,
              w: pageSize.width,
              h: pageSize.height,
              color: '#FFFFFF',
            },
          ],
        };
      },
      content,
      footer: (currentPage: number, pageCount: number) => {
        return {
          stack: [
            {
              canvas: [
                {
                  type: 'line',
                  x1: 40,
                  y1: 0,
                  x2: 555,
                  y2: 0,
                  lineWidth: 0.5,
                  lineColor: '#E2E8F0',
                },
              ],
            },
            {
              columns: [
                {
                  text: 'Simulado elaborado com base nas Diretrizes Médicas Vigentes. MedAnki Medicina.',
                  alignment: 'left',
                  fontSize: 8,
                  color: '#64748B',
                  margin: [40, 8, 0, 0],
                },
                {
                  text: `Página ${currentPage} de ${pageCount}`,
                  alignment: 'right',
                  fontSize: 8.5,
                  bold: true,
                  color: '#7A1F2B',
                  margin: [0, 8, 40, 0],
                },
              ],
            },
          ],
        };
      },
    };

    const pdfDoc = pdfmake.createPdf(docDefinition);
    return await pdfDoc.getBuffer();
  }
}
