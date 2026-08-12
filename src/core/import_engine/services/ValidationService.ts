import { DocumentValidator } from './DocumentValidator';
import { IDocumentValidator } from '../interfaces/IDocumentValidator';
import { ValidationResult, ValidationOptions } from '../models/ValidationResult';
import { ValidationException } from '../exceptions/ValidationException';

export class ValidationService {
  private readonly validator: IDocumentValidator;

  constructor(validator?: IDocumentValidator) {
    this.validator = validator || new DocumentValidator();
  }

  /**
   * Valida um único arquivo e retorna o resultado estruturado.
   */
  public async validateDocument(file: File | Blob, options?: ValidationOptions): Promise<ValidationResult> {
    return this.validator.validate(file, options);
  }

  /**
   * Valida um arquivo e lança ValidationException se houver erros de validação.
   */
  public async validateDocumentOrThrow(file: File | Blob, options?: ValidationOptions): Promise<ValidationResult> {
    const result = await this.validateDocument(file, options);
    if (!result.isValid) {
      throw new ValidationException(
        `Falha na validação do documento ${result.fileName}: ${result.errors.map((e) => e.message).join('; ')}`,
        result.errors,
      );
    }
    return result;
  }

  /**
   * Valida um lote de arquivos sequencialmente ou em paralelo.
   */
  public async validateBatch(files: (File | Blob)[], options?: ValidationOptions): Promise<ValidationResult[]> {
    return Promise.all(files.map((file) => this.validateDocument(file, options)));
  }

  /**
   * Calcula o hash SHA-256 de um arquivo sem rodar a validação completa.
   */
  public async calculateHash(file: File | Blob): Promise<string> {
    return this.validator.calculateHash(file);
  }

  /**
   * Calcula o checksum de um arquivo sem rodar a validação completa.
   */
  public async calculateChecksum(file: File | Blob): Promise<string> {
    return this.validator.calculateChecksum(file);
  }
}
