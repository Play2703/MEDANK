import { IKernelLogger } from '../interfaces/IKernelInterfaces';

export class KernelLoggerService implements IKernelLogger {
  public debug(message: string, meta?: any): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[MedCoreKernel:DEBUG] ${message}`, meta || '');
    }
  }

  public info(message: string, meta?: any): void {
    console.info(`[MedCoreKernel:INFO] ${message}`, meta || '');
  }

  public warn(message: string, meta?: any): void {
    console.warn(`[MedCoreKernel:WARN] ${message}`, meta || '');
  }

  public error(message: string, error?: any, meta?: any): void {
    console.error(`[MedCoreKernel:ERROR] ${message}`, error || '', meta || '');
  }
}
