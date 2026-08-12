import { DeveloperStorageService } from './DeveloperStorageService';
import { SecurityAuditLog } from '../models/DeveloperSettings';

export class DeveloperLogService {
  private storage: DeveloperStorageService;

  constructor(storage = DeveloperStorageService.getInstance()) {
    this.storage = storage;
  }

  public logFailedAttempt(attemptCount: number, reason: string): void {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
    this.storage.addAuditLog({
      timestamp: new Date().toISOString(),
      attemptCount,
      reason,
      success: false,
      userAgent,
    });
  }

  public logLockoutTriggered(failedAttempts: number, lockoutDurationMinutes: number): void {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
    this.storage.addAuditLog({
      timestamp: new Date().toISOString(),
      attemptCount: failedAttempts,
      reason: `BLOQUEIO DE SEGURANÇA: ${failedAttempts} tentativas incorretas consecutivas. Painel travado por ${lockoutDurationMinutes} minutos.`,
      success: false,
      userAgent,
    });
  }

  public logSuccessfulAccess(): void {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
    this.storage.addAuditLog({
      timestamp: new Date().toISOString(),
      attemptCount: 0,
      reason: 'Acesso autenticado com sucesso ao Developer Console.',
      success: true,
      userAgent,
    });
  }

  public getLogs(): SecurityAuditLog[] {
    return this.storage.getAuditLogs();
  }
}
