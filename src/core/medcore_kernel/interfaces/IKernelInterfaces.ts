export enum ModuleState {
  Unregistered = 'Unregistered',
  Registered = 'Registered',
  Initializing = 'Initializing',
  Active = 'Active',
  Suspended = 'Suspended',
  Error = 'Error',
  Terminated = 'Terminated',
}

export interface IKernelContext {
  getKernelVersion(): string;
  getEnvironment(): string;
  getConfig<T = any>(key: string, defaultValue?: T): T;
  logger: IKernelLogger;
  eventBus: IKernelEventBus;
}

export interface IKernelConfiguration {
  get<T>(key: string, defaultValue?: T): T;
  set<T>(key: string, value: T): void;
  getAll(): Record<string, any>;
}

export interface IKernelLifecycle {
  initialize(context: IKernelContext): Promise<void>;
  start(): Promise<void>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  terminate(): Promise<void>;
  getState(): ModuleState;
}

export interface IModule extends IKernelLifecycle {
  id: string;
  name: string;
  version: string;
  dependencies?: string[];
  register(registry: IModuleRegistry): void;
}

export interface IModuleRegistry {
  register(module: IModule): void;
  unregister(moduleId: string): void;
  get(moduleId: string): IModule | undefined;
  getAll(): IModule[];
  has(moduleId: string): boolean;
}

export interface IModuleManager {
  initializeAll(): Promise<void>;
  startAll(): Promise<void>;
  terminateAll(): Promise<void>;
  getModuleState(moduleId: string): ModuleState;
}

export type KernelEventCallback = (payload: any) => void;

export interface IKernelEventBus {
  publish(event: string, payload: any): void;
  subscribe(event: string, callback: KernelEventCallback): () => void;
  unsubscribe(event: string, callback: KernelEventCallback): void;
  clear(): void;
}

export interface IKernelDispatcher {
  dispatchCommand<T = any>(commandName: string, payload: any): Promise<T>;
  registerHandler<T = any, R = any>(commandName: string, handler: (payload: T) => Promise<R>): void;
}

export interface IKernelObserver {
  onModuleStateChange(moduleId: string, oldState: ModuleState, newState: ModuleState): void;
  onKernelEvent(event: string, payload: any): void;
}

export interface IKernelLogger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: any, meta?: any): void;
}

export interface HealthCheckResult {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  latencyMs?: number;
  details?: Record<string, any>;
}

export interface IKernelHealth {
  checkHealth(): Promise<HealthCheckResult[]>;
  isSystemHealthy(): Promise<boolean>;
}

export interface IMedCoreKernel extends IKernelContext, IModuleRegistry, IModuleManager, IKernelDispatcher, IKernelHealth {
  boot(): Promise<void>;
  shutdown(): Promise<void>;
}
