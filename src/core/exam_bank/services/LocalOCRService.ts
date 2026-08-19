/**
 * LocalOCRService
 *
 * Motor de OCR 100% local baseado em Tesseract.js com lazy-loading e suporte a WASM.
 * Executa no cliente (navegador/mobile) ou Node sem consumir tokens de IA e sem envio para nuvem.
 */

export type OCRMode = 'native-only' | 'local' | 'remote-consent';

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
  onProgress?: (info: { page: number; total: number; progressPct: number }) => void;
  signal?: AbortSignal;
}

export class LocalOCRService {
  private worker: any = null;
  private isInitializing = false;

  /**
   * Inicializa o worker do Tesseract de forma lazy com idioma Português (por).
   */
  public async getWorker(): Promise<any> {
    if (this.worker) return this.worker;

    if (this.isInitializing) {
      // Aguarda inicialização em andamento
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (this.worker) return this.worker;
    }

    this.isInitializing = true;
    try {
      const { createWorker } = await import('tesseract.js');
      // Inicializa com Português ('por')
      this.worker = await createWorker('por', 1, {
        logger: () => {},
      });
      return this.worker;
    } catch (err) {
      console.warn('[LocalOCRService] Falha ao inicializar worker Tesseract em português:', err);
      // Fallback para inglês se modelo português não estiver disponível
      try {
        const { createWorker } = await import('tesseract.js');
        this.worker = await createWorker('eng', 1, {
          logger: () => {},
        });
        return this.worker;
      } catch (engErr) {
        console.error('[LocalOCRService] Falha total ao carregar Tesseract.js:', engErr);
        throw new Error('OCR Local indisponível no ambiente atual.');
      }
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Verifica se o OCR local está disponível no ambiente.
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const worker = await this.getWorker();
      return !!worker;
    } catch {
      return false;
    }
  }

  /**
   * Executa OCR em uma única imagem / canvas / buffer de página.
   */
  public async processImage(
    imageInput: any,
    pageNumber = 1,
    signal?: AbortSignal
  ): Promise<OCRPageResult> {
    if (signal?.aborted) {
      throw new Error('OCR cancelado pelo usuário.');
    }

    const worker = await this.getWorker();

    const ret = await worker.recognize(imageInput);

    if (signal?.aborted) {
      throw new Error('OCR cancelado pelo usuário.');
    }

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
   * Processa um documento PDF página por página via pdfjs + canvas + OCR local.
   * Libera a memória de cada página imediatamente (page.cleanup() + canvas dispose).
   */
  public async processPDF(
    pdf: any,
    options: ProcessPDFOCROptions = {}
  ): Promise<OCRPageResult[]> {
    const totalPages = pdf.numPages || 1;
    const startPage = Math.max(1, options.startPage || 1);
    const maxPages = Math.min(totalPages, options.maxPages || totalPages);
    const scale = options.scale || 1.5; // Resolução balanceada (~150-200 DPI) para evitar OOM
    const results: OCRPageResult[] = [];

    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

    for (let p = startPage; p <= maxPages; p++) {
      if (options.signal?.aborted) {
        throw new Error('OCR cancelado pelo usuário.');
      }

      let pageResult: OCRPageResult = {
        pageNumber: p,
        text: '',
        blocks: [],
      };

      try {
        const page = await pdf.getPage(p);

        if (isBrowser) {
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');

          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
            pageResult = await this.processImage(canvas, p, options.signal);
            // Libera o canvas
            canvas.width = 0;
            canvas.height = 0;
          }
        } else {
          // Ambiente Node / Testes sem DOM nativo: tenta extrair texto nativo ou usar mock
          const content = await page.getTextContent();
          const rawStr = content.items.map((it: any) => it.str).join(' ').trim();
          pageResult = {
            pageNumber: p,
            text: rawStr,
            blocks: content.items.map((it: any) => ({ text: it.str })),
          };
        }

        page.cleanup(); // CRÍTICO: Libera recursos da página do pdfjs
      } catch (err: any) {
        if (options.signal?.aborted) throw err;
        console.warn(`[LocalOCRService] Falha ao processar página ${p} com OCR:`, err);
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
        });
      }
    }

    return results;
  }

  /**
   * Finaliza o worker e libera memória.
   */
  public async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {}
      this.worker = null;
    }
  }
}

export const localOCRService = new LocalOCRService();
