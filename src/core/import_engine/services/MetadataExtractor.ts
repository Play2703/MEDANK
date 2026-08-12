import { IDocumentMetadataExtractor } from '../interfaces/IDocumentMetadataExtractor';
import { DocumentMetadata } from '../models/DocumentMetadata';
import { DocumentFormat } from '../models/DocumentContent';

/**
 * MetadataExtractor
 *
 * Responsável por extrair automaticamente os metadados estruturados de documentos.
 *
 * Metadados extraídos:
 * - Nome do arquivo
 * - Autor
 * - Título
 * - Idioma
 * - Número de páginas
 * - Data
 * - Formato
 * - Codificação
 * - Peso (bytes)
 * - Tamanho (formatado)
 * - Livro
 * - Capítulo (quando disponível)
 *
 * Regra: Não realiza interpretação de conteúdo médico ou inferências clínicas.
 */
export class MetadataExtractor implements IDocumentMetadataExtractor {
  public async extractMetadata(file: File | Blob, rawContent?: any): Promise<DocumentMetadata> {
    const fileName = (file as File).name || 'documento_sem_nome';
    const peso = file.size;
    const tamanho = this.formatFileSize(peso);
    const mimeType = file.type || 'application/octet-stream';
    const format = this.detectFormat(fileName, mimeType);
    const date = this.extractDate(file);

    // Valores default
    let author: string | undefined;
    let title: string | undefined;
    let language: string | undefined;
    let pageCount: number | undefined;
    let encoding: string | undefined = 'utf-8';
    let livro: string | undefined;
    let capitulo: string | undefined;

    // Tenta extrair padrões do nome do arquivo
    const filenameMeta = this.extractFromFilename(fileName);
    if (filenameMeta.title) title = filenameMeta.title;
    if (filenameMeta.author) author = filenameMeta.author;
    if (filenameMeta.livro) livro = filenameMeta.livro;
    if (filenameMeta.capitulo) capitulo = filenameMeta.capitulo;

    // Se houver conteúdo bruto em texto/string, extrai informações estruturais sem interpretação médica
    if (typeof rawContent === 'string' && rawContent.length > 0) {
      const textMeta = this.extractFromRawText(rawContent, format);
      if (textMeta.title && !title) title = textMeta.title;
      if (textMeta.author && !author) author = textMeta.author;
      if (textMeta.language) language = textMeta.language;
      if (textMeta.capitulo && !capitulo) capitulo = textMeta.capitulo;
      if (textMeta.livro && !livro) livro = textMeta.livro;
      if (textMeta.pageCount) pageCount = textMeta.pageCount;
    } else if (rawContent && typeof rawContent === 'object') {
      // Se rawContent for um objeto estruturado de conteúdo (ex: DocumentContent)
      if (rawContent.rawText) {
        const textMeta = this.extractFromRawText(rawContent.rawText, format);
        if (textMeta.title && !title) title = textMeta.title;
        if (textMeta.author && !author) author = textMeta.author;
        if (textMeta.language) language = textMeta.language;
        if (textMeta.capitulo && !capitulo) capitulo = textMeta.capitulo;
        if (textMeta.livro && !livro) livro = textMeta.livro;
        if (textMeta.pageCount) pageCount = textMeta.pageCount;
      }

      if (rawContent.encoding) {
        encoding = rawContent.encoding;
      }
    }

    // Contagem real de páginas via PDF.js se o arquivo for PDF
    if (!pageCount && format === 'pdf' && file && file.size > 0) {
      try {
        const buffer = await file.arrayBuffer();
        const pdfjsLib = await import('pdfjs-dist');
        // @ts-ignore
        const pdfjsWorkerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
        const pdfDoc = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
        if (pdfDoc && typeof pdfDoc.numPages === 'number' && pdfDoc.numPages > 0) {
          pageCount = pdfDoc.numPages;
        }
      } catch (pdfErr) {
        console.warn('[MetadataExtractor] pdfjs fast page count fallback:', pdfErr);
      }
    }

    // Estimativa bruta de páginas por contagem de caracteres ou peso se não determinado via PDF.js ou marcações
    if (!pageCount && typeof rawContent === 'string' && rawContent.trim().length > 0) {
      pageCount = this.estimatePageCount(rawContent.length);
    } else if (!pageCount && peso > 0) {
      pageCount = this.estimatePageCountFromSize(peso, format);
    }

    return {
      fileName,
      author: author || 'Desconhecido',
      title: title || this.cleanTitleFromFilename(fileName),
      language: language || 'pt-BR',
      pageCount,
      date,
      format,
      encoding,
      peso,
      tamanho,
      livro,
      capitulo,
      mimeType,
      extractedAt: new Date().toISOString(),
    };
  }

  /**
   * Formata o peso em bytes para uma string legível (ex: "2.4 MB", "500 KB").
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    return `${value} ${sizes[i]}`;
  }

  /**
   * Identifica o formato a partir do nome e MIME type.
   */
  private detectFormat(fileName: string, mimeType: string): DocumentFormat {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    if (mimeType.includes('pdf') || ext === 'pdf') return 'pdf';
    if (mimeType.includes('word') || ext === 'docx' || ext === 'doc') return 'docx';
    if (mimeType.includes('presentation') || ext === 'pptx' || ext === 'ppt') return 'pptx';
    if (mimeType.includes('epub') || ext === 'epub') return 'epub';
    if (mimeType.includes('html') || ext === 'html' || ext === 'htm') return 'html';
    if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
    if (['txt', 'md', 'csv', 'json', 'apkg'].includes(ext) || mimeType.includes('text')) return 'txt';

    return 'unknown';
  }

  /**
   * Extrai data da propriedade `lastModified` do arquivo.
   */
  private extractDate(file: File | Blob): string {
    if ('lastModified' in file && typeof file.lastModified === 'number' && file.lastModified > 0) {
      return new Date(file.lastModified).toISOString();
    }
    return new Date().toISOString();
  }

  /**
   * Extrai informações de Título, Autor, Livro e Capítulo diretamente do padrão do nome do arquivo.
   * Ex: "Livro de Anatomia - Cap 02 - Autor Silva.pdf"
   */
  private extractFromFilename(fileName: string): {
    title?: string;
    author?: string;
    livro?: string;
    capitulo?: string;
  } {
    const cleanName = fileName.replace(/\.[^/.]+$/, ''); // Remove extensão
    const result: { title?: string; author?: string; livro?: string; capitulo?: string } = {};

    // Padrão de Capítulo: Cap 1, Capítulo 02, Cap. 3, Ch 4, Chapter 5
    const capMatch = cleanName.match(/(?:cap[íi]tulo|cap\.?|chapter|ch\.?)\s*(\d+[a-z]?)/i);
    if (capMatch) {
      result.capitulo = `Capítulo ${capMatch[1]}`;
    }

    // Padrão de Livro: Livro X, Vol Y, Volume Z
    const livroMatch = cleanName.match(/(?:livro|vol\.?|volume)\s*([a-z0-9\s]+?)(?:-|_|$)/i);
    if (livroMatch) {
      result.livro = livroMatch[0].trim();
    }

    // Padrão com hífens/separadores: "Autor - Título" ou "Livro - Capítulo - Título"
    const parts = cleanName.split(/\s*[-_–—]\s*/);
    if (parts.length >= 2) {
      if (!result.author && parts[0].length < 30) {
        result.author = parts[0].trim();
      }
      result.title = parts[parts.length - 1].trim();
    }

    return result;
  }

  /**
   * Extrai títulos, autores, capítulos e idioma de cabeçalhos brutos do texto.
   */
  private extractFromRawText(text: string, format: DocumentFormat): {
    title?: string;
    author?: string;
    language?: string;
    capitulo?: string;
    livro?: string;
    pageCount?: number;
  } {
    const result: {
      title?: string;
      author?: string;
      language?: string;
      capitulo?: string;
      livro?: string;
      pageCount?: number;
    } = {};

    const sample = text.slice(0, 5000); // Primeiros 5.000 caracteres

    // HTML / Meta Tags
    if (format === 'html') {
      const titleMatch = sample.match(/<title[^>]*>(.*?)<\/title>/i);
      if (titleMatch) result.title = titleMatch[1].trim();

      const authorMatch = sample.match(/<meta\s+name=["']author["']\s+content=["'](.*?)["']/i);
      if (authorMatch) result.author = authorMatch[1].trim();

      const langMatch = sample.match(/<html[^>]*lang=["'](.*?)["']/i);
      if (langMatch) result.language = langMatch[1].trim();
    }

    // Padrão de Markdown / Títulos em Texto
    if (!result.title) {
      const h1Match = sample.match(/^#\s+(.+)$/m) || sample.match(/^Title:\s*(.+)$/im);
      if (h1Match) result.title = h1Match[1].trim();
    }

    if (!result.author) {
      const authorLine = sample.match(/^(?:Author|Autor|Por):\s*(.+)$/im);
      if (authorLine) result.author = authorLine[1].trim();
    }

    // Padrão de Capítulo no texto
    const capLine = sample.match(/^(?:Cap[íi]tulo|Chapter|Cap\.)\s*(\d+[:\s\-\w]*)/im);
    if (capLine) {
      result.capitulo = capLine[0].trim();
    }

    // Contagem aproximada de marcas de páginas em PDF / EPUB brutos
    const pageMatches = text.match(/\/Type\s*\/Page\b/g);
    if (pageMatches) {
      result.pageCount = pageMatches.length;
    }

    return result;
  }

  private cleanTitleFromFilename(fileName: string): string {
    return fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim();
  }

  private estimatePageCount(charCount: number): number | undefined {
    if (charCount <= 0) return undefined;
    // Média de ~2.000 caracteres por página impressa padrão
    return Math.max(1, Math.ceil(charCount / 2000));
  }

  private estimatePageCountFromSize(bytes: number, format: DocumentFormat): number | undefined {
    if (bytes <= 0) return undefined;

    switch (format) {
      case 'pdf':
        // Aprox. 50 KB por página em PDF simples
        return Math.max(1, Math.ceil(bytes / (50 * 1024)));
      case 'docx':
      case 'pptx':
        return Math.max(1, Math.ceil(bytes / (30 * 1024)));
      case 'txt':
        return Math.max(1, Math.ceil(bytes / (2 * 1024)));
      case 'image':
        return 1;
      default:
        return undefined;
    }
  }
}
