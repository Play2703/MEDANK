import { IKernelDispatcher } from '../interfaces/IKernelInterfaces';
import { KernelException } from '../exceptions/KernelExceptions';

export class KernelDispatcherService implements IKernelDispatcher {
  private handlers: Map<string, (payload: any) => Promise<any>> = new Map();

  public registerHandler<T = any, R = any>(commandName: string, handler: (payload: T) => Promise<R>): void {
    if (this.handlers.has(commandName)) {
      console.warn(`[KernelDispatcher] Command handler for [${commandName}] is being overwritten.`);
    }
    this.handlers.set(commandName, handler);
  }

  public async dispatchCommand<T = any>(commandName: string, payload: any): Promise<T> {
    const handler = this.handlers.get(commandName);
    if (!handler) {
      throw new KernelException(`No command handler registered for command: [${commandName}]`);
    }
    try {
      return await handler(payload);
    } catch (err) {
      throw new KernelException(`Error executing command [${commandName}]: ${err}`);
    }
  }
}
