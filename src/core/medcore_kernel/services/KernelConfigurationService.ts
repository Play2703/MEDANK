import { IKernelConfiguration } from '../interfaces/IKernelInterfaces';
import { ConfigurationException } from '../exceptions/KernelExceptions';

export class KernelConfigurationService implements IKernelConfiguration {
  private config: Map<string, any> = new Map();

  constructor(initialConfig?: Record<string, any>) {
    this.config.set('appName', 'MedAnki MedCore Kernel');
    this.config.set('version', '19.0.0');
    this.config.set('environment', 'production');
    this.config.set('aiProvider', 'gemini-3.5-flash-lite');
    this.config.set('offlineMode', false);
    this.config.set('syncEnabled', true);

    if (initialConfig) {
      for (const [key, value] of Object.entries(initialConfig)) {
        this.config.set(key, value);
      }
    }
  }

  public get<T>(key: string, defaultValue?: T): T {
    if (!this.config.has(key)) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new ConfigurationException(key, `Configuration key not found and no default provided.`);
    }
    return this.config.get(key) as T;
  }

  public set<T>(key: string, value: T): void {
    this.config.set(key, value);
  }

  public getAll(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of this.config.entries()) {
      result[key] = value;
    }
    return result;
  }
}
