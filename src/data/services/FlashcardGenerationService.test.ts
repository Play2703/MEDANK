import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { FlashcardGenerationService } from './FlashcardGenerationService';
import { ragEngine } from './RAGEngine';
import { FlashcardGenerationOptions } from '../../domain/entities/DocumentImport';

describe('FlashcardGenerationService - Segmentação e Validação de Nível', () => {
  let service: FlashcardGenerationService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new FlashcardGenerationService();
    vi.spyOn(ragEngine, 'retrieveContext').mockResolvedValue([
      {
        assetId: 'asset-1',
        chunkIndex: 0,
        content: 'Conteúdo de Cardiologia: Fisiopatologia do Infarto Agudo do Miocárdio.',
        similarity: 0.95,
      },
      {
        assetId: 'asset-1',
        chunkIndex: 1,
        content: 'Tratamento com trombolíticos e angioplastia primária.',
        similarity: 0.90,
      },
      {
        assetId: 'asset-1',
        chunkIndex: 2,
        content: 'Mortalidade pós-IAM e uso de betabloqueadores.',
        similarity: 0.88,
      },
    ]);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('deve segmentar semanticamente userInstructions longo (>1500 chars) no payload de geração', async () => {
    let capturedPayload: any = null;

    // Criar um userInstructions com mais de 1600 caracteres
    const longInstructions = `
      [PROFESSOR DR. CARLOS - CARDIOLOGIA CLINICA]
      Foco especial em IAM com supra de ST: tempo porta-balão inferior a 90 minutos em centros com hemodinâmica,
      e porta-agulha inferior a 30 minutos quando indicado trombolítico (Tenecteplase/Alteplase).
      Eletrocardiograma em menos de 10 minutos da admissão.
      ${'Instruções complementares sobre conduta em insuficiência coronariana aguda e critérios de reperfusão. '.repeat(15)}
    `.trim();

    expect(longInstructions.length).toBeGreaterThan(1500);

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      if (url.toString().includes('/api/generate-cards')) {
        capturedPayload = JSON.parse(init?.body as string);
        return {
          ok: true,
          json: async () => ({
            success: true,
            cards: [
              {
                type: 'basic',
                front: 'Qual o tempo porta-balão recomendado no IAM com supra de ST?',
                back: 'Menos de 90 minutos em hospitais com serviço de hemodinâmica disponível.',
                tags: ['Cardiologia', 'IAM'],
                difficulty: 'Médio',
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const options: FlashcardGenerationOptions = {
      deckId: 'deck-test-1',
      text: 'Conteúdo sobre IAM e Fisiopatologia Cardiovascular',
      subject: 'Cardiologia',
      cardCount: 1,
      cardType: 'basic',
      level: 'intermediario',
      userInstructions: longInstructions,
    };

    const cards = await service.generateFlashcards(options);

    expect(cards).toBeDefined();
    expect(cards.length).toBe(1);
    expect(capturedPayload).toBeDefined();
    expect(capturedPayload.userInstructions).toBeDefined();
    // O texto segmentado deve ser menor ou igual a 1500 caracteres
    expect(capturedPayload.userInstructions.length).toBeLessThan(longInstructions.length);
  });

  it('não deve acionar segmentação quando userInstructions for curto (<=1500 chars)', async () => {
    let capturedPayload: any = null;
    const shortInstructions = 'Focar em diagnóstico diferencial e doses de ataque de AAS e Clopidogrel.';

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      if (url.toString().includes('/api/generate-cards')) {
        capturedPayload = JSON.parse(init?.body as string);
        return {
          ok: true,
          json: async () => ({
            success: true,
            cards: [
              {
                type: 'basic',
                front: 'Qual a dose de ataque do AAS no IAM?',
                back: '160 a 325 mg mastigado.',
                tags: ['Cardiologia'],
                difficulty: 'Fácil',
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const options: FlashcardGenerationOptions = {
      deckId: 'deck-test-1',
      text: 'Conteúdo de Cardiologia',
      subject: 'Cardiologia',
      cardCount: 1,
      cardType: 'basic',
      level: 'intermediario',
      userInstructions: shortInstructions,
    };

    await service.generateFlashcards(options);

    expect(capturedPayload.userInstructions).toBe(shortInstructions);
  });

  it('deve truncar ativamente o verso de cards com >220 caracteres quando level === "resumido"', async () => {
    const excessivelyLongBack = 'Betabloqueador na fase aguda do IAM. Reduz o consumo de oxigênio pelo miocárdio e previne arritmias ventriculares complexas. ' +
      'Além disso, promove melhora da perfusão subendocárdica através do prolongamento da diástole e modulação simpática autonômica prolongada em pacientes de alto risco.';

    expect(excessivelyLongBack.length).toBeGreaterThan(220);

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      if (url.toString().includes('/api/generate-cards')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            cards: [
              {
                type: 'basic',
                front: 'Qual o papel dos betabloqueadores no pós-IAM?',
                back: excessivelyLongBack,
                tags: ['Cardiologia'],
                difficulty: 'Fácil',
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const options: FlashcardGenerationOptions = {
      deckId: 'deck-test-1',
      text: 'Conteúdo de Cardiologia',
      subject: 'Cardiologia',
      cardCount: 1,
      cardType: 'basic',
      level: 'resumido',
    };

    const cards = await service.generateFlashcards(options);

    expect(cards.length).toBe(1);
    expect(cards[0].back.length).toBeLessThanOrEqual(220);
    expect(cards[0].back.endsWith('.') || cards[0].back.endsWith('…')).toBe(true);
  });

  it('deve truncar o verso quando level === "intermediario" e exceder 400 caracteres, mas manter intacto se <= 400', async () => {
    const textUnder400 = 'Betabloqueador na fase aguda do IAM. Reduz o consumo de oxigênio pelo miocárdio e previne arritmias ventriculares complexas.';
    const textOver400 = textUnder400.repeat(4); // > 400 chars

    expect(textUnder400.length).toBeLessThanOrEqual(400);
    expect(textOver400.length).toBeGreaterThan(400);

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      if (url.toString().includes('/api/generate-cards')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            cards: [
              {
                type: 'basic',
                front: 'Card 1',
                back: textUnder400,
                tags: ['Cardiologia'],
                difficulty: 'Médio',
              },
              {
                type: 'basic',
                front: 'Card 2',
                back: textOver400,
                tags: ['Cardiologia'],
                difficulty: 'Médio',
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const options: FlashcardGenerationOptions = {
      deckId: 'deck-test-1',
      text: 'Conteúdo de Cardiologia',
      subject: 'Cardiologia',
      cardCount: 2,
      cardType: 'basic',
      level: 'intermediario',
    };

    const cards = await service.generateFlashcards(options);

    expect(cards.length).toBe(2);
    expect(cards[0].back).toBe(textUnder400);
    expect(cards[1].back.length).toBeLessThanOrEqual(400);
    expect(cards[1].back.endsWith('.') || cards[1].back.endsWith('…')).toBe(true);
  });

  it('deve truncar o verso quando level === "completo" e exceder 800 caracteres, mas manter intacto se <= 800', async () => {
    const textUnder800 = 'Diretrizes completas de IAM com supra de ST. Indicação de reperfusão química ou mecânica imediata. ' +
      'Antiagregação plaquetária dupla (AAS + Inibidor P2Y12) e anticoagulação plena com enoxaparina ou heparina não fracionada. ' +
      'Monitorização contínua em UTI coronariana por 24-48h.'.repeat(2); // ~500 chars

    const textOver800 = textUnder800.repeat(3); // > 1000 chars

    expect(textUnder800.length).toBeLessThanOrEqual(800);
    expect(textOver800.length).toBeGreaterThan(800);

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      if (url.toString().includes('/api/generate-cards')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            cards: [
              {
                type: 'basic',
                front: 'Card Completo 1',
                back: textUnder800,
                tags: ['Cardiologia'],
                difficulty: 'Difícil',
              },
              {
                type: 'basic',
                front: 'Card Completo 2',
                back: textOver800,
                tags: ['Cardiologia'],
                difficulty: 'Difícil',
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const options: FlashcardGenerationOptions = {
      deckId: 'deck-test-1',
      text: 'Conteúdo de Cardiologia',
      subject: 'Cardiologia',
      cardCount: 2,
      cardType: 'basic',
      level: 'completo',
    };

    const cards = await service.generateFlashcards(options);

    expect(cards.length).toBe(2);
    expect(cards[0].back).toBe(textUnder800);
    expect(cards[1].back.length).toBeLessThanOrEqual(800);
    expect(cards[1].back.endsWith('.') || cards[1].back.endsWith('…')).toBe(true);
  });

  it('deve marcar needsReview: true apenas para cards com status "low_anchoring" no localValidation', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      if (url.toString().includes('/api/generate-cards')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            cards: [
              {
                type: 'basic',
                front: 'Card Bem Ancorado',
                back: 'Betabloqueadores reduzem o consumo de oxigênio miocárdico.',
                tags: ['Cardiologia'],
                difficulty: 'Fácil',
              },
              {
                type: 'basic',
                front: 'Card Mal Ancorado',
                back: 'Texto genérico sem termos médicos reconhecidos pelo NER.',
                tags: ['Geral'],
                difficulty: 'Fácil',
              },
            ],
            localValidation: {
              items: [
                { index: 0, itemType: 'card', status: 'well_anchored', anchoringConfidence: 0.9 },
                { index: 1, itemType: 'card', status: 'low_anchoring', anchoringConfidence: 0.2 },
              ],
            },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const options: FlashcardGenerationOptions = {
      deckId: 'deck-test-1',
      text: 'Conteúdo de Teste',
      subject: 'Cardiologia',
      cardCount: 2,
      cardType: 'basic',
      level: 'intermediario',
    };

    const cards = await service.generateFlashcards(options);

    expect(cards).toHaveLength(2);
    expect(cards[0].needsReview).toBe(false);
    expect(cards[1].needsReview).toBe(true);
  });
});
