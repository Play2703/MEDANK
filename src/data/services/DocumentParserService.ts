import { OCRService } from './OCRService';

export class DocumentParserService {
  private ocrService = new OCRService();

  public async parseDocument(file: File, onProgress?: (percent: number) => void): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext) || file.type.startsWith('image/')) {
      if (onProgress) onProgress(40);
      const ocrText = await this.ocrService.performOCR(file, onProgress);
      if (onProgress) onProgress(100);
      return this.cleanExtractedText(ocrText);
    }

    if (['txt', 'md', 'markdown'].includes(ext)) {
      if (onProgress) onProgress(50);
      const rawText = await this.readAsText(file);
      if (onProgress) onProgress(100);
      return this.cleanExtractedText(rawText);
    }

    // For PDF, DOCX, PPTX files, try text reading or Gemini OCR endpoint
    if (['pdf', 'docx', 'pptx'].includes(ext)) {
      if (onProgress) onProgress(30);
      try {
        const text = await this.readAsText(file);
        if (this.isLikelyValidExtractedText(text)) {
          if (onProgress) onProgress(100);
          return this.cleanExtractedText(text);
        }
      } catch {
        // Fallback to OCR service if plain text reading fails or returns binary
      }

      if (onProgress) onProgress(30);
      const ocrResult = await this.ocrService.performOCR(file, onProgress);
      if (onProgress) onProgress(100);
      return this.cleanExtractedText(ocrResult);
    }

    // Default text reader fallback
    const rawText = await this.readAsText(file);
    return this.cleanExtractedText(rawText);
  }

  /**
   * Heuristically validates if extracted text is legible human language (PT-BR)
   * rather than decoded binary garbage from FileReader.readAsText().
   */
  public isLikelyValidExtractedText(text: string): boolean {
    if (!text || text.trim().length < 50) return false;

    const nonSpaceChars = text.replace(/\s/g, '');
    if (nonSpaceChars.length === 0) return false;

    // Check replacement chars (\uFFFD) and null bytes or non-printable ASCII control chars
    const invalidCharsCount = (text.match(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
    const invalidCharRatio = invalidCharsCount / nonSpaceChars.length;
    if (invalidCharRatio > 0.05) {
      return false;
    }

    // Count valid printable ASCII + Portuguese accented characters
    const validCharsCount = (text.match(/[a-zA-Z0-9\s.,;:!?()"'/\-\\–—%º°ªáàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/g) || []).length;
    const validRatio = validCharsCount / text.length;
    if (validRatio < 0.85) {
      return false;
    }

    // Check presence of at least a few recognizable alphabetic words of 3+ letters
    const wordMatches = text.match(/[a-zA-ZáàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]{3,}/g) || [];
    if (wordMatches.length < 5) {
      return false;
    }

    return true;
  }

  private readAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string || '');
      };
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });
  }

  /**
   * Cleans extracted text by:
   * - Removing page numbers (e.g. "Página 1 de 10", "Page 5", "pág 3")
   * - Removing header/footer artifacts and repetitive lines
   * - Preserving structural markdown headers, lists, definitions and tables
   */
  public cleanExtractedText(text: string): string {
    if (!text) return '';

    let cleaned = text;

    // Remove page numbers pattern
    cleaned = cleaned.replace(/Págin[aa]\s+\d+(\s+de\s+\d+)?/gi, '');
    cleaned = cleaned.replace(/Page\s+\d+(\s+of\s+\d+)?/gi, '');
    cleaned = cleaned.replace(/Pág\.\s*\d+/gi, '');
    cleaned = cleaned.replace(/^\s*\d+\s*$/gm, ''); // standalone page numbers on a line

    // Remove repetitive copyright / header lines
    cleaned = cleaned.replace(/Todos os direitos reservados\.?/gi, '');
    cleaned = cleaned.replace(/Uso exclusivo para fins didáticos\.?/gi, '');

    // Normalize excess whitespace (more than 3 blank lines to 2)
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');

    return cleaned.trim();
  }
}
