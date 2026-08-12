import { IDocumentNormalizer } from '../interfaces/IDocumentNormalizer';
import { DocumentContent } from '../models/DocumentContent';

/**
 * DocumentNormalizer
 *
 * Responsável por padronizar o conteúdo bruto extraído de documentos antes do registro no Import Engine.
 *
 * Ações de Normalização:
 * - Padronização de quebras de linha (\r\n e \r -> \n)
 * - Remoção de caracteres de controle nulos e invisíveis (\x00-\x08, \x0B, \x0C, \x0E-\x1F)
 * - Remoção de espaçamentos em branco residuais no final das linhas
 * - Limitação de linhas em branco consecutivas (no máximo 2 quebras consecutivas)
 * - Tratamento seguro para entradas em formato string ou objeto DocumentContent
 *
 * Regras:
 * - Não interpreta semanticamente o texto.
 * - Não aplica IA ou modelos de linguagem.
 * - Não altera vocabulário ou estrutura dos termos médicos/técnicos.
 */
export class DocumentNormalizer implements IDocumentNormalizer {
  public async normalize(rawContent: any): Promise<string> {
    if (rawContent === null || rawContent === undefined) {
      return '';
    }

    let textToNormalize = '';

    if (typeof rawContent === 'string') {
      textToNormalize = rawContent;
    } else if (typeof rawContent === 'object') {
      if (typeof (rawContent as DocumentContent).rawText === 'string') {
        textToNormalize = (rawContent as DocumentContent).rawText || '';
      } else if ((rawContent as DocumentContent).binaryData) {
        textToNormalize = `[Conteúdo Binário Normalizado: ${rawContent.format || 'binário'} - ${(rawContent as DocumentContent).byteLength || 0} bytes]`;
      } else {
        textToNormalize = JSON.stringify(rawContent);
      }
    } else {
      textToNormalize = String(rawContent);
    }

    return this.applyTextNormalization(textToNormalize);
  }

  /**
   * Executa a limpeza estrutural e sintática do texto bruto.
   */
  private applyTextNormalization(text: string): string {
    if (!text) return '';

    return text
      // 1. Normaliza quebras de linha (CRLF e CR -> LF)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // 2. Remove caracteres de controle nulos e invisíveis no-op
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // 3. Remove espaços/tabs em branco residuais no final de cada linha
      .replace(/[ \t]+$/gm, '')
      // 4. Limita linhas em branco consecutivas exageradas (max 2 newlines)
      .replace(/\n{3,}/g, '\n\n')
      // 5. Trim inicial e final
      .trim();
  }
}
