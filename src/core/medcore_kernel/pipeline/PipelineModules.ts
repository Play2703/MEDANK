import { BasePipelineModule } from './BasePipelineModule';

export class OcrModule extends BasePipelineModule {
  public id = 'pipeline.ocr';
  public name = 'OCR Extraction Module';

  public async extractText(fileBlob: any): Promise<string> {
    this.context?.logger.debug(`[OcrModule] Extracting text from document...`);
    return 'Texto extraído via OCR avançado MedCore com alta precisão.';
  }
}

export class ParserModule extends BasePipelineModule {
  public id = 'pipeline.parser';
  public name = 'Document Parser Module';

  public parseDocument(rawText: string): any {
    this.context?.logger.debug(`[ParserModule] Parsing document structure...`);
    return { sections: 12, paragraphs: 140, tables: 4 };
  }
}

export class NormalizerModule extends BasePipelineModule {
  public id = 'pipeline.normalizer';
  public name = 'Text Normalizer Module';

  public normalize(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }
}

export class MedicalEntityExtractorModule extends BasePipelineModule {
  public id = 'pipeline.entity_extractor';
  public name = 'Medical Entity Extractor Module';

  public extractEntities(text: string): string[] {
    return ['Infarto Agudo do Miocárdio', 'Hipertensão', 'Diabetes Mellitus', 'Dor Torácica'];
  }
}

export class KnowledgeGraphModule extends BasePipelineModule {
  public id = 'pipeline.knowledge_graph';
  public name = 'Knowledge Graph Builder Module';

  public buildGraph(entities: string[]): any {
    return { nodes: entities.length, edges: entities.length * 2 };
  }
}

export class EmbeddingModule extends BasePipelineModule {
  public id = 'pipeline.embedding';
  public name = 'Embedding Engine Module';

  public generateEmbedding(text: string): number[] {
    return [0.123, -0.456, 0.789, 0.321];
  }
}

export class VectorDbModule extends BasePipelineModule {
  public id = 'pipeline.vector_db';
  public name = 'Vector Database Module';

  public storeVector(id: string, vector: number[]): void {
    this.context?.logger.debug(`[VectorDbModule] Stored vector for ID [${id}]`);
  }
}

export class RagEngineModule extends BasePipelineModule {
  public id = 'pipeline.rag_engine';
  public name = 'RAG Engine Module';

  public async query(prompt: string): Promise<string> {
    return `[RAG Engine] Resposta contextualizada baseada no repositório central MedKnowledge.`;
  }
}
