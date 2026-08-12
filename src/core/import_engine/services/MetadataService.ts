import { IDocumentMetadataExtractor } from '../interfaces/IDocumentMetadataExtractor';
import { MetadataExtractor } from './MetadataExtractor';
import { DocumentMetadata } from '../models/DocumentMetadata';

/**
 * MetadataService
 *
 * Serviço gerenciador responsável por orquestrar a extração de metadados
 * estruturados de documentos individuais ou em lote.
 */
export class MetadataService {
  private readonly extractor: IDocumentMetadataExtractor;

  constructor(extractor?: IDocumentMetadataExtractor) {
    this.extractor = extractor || new MetadataExtractor();
  }

  /**
   * Extrai metadados completos de um único arquivo.
   */
  public async extractMetadata(file: File | Blob, rawContent?: any): Promise<DocumentMetadata> {
    return this.extractor.extractMetadata(file, rawContent);
  }

  /**
   * Extrai metadados de múltiplos arquivos em paralelo.
   */
  public async extractMetadataBatch(
    files: (File | Blob)[],
    rawContents?: any[]
  ): Promise<DocumentMetadata[]> {
    return Promise.all(
      files.map((file, index) =>
        this.extractMetadata(file, rawContents ? rawContents[index] : undefined)
      )
    );
  }

  /**
   * Retorna a instância do extrator configurado.
   */
  public getExtractor(): IDocumentMetadataExtractor {
    return this.extractor;
  }
}
