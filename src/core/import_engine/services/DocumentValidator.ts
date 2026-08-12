import { IDocumentValidator } from '../interfaces/IDocumentValidator';
import {
  ValidationResult,
  ValidationOptions,
  ValidationErrorCode,
  ValidationMessages,
  ValidationErrorDetail,
} from '../models/ValidationResult';

/**
 * DocumentValidator
 *
 * Responsável por validar documentos antes da importação.
 * Realiza verificações estruturais e de integridade sem ler ou processar o conteúdo textual.
 */
export class DocumentValidator implements IDocumentValidator {
  private static readonly DEFAULT_MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
  private static readonly DEFAULT_ALLOWED_EXTENSIONS = [
    'pdf',
    'apkg',
    'txt',
    'md',
    'doc',
    'docx',
    'json',
    'csv',
    'png',
    'jpg',
    'jpeg',
  ];

  /**
   * Calcula o hash SHA-256 do arquivo a partir do buffer binário.
   */
  public async calculateHash(file: File | Blob): Promise<string> {
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return '';
    }
  }

  /**
   * Calcula o checksum (CRC32/Fletcher em formato de string hexadecimal) do arquivo binário.
   */
  public async calculateChecksum(file: File | Blob): Promise<string> {
    try {
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      let sum1 = 0xffff;
      let sum2 = 0xffff;

      for (let i = 0; i < uint8.length; i++) {
        sum1 = (sum1 + uint8[i]) % 65535;
        sum2 = (sum2 + sum1) % 65535;
      }

      const checksum = (sum2 << 16) | sum1;
      return (checksum >>> 0).toString(16).padStart(8, '0');
    } catch {
      return '';
    }
  }

  /**
   * Verifica se o checksum bate com o valor esperado.
   */
  public async verifyChecksum(file: File | Blob, expectedChecksum: string): Promise<boolean> {
    const calculated = await this.calculateChecksum(file);
    return calculated.toLowerCase() === expectedChecksum.toLowerCase();
  }

  /**
   * Executa todo o conjunto de validações no documento.
   */
  public async validate(file: File | Blob, options: ValidationOptions = {}): Promise<ValidationResult> {
    const errors: ValidationErrorDetail[] = [];
    const warnings: string[] = [];

    const fileName = (file as File).name || 'document';
    const fileSize = file.size;
    const mimeType = file.type || 'application/octet-stream';
    const extension = this.extractExtension(fileName);

    const maxSizeBytes = options.maxSizeBytes ?? DocumentValidator.DEFAULT_MAX_SIZE_BYTES;
    const allowedExtensions = options.allowedExtensions ?? DocumentValidator.DEFAULT_ALLOWED_EXTENSIONS;
    const allowedMimeTypes = options.allowedMimeTypes;

    // 1. Validação de Arquivo Vazio
    if (fileSize === 0) {
      errors.push({
        code: ValidationErrorCode.EMPTY_FILE,
        message: ValidationMessages[ValidationErrorCode.EMPTY_FILE],
        field: 'fileSize',
      });
    }

    // 2. Validação de Tamanho Máximo
    if (fileSize > maxSizeBytes) {
      errors.push({
        code: ValidationErrorCode.MAX_SIZE_EXCEEDED,
        message: ValidationMessages[ValidationErrorCode.MAX_SIZE_EXCEEDED],
        field: 'fileSize',
        details: { fileSize, maxSizeBytes },
      });
    }

    // 3. Validação de Extensão
    if (extension && !allowedExtensions.includes(extension.toLowerCase())) {
      errors.push({
        code: ValidationErrorCode.INVALID_EXTENSION,
        message: ValidationMessages[ValidationErrorCode.INVALID_EXTENSION],
        field: 'extension',
        details: { extension, allowedExtensions },
      });
    }

    // 4. Validação de Formato / MIME Type Suportado
    if (allowedMimeTypes && allowedMimeTypes.length > 0) {
      if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
        errors.push({
          code: ValidationErrorCode.UNSUPPORTED_FORMAT,
          message: ValidationMessages[ValidationErrorCode.UNSUPPORTED_FORMAT],
          field: 'mimeType',
          details: { mimeType, allowedMimeTypes },
        });
      }
    }

    // 5. Validação de Arquivo Corrompido
    let isCorrupted = false;
    let hashSha256 = '';
    let checksum = '';

    try {
      // Teste de leitura física do blob/buffer para detectar corrupção
      const slice = file.slice(0, Math.min(fileSize, 1024));
      await slice.arrayBuffer();

      hashSha256 = await this.calculateHash(file);
      checksum = await this.calculateChecksum(file);

      if (!hashSha256 && fileSize > 0) {
        isCorrupted = true;
      }
    } catch {
      isCorrupted = true;
    }

    if (isCorrupted) {
      errors.push({
        code: ValidationErrorCode.CORRUPTED_FILE,
        message: ValidationMessages[ValidationErrorCode.CORRUPTED_FILE],
        field: 'file',
      });
    }

    // 6. Validação de Duplicidade (via Hash SHA-256)
    if (hashSha256 && options.existingHashes && options.existingHashes.includes(hashSha256)) {
      errors.push({
        code: ValidationErrorCode.DUPLICATE_FILE,
        message: ValidationMessages[ValidationErrorCode.DUPLICATE_FILE],
        field: 'hashSha256',
        details: { hashSha256 },
      });
    }

    // 7. Validação de Hash SHA-256 Esperado
    if (options.expectedHashSha256 && hashSha256) {
      if (options.expectedHashSha256.toLowerCase() !== hashSha256.toLowerCase()) {
        errors.push({
          code: ValidationErrorCode.HASH_MISMATCH,
          message: ValidationMessages[ValidationErrorCode.HASH_MISMATCH],
          field: 'hashSha256',
          details: { expected: options.expectedHashSha256, actual: hashSha256 },
        });
      }
    }

    // 8. Validação de Checksum Esperado
    if (options.expectedChecksum && checksum) {
      if (options.expectedChecksum.toLowerCase() !== checksum.toLowerCase()) {
        errors.push({
          code: ValidationErrorCode.CHECKSUM_FAILED,
          message: ValidationMessages[ValidationErrorCode.CHECKSUM_FAILED],
          field: 'checksum',
          details: { expected: options.expectedChecksum, actual: checksum },
        });
      }
    }

    return {
      isValid: errors.length === 0,
      fileName,
      fileSize,
      mimeType,
      hashSha256,
      checksum,
      errors,
      warnings,
      validatedAt: new Date().toISOString(),
    };
  }

  private extractExtension(fileName: string): string {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts.pop() || '' : '';
  }
}
