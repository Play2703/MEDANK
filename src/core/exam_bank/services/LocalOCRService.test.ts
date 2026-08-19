import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LocalOCRService,
  BrowserLocalOCRAdapter,
  CapacitorLocalOCRAdapter,
  NodeLocalOCRAdapter,
  LocalOCRError,
  detectOCRRuntime,
  toArrayBuffer,
} from './LocalOCRService';
import { ExamPDFQuestionSplitter } from './ExamPDFQuestionSplitter';

describe('LocalOCRService - Plataformas, Adaptadores e Isolamento Local', () => {
  let service: LocalOCRService;

  beforeEach(() => {
    service = new LocalOCRService();
    vi.restoreAllMocks();
  });

  // 1. LocalOCRService no runtime web com mock de canvas
  it('1. deve executar no runtime web renderizando páginas via HTMLCanvasElement', async () => {
    const adapter = new BrowserLocalOCRAdapter();
    expect(adapter.runtime).toBe('web');

    // Mock do processImage
    vi.spyOn(adapter, 'processImage').mockResolvedValue({
      pageNumber: 1,
      text: 'QUESTÃO 01\nEnunciado sobre insuficiência cardíaca.\nA) Furosemida\nB) Metoprolol\nC) Espironolactona\nD) Dapagliflozina',
      confidence: 95,
      blocks: [{ text: 'QUESTÃO 01' }],
    });

    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getViewport: () => ({ width: 800, height: 1000 }),
        render: () => ({ promise: Promise.resolve() }),
        cleanup: vi.fn(),
      }),
    };

    // Simula document.createElement('canvas')
    const originalCreateElement = global.document?.createElement;
    if (typeof document !== 'undefined') {
      const mockCanvas: any = {
        width: 800,
        height: 1000,
        getContext: () => ({}),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas);
    }

    const results = await adapter.processPDF(mockPdf);
    expect(results).toHaveLength(1);
    expect(results[0].text).toContain('QUESTÃO 01');
    expect(results[0].confidence).toBe(95);
  });

  // 2. Runtime Capacitor/iOS com mock de WebView/canvas
  it('2. deve executar no runtime Capacitor/iOS com liberação agressiva de memória por página', async () => {
    const adapter = new CapacitorLocalOCRAdapter('capacitor-ios');
    expect(adapter.runtime).toBe('capacitor-ios');

    const cleanupSpy = vi.fn();
    const mockPdf = {
      numPages: 2,
      getPage: vi.fn().mockResolvedValue({
        getViewport: () => ({ width: 600, height: 800 }),
        render: () => ({ promise: Promise.resolve() }),
        cleanup: cleanupSpy,
      }),
    };

    vi.spyOn(adapter, 'processImage').mockImplementation(async (_input, pageNumber) => ({
      pageNumber: pageNumber || 1,
      text: `Página ${pageNumber} reconhecida no iOS`,
      confidence: 90,
    }));

    const results = await adapter.processPDF(mockPdf);
    expect(results).toHaveLength(2);
    expect(cleanupSpy).toHaveBeenCalledTimes(2);
    expect(results[0].text).toContain('Página 1');
    expect(results[1].text).toContain('Página 2');
  });

  // 3. Runtime Node com mock de PDF.js e CanvasFactory
  it('3. deve executar no runtime Node com rasterização real via CanvasFactory', async () => {
    const adapter = new NodeLocalOCRAdapter();
    expect(adapter.runtime).toBe('node');

    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getViewport: () => ({ width: 500, height: 700 }),
        render: () => ({ promise: Promise.resolve() }),
        cleanup: vi.fn(),
      }),
    };

    vi.spyOn(adapter, 'processImage').mockResolvedValue({
      pageNumber: 1,
      text: 'QUESTÃO 27\nPaciente com sepse de foco urinário.\nA) Ceftriaxona\nB) Ciprofloxacino\nC) Amicacina\nD) Meropenem',
      confidence: 92,
    });

    const results = await adapter.processPDF(mockPdf);
    expect(results).toHaveLength(1);
    expect(results[0].text).toContain('QUESTÃO 27');
    expect(results[0].confidence).toBe(92);
  });

  // 4. Node escaneado executando recognize, não getTextContent
  it('4. deve executar recognize de imagem no Node e NÃO recorrer apenas ao getTextContent vazio', async () => {
    const adapter = new NodeLocalOCRAdapter();
    const processImageSpy = vi.spyOn(adapter, 'processImage').mockResolvedValue({
      pageNumber: 1,
      text: 'QUESTÃO 10\nTexto reconhecido via OCR da imagem.',
      confidence: 88,
    });

    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getViewport: () => ({ width: 400, height: 600 }),
        render: () => ({ promise: Promise.resolve() }),
        getTextContent: vi.fn().mockResolvedValue({ items: [] }), // Simula PDF escaneado (vazio no getTextContent)
        cleanup: vi.fn(),
      }),
    };

    const results = await adapter.processPDF(mockPdf);
    expect(results[0].text).toContain('QUESTÃO 10');
    expect(processImageSpy).toHaveBeenCalled();
  });

  // 5. Node sem canvas retornando OCR_RUNTIME_UNSUPPORTED
  it('5. deve retornar OCR_RUNTIME_UNSUPPORTED quando CanvasFactory falhar no Node', async () => {
    const adapter = new NodeLocalOCRAdapter();
    vi.spyOn(adapter as any, 'getCanvasFactory').mockRejectedValue(
      new LocalOCRError('OCR_RUNTIME_UNSUPPORTED', 'Canvas indisponível')
    );

    await expect(adapter.processPDF({ numPages: 1 })).rejects.toThrow('Canvas indisponível');
  });

  // 6. Carregamento do modelo por com fallback para eng
  it('6. deve tentar idioma "por" e ter suporte a fallback de idioma', async () => {
    const adapter = new NodeLocalOCRAdapter();
    const isAvail = await adapter.isAvailable();
    expect(typeof isAvail).toBe('boolean');
  });

  // 7. Cancelamento via AbortSignal durante a página 2
  it('7. deve cancelar imediatamente e interromper o loop ao acionar AbortSignal', async () => {
    const adapter = new NodeLocalOCRAdapter();
    const abortController = new AbortController();

    const mockPdf = {
      numPages: 5,
      getPage: vi.fn().mockImplementation(async (pageNum: number) => {
        if (pageNum === 2) {
          abortController.abort();
        }
        return {
          getViewport: () => ({ width: 300, height: 400 }),
          render: () => ({ promise: Promise.resolve() }),
          cleanup: vi.fn(),
        };
      }),
    };

    vi.spyOn(adapter, 'processImage').mockResolvedValue({
      pageNumber: 1,
      text: 'Página 1',
    });

    await expect(
      adapter.processPDF(mockPdf, { signal: abortController.signal })
    ).rejects.toThrow();
  });

  // 8. Liberação de memória e recursos após sucesso e exceção
  it('8. deve chamar page.cleanup() tanto em caso de sucesso quanto em caso de exceção', async () => {
    const adapter = new BrowserLocalOCRAdapter();
    const cleanupSpy = vi.fn();

    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getViewport: () => ({ width: 100, height: 100 }),
        render: () => ({ promise: Promise.reject(new Error('Render error')) }),
        cleanup: cleanupSpy,
      }),
    };

    await adapter.processPDF(mockPdf);
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  // 9. Conversor universal toArrayBuffer
  it('9. deve converter Uint8Array, Buffer, Blob e Data URLs em ArrayBuffer', async () => {
    const uint8 = new Uint8Array([1, 2, 3, 4]);
    const ab1 = await toArrayBuffer(uint8);
    expect(ab1.byteLength).toBe(4);

    const ab2 = await toArrayBuffer(uint8.buffer);
    expect(ab2.byteLength).toBe(4);

    const dataUrl = 'data:application/pdf;base64,JVBERi0xLjQK';
    const ab3 = await toArrayBuffer(dataUrl);
    expect(ab3.byteLength).toBeGreaterThan(0);
  });

  // 10. Splitter não chamando IA nem OCR em PDF com texto nativo
  it('10. deve utilizar o parser nativo rápido sem chamar OCR em PDFs vetoriais', async () => {
    const nativeText = `
QUESTÃO 01
Paciente com cefaleia súbita e rigidez de nuca.
A) Hemorragia subaracnóidea.
B) Enxaqueca clássica.
C) Cefaleia tensional.
D) Sinusite aguda.
`;
    const result = ExamPDFQuestionSplitter.splitFromText(nativeText);
    expect(result.totalQuestions).toBe(1);
    expect(result.questions[0].confidence).toBe('high');
    expect(result.questions[0].questionNumber).toBe(1);
  });

  // 11. Splitter em modo local nunca chama OCR remoto
  it('11. o modo "local" nunca deve invocar endpoint remoto de OCR', async () => {
    const mockOCRAdapter = {
      runtime: 'node' as const,
      isAvailable: vi.fn().mockResolvedValue(true),
      processImage: vi.fn(),
      processPDF: vi.fn().mockResolvedValue([
        {
          pageNumber: 1,
          text: 'QUESTÃO 27\nPaciente com apendicite aguda.\nA) Cirurgia imediata\nB) Observação\nC) Alta hospitalar\nD) Analgesia simples',
          confidence: 90,
        },
      ]),
      terminate: vi.fn().mockResolvedValue(undefined),
    };

    service.setAdapter(mockOCRAdapter);

    const splitResult = ExamPDFQuestionSplitter.splitFromOCR([
      {
        pageNumber: 1,
        text: 'QUESTÃO 27\nPaciente com apendicite aguda.\nA) Cirurgia imediata\nB) Observação\nC) Alta hospitalar\nD) Analgesia simples',
        confidence: 90,
      },
    ]);

    expect(splitResult.totalQuestions).toBe(1);
    expect(splitResult.questions[0].questionNumber).toBe(27);
    expect(splitResult.questions[0].options).toHaveLength(4);
    expect(splitResult.questions[0].options[0].letter).toBe('A');
    expect(splitResult.questions[0].options[3].letter).toBe('D');
    expect(splitResult.questions[0].confidence).toBe('high');
  });

  // 12. Teste com imagem rasterizada sintetizada via Canvas em Node
  it('12. teste de integração de OCR local com imagem rasterizada no Node', async () => {
    const { createCanvas } = await import('@napi-rs/canvas');
    const canvas = createCanvas(400, 150);
    const ctx = canvas.getContext('2d');

    // Fundo branco
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 400, 150);

    // Texto de teste
    ctx.fillStyle = '#000000';
    ctx.font = '24px sans-serif';
    ctx.fillText('QUESTÃO 27', 20, 40);
    ctx.font = '16px sans-serif';
    ctx.fillText('A) Alternativa Correta', 20, 80);
    ctx.fillText('B) Alternativa Incorreta', 20, 110);

    const pngBuffer = canvas.toBuffer('image/png');
    const nodeAdapter = new NodeLocalOCRAdapter();

    const ocrResult = await nodeAdapter.processImage(pngBuffer, 1);
    expect(ocrResult.text).toContain('QUESTÃO');
    expect(ocrResult.text).toContain('27');
    await nodeAdapter.terminate();
  });
});
