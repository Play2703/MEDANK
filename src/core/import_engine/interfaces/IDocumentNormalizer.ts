export interface IDocumentNormalizer {
  normalize(rawContent: any): Promise<string>;
}
