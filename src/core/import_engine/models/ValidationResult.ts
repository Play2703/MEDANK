export enum ValidationErrorCode {
  EMPTY_FILE = 'EMPTY_FILE',
  CORRUPTED_FILE = 'CORRUPTED_FILE',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  INVALID_EXTENSION = 'INVALID_EXTENSION',
  MAX_SIZE_EXCEEDED = 'MAX_SIZE_EXCEEDED',
  DUPLICATE_FILE = 'DUPLICATE_FILE',
  HASH_MISMATCH = 'HASH_MISMATCH',
  CHECKSUM_FAILED = 'CHECKSUM_FAILED',
}

export const ValidationMessages: Record<ValidationErrorCode, string> = {
  [ValidationErrorCode.EMPTY_FILE]: 'O arquivo fornecido está vazio (0 bytes).',
  [ValidationErrorCode.CORRUPTED_FILE]: 'O arquivo está corrompido ou não pôde ser lido corretamente.',
  [ValidationErrorCode.UNSUPPORTED_FORMAT]: 'O tipo de arquivo (MIME type) não é suportado pelo sistema.',
  [ValidationErrorCode.INVALID_EXTENSION]: 'A extensão do arquivo não está na lista de extensões permitidas.',
  [ValidationErrorCode.MAX_SIZE_EXCEEDED]: 'O tamanho do arquivo excede o limite máximo permitido.',
  [ValidationErrorCode.DUPLICATE_FILE]: 'Arquivo duplicado detectado no sistema (mesmo hash SHA-256).',
  [ValidationErrorCode.HASH_MISMATCH]: 'O hash SHA-256 gerado diverge do valor esperado.',
  [ValidationErrorCode.CHECKSUM_FAILED]: 'A verificação de checksum falhou. O arquivo pode ter sido alterado.',
};

export interface ValidationErrorDetail {
  code: ValidationErrorCode;
  message: string;
  field?: string;
  details?: Record<string, any>;
}

export interface ValidationOptions {
  maxSizeBytes?: number; // Ex: 50 * 1024 * 1024 (50MB)
  allowedExtensions?: string[]; // Ex: ['pdf', 'txt', 'md', 'docx', 'json']
  allowedMimeTypes?: string[]; // Ex: ['application/pdf', 'text/plain']
  existingHashes?: string[]; // Para verificação de duplicidade
  expectedHashSha256?: string;
  expectedChecksum?: string;
  checkCorrupted?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  fileName: string;
  fileSize: number;
  mimeType: string;
  hashSha256: string;
  checksum: string;
  errors: ValidationErrorDetail[];
  warnings: string[];
  validatedAt: string;
}
