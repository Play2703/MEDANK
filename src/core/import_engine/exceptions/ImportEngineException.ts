export class ImportEngineException extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'ImportEngineException';
  }
}

export class DocumentValidationException extends ImportEngineException {
  constructor(message: string, public readonly errors: string[] = []) {
    super(message, 'DOCUMENT_VALIDATION_ERROR');
    this.name = 'DocumentValidationException';
  }
}

export class DocumentReadException extends ImportEngineException {
  constructor(message: string) {
    super(message, 'DOCUMENT_READ_ERROR');
    this.name = 'DocumentReadException';
  }
}

export class DocumentProcessException extends ImportEngineException {
  constructor(message: string) {
    super(message, 'DOCUMENT_PROCESS_ERROR');
    this.name = 'DocumentProcessException';
  }
}
