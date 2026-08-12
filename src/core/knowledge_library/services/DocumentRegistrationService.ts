/**
 * Knowledge Library Module - DocumentRegistrationService
 *
 * Implements registration of imported files into knowledge items with default status "Importado".
 * Supports multi-file imports and format inference for PDF, DOCX, PPTX, EPUB, ZIP, etc.
 */

import { IDocumentRegistrationService, FileImportPayload } from '../interfaces/IDocumentRegistrationService';
import { IKnowledgeLibraryRepository } from '../interfaces/IKnowledgeLibraryRepository';
import {
  KnowledgeLibraryItem,
  KnowledgeLibraryItemCreateDTO,
  AllowedFileFormat,
} from '../models/KnowledgeLibraryItem';
import { KnowledgeCategory, KnowledgeCategoryMapper } from '../models/KnowledgeCategory';

export class DocumentRegistrationService implements IDocumentRegistrationService {
  constructor(private readonly repository: IKnowledgeLibraryRepository) {}

  public prepareRegistrationDTO(payload: FileImportPayload): KnowledgeLibraryItemCreateDTO {
    const file = payload.file;
    const fileName = file.name;
    const fileSize = file.size;
    const inferredFormat = this.inferFileFormat(fileName, file.type);

    return {
      name: payload.overrideName || fileName.replace(/\.[^/.]+$/, ''),
      type: payload.category || KnowledgeCategoryMapper.fromFileName(fileName),
      format: inferredFormat,
      fileName,
      fileSize,
      specialties: payload.specialties || ['Geral'],
      discipline: payload.discipline || 'Geral',
      subject: payload.subject || 'Geral',
      subtopic: payload.subtopic || '',
      author: payload.author || '',
      institution: payload.institution || '',
      year: payload.year || new Date().getFullYear(),
      language: payload.language || 'pt-BR',
      description: payload.description || `Documento importado (${inferredFormat})`,
      tags: payload.tags || [inferredFormat],
      notes: payload.notes || '',
      conteudoTexto: payload.extractedText,
      origin: payload.origin || 'Importador MedAnki',
      status: 'Importado',
      metadata: {
        ocrPrepared: false,
        parserPrepared: false,
        embeddingsPrepared: false,
        knowledgeGraphPrepared: false,
        aiPrepared: false,
      },
    };
  }

  public async registerDocument(payload: FileImportPayload): Promise<KnowledgeLibraryItem> {
    const dto = this.prepareRegistrationDTO(payload);
    return this.repository.createItem(dto);
  }

  public async registerBatchDocuments(payloads: FileImportPayload[]): Promise<KnowledgeLibraryItem[]> {
    const registered: KnowledgeLibraryItem[] = [];
    for (const payload of payloads) {
      const item = await this.registerDocument(payload);
      registered.push(item);
    }
    return registered;
  }

  public inferFileFormat(fileName: string, mimeType?: string): AllowedFileFormat {
    const ext = fileName.split('.').pop()?.toUpperCase() || '';

    const supportedExts: AllowedFileFormat[] = [
      'PDF',
      'DOCX',
      'DOC',
      'PPTX',
      'PPT',
      'TXT',
      'MD',
      'EPUB',
      'HTML',
      'CSV',
      'JPEG',
      'PNG',
      'WEBP',
      'HEIC',
      'TIFF',
      'ZIP',
    ];

    if (supportedExts.includes(ext as AllowedFileFormat)) {
      return ext as AllowedFileFormat;
    }

    if (mimeType) {
      if (mimeType.includes('pdf')) return 'PDF';
      if (mimeType.includes('word') || mimeType.includes('docx')) return 'DOCX';
      if (mimeType.includes('powerpoint') || mimeType.includes('pptx')) return 'PPTX';
      if (mimeType.includes('zip')) return 'ZIP';
      if (mimeType.includes('image')) return 'JPEG';
    }

    return ext || 'PDF';
  }
}
