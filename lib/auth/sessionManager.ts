/**
 * Secure Session Management System
 * Handles session fixation, concurrent session limits, and secure session lifecycle
 */

import { useState, useEffect, useCallback } from 'react';

export interface SessionInfo {
  sessionId: string;
  userId: string;
  createdAt: number;
  lastActivity: number;
  deviceId: string;
  userAgent: string;
  isActive: boolean;
  privilege: 'user' | 'admin' | 'premium';
}

interface SessionLimits {
  maxConcurrentSessions: number;
  sessionTimeoutMs: number;
  privilegeChangeRegenerationRequired: boolean;
}

const SESSION_LIMITS: Record<string, SessionLimits> = {
  free: {
    maxConcurrentSessions: 2,
    sessionTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
    privilegeChangeRegenerationRequired: true
  },
  plus: {
    maxConcurrentSessions: 3,
    sessionTimeoutMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    privilegeChangeRegenerationRequired: true
  },
  pro: {
    maxConcurrentSessions: 5,
    sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    privilegeChangeRegenerationRequired: true
  },
  premium: {
    maxConcurrentSessions: 10,
    sessionTimeoutMs: 90 * 24 * 60 * 60 * 1000, // 90 days
    privilegeChangeRegenerationRequired: true
  }
};

const SESSION_STORAGE_KEY = 'insturix_session_info';
const DEVICE_ID_KEY = 'insturix_device_id';

class SecureSessionManager {
  private static instance: SecureSessionManager;
  private currentSession: SessionInfo | null = null;
  private sessionValidationTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.loadSession();
    this.startSessionValidation();
  }

  static getInstance(): SecureSessionManager {
    if (!SecureSessionManager.instance) {
      SecureSessionManager.instance = new SecureSessionManager();
    }
    return SecureSessionManager.instance;
  }

  /**
   * Generate a cryptographically secure session ID
   */
  private generateSessionId(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate or retrieve device ID
   */
  private getDeviceId(): string {
    try {
      let deviceId = localStorage.getItem(DEVICE_ID_KEY);
      if (!deviceId) {
        deviceId = this.generateSessionId();
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
      }
      return deviceId;
    } catch {
      // Fallback for storage issues
      return 'unknown-device';
    }
  }

  /**
   * Load session from storage
   */
  private loadSession(): void {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const session: SessionInfo = JSON.parse(stored);
        
        // Validate session hasn't expired
        const limits = SESSION_LIMITS[session.privilege] || SESSION_LIMITS.free;
        if (Date.now() - session.lastActivity > limits.sessionTimeoutMs) {
          this.clearSession();
          return;
        }
        
        this.currentSession = session;
      }
    } catch (error) {
      // Failed to load session - clear any corrupted data
      this.clearSession();
    }
  }

  /**
   * Save session to storage
   */
  private saveSession(): void {
    if (!this.currentSession) return;
    
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.currentSession));
    } catch (error) {
      // Session save failed - security issue, invalidate session
      this.clearSession();
    }
  }

  /**
   * Create a new session
   */
  async createSession(userId: string, userPlan: string = 'free'): Promise<SessionInfo | null> {
    try {
      // Check concurrent session limits
      const activeSessions = await this.getActiveSessionsCount(userId);
      const limits = SESSION_LIMITS[userPlan.toLowerCase()] || SESSION_LIMITS.free;
      
      if (activeSessions >= limits.maxConcurrentSessions) {
        // Remove oldest session to make room
        await this.removeOldestSession(userId);
      }

      // Generate new session
      const sessionId = this.generateSessionId();
      const deviceId = this.getDeviceId();
      
      const newSession: SessionInfo = {
        sessionId,
        userId,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        deviceId,
        userAgent: navigator.userAgent.slice(0, 200), // Limit length for security
        isActive: true,
        privilege: this.mapPlanToPrivilege(userPlan)
      };

      // Register session with backend
      const registered = await this.registerSessionWithBackend(newSession);
      if (!registered) {
        return null;
      }

      this.currentSession = newSession;
      this.saveSession();
      
      return newSession;
    } catch (error) {
      // Session creation failed
      return null;
    }
  }

  /**
   * Update session activity
   */
  updateActivity(): void {
    if (!this.currentSession) return;
    
    this.currentSession.lastActivity = Date.now();
    this.saveSession();
    
    // Notify backend of activity (fire and forget)
    this.updateActivityWithBackend().catch(() => {
      // Silent failure for activity updates
    });
  }

  /**
   * Handle privilege changes (regenerate session)
   */
  async onPrivilegeChange(newPlan: string): Promise<boolean> {
    if (!this.currentSession) return false;
    
    const newPrivilege = this.mapPlanToPrivilege(newPlan);
    const limits = SESSION_LIMITS[newPlan.toLowerCase()] || SESSION_LIMITS.free;
    
    if (limits.privilegeChangeRegenerationRequired || this.currentSession.privilege !== newPrivilege) {
      // Invalidate current session
      await this.invalidateSession();
      
      // Create new session with new privileges
      const newSession = await this.createSession(this.currentSession.userId, newPlan);
      return !!newSession;
    }
    
    // Update privilege without regeneration
    this.currentSession.privilege = newPrivilege;
    this.saveSession();
    return true;
  }

  /**
   * Get current session
   */
  getCurrentSession(): SessionInfo | null {
    return this.currentSession;
  }

  /**
   * Validate current session
   */
  async validateSession(): Promise<boolean> {
    if (!this.currentSession) return false;
    
    try {
      const response = await fetch('/api/auth/validate-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentSession.sessionId}`
        },
        body: JSON.stringify({
          sessionId: this.currentSession.sessionId,
          deviceId: this.currentSession.deviceId
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.valid) {
          this.updateActivity();
          return true;
        }
      }
      
      // Session invalid
      this.clearSession();
      return false;
    } catch (error) {
      // Network error - don't invalidate session
      return true;
    }
  }

  /**
   * Invalidate current session
   */
  async invalidateSession(): Promise<void> {
    if (!this.currentSession) return;
    
    try {
      await fetch('/api/auth/invalidate-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentSession.sessionId}`
        },
        body: JSON.stringify({
          sessionId: this.currentSession.sessionId
        })
      });
    } catch (error) {
      // Backend invalidation failed - still clear local session
    }
    
    this.clearSession();
  }

  /**
   * Clear session locally
   */
  clearSession(): void {
    this.currentSession = null;
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
      // Storage clear failed
    }
    
    if (this.sessionValidationTimer) {
      clearInterval(this.sessionValidationTimer);
      this.sessionValidationTimer = null;
    }
  }

  /**
   * Start periodic session validation
   */
  private startSessionValidation(): void {
    // Validate session every 5 minutes
    this.sessionValidationTimer = setInterval(async () => {
      if (this.currentSession) {
        await this.validateSession();
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Get active sessions count for user
   */
  private async getActiveSessionsCount(userId: string): Promise<number> {
    try {
      const response = await fetch(`/api/auth/sessions/count?userId=${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        return result.count || 0;
      }
    } catch (error) {
      // Fallback to assuming no active sessions
    }
    return 0;
  }

  /**
   * Remove oldest session for user
   */
  private async removeOldestSession(userId: string): Promise<void> {
    try {
      await fetch('/api/auth/sessions/remove-oldest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
      });
    } catch (error) {
      // Failed to remove oldest session
    }
  }

  /**
   * Register session with backend
   */
  private async registerSessionWithBackend(session: SessionInfo): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/sessions/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(session)
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Update activity with backend
   */
  private async updateActivityWithBackend(): Promise<void> {
    if (!this.currentSession) return;
    
    await fetch('/api/auth/sessions/activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.currentSession.sessionId}`
      },
      body: JSON.stringify({
        sessionId: this.currentSession.sessionId,
        lastActivity: this.currentSession.lastActivity
      })
    });
  }

  /**
   * Map plan to privilege level
   */
  private mapPlanToPrivilege(plan: string): 'user' | 'admin' | 'premium' {
    switch (plan.toLowerCase()) {
      case 'premium':
        return 'premium';
      case 'admin':
        return 'admin';
      default:
        return 'user';
    }
  }

  /**
   * Get session limits for plan
   */
  getSessionLimits(plan: string): SessionLimits {
    return SESSION_LIMITS[plan.toLowerCase()] || SESSION_LIMITS.free;
  }
}

// Global instance
const sessionManager = SecureSessionManager.getInstance();

/**
 * React hook for secure session management
 */
export function useSecureSession() {
  const [session, setSession] = useState<SessionInfo | null>(sessionManager.getCurrentSession());

  useEffect(() => {
    // Validate session on mount
    sessionManager.validateSession().then((valid) => {
      if (!valid) {
        setSession(null);
      }
    });

    // Update activity on user interaction
    const updateActivity = () => {
      sessionManager.updateActivity();
    };

    const events = ['click', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
    };
  }, []);

  const createSession = useCallback(async (userId: string, userPlan: string = 'free') => {
    const newSession = await sessionManager.createSession(userId, userPlan);
    setSession(newSession);
    return newSession;
  }, []);

  const invalidateSession = useCallback(async () => {
    await sessionManager.invalidateSession();
    setSession(null);
  }, []);

  const onPrivilegeChange = useCallback(async (newPlan: string) => {
    const success = await sessionManager.onPrivilegeChange(newPlan);
    if (success) {
      setSession(sessionManager.getCurrentSession());
    }
    return success;
  }, []);

  return {
    session,
    createSession,
    invalidateSession,
    onPrivilegeChange,
    isAuthenticated: !!session
  };
}

export default sessionManager; 