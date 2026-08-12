import { DeveloperStorageService } from '../services/DeveloperStorageService';
import { DeveloperSecurityService } from '../services/DeveloperSecurityService';
import { DeveloperAuthService } from '../services/DeveloperAuthService';
import { DeveloperLogService } from '../services/DeveloperLogService';
import { DeveloperRepository } from '../repositories/DeveloperRepository';
import { DeveloperModule, SecurityAuditLog, LockoutState } from '../models/DeveloperSettings';

export interface DeveloperConsoleState {
  isAuthDialogOpen: boolean;
  isConsoleOpen: boolean;
  pinInput: string;
  showPin: boolean;
  errorMessage: string | null;
  lockoutState: LockoutState;
  remainingLockoutSeconds: number;
  auditLogs: SecurityAuditLog[];
  modules: DeveloperModule[];
  // Secret gesture tap tracking
  tapTimestamps: number[];
}

type Listener = () => void;

export class DeveloperConsoleStore {
  private static instance: DeveloperConsoleStore;

  private storageService: DeveloperStorageService;
  private securityService: DeveloperSecurityService;
  private authService: DeveloperAuthService;
  private logService: DeveloperLogService;
  private repository: DeveloperRepository;

  private state: DeveloperConsoleState;
  private listeners: Set<Listener> = new Set();
  private lockoutTimer: any = null;

  private constructor() {
    this.storageService = DeveloperStorageService.getInstance();
    this.logService = new DeveloperLogService(this.storageService);
    this.securityService = new DeveloperSecurityService(this.storageService, this.logService);
    this.authService = new DeveloperAuthService(this.storageService, this.securityService, this.logService);
    this.repository = new DeveloperRepository();

    this.state = {
      isAuthDialogOpen: false,
      isConsoleOpen: false,
      pinInput: '',
      showPin: false,
      errorMessage: null,
      lockoutState: this.securityService.getLockoutState(),
      remainingLockoutSeconds: this.securityService.getRemainingLockoutSeconds(),
      auditLogs: this.logService.getLogs(),
      modules: this.repository.getModules(),
      tapTimestamps: [],
    };

    // If initial state is blocked, start ticker
    if (this.state.remainingLockoutSeconds > 0) {
      this.startLockoutTimer();
    }
  }

  public static getInstance(): DeveloperConsoleStore {
    if (!DeveloperConsoleStore.instance) {
      DeveloperConsoleStore.instance = new DeveloperConsoleStore();
    }
    return DeveloperConsoleStore.instance;
  }

  public getState(): DeveloperConsoleState {
    return this.state;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  private setState(partial: Partial<DeveloperConsoleState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  /**
   * Secret 7-tap gesture handler on "M3 CLEAN ARCH" badge
   * Must execute silently without any UI feedback, color change, counter or toast.
   */
  public handleSecretTap(): void {
    const now = Date.now();
    const WINDOW_MS = 3000;
    const TARGET_TAPS = 7;

    // Filter taps within 3 seconds
    const validTaps = [...this.state.tapTimestamps, now].filter((t) => now - t <= WINDOW_MS);

    if (validTaps.length >= TARGET_TAPS) {
      // 7 taps achieved! Open Auth Dialog silently
      this.openAuthDialog();
      this.setState({ tapTimestamps: [] });
    } else {
      this.setState({ tapTimestamps: validTaps });
    }
  }

  public openAuthDialog(): void {
    const lockoutState = this.securityService.getLockoutState();
    const remaining = this.securityService.getRemainingLockoutSeconds();

    this.setState({
      isAuthDialogOpen: true,
      pinInput: '',
      showPin: false,
      errorMessage: null,
      lockoutState,
      remainingLockoutSeconds: remaining,
    });

    if (remaining > 0) {
      this.startLockoutTimer();
    }
  }

  public closeAuthDialog(): void {
    this.setState({
      isAuthDialogOpen: false,
      pinInput: '',
      errorMessage: null,
    });
  }

  public setPinInput(val: string): void {
    this.setState({ pinInput: val, errorMessage: null });
  }

  public toggleShowPin(): void {
    this.setState({ showPin: !this.state.showPin });
  }

  public submitPin(): boolean {
    const { pinInput } = this.state;
    if (!pinInput.trim()) {
      this.setState({ errorMessage: 'Acesso negado.' });
      return false;
    }

    const result = this.authService.verifyPin(pinInput.trim());

    if (result.success) {
      // Authenticated! Close dialog, open Developer Console view
      this.setState({
        isAuthDialogOpen: false,
        isConsoleOpen: true,
        pinInput: '',
        errorMessage: null,
        auditLogs: this.logService.getLogs(),
        lockoutState: this.securityService.getLockoutState(),
        remainingLockoutSeconds: 0,
      });
      this.stopLockoutTimer();
      return true;
    } else {
      // Failed or blocked
      const remaining = this.securityService.getRemainingLockoutSeconds();
      this.setState({
        errorMessage: result.errorMessage || 'Acesso negado.',
        lockoutState: this.securityService.getLockoutState(),
        remainingLockoutSeconds: remaining,
        auditLogs: this.logService.getLogs(),
      });

      if (result.isBlocked || remaining > 0) {
        this.startLockoutTimer();
      }
      return false;
    }
  }

  public closeConsoleView(): void {
    this.setState({ isConsoleOpen: false });
  }

  public changePin(currentPin: string, newPin: string): { success: boolean; message: string } {
    const res = this.authService.changePin(currentPin, newPin);
    if (res.success) {
      this.setState({ auditLogs: this.logService.getLogs() });
    }
    return res;
  }

  private startLockoutTimer(): void {
    if (this.lockoutTimer) return;
    this.lockoutTimer = setInterval(() => {
      const remaining = this.securityService.getRemainingLockoutSeconds();
      const lockoutState = this.securityService.getLockoutState();
      this.setState({
        remainingLockoutSeconds: remaining,
        lockoutState,
      });

      if (remaining <= 0) {
        this.stopLockoutTimer();
        this.setState({ errorMessage: null });
      }
    }, 1000);
  }

  private stopLockoutTimer(): void {
    if (this.lockoutTimer) {
      clearInterval(this.lockoutTimer);
      this.lockoutTimer = null;
    }
  }
}
