/**
 * Persistent Authentication Utility
 * Maintains authentication state through reloads, network errors, and page navigation
 */

import { useUser, useAuth } from '@clerk/nextjs';
import { useEffect, useCallback, useState } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  token: string | null;
  lastValidated: number;
  userPlan: string | null;
}

const AUTH_STORAGE_KEY = 'insturix_auth_state';
const AUTH_VALIDATION_INTERVAL = 5 * 60 * 1000; // 5 minutes
const AUTH_RETRY_INTERVAL = 30 * 1000; // 30 seconds for retries

class PersistentAuthManager {
  private authState: AuthState | null = null;
  private validationTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.loadAuthState();
  }

  private loadAuthState(): void {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        this.authState = JSON.parse(stored);
        
        // Validate stored auth hasn't expired (24 hours)
        const now = Date.now();
        if (this.authState && (now - this.authState.lastValidated) > 24 * 60 * 60 * 1000) {
          this.clearAuthState();
        }
      }
    } catch (error) {
      // Failed to load auth state from storage - silent failure for security
      this.clearAuthState();
    }
  }

  private saveAuthState(): void {
    try {
      if (this.authState) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.authState));
      }
    } catch (error) {
      // Failed to save auth state to storage - silent failure for security
    }
  }

  private clearAuthState(): void {
    this.authState = null;
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (error) {
      // Failed to clear auth state from storage - silent failure for security
    }
  }

  updateAuthState(userId: string, userPlan: string = 'free'): void {
    this.authState = {
      isAuthenticated: true,
      userId,
      token: userId, // For now, use userId as token
      lastValidated: Date.now(),
      userPlan
    };
    this.saveAuthState();
  }

  getAuthState(): AuthState | null {
    return this.authState;
  }

  getAuthToken(): string | null {
    return this.authState?.token || null;
  }

  isAuthenticated(): boolean {
    return this.authState?.isAuthenticated || false;
  }

  getUserId(): string | null {
    return this.authState?.userId || null;
  }

  getUserPlan(): string | null {
    return this.authState?.userPlan || null;
  }

  logout(): void {
    this.clearAuthState();
    if (this.validationTimer) {
      clearTimeout(this.validationTimer);
      this.validationTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  async validateAuth(): Promise<boolean> {
    if (!this.authState) return false;

    try {
      // Validate with backend
      const response = await fetch('/api/user/validate', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authState.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          this.authState.lastValidated = Date.now();
          if (data.plan) {
            this.authState.userPlan = data.plan;
          }
          this.saveAuthState();
          return true;
        }
      }
      
      // Auth validation failed
      this.clearAuthState();
      return false;
    } catch (error) {
      // Network error - don't clear auth, just return false
      // Auth validation failed due to network error - silent failure for security
      return false;
    }
  }

  startPeriodicValidation(): void {
    this.stopPeriodicValidation();
    
    const validate = async () => {
      const isValid = await this.validateAuth();
      
      if (isValid) {
        // Schedule next validation
        this.validationTimer = setTimeout(validate, AUTH_VALIDATION_INTERVAL);
      } else {
        // Retry validation more frequently if it failed
        this.retryTimer = setTimeout(validate, AUTH_RETRY_INTERVAL);
      }
    };

    // Start validation
    validate();
  }

  stopPeriodicValidation(): void {
    if (this.validationTimer) {
      clearTimeout(this.validationTimer);
      this.validationTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}

// Global instance
const authManager = new PersistentAuthManager();

/**
 * React hook for persistent authentication
 */
export function usePersistentAuth() {
  const { user, isLoaded } = useUser();
  const { isSignedIn } = useAuth();
  const [authState, setAuthState] = useState<AuthState | null>(authManager.getAuthState());

  // Update auth state when Clerk auth changes
  useEffect(() => {
    if (isLoaded) {
      if (isSignedIn && user?.id) {
        // User is authenticated with Clerk
        authManager.updateAuthState(user.id, user.publicMetadata?.plan as string || 'free');
        setAuthState(authManager.getAuthState());
        authManager.startPeriodicValidation();
      } else {
        // User is not authenticated
        authManager.logout();
        setAuthState(null);
      }
    }
  }, [isLoaded, isSignedIn, user?.id, user?.publicMetadata?.plan]);

  // Start periodic validation on mount
  useEffect(() => {
    if (authManager.isAuthenticated()) {
      authManager.startPeriodicValidation();
    }

    // Cleanup on unmount
    return () => {
      authManager.stopPeriodicValidation();
    };
  }, []);

  const logout = useCallback(() => {
    authManager.logout();
    setAuthState(null);
  }, []);

  const getAuthHeaders = useCallback(() => {
    const token = authManager.getAuthToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, []);

  const validateAuth = useCallback(async () => {
    const isValid = await authManager.validateAuth();
    setAuthState(authManager.getAuthState());
    return isValid;
  }, []);

  return {
    isAuthenticated: authManager.isAuthenticated(),
    userId: authManager.getUserId(),
    userPlan: authManager.getUserPlan(),
    authState,
    logout,
    getAuthHeaders,
    validateAuth,
    isLoaded
  };
}

export default authManager; 