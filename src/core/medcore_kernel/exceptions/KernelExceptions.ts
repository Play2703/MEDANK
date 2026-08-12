export class KernelException extends Error {
  constructor(message: string) {
    super(`[MedCoreKernel] ${message}`);
    this.name = 'KernelException';
  }
}

export class ModuleException extends KernelException {
  constructor(moduleId: string, message: string) {
    super(`Module [${moduleId}] Error: ${message}`);
    this.name = 'ModuleException';
  }
}

export class RegistrationException extends KernelException {
  constructor(moduleId: string, message: string) {
    super(`Registration Error for [${moduleId}]: ${message}`);
    this.name = 'RegistrationException';
  }
}

export class LifecycleException extends KernelException {
  constructor(moduleId: string, state: string, message: string) {
    super(`Lifecycle Error for [${moduleId}] in state [${state}]: ${message}`);
    this.name = 'LifecycleException';
  }
}

export class ConfigurationException extends KernelException {
  constructor(key: string, message: string) {
    super(`Configuration Error for key [${key}]: ${message}`);
    this.name = 'ConfigurationException';
  }
}
