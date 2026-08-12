import { mapWithConcurrency } from '../../core/utils/asyncUtils';
import { apiUrl } from '../../lib/apiBaseUrl';

export class OCRService {
  public async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1] || result;
        resolve(base64Data);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  public async performOCR(file: File, onProgress?: (percent: number) => void): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isPdf = ext === 'pdf' || file.type === 'application/pdf';

    // If file is a PDF and browser environment is supported, check page count for multi-page block splitting
    if (isPdf && typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        // @ts-ignore
        const pdfjsWorkerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;

        const PDF_SPLIT_THRESHOLD = 15;
        const PAGES_PER_BLOCK = 10;

        if (totalPages > PDF_SPLIT_THRESHOLD) {
          const blocks: { startPage: number; endPage: number }[] = [];
          for (let p = 1; p <= totalPages; p += PAGES_PER_BLOCK) {
            blocks.push({
              startPage: p,
              endPage: Math.min(p + PAGES_PER_BLOCK - 1, totalPages),
            });
          }

          let completedCount = 0;
          const OCR_CONCURRENCY = 3;

          const blockTexts = await mapWithConcurrency(blocks, OCR_CONCURRENCY, async (block, bIdx) => {
            const blockBase64 = await this.renderPdfBlockToBase64(pdf, block.startPage, block.endPage);
            if (!blockBase64) return '';

            const response = await fetch(apiUrl('/api/ocr'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: blockBase64, mimeType: 'image/png' }),
            });

            completedCount++;
            if (onProgress) {
              const progressPct = 30 + Math.round((completedCount / blocks.length) * 70);
              onProgress(Math.min(100, progressPct));
            }

            if (!response.ok) {
              console.warn(`[OCRService] OCR block ${bIdx + 1}/${blocks.length} failed.`);
              return '';
            }

            const data = await response.json();
            return data.text || '';
          });

          return blockTexts.filter(Boolean).join('\n\n');
        }
      } catch (pdfErr) {
        console.warn('[OCRService] PDF block splitting skipped/failed, using fallback single OCR call:', pdfErr);
      }
    }

    // Default single-call OCR for files under threshold or non-browser environments
    const base64 = await this.fileToBase64(file);
    const mimeType = file.type || 'image/png';

    const response = await fetch(apiUrl('/api/ocr'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Erro no processamento OCR com Gemini.');
    }

    const data = await response.json();
    return data.text || '';
  }

  private async renderPdfBlockToBase64(pdf: any, startPage: number, endPage: number): Promise<string> {
    try {
      const canvases: HTMLCanvasElement[] = [];
      let totalHeight = 0;
      let maxWidth = 0;

      for (let p = startPage; p <= endPage; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          canvases.push(canvas);
          totalHeight += canvas.height;
          maxWidth = Math.max(maxWidth, canvas.width);
        }
      }

      if (canvases.length === 0) return '';

      const combinedCanvas = document.createElement('canvas');
      combinedCanvas.width = maxWidth;
      combinedCanvas.height = totalHeight;
      const combinedCtx = combinedCanvas.getContext('2d');

      if (combinedCtx) {
        let currentY = 0;
        for (const canvas of canvases) {
          combinedCtx.drawImage(canvas, 0, currentY);
          currentY += canvas.height;
        }
        const dataUrl = combinedCanvas.toDataURL('image/png');
        return dataUrl.split(',')[1] || dataUrl;
      }
    } catch (err) {
      console.warn('[OCRService] Failed rendering PDF block to canvas:', err);
    }
    return '';
  }
}
