import { IModule, IModuleRegistry } from '../interfaces/IKernelInterfaces';
import { RegistrationException } from '../exceptions/KernelExceptions';

export class ModuleRegistryService implements IModuleRegistry {
  private modules: Map<string, IModule> = new Map();

  public register(module: IModule): void {
    if (!module.id || !module.name) {
      throw new RegistrationException(module.id || 'unknown', 'Module must have a valid id and name.');
    }
    if (this.modules.has(module.id)) {
      throw new RegistrationException(module.id, `Module with ID [${module.id}] is already registered.`);
    }

    // Check dependencies
    if (module.dependencies) {
      for (const depId of module.dependencies) {
        if (!this.modules.has(depId)) {
          throw new RegistrationException(module.id, `Missing required dependency module: [${depId}]`);
        }
      }
    }

    this.modules.set(module.id, module);
  }

  public unregister(moduleId: string): void {
    if (!this.modules.has(moduleId)) {
      throw new RegistrationException(moduleId, `Cannot unregister: module [${moduleId}] not found.`);
    }
    this.modules.delete(moduleId);
  }

  public get(moduleId: string): IModule | undefined {
    return this.modules.get(moduleId);
  }

  public getAll(): IModule[] {
    return Array.from(this.modules.values());
  }

  public has(moduleId: string): boolean {
    return this.modules.has(moduleId);
  }
}
