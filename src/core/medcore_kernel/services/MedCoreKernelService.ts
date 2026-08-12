import {
  IMedCoreKernel,
  IModule,
  IKernelContext,
  IKernelLogger,
  IKernelConfiguration,
  IKernelEventBus,
  IKernelDispatcher,
  IKernelHealth,
  HealthCheckResult,
  ModuleState,
} from '../interfaces/IKernelInterfaces';
import { KernelLoggerService } from './KernelLoggerService';
import { KernelConfigurationService } from './KernelConfigurationService';
import { KernelDispatcherService } from './KernelDispatcherService';
import { KernelHealthService } from './KernelHealthService';
import { ModuleRegistryService } from './ModuleRegistryService';
import { KernelEventBus } from '../events/KernelEvents';
import {
  OcrModule,
  ParserModule,
  NormalizerModule,
  MedicalEntityExtractorModule,
  KnowledgeGraphModule,
  EmbeddingModule,
  VectorDbModule,
  RagEngineModule,
} from '../pipeline/PipelineModules';

export class MedCoreKernelService implements IMedCoreKernel {
  private static instance: MedCoreKernelService;

  public logger: IKernelLogger;
  public config: IKernelConfiguration;
  public eventBus: IKernelEventBus;
  private dispatcher: IKernelDispatcher;
  private registry: ModuleRegistryService;
  private healthService: KernelHealthService;
  private isBootedFlag: boolean = false;

  private constructor() {
    this.logger = new KernelLoggerService();
    this.config = new KernelConfigurationService();
    this.eventBus = new KernelEventBus();
    this.dispatcher = new KernelDispatcherService();
    this.registry = new ModuleRegistryService();
    this.healthService = new KernelHealthService(this.registry);

    // Register Pipeline Modules automatically
    this.register(new OcrModule());
    this.register(new ParserModule());
    this.register(new NormalizerModule());
    this.register(new MedicalEntityExtractorModule());
    this.register(new KnowledgeGraphModule());
    this.register(new EmbeddingModule());
    this.register(new VectorDbModule());
    this.register(new RagEngineModule());
  }

  public static getInstance(): MedCoreKernelService {
    if (!MedCoreKernelService.instance) {
      MedCoreKernelService.instance = new MedCoreKernelService();
    }
    return MedCoreKernelService.instance;
  }

  public getKernelVersion(): string {
    return this.config.get('version', '19.0.0');
  }

  public getEnvironment(): string {
    return this.config.get('environment', 'production');
  }

  public getConfig<T = any>(key: string, defaultValue?: T): T {
    return this.config.get(key, defaultValue);
  }

  // Module Registry methods
  public register(module: IModule): void {
    this.registry.register(module);
    module.register(this);
    this.logger.info(`Module registered: [${module.id}] - ${module.name}`);
  }

  public unregister(moduleId: string): void {
    this.registry.unregister(moduleId);
    this.logger.info(`Module unregistered: [${moduleId}]`);
  }

  public get(moduleId: string): IModule | undefined {
    return this.registry.get(moduleId);
  }

  public getAll(): IModule[] {
    return this.registry.getAll();
  }

  public has(moduleId: string): boolean {
    return this.registry.has(moduleId);
  }

  // Module Manager methods
  public async initializeAll(): Promise<void> {
    const modules = this.registry.getAll();
    for (const m of modules) {
      try {
        await m.initialize(this);
        this.logger.info(`Module initialized successfully: [${m.id}]`);
      } catch (err) {
        this.logger.error(`Failed to initialize module [${m.id}]`, err);
      }
    }
  }

  public async startAll(): Promise<void> {
    const modules = this.registry.getAll();
    for (const m of modules) {
      try {
        await m.start();
        this.logger.info(`Module started: [${m.id}]`);
      } catch (err) {
        this.logger.error(`Failed to start module [${m.id}]`, err);
      }
    }
  }

  public async terminateAll(): Promise<void> {
    const modules = this.registry.getAll();
    for (const m of modules) {
      try {
        await m.terminate();
        this.logger.info(`Module terminated: [${m.id}]`);
      } catch (err) {
        this.logger.error(`Failed to terminate module [${m.id}]`, err);
      }
    }
  }

  public getModuleState(moduleId: string): ModuleState {
    const m = this.registry.get(moduleId);
    return m ? m.getState() : ModuleState.Unregistered;
  }

  // Dispatcher methods
  public async dispatchCommand<T = any>(commandName: string, payload: any): Promise<T> {
    return await this.dispatcher.dispatchCommand<T>(commandName, payload);
  }

  public registerHandler<T = any, R = any>(commandName: string, handler: (payload: T) => Promise<R>): void {
    this.dispatcher.registerHandler(commandName, handler);
  }

  // Health methods
  public async checkHealth(): Promise<HealthCheckResult[]> {
    return await this.healthService.checkHealth();
  }

  public async isSystemHealthy(): Promise<boolean> {
    return await this.healthService.isSystemHealthy();
  }

  // Boot & Shutdown
  public async boot(): Promise<void> {
    if (this.isBootedFlag) return;
    this.logger.info('Booting MedCore Kernel v19.0.0...');
    await this.initializeAll();
    await this.startAll();
    this.isBootedFlag = true;
    this.eventBus.publish('KernelBooted', { timestamp: new Date().toISOString() });
    this.logger.info('MedCore Kernel successfully booted and all modules active.');
  }

  public async shutdown(): Promise<void> {
    if (!this.isBootedFlag) return;
    this.logger.info('Shutting down MedCore Kernel...');
    await this.terminateAll();
    this.isBootedFlag = false;
    this.eventBus.publish('KernelShutdown', { timestamp: new Date().toISOString() });
  }
}

export const medCoreKernel = MedCoreKernelService.getInstance();
