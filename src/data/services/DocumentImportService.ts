import { ImportedFile, FileImportStatus } from '../../domain/entities/DocumentImport';
import { DocumentPickerService } from './DocumentPickerService';
import { DocumentParserService } from './DocumentParserService';
import { realSemanticSearchService } from './RealSemanticSearchService';
import { mapWithConcurrency } from '../../core/utils/asyncUtils';

export class DocumentImportService {
  private pickerService = new DocumentPickerService();
  private parserService = new DocumentParserService();

  public createImportedFiles(files: File[]): ImportedFile[] {
    return files
      .filter((f) => this.pickerService.isFileSupported(f))
      .map((f) => this.pickerService.createImportedFile(f));
  }

  public async processFile(
    item: ImportedFile,
    onProgress: (id: string, progress: number, status: FileImportStatus, text?: string, errorMsg?: string) => void,
    metadata?: { examBoard?: string; professor?: string }
  ): Promise<string> {
    try {
      onProgress(item.id, 10, 'reading');
      
      const { text: extractedText, wasOCRProcessed } = await this.parserService.parseDocumentDetailed(item.file, (p) => {
        onProgress(item.id, Math.min(60, 10 + Math.round(p * 0.5)), 'reading');
      });

      // Real Semantic Indexing via Gemini API + Dexie (with optional banca/professor metadata and OCR flag)
      onProgress(item.id, 70, 'reading');
      try {
        await realSemanticSearchService.indexDocument(item.id, extractedText, {
          ...metadata,
          wasOCRProcessed,
        });
      } catch (embErr) {
        console.warn(`[DocumentImportService] Embeddings call skipped or failed for file ${item.name}:`, embErr);
      }

      onProgress(item.id, 100, 'completed', extractedText);
      return extractedText;
    } catch (err: any) {
      const errMsg = err.message || 'Erro ao extrair conteúdo do arquivo.';
      onProgress(item.id, 100, 'error', undefined, errMsg);
      throw err;
    }
  }

  public async processAllFiles(
    items: ImportedFile[],
    onProgress: (id: string, progress: number, status: FileImportStatus, text?: string, errorMsg?: string) => void,
    metadata?: { examBoard?: string; professor?: string }
  ): Promise<{ file: ImportedFile; text: string }[]> {
    const rawResults = await mapWithConcurrency(items, 3, async (item) => {
      if (item.status === 'completed' && item.extractedText) {
        return { file: item, text: item.extractedText };
      }

      try {
        const text = await this.processFile(item, onProgress, metadata);
        return { file: item, text };
      } catch {
        // Continue processing remaining files even if one fails
        return null;
      }
    });

    return rawResults.filter((r): r is { file: ImportedFile; text: string } => r !== null);
  }
}
