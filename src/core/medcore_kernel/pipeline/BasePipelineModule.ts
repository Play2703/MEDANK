import { IModule, IModuleRegistry, IKernelContext, ModuleState } from '../interfaces/IKernelInterfaces';

export abstract class BasePipelineModule implements IModule {
  public abstract id: string;
  public abstract name: string;
  public version: string = '19.0.0';
  public dependencies?: string[] = [];
  protected state: ModuleState = ModuleState.Unregistered;
  protected context?: IKernelContext;

  public register(registry: IModuleRegistry): void {
    this.state = ModuleState.Registered;
  }

  public async initialize(context: IKernelContext): Promise<void> {
    this.context = context;
    this.state = ModuleState.Initializing;
    context.logger.info(`Initializing pipeline module: [${this.name}]`);
    this.state = ModuleState.Active;
  }

  public async start(): Promise<void> {
    this.state = ModuleState.Active;
  }

  public async suspend(): Promise<void> {
    this.state = ModuleState.Suspended;
  }

  public async resume(): Promise<void> {
    this.state = ModuleState.Active;
  }

  public async terminate(): Promise<void> {
    this.state = ModuleState.Terminated;
  }

  public getState(): ModuleState {
    return this.state;
  }
}
