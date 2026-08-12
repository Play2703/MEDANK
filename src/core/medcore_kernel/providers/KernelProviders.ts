import { StateNotifier, stateNotifierProvider, StateNotifierProvider } from '../../riverpod';
import { medCoreKernel } from '../services/MedCoreKernelService';
import { HealthCheckResult, ModuleState } from '../interfaces/IKernelInterfaces';

export interface KernelState {
  isBooted: boolean;
  modules: { id: string; name: string; state: ModuleState }[];
  health: HealthCheckResult[];
  config: Record<string, any>;
}

export class KernelNotifier extends StateNotifier<KernelState> {
  constructor() {
    super({
      isBooted: false,
      modules: [],
      health: [],
      config: medCoreKernel.config.getAll(),
    });
    this.initKernel();
  }

  private async initKernel(): Promise<void> {
    await medCoreKernel.boot();
    this.refreshState();
  }

  public refreshState(): void {
    const allModules = medCoreKernel.getAll().map((m) => ({
      id: m.id,
      name: m.name,
      state: m.getState(),
    }));

    medCoreKernel.checkHealth().then((health) => {
      this.state = {
        isBooted: true,
        modules: allModules,
        health,
        config: medCoreKernel.config.getAll(),
      };
    });
  }
}

export const medCoreKernelProvider: StateNotifierProvider<KernelNotifier, KernelState> =
  stateNotifierProvider(() => new KernelNotifier());
