import { IDocumentReader } from '../interfaces/IDocumentReader';
import { RawDocument } from '../models/RawDocument';
import { BinaryDocument } from '../models/BinaryDocument';
import { DocumentContent, DocumentFormat } from '../models/DocumentContent';
import { DocumentReadException } from '../exceptions/ImportEngineException';

export interface PDFLayoutItem {
  str: string;
  x: number;
  y: number;
  fontSize: number;
  pageNumber: number;
  width?: number;
  height?: number;
}

export interface PDFLayoutResult {
  items: PDFLayoutItem[];
  totalPages: number;
  rawText: string;
}

/**
 * DocumentReaderService
 *
 * Responsável por abrir documentos e extrair seu conteúdo bruto (raw).
 * Suporta os formatos: PDF, DOCX, TXT, EPUB, HTML, PPTX, Imagens.
 *
 * Regras:
 * - Não interpreta.
 * - Não separa capítulos.
 * - Não utiliza IA.
 * - Não gera embeddings.
 * - Retorna apenas conteúdo bruto sem tratamento.
 */
export class DocumentReaderService implements IDocumentReader {
  /**
   * Detecta o formato do documento com base na extensão ou MIME type.
   */
  public detectFormat(file: File | Blob): DocumentFormat {
    const fileName = (file as File).name || '';
    const mimeType = (file.type || '').toLowerCase();
    const ext = this.extractExtension(fileName).toLowerCase();

    if (mimeType.includes('pdf') || ext === 'pdf') {
      return 'pdf';
    }
    if (
      mimeType.includes('wordprocessingml') ||
      mimeType.includes('msword') ||
      ext === 'docx' ||
      ext === 'doc'
    ) {
      return 'docx';
    }
    if (
      mimeType.includes('presentationml') ||
      mimeType.includes('ms-powerpoint') ||
      ext === 'pptx' ||
      ext === 'ppt'
    ) {
      return 'pptx';
    }
    if (mimeType.includes('epub') || ext === 'epub') {
      return 'epub';
    }
    if (mimeType.includes('html') || ext === 'html' || ext === 'htm') {
      return 'html';
    }
    if (
      mimeType.startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
    ) {
      return 'image';
    }
    if (
      mimeType.includes('text') ||
      ['txt', 'md', 'json', 'csv', 'log', 'apkg'].includes(ext)
    ) {
      return 'txt';
    }

    return 'unknown';
  }

  /**
   * Leitura simplificada básica (string ou ArrayBuffer).
   */
  public async read(file: File | Blob): Promise<string | ArrayBuffer> {
    const format = this.detectFormat(file);
    if (format === 'txt' || format === 'html') {
      return this.readAsText(file);
    }
    return this.readAsArrayBuffer(file);
  }

  /**
   * Leitura estruturada retornando o RawDocument completo.
   */
  public async readRawDocument(file: File | Blob): Promise<RawDocument> {
    try {
      const fileName = (file as File).name || 'document';
      const fileSize = file.size;
      const mimeType = file.type || 'application/octet-stream';
      const format = this.detectFormat(file);

      const content = await this.readContent(file);

      return {
        id: this.generateUniqueId(),
        fileName,
        fileSize,
        mimeType,
        format,
        content,
        metadata: {
          extractedAt: new Date().toISOString(),
          formatDetected: format,
          isBinary: !!content.binaryData && !content.rawText,
        },
        createdAt: new Date().toISOString(),
      };
    } catch (error: any) {
      throw new DocumentReadException(
        `Falha na leitura do documento ${(file as File).name || ''}: ${error.message || error}`
      );
    }
  }

  /**
   * Leitura do documento como dados binários puros (BinaryDocument).
   */
  public async readBinaryDocument(file: File | Blob): Promise<BinaryDocument> {
    try {
      const fileName = (file as File).name || 'document';
      const fileSize = file.size;
      const mimeType = file.type || 'application/octet-stream';
      const format = this.detectFormat(file);

      const buffer = await this.readAsArrayBuffer(file);
      const base64 = this.arrayBufferToBase64(buffer);

      return {
        id: this.generateUniqueId(),
        fileName,
        fileSize,
        mimeType,
        format,
        buffer,
        base64,
        metadata: {
          readAt: new Date().toISOString(),
          byteLength: buffer.byteLength,
        },
        createdAt: new Date().toISOString(),
      };
    } catch (error: any) {
      throw new DocumentReadException(
        `Falha na leitura binária do documento: ${error.message || error}`
      );
    }
  }

  /**
   * Extrai o conteúdo bruto conforme o tipo de documento.
   */
  public async readContent(file: File | Blob, onProgress?: (progressPercent: number) => void): Promise<DocumentContent> {
    const format = this.detectFormat(file);

    switch (format) {
      case 'txt':
        return this.readTxt(file);
      case 'html':
        return this.readHtml(file);
      case 'pdf':
        return this.readPdf(file, onProgress);
      case 'docx':
        return this.readDocx(file);
      case 'pptx':
        return this.readPptx(file);
      case 'epub':
        return this.readEpub(file);
      case 'image':
        return this.readImage(file);
      default:
        return this.readGenericBinary(file);
    }
  }

  // --- LEITORES ESPECÍFICOS POR FORMATO ---

  /**
   * Leitor de TXT (Textos planos, Markdown, JSON, CSV)
   */
  private async readTxt(file: File | Blob): Promise<DocumentContent> {
    const rawText = await this.readAsText(file);
    return {
      rawText,
      format: 'txt',
      encoding: 'utf-8',
      charCount: rawText.length,
      byteLength: file.size,
    };
  }

  /**
   * Leitor de HTML (Markup bruto sem renderização)
   */
  private async readHtml(file: File | Blob): Promise<DocumentContent> {
    const rawText = await this.readAsText(file);
    return {
      rawText,
      format: 'html',
      encoding: 'utf-8',
      charCount: rawText.length,
      byteLength: file.size,
    };
  }

  /**
   * Leitor de PDF (pdfjs-dist com lazy loading, guarda de tamanho de 15MB e fallback para mobile)
   */
  private async readPdf(file: File | Blob, onProgress?: (progressPercent: number) => void): Promise<DocumentContent> {
    const buffer = await this.readAsArrayBuffer(file);

    // GUARDA DE MEMÓRIA: Se for maior que 15MB, usa o fallback de string crua para não travar a aba do mobile
    if (buffer.byteLength > 15 * 1024 * 1024) {
      const rawText = this.extractRawStringsFromBuffer(buffer);
      return {
        rawText: rawText || undefined,
        binaryData: buffer,
        format: 'pdf',
        charCount: rawText.length,
        byteLength: buffer.byteLength,
      };
    }

    try {
      let pdfjsLib: any;
      if (typeof window === 'undefined') {
        pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      } else {
        pdfjsLib = await import('pdfjs-dist');
        // @ts-ignore
        const pdfjsWorkerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
      }

      const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
      const maxPages = Math.min(pdf.numPages, 150);
      let rawText = '';

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        rawText += content.items.map((item: any) => item.str).join(' ') + '\n\n';
        page.cleanup(); // Libera a memória da página processada (CRÍTICO para mobile)
        if (onProgress && i % 5 === 0) {
          onProgress(Math.round((i / maxPages) * 100));
        }
      }

      if (!rawText.trim()) {
        rawText = this.extractRawStringsFromBuffer(buffer);
      }

      return {
        rawText: rawText || undefined,
        binaryData: buffer,
        format: 'pdf',
        charCount: rawText ? rawText.length : 0,
        byteLength: buffer.byteLength,
      };
    } catch (err) {
      console.warn('[DocumentReaderService] PDF parsing fallback triggered:', err);
      const rawText = this.extractRawStringsFromBuffer(buffer);
      return {
        rawText: rawText || undefined,
        binaryData: buffer,
        format: 'pdf',
        charCount: rawText ? rawText.length : 0,
        byteLength: buffer.byteLength,
      };
    }
  }

  /**
   * Extrai o conteúdo do PDF preservando as coordenadas (x, y), fontSize e número da página de cada item de texto.
   * Utilizado pelo ExamPDFQuestionSplitter para segmentação estruturada por layout sem uso de IA.
   */
  public async extractPDFWithLayout(
    input: File | Blob | ArrayBuffer | Uint8Array,
    onProgress?: (progressPercent: number) => void
  ): Promise<PDFLayoutResult> {
    let buffer: ArrayBuffer;
    if (input instanceof ArrayBuffer) {
      buffer = input;
    } else if (input instanceof Uint8Array) {
      buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
    } else {
      buffer = await this.readAsArrayBuffer(input);
    }

    try {
      let pdfjsLib: any;
      if (typeof window === 'undefined') {
        pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      } else {
        pdfjsLib = await import('pdfjs-dist');
        // @ts-ignore
        const pdfjsWorkerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
      }

      const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
      const maxPages = Math.min(pdf.numPages, 300);
      const items: PDFLayoutItem[] = [];
      let fullRawText = '';

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        for (const item of content.items as any[]) {
          if (!item || typeof item.str !== 'string') continue;
          const transform = item.transform || [1, 0, 0, 1, 0, 0];
          const x = transform[4] ?? 0;
          const y = transform[5] ?? 0;
          const fontSize = Math.abs(transform[0]) || Math.abs(transform[3]) || 12;

          items.push({
            str: item.str,
            x: Math.round(x * 100) / 100,
            y: Math.round(y * 100) / 100,
            fontSize: Math.round(fontSize * 100) / 100,
            pageNumber: i,
            width: item.width ? Math.round(item.width * 100) / 100 : undefined,
            height: item.height ? Math.round(item.height * 100) / 100 : undefined,
          });
        }

        fullRawText += content.items.map((item: any) => item.str).join(' ') + '\n\n';
        page.cleanup();
        if (onProgress && i % 5 === 0) {
          onProgress(Math.round((i / maxPages) * 100));
        }
      }

      return {
        items,
        totalPages: pdf.numPages,
        rawText: fullRawText,
      };
    } catch (err) {
      console.warn('[DocumentReaderService] PDF layout extraction failed, falling back to raw strings:', err);
      const rawText = this.extractRawStringsFromBuffer(buffer);
      return {
        items: [],
        totalPages: 1,
        rawText,
      };
    }
  }

  /**
   * Leitor de DOCX (mammoth com lazy loading e guarda de tamanho)
   */
  private async readDocx(file: File | Blob): Promise<DocumentContent> {
    const buffer = await this.readAsArrayBuffer(file);
    let rawText = '';

    if (buffer.byteLength > 15 * 1024 * 1024) {
      rawText = this.extractRawStringsFromBuffer(buffer);
      return {
        rawText: rawText || undefined,
        binaryData: buffer,
        format: 'docx',
        charCount: rawText.length,
        byteLength: buffer.byteLength,
      };
    }

    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer: buffer.slice(0) });
      rawText = result.value || '';
      if (!rawText.trim()) {
        rawText = this.extractRawStringsFromBuffer(buffer);
      }
    } catch (err) {
      console.warn('[DocumentReaderService] DOCX parsing fallback triggered:', err);
      rawText = this.extractRawStringsFromBuffer(buffer);
    }

    return {
      rawText: rawText || undefined,
      binaryData: buffer,
      format: 'docx',
      charCount: rawText ? rawText.length : 0,
      byteLength: buffer.byteLength,
    };
  }

  /**
   * Leitor de PPTX (JSZip slide a slide com lazy loading)
   */
  private async readPptx(file: File | Blob): Promise<DocumentContent> {
    const buffer = await this.readAsArrayBuffer(file);
    let rawText = '';

    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(buffer.slice(0));

      const slideFiles = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => {
          const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
          const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
          return na - nb;
        });

      const parts: string[] = [];
      for (const name of slideFiles) {
        const xml = await zip.files[name].async('text');
        const matches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
        parts.push(matches.map((m) => m.replace(/<\/?a:t>/g, '')).join(' '));
      }

      rawText = parts.join('\n\n');
      if (!rawText.trim()) {
        rawText = this.extractRawStringsFromBuffer(buffer);
      }
    } catch (err) {
      console.warn('[DocumentReaderService] PPTX parsing fallback triggered:', err);
      rawText = this.extractRawStringsFromBuffer(buffer);
    }

    return {
      rawText: rawText || undefined,
      binaryData: buffer,
      format: 'pptx',
      charCount: rawText ? rawText.length : 0,
      byteLength: buffer.byteLength,
    };
  }

  /**
   * Leitor de EPUB (JSZip + resolução de spine via OPF, com lazy loading e guarda de tamanho)
   */
  private async readEpub(file: File | Blob): Promise<DocumentContent> {
    const buffer = await this.readAsArrayBuffer(file);
    let rawText = '';

    if (buffer.byteLength > 15 * 1024 * 1024) {
      rawText = this.extractRawStringsFromBuffer(buffer);
      return {
        rawText: rawText || undefined,
        binaryData: buffer,
        format: 'epub',
        charCount: rawText.length,
        byteLength: buffer.byteLength,
      };
    }

    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(buffer.slice(0));

      // 1. Ler META-INF/container.xml pra achar o caminho do arquivo OPF
      const containerFile = zip.files['META-INF/container.xml'];
      if (!containerFile) throw new Error('container.xml não encontrado — EPUB inválido.');
      const containerXml = await containerFile.async('text');
      const opfPathMatch = containerXml.match(/full-path="([^"]+)"/);
      if (!opfPathMatch) throw new Error('full-path do OPF não encontrado no container.xml.');
      const opfPath = opfPathMatch[1];
      const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

      // 2. Ler o OPF, extrair manifest (id -> href) e spine (ordem de leitura por idref)
      const opfFile = zip.files[opfPath];
      if (!opfFile) throw new Error(`Arquivo OPF "${opfPath}" não encontrado no zip.`);
      const opfXml = await opfFile.async('text');

      const manifestMap = new Map<string, string>();
      const itemRegex = /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*\/?>|<item\s+[^>]*href="([^"]+)"[^>]*id="([^"]+)"[^>]*\/?>/g;
      let itemMatch;
      while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
        const id = itemMatch[1] || itemMatch[4];
        const href = itemMatch[2] || itemMatch[3];
        if (id && href) manifestMap.set(id, href);
      }

      const spineIds: string[] = [];
      const spineRegex = /<itemref\s+[^>]*idref="([^"]+)"/g;
      let spineMatch;
      while ((spineMatch = spineRegex.exec(opfXml)) !== null) {
        spineIds.push(spineMatch[1]);
      }

      if (spineIds.length === 0) throw new Error('Spine vazio ou não encontrado no OPF.');

      // 3. Ler cada arquivo do spine, na ordem, e extrair texto (stripando tags HTML)
      const parts: string[] = [];
      for (const id of spineIds) {
        const href = manifestMap.get(id);
        if (!href) continue;
        const fullPath = opfDir + href;
        const chapterFile = zip.files[fullPath] || zip.files[href];
        if (!chapterFile) continue;

        const html = await chapterFile.async('text');
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();

        if (text) parts.push(text);
      }

      rawText = parts.join('\n\n');
      if (!rawText.trim()) {
        rawText = this.extractRawStringsFromBuffer(buffer);
      }
    } catch (err) {
      console.warn('[DocumentReaderService] EPUB parsing fallback triggered:', err);
      rawText = this.extractRawStringsFromBuffer(buffer);
    }

    return {
      rawText: rawText || undefined,
      binaryData: buffer,
      format: 'epub',
      charCount: rawText ? rawText.length : 0,
      byteLength: buffer.byteLength,
    };
  }

  /**
   * Leitor de Imagens (Base64 data URL e ArrayBuffer)
   */
  private async readImage(file: File | Blob): Promise<DocumentContent> {
    const buffer = await this.readAsArrayBuffer(file);
    const base64 = this.arrayBufferToBase64(buffer);
    const mimeType = file.type || 'image/png';
    const base64Data = `data:${mimeType};base64,${base64}`;

    return {
      binaryData: buffer,
      base64Data,
      format: 'image',
      byteLength: buffer.byteLength,
    };
  }

  /**
   * Leitor Genérico Binário para formatos não mapeados especificamente
   */
  private async readGenericBinary(file: File | Blob): Promise<DocumentContent> {
    const buffer = await this.readAsArrayBuffer(file);
    return {
      binaryData: buffer,
      format: 'unknown',
      byteLength: buffer.byteLength,
    };
  }

  // --- MÉTODOS AUXILIARES E UTILITÁRIOS ---

  private readAsText(file: File | Blob): Promise<string> {
    if (typeof file.text === 'function') {
      return file.text();
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Erro ao ler o arquivo como texto.'));
      reader.readAsText(file, 'utf-8');
    });
  }

  private readAsArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
    if (typeof file.arrayBuffer === 'function') {
      return file.arrayBuffer();
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('Erro ao ler o arquivo como ArrayBuffer.'));
      reader.readAsArrayBuffer(file);
    });
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Tenta extrair trechos de texto imprimíveis a partir do buffer binário bruto
   * sem qualquer interpretação semântica ou estrutural.
   */
  private extractRawStringsFromBuffer(buffer: ArrayBuffer): string {
    try {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const fullString = decoder.decode(buffer);
      // Filtra caracteres ASCII imprimíveis e quebras de linha para extrair texto bruto sem metadados binários ruidosos
      const printableMatches = fullString.match(/[\x20-\x7E\t\r\n]{4,}/g);
      return printableMatches ? printableMatches.join(' ') : '';
    } catch {
      return '';
    }
  }

  private extractExtension(fileName: string): string {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts.pop() || '' : '';
  }

  private generateUniqueId(): string {
    return `doc_raw_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
