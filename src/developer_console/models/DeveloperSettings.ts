export interface DeveloperModule {
  id: string;
  name: string;
  description: string;
  iconName: string;
  category: 'knowledge' | 'sources' | 'ai' | 'system';
  status: 'Em desenvolvimento' | 'Ativo' | 'Planejado';
  enabled: boolean;
  futureFormats?: string[];
}

export interface SecurityAuditLog {
  id: string;
  timestamp: string;
  attemptCount: number;
  reason: string;
  success: boolean;
  userAgent?: string;
}

export interface LockoutState {
  isBlocked: boolean;
  lockoutUntil: string | null; // ISO string
  failedAttempts: number;
}

export interface DeveloperState {
  isAuthenticated: boolean;
  isAuthDialogOpen: boolean;
  isConsoleOpen: boolean;
  lockout: LockoutState;
  auditLogs: SecurityAuditLog[];
}
