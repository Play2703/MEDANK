import { ValidationResult, ValidationOptions } from '../models/ValidationResult';

export interface IDocumentValidator {
  validate(file: File | Blob, options?: ValidationOptions): Promise<ValidationResult>;
  calculateHash(file: File | Blob): Promise<string>;
  calculateChecksum(file: File | Blob): Promise<string>;
  verifyChecksum(file: File | Blob, expectedChecksum: string): Promise<boolean>;
}
