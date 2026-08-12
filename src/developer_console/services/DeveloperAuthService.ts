import { DeveloperStorageService } from './DeveloperStorageService';
import { DeveloperSecurityService } from './DeveloperSecurityService';
import { DeveloperLogService } from './DeveloperLogService';

export class DeveloperAuthService {
  private storage: DeveloperStorageService;
  private security: DeveloperSecurityService;
  private logger: DeveloperLogService;

  constructor(
    storage = DeveloperStorageService.getInstance(),
    security = new DeveloperSecurityService(storage),
    logger = new DeveloperLogService(storage)
  ) {
    this.storage = storage;
    this.security = security;
    this.logger = logger;
  }

  public verifyPin(inputPin: string): { success: boolean; isBlocked: boolean; errorMessage?: string } {
    // 1. Check if currently blocked
    if (this.security.isBlocked()) {
      const remaining = this.security.getRemainingLockoutSeconds();
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      return {
        success: false,
        isBlocked: true,
        errorMessage: `Acesso negado. Sistema bloqueado temporariamente (${mins}m ${secs}s).`,
      };
    }

    // 2. Validate input against secure storage PIN
    const storedPin = this.storage.getPin();
    if (inputPin === storedPin) {
      // Success! Reset security counters and log
      this.security.resetLockout();
      this.logger.logSuccessfulAccess();
      return { success: true, isBlocked: false };
    } else {
      // Failed PIN!
      const result = this.security.registerFailedAttempt();
      if (result.isNowBlocked) {
        return {
          success: false,
          isBlocked: true,
          errorMessage: 'Acesso negado.',
        };
      }
      return {
        success: false,
        isBlocked: false,
        errorMessage: 'Acesso negado.',
      };
    }
  }

  public changePin(currentPin: string, newPin: string): { success: boolean; message: string } {
    const storedPin = this.storage.getPin();
    if (currentPin !== storedPin) {
      return { success: false, message: 'PIN atual incorreto.' };
    }
    if (!newPin || newPin.length < 4) {
      return { success: false, message: 'O novo PIN deve conter no mínimo 4 caracteres.' };
    }
    this.storage.savePin(newPin);
    return { success: true, message: 'PIN do desenvolvedor atualizado com sucesso!' };
  }
}
