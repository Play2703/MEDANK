import { describe, it, expect, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  segmentContextIntoCoverageUnits,
  assignCoverageUnitsToQuestions,
} from './contextSegmentation';
import { isQuestionGroundedInCustomContext } from './QuestionGenerationService';
import { QuestionGenerationService } from './QuestionGenerationService';
import { QuestionGenerationRequest } from '../../domain/entities/Question';

describe('Geração Direcionada por Unidades de Cobertura (Coverage Units)', () => {
  const notesTronco = `
NOTAS DE ANATOMIA - TRONCO ENCEFÁLICO
1. Mesencéfalo: porção cranial que contém os colículos superiores (visão) e inferiores (audição), pedúnculos cerebrais e a substância negra dopaminérgica.
2. Ponte de Varólio: porção média caracterizada por estriações e fibras transversais na face anterior, onde emergem as raízes do nervo trigêmeo (V par craniano).
3. Bulbo Raquídeo: porção caudal conectada à medula espinhal. Apresenta na face anterior as pirâmides bulbares (onde ocorre a decussação das pirâmides) e as olivas. Aloja os centros vitais de controle respiratório e cardiovascular.
  `.trim();

  it('PASSO 1: deve segmentar o texto de anotações em 3 unidades de cobertura estruturadas', async () => {
    const units = await segmentContextIntoCoverageUnits(notesTronco);

    expect(units).toHaveLength(3);

    // Unidade 1: Mesencéfalo
    expect(units[0].id).toBe('unit-1');
    expect(units[0].label).toContain('Mesencéfalo');
    expect(units[0].content).toContain('substância negra dopaminérgica');
    expect(units[0].sourceType).toBe('numbered');

    // Unidade 2: Ponte
    expect(units[1].id).toBe('unit-2');
    expect(units[1].label).toContain('Ponte');
    expect(units[1].content).toContain('nervo trigêmeo');
    expect(units[1].sourceType).toBe('numbered');

    // Unidade 3: Bulbo
    expect(units[2].id).toBe('unit-3');
    expect(units[2].label).toContain('Bulbo');
    expect(units[2].content).toContain('decussação das pirâmides');
    expect(units[2].sourceType).toBe('numbered');
  });

  it('PASSO 2: deve distribuir 6 questões proporcionalmente entre as 3 unidades de cobertura', async () => {
    const units = await segmentContextIntoCoverageUnits(notesTronco);
    const { assignments, omittedUnitLabels } = assignCoverageUnitsToQuestions(units, 6);

    expect(assignments).toHaveLength(6);
    expect(omittedUnitLabels).toHaveLength(0);

    // Cada uma das 3 unidades deve receber 2 questões (6 / 3 = 2 cada)
    const unit1Questions = assignments.filter((a) => a.unitId === 'unit-1');
    const unit2Questions = assignments.filter((a) => a.unitId === 'unit-2');
    const unit3Questions = assignments.filter((a) => a.unitId === 'unit-3');

    expect(unit1Questions.length).toBe(2);
    expect(unit2Questions.length).toBe(2);
    expect(unit3Questions.length).toBe(2);
    expect(unit1Questions.length + unit2Questions.length + unit3Questions.length).toBe(6);
  });

  it('PASSO 2 (caso quantity < unidades): deve priorizar as primeiras e listar as omitidas', async () => {
    const units = await segmentContextIntoCoverageUnits(notesTronco);
    const { assignments, omittedUnitLabels } = assignCoverageUnitsToQuestions(units, 2);

    expect(assignments).toHaveLength(2);
    expect(omittedUnitLabels).toHaveLength(1);
    expect(omittedUnitLabels[0]).toContain('Bulbo');
  });

  it('PASSO 3: deve gerar simulado completo de 6 questões com rastreabilidade (sourceContextExcerpt e coverageUnitId)', async () => {
    const units = await segmentContextIntoCoverageUnits(notesTronco);
    const { assignments } = assignCoverageUnitsToQuestions(units, 6);

    const mockQuestionsResponse = assignments.map((a, idx) => {
      if (a.unitId === 'unit-1') {
        return {
          statement: `Qual estrutura localizada no mesencéfalo está associada à transmissão dopaminérgica e aos reflexos visuais? (Q${idx + 1})`,
          correctAnswerText: 'Substância negra e colículos',
          correctAnswerExplanation: 'O mesencéfalo abriga os colículos e a substância negra.',
          sourceContextExcerpt: 'Mesencéfalo: porção cranial que contém os colículos superiores e substância negra dopaminérgica.',
          coverageUnitId: 'unit-1',
          commentary: {
            correta: 'O mesencéfalo é a porção cranial do tronco encefálico.',
            porOpcao: {
              A: 'Correto: contém substância negra e colículos.',
              B: 'Incorreto: ponte não contém colículos.',
              C: 'Incorreto: bulbo contém centros vitais.',
              D: 'Incorreto: diencéfalo não pertence ao tronco.',
            },
          },
        };
      } else if (a.unitId === 'unit-2') {
        return {
          statement: `Qual par craniano tem sua emergência associada às fibras transversais da face anterior da ponte? (Q${idx + 1})`,
          correctAnswerText: 'Nervo trigêmeo (V par)',
          correctAnswerExplanation: 'As raízes do V par craniano emergem na face anterior da ponte.',
          sourceContextExcerpt: 'Ponte de Varólio: caracterizada por fibras transversais onde emergem as raízes do V par.',
          coverageUnitId: 'unit-2',
          commentary: {
            correta: 'O nervo trigêmeo emerge na face anterior da ponte.',
            porOpcao: {
              A: 'Correto: V par emerge na ponte.',
              B: 'Incorreto: bulbo aloja outros pares.',
              C: 'Incorreto: mesencéfalo não origina o trigêmeo.',
              D: 'Incorreto: medula espinhal.',
            },
          },
        };
      } else {
        return {
          statement: `Onde se localizam as pirâmides onde ocorre a decussação motora no tronco encefálico? (Q${idx + 1})`,
          correctAnswerText: 'Face anterior do bulbo raquídeo',
          correctAnswerExplanation: 'As pirâmides bulbares e a decussação das pirâmides ocorrem no bulbo.',
          sourceContextExcerpt: 'Bulbo Raquídeo: apresenta na face anterior as pirâmides bulbares onde ocorre a decussação.',
          coverageUnitId: 'unit-3',
          commentary: {
            correta: 'A decussação das pirâmides ocorre na porção caudal do bulbo.',
            porOpcao: {
              A: 'Correto: no bulbo raquídeo.',
              B: 'Incorreto: ponte possui fibras transversais.',
              C: 'Incorreto: mesencéfalo possui pedúnculos.',
              D: 'Incorreto: diencéfalo.',
            },
          },
        };
      }
    });

    const originalFetch = global.fetch;
    let capturedPayload: any = null;

    global.fetch = vi.fn(async (url: any, options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/generate-questions')) {
        const payload = JSON.parse(options.body);
        if (!capturedPayload) {
          capturedPayload = payload;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            questions: mockQuestionsResponse.slice(0, payload.quantity || 5),
            mainModel: 'test-model',
          }),
        } as any;
      }
      if (urlStr.includes('/api/embeddings')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            embeddings: [
              [1, 0, 0],
              [0, 1, 0],
              [0, 0, 1],
              [0.5, 0.5, 0],
              [0, 0.5, 0.5],
              [0.5, 0, 0.5],
            ],
          }),
        } as any;
      }
      if (urlStr.includes('/api/decs-siblings')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            siblings: ['Pedúnculos cerebrais', 'Colículos superiores', 'Substância negra'],
          }),
        } as any;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    const request: QuestionGenerationRequest = {
      id: 'req-1',
      mode: 'geral',
      configuration: {
        specialty: 'Neurologia',
        topics: ['Tronco Encefálico'],
        quantity: 6,
        difficulty: 'media',
        questionType: 'conceitual',
        customContext: notesTronco,
        strictCustomContextOnly: true,
        includeCommentary: true,
        showReferences: true,
        autoGenerateFlashcards: false,
      },
      createdAt: new Date().toISOString(),
    };

    const service = new QuestionGenerationService();
    const result = await service.generateQuestions(request);

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload.coverageAssignments.length).toBeGreaterThanOrEqual(3);
    expect(capturedPayload.coverageAssignments[0].unitId).toBe('unit-1');
    expect(capturedPayload.coverageAssignments[0].unitContent).toContain('Mesencéfalo');

    expect(result.questionSet.questions).toHaveLength(6);

    result.questionSet.questions.forEach((q, idx) => {
      expect(q.sourceContextExcerpt).toBeDefined();
      expect(q.coverageUnitId).toBeDefined();
      expect(q.coverageUnitLabel).toBeDefined();
      expect(isQuestionGroundedInCustomContext(q, notesTronco)).toBe(true);
    });

    global.fetch = originalFetch;
  });

  it('REGRESSÃO: divisão em lotes (batching) deve alocar fatias contíguas de unidades de cobertura sem sobreposição', async () => {
    // 15 unidades de cobertura distintas
    const fifteenUnitsContext = Array.from({ length: 15 }, (_, i) => `${i + 1}. Tópico Médico ${i + 1}: Fisiopatologia e conduta específica do tema ${i + 1} com detalhes clínicos relevantes para a questão.`).join('\n\n');

    const capturedBatchPayloads: any[] = [];
    const originalFetch = global.fetch;

    global.fetch = vi.fn(async (url: any, options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/generate-questions')) {
        const payload = JSON.parse(options.body);
        capturedBatchPayloads.push(payload);
        const batchQty = payload.quantity || 5;
        const fakeQuestions = Array.from({ length: batchQty }, (_, i) => ({
          statement: `Questão ${i + 1} do lote ${capturedBatchPayloads.length}`,
          correctAnswerText: `Resposta ${i + 1}`,
          correctAnswerExplanation: `Explicação ${i + 1}`,
          sourceContextExcerpt: `Tópico ${i + 1}`,
          coverageUnitId: payload.coverageAssignments?.[i]?.unitId || `unit-${i + 1}`,
          commentary: {
            correta: 'Correta',
            porOpcao: { A: 'A', B: 'B', C: 'C', D: 'D' },
          },
        }));

        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            questions: fakeQuestions,
            mainModel: 'test-model',
          }),
        } as any;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    const request: QuestionGenerationRequest = {
      id: 'req-batching-10',
      mode: 'geral',
      configuration: {
        specialty: 'Clínica Médica',
        topics: ['Geral'],
        quantity: 10, // 2 lotes de 5 questões
        difficulty: 'media',
        questionType: 'conceitual',
        customContext: fifteenUnitsContext,
        strictCustomContextOnly: true,
        includeCommentary: true,
        showReferences: false,
        autoGenerateFlashcards: false,
      },
      createdAt: new Date().toISOString(),
    };

    const service = new QuestionGenerationService();
    const result = await service.generateQuestions(request);

    expect(capturedBatchPayloads.length).toBe(2);
    expect(result.questionSet.questions).toHaveLength(10);

    const batch0UnitIds = capturedBatchPayloads[0].coverageAssignments.map((a: any) => a.unitId);
    const batch1UnitIds = capturedBatchPayloads[1].coverageAssignments.map((a: any) => a.unitId);

    // Cada lote deve receber 5 unidades
    expect(batch0UnitIds).toHaveLength(5);
    expect(batch1UnitIds).toHaveLength(5);

    // Os dois lotes NÃO podem receber o mesmo conjunto de unidades (interseção vazia)
    const intersection = batch0UnitIds.filter((id: string) => batch1UnitIds.includes(id));
    expect(intersection).toHaveLength(0);

    // A união dos IDs deve ter cardinalidade 10 (10 tópicos únicos cobertos)
    const allAssignedUnitIds = new Set([...batch0UnitIds, ...batch1UnitIds]);
    expect(allAssignedUnitIds.size).toBe(10);

    global.fetch = originalFetch;
  });
});
