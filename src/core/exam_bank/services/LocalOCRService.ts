/**
 * LocalOCRService
 *
 * Motor de OCR 100% local com adaptadores dedicados por plataforma:
 * 1. BrowserLocalOCRAdapter (Web / Chrome / Safari / Firefox)
 * 2. CapacitorLocalOCRAdapter (iOS / Android em WebView nativo)
 * 3. NodeLocalOCRAdapter (Servidor / Scripts / Testes em Node.js com CanvasFactory real)
 *
 * ⚠️ REQUISITOS ARQUITETURAIS:
 * - 100% local por padrão (zero chamadas a LLMs e zero consumo de tokens).
 * - No Node, renderiza páginas reais via CanvasFactory e executa Tesseract de verdade.
 * - No iOS/Capacitor, renderiza via HTMLCanvasElement no WKWebView e libera memória por página.
 * - Suporta cancelamento via AbortSignal e feedback detalhado de progresso.
 * - Preserva tokens, linhas visuais agrupadas por coordenadas Y/X e bounding boxes.
 */
import '../../../polyfills';

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

export interface OCRTextToken {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  lineId?: number;
  blockId?: number;
}

export interface OCRVisualLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tokens: OCRTextToken[];
  confidence?: number;
  pageNumber: number;
}

export interface OCRTextBlock {
  text: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  confidence?: number;
  tokens?: OCRTextToken[];
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
  lines?: OCRVisualLine[];
  tokens?: OCRTextToken[];
  imageRegions?: OCRImageRegion[];
  failureReason?: string;
  isDownscaled?: boolean;
  renderedDimensions?: { width: number; height: number };
}

export const MAX_SAFE_MOBILE_CANVAS_PIXELS = 12_500_000; // ~12.5 MP limite seguro de pixels para WKWebView / Android WebView
export const MAX_SAFE_MOBILE_CANVAS_DIMENSION = 4096; // 4096px limite por eixo

/**
 * Retorna as opções de caminhos de arquivos locais do Tesseract (100% offline, zero dependência de CDN em runtime).
 */
export function getLocalTesseractOptions(runtime: OCRRuntime) {
  if (runtime === 'node') {
    const tesseractDir =
      typeof process !== 'undefined' && process.cwd
        ? `${process.cwd()}/public/tesseract`
        : './public/tesseract';
    return {
      langPath: tesseractDir,
      gzip: true,
      cacheMethod: 'none' as const,
    };
  }

  // Web e Capacitor (iOS / Android):
  // Em Capacitor/Web, os assets bundlados residem em /tesseract/
  let basePath = '/tesseract';
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    if (origin && origin !== 'null' && !origin.startsWith('file://')) {
      basePath = `${origin}/tesseract`;
    } else {
      basePath = './tesseract';
    }
  }

  return {
    workerPath: `${basePath}/worker.min.js`,
    corePath: basePath,
    langPath: basePath,
    gzip: true,
    cacheMethod: 'none' as const,
  };
}

/**
 * Calcula um viewport seguro para o canvas evitando estouro de memória em WebViews móveis.
 */
export function calculateSafeCanvasViewport(
  page: any,
  requestedScale = 2.0,
  runtime: OCRRuntime = 'web'
): { viewport: any; scale: number; isDownscaled: boolean } {
  const isMobile = runtime === 'capacitor-ios' || runtime === 'capacitor-android';
  const unscaled = page.getViewport({ scale: 1.0 });
  let effectiveScale = requestedScale;
  let isDownscaled = false;

  const targetWidth = unscaled.width * effectiveScale;
  const targetHeight = unscaled.height * effectiveScale;
  const targetPixels = targetWidth * targetHeight;

  const maxPixels = isMobile ? MAX_SAFE_MOBILE_CANVAS_PIXELS : 25_000_000;
  const maxDim = isMobile ? MAX_SAFE_MOBILE_CANVAS_DIMENSION : 8192;

  if (targetPixels > maxPixels || targetWidth > maxDim || targetHeight > maxDim) {
    const pixelScaleRatio = Math.sqrt(maxPixels / (unscaled.width * unscaled.height));
    const dimScaleRatio = Math.min(maxDim / unscaled.width, maxDim / unscaled.height);
    effectiveScale = Math.max(1.0, Math.min(pixelScaleRatio, dimScaleRatio, effectiveScale * 0.9));
    isDownscaled = true;
    console.warn(
      `[LocalOCRService] Reduzindo scale de ${requestedScale} para ${effectiveScale.toFixed(2)} para prevenir estouro de memória no canvas (dimensão original calculada: ${Math.round(targetWidth)}x${Math.round(targetHeight)}, ajustada: ${Math.round(unscaled.width * effectiveScale)}x${Math.round(unscaled.height * effectiveScale)}).`
    );
  }

  const viewport = page.getViewport({ scale: effectiveScale });
  return { viewport, scale: effectiveScale, isDownscaled };
}

export interface ProcessPDFOCROptions {
  maxPages?: number;
  startPage?: number;
  scale?: number;
  language?: string;
  fallbackLanguage?: string;
  preprocessMode?: 'contrast' | 'binarize' | 'none';
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
 * Agrupa tokens de OCR espacialmente em linhas visuais ordenadas por Y e depois X.
 */
export function groupOCRTokensIntoVisualLines(
  tokens: OCRTextToken[],
  pageNumber = 1
): OCRVisualLine[] {
  if (!tokens || tokens.length === 0) return [];

  const validTokens = tokens.filter((t) => t.text && t.text.trim().length > 0);
  if (validTokens.length === 0) return [];

  // Ordena prioritariamente por Y do centro e secundariamente por X
  const sorted = [...validTokens].sort((a, b) => {
    const cyA = a.y + (a.height || 12) / 2;
    const cyB = b.y + (b.height || 12) / 2;
    if (Math.abs(cyA - cyB) <= 4) {
      return a.x - b.x;
    }
    return cyA - cyB;
  });

  const lineGroups: OCRTextToken[][] = [];

  for (const token of sorted) {
    const tTop = token.y;
    const tH = token.height || 12;
    const tBottom = token.y + tH;
    const tCenter = token.y + tH / 2;

    let bestGroup: OCRTextToken[] | null = null;
    let maxOverlap = 0;

    for (const group of lineGroups) {
      const gTop = Math.min(...group.map((t) => t.y));
      const gBottom = Math.max(...group.map((t) => t.y + (t.height || 12)));
      const gH = gBottom - gTop;
      const gCenter = gTop + gH / 2;

      const overlap = Math.min(tBottom, gBottom) - Math.max(tTop, gTop);
      const minH = Math.min(tH, gH);

      if (overlap > 0 && overlap / minH >= 0.35) {
        if (overlap > maxOverlap) {
          maxOverlap = overlap;
          bestGroup = group;
        }
      } else if (Math.abs(tCenter - gCenter) <= 6) {
        if (!bestGroup) bestGroup = group;
      }
    }

    if (bestGroup) {
      bestGroup.push(token);
    } else {
      lineGroups.push([token]);
    }
  }

  // Ordena grupos de cima para baixo
  lineGroups.sort((g1, g2) => {
    const avgY1 = g1.reduce((acc, t) => acc + (t.y + (t.height || 12) / 2), 0) / g1.length;
    const avgY2 = g2.reduce((acc, t) => acc + (t.y + (t.height || 12) / 2), 0) / g2.length;
    return avgY1 - avgY2;
  });

  const visualLines: OCRVisualLine[] = [];

  for (const group of lineGroups) {
    group.sort((a, b) => a.x - b.x);

    const minX = Math.min(...group.map((t) => t.x));
    const minY = Math.min(...group.map((t) => t.y));
    const maxX = Math.max(...group.map((t) => t.x + (t.width || 0)));
    const maxY = Math.max(...group.map((t) => t.y + (t.height || 0)));

    let lineText = '';
    for (let k = 0; k < group.length; k++) {
      const curr = group[k];
      if (k > 0) {
        const prev = group[k - 1];
        const gap = curr.x - (prev.x + (prev.width || 0));
        if (gap > 25) {
          lineText += '   ';
        } else {
          lineText += ' ';
        }
      }
      lineText += curr.text;
    }

    const confidences = group
      .map((t) => t.confidence)
      .filter((c): c is number => typeof c === 'number');
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : undefined;

    visualLines.push({
      text: lineText.trim(),
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      tokens: group,
      confidence: avgConfidence,
      pageNumber,
    });
  }

  return visualLines;
}

/**
 * Pré-processamento de imagem/canvas para otimização de OCR em documentos escaneados.
 */
export function preprocessCanvasForOCR(
  canvas: any,
  mode: 'contrast' | 'binarize' | 'none' = 'contrast'
): any {
  if (mode === 'none') return canvas;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;

      if (mode === 'binarize') {
        const val = gray > 155 ? 255 : 0;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      } else {
        // Realce de contraste
        const factor = 1.35;
        const contrasted = Math.min(255, Math.max(0, factor * (gray - 128) + 128));
        data[i] = contrasted;
        data[i + 1] = contrasted;
        data[i + 2] = contrasted;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  } catch {}
  return canvas;
}

/**
 * Formata os resultados do Tesseract preservando tokens espaciais, linhas e blocos.
 */
function formatTesseractResult(ret: any, pageNumber: number): OCRPageResult {
  const rawText = ret?.data?.text || '';
  const confidence = typeof ret?.data?.confidence === 'number' ? ret.data.confidence : undefined;

  const tokens: OCRTextToken[] = [];
  let tokenIdx = 0;

  if (Array.isArray(ret?.data?.words) && ret.data.words.length > 0) {
    for (const w of ret.data.words) {
      const tText = w.text?.trim() || '';
      if (tText) {
        tokens.push({
          text: tText,
          x: w.bbox?.x0 || 0,
          y: w.bbox?.y0 || 0,
          width: w.bbox ? w.bbox.x1 - w.bbox.x0 : 0,
          height: w.bbox ? w.bbox.y1 - w.bbox.y0 : 0,
          confidence: w.confidence,
          lineId: tokenIdx++,
        });
      }
    }
  } else if (Array.isArray(ret?.data?.blocks)) {
    for (const block of ret.data.blocks) {
      for (const para of (block.paragraphs || [])) {
        for (const line of (para.lines || [])) {
          for (const w of (line.words || [])) {
            const tText = w.text?.trim() || '';
            if (tText) {
              tokens.push({
                text: tText,
                x: w.bbox?.x0 || 0,
                y: w.bbox?.y0 || 0,
                width: w.bbox ? w.bbox.x1 - w.bbox.x0 : 0,
                height: w.bbox ? w.bbox.y1 - w.bbox.y0 : 0,
                confidence: w.confidence,
                lineId: tokenIdx++,
              });
            }
          }
        }
      }
    }
  }

  const visualLines = groupOCRTokensIntoVisualLines(tokens, pageNumber);

  const blocks: OCRTextBlock[] = (ret?.data?.blocks || []).map((block: any) => ({
    text: block.text?.trim() || '',
    x: block.bbox?.x0,
    y: block.bbox?.y0,
    width: block.bbox ? block.bbox.x1 - block.bbox.x0 : undefined,
    height: block.bbox ? block.bbox.y1 - block.bbox.y0 : undefined,
    confidence: block.confidence,
  })).filter((b: OCRTextBlock) => b.text.length > 0);

  // Se visualLines reconstruídas existirem, usa a ordenação espacial limpa
  const formattedText =
    visualLines.length > 0 ? visualLines.map((l) => l.text).join('\n') : rawText.trim();

  return {
    pageNumber,
    text: formattedText,
    confidence,
    blocks:
      blocks.length > 0
        ? blocks
        : visualLines.map((l) => ({
            text: l.text,
            x: l.x,
            y: l.y,
            width: l.width,
            height: l.height,
            confidence: l.confidence,
          })),
    lines: visualLines,
    tokens,
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
      const localOpts = getLocalTesseractOptions('web');
      this.worker = await createWorker(lang, 1, {
        ...localOpts,
        logger: () => {},
      });
      return this.worker;
    } catch (err: any) {
      console.warn(`[BrowserLocalOCRAdapter] Falha ao carregar idioma ${lang}, tentando fallback ${fallbackLang}:`, err);
      try {
        const { createWorker } = await import('tesseract.js');
        const localOpts = getLocalTesseractOptions('web');
        this.worker = await createWorker(fallbackLang, 1, {
          ...localOpts,
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
    const ret = await worker.recognize(input, {}, { blocks: true, text: true });

    if (signal?.aborted) {
      throw new LocalOCRError('OCR_CANCELLED', 'OCR cancelado pelo usuário.');
    }

    return formatTesseractResult(ret, pageNumber);
  }

  public async processPDF(
    input: unknown,
    options: ProcessPDFOCROptions = {}
  ): Promise<OCRPageResult[]> {
    const scale = options.scale || 2.0;
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
        const { viewport, isDownscaled } = calculateSafeCanvasViewport(page, scale, 'web');
        let canvas: any = null;
        let ctx: any = null;

        if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
          canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          ctx = canvas.getContext('2d');
        } else {
          const { createCanvas } = await import('@napi-rs/canvas');
          canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
          ctx = canvas.getContext('2d');
        }

        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          preprocessCanvasForOCR(canvas, options.preprocessMode || 'contrast');
          const inputForProcess = typeof canvas.toBuffer === 'function' ? canvas.toBuffer('image/png') : canvas;
          pageResult = await this.processImage(inputForProcess, p, options.signal);
          pageResult.isDownscaled = isDownscaled;
          pageResult.renderedDimensions = {
            width: Math.round(viewport.width),
            height: Math.round(viewport.height),
          };
        } else {
          const errMsg = `Falha ao criar contexto 2D de canvas para renderizar a página ${p} (dimensões: ${Math.round(viewport.width)}x${Math.round(viewport.height)}) — possível limite de memória do navegador.`;
          console.error(`[BrowserLocalOCRAdapter] ${errMsg}`);
          pageResult.failureReason = errMsg;
          throw new LocalOCRError('OCR_PROCESSING_FAILED', errMsg);
        }

        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
      } catch (err: any) {
        if (options.signal?.aborted) throw err;
        console.warn(`[BrowserLocalOCRAdapter] Falha na página ${p}:`, err);
        if (!pageResult.failureReason) {
          pageResult.failureReason = err?.message || `Erro ao processar página ${p}`;
        }
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
      const localOpts = getLocalTesseractOptions(this.runtime);
      this.worker = await createWorker(lang, 1, {
        ...localOpts,
        logger: () => {},
      });
      return this.worker;
    } catch (err: any) {
      console.warn(`[CapacitorLocalOCRAdapter] Falha ao inicializar idioma ${lang}:`, err);
      try {
        const { createWorker } = await import('tesseract.js');
        const localOpts = getLocalTesseractOptions(this.runtime);
        this.worker = await createWorker(fallbackLang, 1, {
          ...localOpts,
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
    const ret = await worker.recognize(input, {}, { blocks: true, text: true });

    if (signal?.aborted) {
      throw new LocalOCRError('OCR_CANCELLED', 'OCR cancelado pelo usuário.');
    }

    return formatTesseractResult(ret, pageNumber);
  }

  public async processPDF(
    input: unknown,
    options: ProcessPDFOCROptions = {}
  ): Promise<OCRPageResult[]> {
    const scale = options.scale || 2.0;
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
        const { viewport, isDownscaled } = calculateSafeCanvasViewport(page, scale, this.runtime);
        let canvas: any = null;
        let ctx: any = null;

        if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
          canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          ctx = canvas.getContext('2d');
        } else {
          const { createCanvas } = await import('@napi-rs/canvas');
          canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
          ctx = canvas.getContext('2d');
        }

        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          preprocessCanvasForOCR(canvas, options.preprocessMode || 'contrast');
          const inputForProcess = typeof canvas.toBuffer === 'function' ? canvas.toBuffer('image/png') : canvas;
          pageResult = await this.processImage(inputForProcess, p, options.signal);
          pageResult.isDownscaled = isDownscaled;
          pageResult.renderedDimensions = {
            width: Math.round(viewport.width),
            height: Math.round(viewport.height),
          };
        } else {
          const errMsg = `Falha ao criar contexto 2D de canvas para renderizar a página ${p} (dimensões: ${Math.round(viewport.width)}x${Math.round(viewport.height)}) — possível limite de memória do dispositivo.`;
          console.error(`[CapacitorLocalOCRAdapter] ${errMsg}`);
          pageResult.failureReason = errMsg;
          throw new LocalOCRError('OCR_PROCESSING_FAILED', errMsg);
        }

        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
      } catch (err: any) {
        if (options.signal?.aborted) throw err;
        console.warn(`[CapacitorLocalOCRAdapter] Falha na página ${p}:`, err);
        if (!pageResult.failureReason) {
          pageResult.failureReason = err?.message || `Erro ao processar página ${p}`;
        }
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
      const localOpts = getLocalTesseractOptions('node');
      this.worker = await createWorker(lang, 1, {
        ...localOpts,
        logger: () => {},
      });
      return this.worker;
    } catch (err: any) {
      console.warn(`[NodeLocalOCRAdapter] Falha ao carregar idioma ${lang}, tentando fallback ${fallbackLang}:`, err);
      try {
        const { createWorker } = await import('tesseract.js');
        const localOpts = getLocalTesseractOptions('node');
        this.worker = await createWorker(fallbackLang, 1, {
          ...localOpts,
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
    const ret = await worker.recognize(input, {}, { blocks: true, text: true });

    if (signal?.aborted) {
      throw new LocalOCRError('OCR_CANCELLED', 'OCR cancelado pelo usuário.');
    }

    return formatTesseractResult(ret, pageNumber);
  }

  public async processPDF(
    input: unknown,
    options: ProcessPDFOCROptions = {}
  ): Promise<OCRPageResult[]> {
    const scale = options.scale || 2.0;
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
        const { viewport, isDownscaled } = calculateSafeCanvasViewport(page, scale, 'node');
        const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
        const canvasContext = canvas.getContext('2d');

        if (canvasContext) {
          await page.render({ canvasContext, viewport }).promise;
          preprocessCanvasForOCR(canvas, options.preprocessMode || 'contrast');
          const imageBuffer = canvas.toBuffer('image/png');
          pageResult = await this.processImage(imageBuffer, p, options.signal);
          pageResult.isDownscaled = isDownscaled;
          pageResult.renderedDimensions = {
            width: Math.round(viewport.width),
            height: Math.round(viewport.height),
          };
        } else {
          const errMsg = `Falha ao criar contexto 2D de canvas em Node.js para a página ${p}.`;
          console.error(`[NodeLocalOCRAdapter] ${errMsg}`);
          pageResult.failureReason = errMsg;
          throw new LocalOCRError('OCR_PROCESSING_FAILED', errMsg);
        }
      } catch (err: any) {
        if (options.signal?.aborted) throw err;
        console.warn(`[NodeLocalOCRAdapter] Falha na página ${p}:`, err);
        if (!pageResult.failureReason) {
          pageResult.failureReason = err?.message || `Erro ao processar página ${p}`;
        }
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
