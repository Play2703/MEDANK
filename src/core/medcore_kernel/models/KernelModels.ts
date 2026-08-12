import { ModuleState } from '../interfaces/IKernelInterfaces';

export interface ModuleMetadata {
  id: string;
  name: string;
  version: string;
  state: ModuleState;
  dependencies: string[];
  uptimeSeconds: number;
  lastError?: string;
}

export interface KernelSystemStatus {
  version: string;
  environment: string;
  isBooted: boolean;
  uptimeSeconds: number;
  modulesCount: number;
  healthy: boolean;
  modules: ModuleMetadata[];
}

export interface SystemConfiguration {
  appName: string;
  version: string;
  environment: string;
  aiProvider: string;
  offlineMode: boolean;
  syncEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  customSettings: Record<string, any>;
}
