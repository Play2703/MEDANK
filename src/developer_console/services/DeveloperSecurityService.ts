import { DeveloperStorageService } from './DeveloperStorageService';
import { DeveloperLogService } from './DeveloperLogService';
import { LockoutState } from '../models/DeveloperSettings';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

export class DeveloperSecurityService {
  private storage: DeveloperStorageService;
  private logger: DeveloperLogService;

  constructor(
    storage = DeveloperStorageService.getInstance(),
    logger = new DeveloperLogService(storage)
  ) {
    this.storage = storage;
    this.logger = logger;
  }

  public getLockoutState(): LockoutState {
    return this.storage.getLockoutState();
  }

  public isBlocked(): boolean {
    const state = this.getLockoutState();
    if (!state.isBlocked) return false;

    if (state.lockoutUntil) {
      const until = new Date(state.lockoutUntil).getTime();
      if (Date.now() >= until) {
        // Lockout expired
        this.resetLockout();
        return false;
      }
      return true;
    }
    return false;
  }

  public getRemainingLockoutSeconds(): number {
    const state = this.getLockoutState();
    if (!state.isBlocked || !state.lockoutUntil) return 0;
    const remainingMs = new Date(state.lockoutUntil).getTime() - Date.now();
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  public registerFailedAttempt(): { isNowBlocked: boolean; attempts: number } {
    const currentState = this.getLockoutState();
    const newAttempts = currentState.failedAttempts + 1;

    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
      const updatedState: LockoutState = {
        isBlocked: true,
        lockoutUntil,
        failedAttempts: newAttempts,
      };
      this.storage.saveLockoutState(updatedState);
      this.logger.logLockoutTriggered(newAttempts, 5);
      return { isNowBlocked: true, attempts: newAttempts };
    } else {
      const updatedState: LockoutState = {
        isBlocked: false,
        lockoutUntil: null,
        failedAttempts: newAttempts,
      };
      this.storage.saveLockoutState(updatedState);
      this.logger.logFailedAttempt(newAttempts, 'PIN incorreto fornecido na tentativa de autenticação.');
      return { isNowBlocked: false, attempts: newAttempts };
    }
  }

  public resetLockout(): void {
    const resetState: LockoutState = {
      isBlocked: false,
      lockoutUntil: null,
      failedAttempts: 0,
    };
    this.storage.saveLockoutState(resetState);
  }
}
