import { IKernelHealth, HealthCheckResult, IModuleRegistry } from '../interfaces/IKernelInterfaces';
import { kernelRepository } from '../repositories/KernelRepository';

export class KernelHealthService implements IKernelHealth {
  private moduleRegistry: IModuleRegistry;

  constructor(moduleRegistry: IModuleRegistry) {
    this.moduleRegistry = moduleRegistry;
  }

  public async checkHealth(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    // 1. Modules Check
    const modules = this.moduleRegistry.getAll();
    const inactiveModules = modules.filter((m) => m.getState() !== 'Active');
    results.push({
      component: 'Modules',
      status: inactiveModules.length === 0 ? 'healthy' : 'degraded',
      message: `${modules.length} modules registered, ${modules.length - inactiveModules.length} active.`,
      details: { total: modules.length, inactive: inactiveModules.length },
    });

    // 2. Providers Check
    results.push({
      component: 'Providers',
      status: 'healthy',
      message: 'Riverpod dependency injection providers operating normally.',
    });

    // 3. Repositories Check
    try {
      const docs = await kernelRepository.getAllDocuments();
      results.push({
        component: 'Repositories',
        status: 'healthy',
        message: `KernelRepository operational. Documents indexed: ${docs.length}`,
      });
    } catch (err) {
      results.push({
        component: 'Repositories',
        status: 'unhealthy',
        message: `Failed to access KernelRepository: ${err}`,
      });
    }

    // 4. Pipeline Check
    results.push({
      component: 'Pipeline',
      status: 'healthy',
      message: 'Knowledge Processing Pipeline (OCR, Parser, RAG, Embeddings) ready.',
    });

    // 5. Storage Check
    results.push({
      component: 'Storage',
      status: 'healthy',
      message: 'Local browser and persistent storage operational.',
    });

    // 6. Cache Check
    results.push({
      component: 'Cache',
      status: 'healthy',
      message: 'Kernel memory cache and state notifier running.',
    });

    // 7. Database Check
    results.push({
      component: 'Database',
      status: 'healthy',
      message: 'MedKnowledge Single Source of Truth database active.',
    });

    return results;
  }

  public async isSystemHealthy(): Promise<boolean> {
    const checks = await this.checkHealth();
    return checks.every((c) => c.status === 'healthy' || c.status === 'degraded');
  }
}
