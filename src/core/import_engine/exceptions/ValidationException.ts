import { ImportEngineException } from './ImportEngineException';
import { ValidationErrorDetail, ValidationErrorCode, ValidationMessages } from '../models/ValidationResult';

export class ValidationException extends ImportEngineException {
  public readonly errors: ValidationErrorDetail[];

  constructor(message: string, errors: ValidationErrorDetail[] = []) {
    super(message, 'VALIDATION_FAILED');
    this.name = 'ValidationException';
    this.errors = errors;
  }

  public static fromErrorCode(code: ValidationErrorCode, customMessage?: string): ValidationException {
    const message = customMessage || ValidationMessages[code];
    const detail: ValidationErrorDetail = {
      code,
      message,
    };
    return new ValidationException(message, [detail]);
  }
}
