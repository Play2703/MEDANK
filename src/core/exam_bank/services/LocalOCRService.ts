/**
 * LocalOCRService
 *
 * Motor de OCR 100% local com adaptadores dedicados por plataforma:
 * 1. BrowserLocalOCRAdapter (Web / Chrome / Safari / Firefox)
 * 2. CapacitorLocalOCRAdapter (iOS / Android em WebView nativo)
 * 3. NodeLocalOCRAdapter (Servidor / Scripts / Testes em Node.js com CanvasFactory real)
 *
 * ⚠️ REQUISITO ARQUITETURAL FUNDAMENTAL:
 * - 100% local por padrão (zero chamadas a LLMs e zero consumo de tokens).
 * - No Node, renderiza páginas reais via CanvasFactory e executa Tesseract de verdade (não usa getTextContent).
 * - No iOS/Capacitor, renderiza via HTMLCanvasElement no WKWebView e libera memória por página.
 * - Suporta cancelamento via AbortSignal e feedback detalhado de progresso.
 */

export type OCRRuntime = 'web' | 'capacitor-ios' | 'capacitor-android' | 'node';
export type OCRMode = 'native-only' | 'local' | 'remote-consent';

export type OCRErrorCode =
  | 'OCR_MODEL_NOT_FOUND'
  | 'OCR_WORKER_LOAD_FAILED'
  | 'OCR_LANGUAGE_DATA_UNAVAILABLE'
  | 'OCR_RUNTIME_UNSUPPORTED'
  | 'OCR_CANCELLED'
  | 'OCR_PROCESSING_FAILED';

export class LocalOCRError extends Error {
  constructor(
    public readonly code: OCRErrorCode,
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'LocalOCRError';
  }
}

export interface OCRTextBlock {
  text: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  confidence?: number;
}

export interface OCRImageRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  type?: 'table' | 'figure' | 'ecg' | 'other';
}

export interface OCRPageResult {
  pageNumber: number;
  text: string;
  confidence?: number;
  blocks?: OCRTextBlock[];
  imageRegions?: OCRImageRegion[];
}

export interface ProcessPDFOCROptions {
  maxPages?: number;
  startPage?: number;
  scale?: number;
  language?: string;
  fallbackLanguage?: string;
  onProgress?: (info: { page: number; total: number; progressPct: number; stage?: string }) => void;
  signal?: AbortSignal;
}

export interface LocalOCRAdapter {
  readonly runtime: OCRRuntime;
  isAvailable(): Promise<boolean>;
  processImage(input: unknown, pageNumber?: number, signal?: AbortSignal): Promise<OCRPageResult>;
  processPDF(input: unknown, options?: ProcessPDFOCROptions): Promise<OCRPageResult[]>;
  terminate(): Promise<void>;
}

/**
 * Converte qualquer entrada binária compatível para ArrayBuffer.
 */
export async function toArrayBuffer(input: unknown): Promise<ArrayBuffer> {
  if (input instanceof ArrayBuffer) return input;
  if (input instanceof Uint8Array) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
  }
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return await input.arrayBuffer();
  }
  if (typeof Buffer !== 'undefined' && (input as any)?.buffer instanceof ArrayBuffer) {
    const buf = input as any;
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      const base64 = input.split(',')[1];
      const binary = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
  }
  throw new LocalOCRError(
    'OCR_PROCESSING_FAILED',
    'Formato de entrada não suportado para conversão em ArrayBuffer.'
  );
}

/**
 * Detecta a plataforma e runtime de execução atual.
 */
export function detectOCRRuntime(): OCRRuntime {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const cap = (window as any).Capacitor;
      if (cap?.isNativePlatform?.()) {
        const platform = cap.getPlatform?.();
        if (platform === 'ios') return 'capacitor-ios';
        if (platform === 'android') return 'capacitor-android';
      }
    } catch {}
    return 'web';
  }
  return 'node';
}

/**
 * Formata os resultados de linhas do Tesseract para OCRPageResult.
 */
function formatTesseractResult(ret: any, pageNumber: number): OCRPageResult {
  const text = ret?.data?.text || '';
  const confidence = typeof ret?.data?.confidence === 'number' ? ret.data.confidence : undefined;

  const blocks: OCRTextBlock[] = (ret?.data?.lines || []).map((line: any) => ({
    text: line.text?.trim() || '',
    x: line.bbox?.x0,
    y: line.bbox?.y0,
    width: line.bbox ? line.bbox.x1 - line.bbox.x0 : undefined,
    height: line.bbox ? line.bbox.y1 - line.bbox.y0 : undefined,
    confidence: line.confidence,
  })).filter((b: OCRTextBlock) => b.text.length > 0);

  return {
    pageNumber,
    text: text.trim(),
    confidence,
    blocks,
  };
}

/**
 * ADAPTADOR 1: BrowserLocalOCRAdapter (Navegador Web)
 */
export class BrowserLocalOCRAdapter implements LocalOCRAdapter {
  public readonly runtime: OCRRuntime = 'web';
  private worker: any = null;
  private isInitializing = false;

  private async getWorker(lang = 'por', fallbackLang = 'eng'): Promise<any> {
    if (this.worker) return this.worker;

    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (this.worker) return this.worker;
    }

    this.isInitializing = true;
    try {
      const { createWorker } = await import('tesseract.js');
      this.worker = await createWorker(lang, 1, {
        cacheMethod: 'indexedDB',
        logger: () => {},
      });
      return this.worker;
    } catch (err: any) {
      console.warn(`[BrowserLocalOCRAdapter] Falha ao carregar idioma ${lang}, tentando fallback ${fallbackLang}:`, err);
      try {
        const { createWorker } = await import('tesseract.js');
        this.worker = await createWorker(fallbackLang, 1, {
          cacheMethod: 'indexedDB',
          logger: () => {},
        });
        return this.worker;
      } catch (fallbackErr: any) {
        throw new LocalOCRError(
          'OCR_WORKER_LOAD_FAILED',
          `Falha ao inicializar worker Tesseract no navegador: ${fallbackErr.message || fallbackErr}`,
          fallbackErr
        );
      }
    } finally {
      this.isInitializing = false;
    }
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const worker = await this.getWorker();
      return !!worker;
    } catch {
      return false;
    }
  }

  public async processImage(
    input: unknown,
    pageNumber = 1,
    signal?: AbortSignal
  ): Promise<OCRPageResult> {
    if (signal?.aborted) {
      throw new LocalOCRError('OCR_CANCELLED', 'OCR cancelado pelo usuário.');
    }

    const worker = await this.getWorker();
    const ret = await worker.recognize(input);

    if (signal?.aborted) {
      throw new LocalOCRError('OCR_CANCELLED', 'OCR cancelado pelo usuário.');
    }

    return formatTesseractResult(ret, pageNumber);
  }

  public async processPDF(
    input: unknown,
    options: ProcessPDFOCROptions = {}
  ): Promise<OCRPageResult[]> {
    const scale = options.scale || 1.5;
    let pdf: any;

    if (input && typeof (input as any).getPage === 'function') {
      pdf = input;
    } else {
      const buffer = await toArrayBuffer(input);
      const pdfjsLib = await import('pdfjs-dist');
      // @ts-ignore
      const pdfjsWorkerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
      pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
    }

    const totalPages = pdf.numPages || 1;
    const startPage = Math.max(1, options.startPage || 1);
    const maxPages = Math.min(totalPages, options.maxPages || totalPages);
    const results: OCRPageResult[] = [];

    for (let p = startPage; p <= maxPages; p++) {
      if (options.signal?.aborted) {
        throw new LocalOCRError('OCR_CANCELLED', 'OCR cancelado pelo usuário.');
      }

      let pageResult: OCRPageResult = { pageNumber: p, text: '', blocks: [] };
      let page: any = null;

      try {
        page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale });
        let canvas: any = null;
        let ctx: any = null;

        if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
          canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          ctx = canvas.getContext('2d');
        } else {
          const { createCanvas } = await import('@napi-rs/canvas');
          canvas = createCanvas(viewport.width, viewport.height);
          ctx = canvas.getContext('2d');
        }

        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          const inputForProcess = typeof canvas.toBuffer === 'function' ? canvas.toBuffer('image/png') : canvas;
          pageResult = await this.processImage(inputForProcess, p, options.signal);
        }

        // Limpeza imediata de memória
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
      } catch (err: any) {
        if (options.signal?.aborted) throw err;
        console.warn(`[BrowserLocalOCRAdapter] Falha na página ${p}:`, err);
      } finally {
        if (page?.cleanup) {
          page.cleanup();
        }
      }

      results.push(pageResult);

      if (options.onProgress) {
        const processedCount = p - startPage + 1;
        const totalToProcess = maxPages - startPage + 1;
        const progressPct = Math.round((processedCount / totalToProcess) * 100);
        options.onProgress({
          page: p,
          total: maxPages,
          progressPct,
          stage: `Processando OCR página ${p} de ${maxPages} (${progressPct}%)...`,
        });
      }
    }

    return results;
  }

  public async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {}
      this.worker = null;
    }
  }
}

/**
 * ADAPTADOR 2: CapacitorLocalOCRAdapter (iOS / Android no WebView)
 */
export class CapacitorLocalOCRAdapter implements LocalOCRAdapter {
  public readonly runtime: OCRRuntime;
  private worker: any = null;
  private isInitializing = false;

  constructor(runtime: OCRRuntime = 'capacitor-ios') {
    this.runtime = runtime;
  }

  private async getWorker(lang = 'por', fallbackLang = 'eng'): Promise<any> {
    if (this.worker) return this.worker;

    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (this.worker) return this.worker;
    }

    this.isInitializing = true;
    try {
      const { createWorker } = await import('tesseract.js');
      // No WKWebView do iOS, IndexedDB armazena o modelo treinado localmente
      this.worker = await createWorker(lang, 1, {
        cacheMethod: 'indexedDB',
        logger: () => {},
      });
      return this.worker;
    } catch (err: any) {
      console.warn(`[CapacitorLocalOCRAdapter] Falha ao inicializar idioma ${lang}:`, err);
      try {
        const { createWorker } = await import('tesseract.js');
        this.worker = await createWorker(fallbackLang, 1, {
          cacheMethod: 'indexedDB',
          logger: () => {},
        });
        return this.worker;
      } catch (fallbackErr: any) {
        throw new LocalOCRError(
          'OCR_WORKER_LOAD_FAILED',
          `Falha ao inicializar Tesseract no dispositivo nativo (${this.runtime}): ${fallbackErr.message || fallbackErr}`,
          fallbackErr
        );
      }
    } finally {
      this.isInitializing = false;
    }
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const worker = await this.getWorker();
      return !!worker;
    } catch {
      return false;
    }
  }

  public async processImage(
    input: unknown,
    pageNumber = 1,
    signal?: AbortSignal
  ): Promise<OCRPageResult> {
    if (signal?.aborted) {
      throw new LocalOCRError('OCR_CANCELLED', 'OCR cancelado pelo usuário.');
    }

    const worker = await this.getWorker();
    const ret = await worker.recognize(input);

    if (signal?.aborted) {
      throw new LocalOCRError('OCR_CANCELLED', 'OCR cancelado pelo usuário.');
    }

    return formatTesseractResult(ret, pageNumber);
  }

  public async processPDF(
    input: unknown,
    options: ProcessPDFOCROptions = {}
  ): Promise<OCRPageResult[]> {
    const scale = options.scale || 1.5;
    let pdf: any;

    if (input && typeof (input as any).getPage === 'function') {
      pdf = input;
    } else {
      const buffer = await toArrayBuffer(input);
      const pdfjsLib = await import('pdfjs-dist');
      // @ts-ignore
      const pdfjsWorkerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
      pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
    }

    const totalPages = pdf.numPages || 1;
    const startPage = Math.max(1, options.startPage || 1);
    const maxPages = Math.min(totalPages, options.maxPages || totalPages);
    const results: OCRPageResult[] = [];

    for (let p = startPage; p <= maxPages; p++) {
      if (options.signal?.aborted) {
        throw new LocalOCRError('OCR_CANCELLED', 'OCR cancelado pelo usuário.');
      }

      let pageResult: OCRPageResult = { pageNumber: p, text: '', blocks: [] };
      let page: any = null;

      try {
        page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale });
        let canvas: any = null;
        let ctx: any = null;

        if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
          canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          ctx = canvas.getContext('2d');
        } else {
          const { createCanvas } = await import('@napi-rs/canvas');
          canvas = createCanvas(viewport.width, viewport.height);
          ctx = canvas.getContext('2d');
        }

        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          const inputForProcess = typeof canvas.toBuffer === 'function' ? canvas.toBuffer('image/png') : canvas;
          pageResult = await this.processImage(inputForProcess, p, options.signal);
        }

        // Liberação agressiva de memória no iOS (evita Jetsam memory kill no WKWebView)
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
      } catch (err: any) {
        if (options.signal?.aborted) throw err;
        console.warn(`[CapacitorLocalOCRAdapter] Falha na página ${p}:`, err);
      } finally {
        if (page?.cleanup) {
          page.cleanup();
        }
      }

      results.push(pageResult);

      if (options.onProgress) {
        const processedCount = p - startPage + 1;
        const totalToProcess = maxPages - startPage + 1;
        const progressPct = Math.round((processedCount / totalToProcess) * 100);
        options.onProgress({
          page: p,
          total: maxPages,
          progressPct,
          stage: `Processando OCR página ${p} de ${maxPages} (${progressPct}%)...`,
        });
      }
    }

    return results;
  }

  public async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {}
      this.worker = null;
    }
  }
}

/**
 * ADAPTADOR 3: NodeLocalOCRAdapter (Node.js com CanvasFactory real)
 */
export class NodeLocalOCRAdapter implements LocalOCRAdapter {
  public readonly runtime: OCRRuntime = 'node';
  private worker: any = null;
  private isInitializing = false;

  private async getCanvasFactory(): Promise<any> {
    try {
      const canvasModule = await import('@napi-rs/canvas');
      if (typeof canvasModule.createCanvas === 'function') {
        return canvasModule;
      }
      throw new Error('createCanvas não disponível no módulo @napi-rs/canvas.');
    } catch (err: any) {
      throw new LocalOCRError(
        'OCR_RUNTIME_UNSUPPORTED',
        'Ambiente Node sem suporte a canvas para rasterização de páginas PDF (@napi-rs/canvas indisponível).',
        err
      );
    }
  }

  private async getWorker(lang = 'por', fallbackLang = 'eng'): Promise<any> {
    if (this.worker) return this.worker;

    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (this.worker) return this.worker;
    }

    this.isInitializing = true;
    try {
      const { createWorker } = await import('tesseract.js');
      this.worker = await createWorker(lang, 1, {
        logger: () => {},
      });
      return this.worker;
    } catch (err: any) {
      console.warn(`[NodeLocalOCRAdapter] Falha ao carregar idioma ${lang}, tentando fallback ${fallbackLang}:`, err);
      try {
        const { createWorker } = await import('tesseract.js');
        this.worker = await createWorker(fallbackLang, 1, {
          logger: () => {},
        });
        return this.worker;
      } catch (fallbackErr: any) {
        throw new LocalOCRError(
          'OCR_WORKER_LOAD_FAILED',
          `Falha ao inicializar worker Tesseract em Node.js: ${fallbackErr.message || fallbackErr}`,
          fallbackErr
        );
      }
    } finally {
      this.isInitializing = false;
    }
  }

  public async isAvailable(): Promise<boolean> {
    try {
      await this.getCanvasFactory();
      const worker = await this.getWorker();
      return !!worker;
    } catch {
      return false;
    }
  }

  public async processImage(
    input: unknown,
    pageNumber = 1,
    signal?: AbortSignal
  ): Promise<OCRPageResult> {
    if (signal?.aborted) {
      throw new LocalOCRError('OCR_CANCELLED', 'OCR cancelado pelo usuário.');
    }

    const worker = await this.getWorker();
    const ret = await worker.recognize(input);

    if (signal?.aborted) {
      throw new LocalOCRError('OCR_CANCELLED', 'OCR cancelado pelo usuário.');
    }

    return formatTesseractResult(ret, pageNumber);
  }

  public async processPDF(
    input: unknown,
    options: ProcessPDFOCROptions = {}
  ): Promise<OCRPageResult[]> {
    const scale = options.scale || 1.5;
    const { createCanvas } = await this.getCanvasFactory();

    let pdf: any;
    if (input && typeof (input as any).getPage === 'function') {
      pdf = input;
    } else {
      const buffer = await toArrayBuffer(input);
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    }

    const totalPages = pdf.numPages || 1;
    const startPage = Math.max(1, options.startPage || 1);
    const maxPages = Math.min(totalPages, options.maxPages || totalPages);
    const results: OCRPageResult[] = [];

    for (let p = startPage; p <= maxPages; p++) {
      if (options.signal?.aborted) {
        throw new LocalOCRError('OCR_CANCELLED', 'OCR cancelado pelo usuário.');
      }

      let pageResult: OCRPageResult = { pageNumber: p, text: '', blocks: [] };
      let page: any = null;

      try {
        page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(viewport.width, viewport.height);
        const canvasContext = canvas.getContext('2d');

        if (canvasContext) {
          await page.render({ canvasContext, viewport }).promise;
          const imageBuffer = canvas.toBuffer('image/png');
          pageResult = await this.processImage(imageBuffer, p, options.signal);
        }
      } catch (err: any) {
        if (options.signal?.aborted) throw err;
        console.warn(`[NodeLocalOCRAdapter] Falha na página ${p}:`, err);
      } finally {
        if (page?.cleanup) {
          page.cleanup();
        }
      }

      results.push(pageResult);

      if (options.onProgress) {
        const processedCount = p - startPage + 1;
        const totalToProcess = maxPages - startPage + 1;
        const progressPct = Math.round((processedCount / totalToProcess) * 100);
        options.onProgress({
          page: p,
          total: maxPages,
          progressPct,
          stage: `Processando OCR página ${p} de ${maxPages} (${progressPct}%)...`,
        });
      }
    }

    return results;
  }

  public async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {}
      this.worker = null;
    }
  }
}

/**
 * SERVIÇO PRINCIPAL: LocalOCRService (Fachada / Seletor de Adaptador)
 */
export class LocalOCRService implements LocalOCRAdapter {
  private activeAdapter: LocalOCRAdapter | null = null;

  public get runtime(): OCRRuntime {
    return detectOCRRuntime();
  }

  /**
   * Obtém ou inicializa o adaptador específico para a plataforma atual.
   */
  public getAdapter(): LocalOCRAdapter {
    if (this.activeAdapter && this.activeAdapter.runtime === this.runtime) {
      return this.activeAdapter;
    }

    const currentRuntime = this.runtime;
    switch (currentRuntime) {
      case 'capacitor-ios':
      case 'capacitor-android':
        this.activeAdapter = new CapacitorLocalOCRAdapter(currentRuntime);
        break;
      case 'web':
        this.activeAdapter = new BrowserLocalOCRAdapter();
        break;
      case 'node':
      default:
        this.activeAdapter = new NodeLocalOCRAdapter();
        break;
    }

    return this.activeAdapter;
  }

  /**
   * Define um adaptador customizado (útil para injeção de dependência e testes unitários).
   */
  public setAdapter(adapter: LocalOCRAdapter): void {
    this.activeAdapter = adapter;
  }

  public async isAvailable(): Promise<boolean> {
    return await this.getAdapter().isAvailable();
  }

  public async processImage(
    input: unknown,
    pageNumber = 1,
    signal?: AbortSignal
  ): Promise<OCRPageResult> {
    return await this.getAdapter().processImage(input, pageNumber, signal);
  }

  public async processPDF(
    input: unknown,
    options: ProcessPDFOCROptions = {}
  ): Promise<OCRPageResult[]> {
    return await this.getAdapter().processPDF(input, options);
  }

  public async terminate(): Promise<void> {
    if (this.activeAdapter) {
      await this.activeAdapter.terminate();
      this.activeAdapter = null;
    }
  }
}

export const localOCRService = new LocalOCRService();
