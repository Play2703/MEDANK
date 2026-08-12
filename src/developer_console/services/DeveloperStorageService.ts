import { LockoutState, SecurityAuditLog } from '../models/DeveloperSettings';

const PIN_STORAGE_KEY = 'medanki_dev_sec_pin_v1';
const LOCKOUT_STORAGE_KEY = 'medanki_dev_sec_lockout_v1';
const AUDIT_LOGS_KEY = 'medanki_dev_sec_audit_v1';
const INITIAL_DEFAULT_PIN = 'apolo2706';

/**
 * Secure Storage Abstraction Layer
 * Simulates Keychain (iOS) / Keystore (Android) via encrypted local vault keying
 */
export class DeveloperStorageService {
  private static instance: DeveloperStorageService;

  private constructor() {
    this.ensureInitialized();
  }

  public static getInstance(): DeveloperStorageService {
    if (!DeveloperStorageService.instance) {
      DeveloperStorageService.instance = new DeveloperStorageService();
    }
    return DeveloperStorageService.instance;
  }

  private ensureInitialized(): void {
    try {
      const existingPin = localStorage.getItem(PIN_STORAGE_KEY);
      if (!existingPin) {
        // Initialize default PIN in secure vault
        this.savePin(INITIAL_DEFAULT_PIN);
      }
    } catch (e) {
      console.warn('DeveloperStorageService init fallback:', e);
    }
  }

  /**
   * Simple reversible obfuscation to prevent plain text inspection in localStorage
   */
  private obfuscate(text: string): string {
    return btoa(encodeURIComponent(text).split('').reverse().join(''));
  }

  private deobfuscate(cipher: string): string {
    try {
      return decodeURIComponent(atob(cipher).split('').reverse().join(''));
    } catch {
      return cipher;
    }
  }

  public getPin(): string {
    try {
      const cipher = localStorage.getItem(PIN_STORAGE_KEY);
      if (!cipher) return INITIAL_DEFAULT_PIN;
      return this.deobfuscate(cipher);
    } catch {
      return INITIAL_DEFAULT_PIN;
    }
  }

  public savePin(newPin: string): void {
    try {
      const cipher = this.obfuscate(newPin);
      localStorage.setItem(PIN_STORAGE_KEY, cipher);
    } catch (e) {
      console.error('Error saving PIN in Secure Storage:', e);
    }
  }

  public getLockoutState(): LockoutState {
    try {
      const raw = localStorage.getItem(LOCKOUT_STORAGE_KEY);
      if (!raw) {
        return { isBlocked: false, lockoutUntil: null, failedAttempts: 0 };
      }
      const data: LockoutState = JSON.parse(raw);
      
      // Check if lockout expired
      if (data.lockoutUntil && new Date(data.lockoutUntil).getTime() <= Date.now()) {
        const resetState: LockoutState = { isBlocked: false, lockoutUntil: null, failedAttempts: 0 };
        this.saveLockoutState(resetState);
        return resetState;
      }
      return data;
    } catch {
      return { isBlocked: false, lockoutUntil: null, failedAttempts: 0 };
    }
  }

  public saveLockoutState(state: LockoutState): void {
    try {
      localStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Error saving lockout state:', e);
    }
  }

  public getAuditLogs(): SecurityAuditLog[] {
    try {
      const raw = localStorage.getItem(AUDIT_LOGS_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public addAuditLog(log: Omit<SecurityAuditLog, 'id'>): void {
    try {
      const logs = this.getAuditLogs();
      const newEntry: SecurityAuditLog = {
        ...log,
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      };
      logs.unshift(newEntry);
      // Keep last 100 logs
      if (logs.length > 100) logs.pop();
      localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(logs));
    } catch (e) {
      console.error('Error saving audit log:', e);
    }
  }
}
