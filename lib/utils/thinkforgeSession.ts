// Unified ThinkForge Session Management
export const THINKFORGE_CURRENT_SESSION_KEY = 'thinkforge_current_session';
export const THINKFORGE_RECENT_SESSIONS_KEY = 'thinkforge_recent_sessions';
export const THINKFORGE_SESSION_USER_KEY = 'thinkforge_session_user';
export const THINKFORGE_SESSION_CREATED_KEY = 'thinkforge_session_created';

export interface SessionMetadata {
  id: string;
  createdAt: number;
  lastUsed: number;
  prompt?: string;
  tone?: string;
  phase?: string;
  isUsed: boolean; // Track if session has been actually used
}

/**
 * Validate session ID format (MongoDB ObjectId - 24 hex chars)
 */
export function isValidSessionId(sessionId: string | null | undefined): boolean {
  return Boolean(sessionId && typeof sessionId === 'string' && /^[0-9a-fA-F]{24}$/.test(sessionId));
}

/**
 * Get current active session ID
 */
export function getCurrentSessionId(): string | null {
  try {
    const sessionId = localStorage.getItem(THINKFORGE_CURRENT_SESSION_KEY);
    return isValidSessionId(sessionId) ? sessionId : null;
  } catch {
    return null;
  }
}

/**
 * Set current active session ID with validation
 */
export function setCurrentSessionId(sessionId: string, userId: string): boolean {
  if (!isValidSessionId(sessionId)) {
    // Invalid session ID format - silent validation failure for security
    return false;
  }

  try {
    localStorage.setItem(THINKFORGE_CURRENT_SESSION_KEY, sessionId);
    localStorage.setItem(THINKFORGE_SESSION_USER_KEY, userId);
    localStorage.setItem(THINKFORGE_SESSION_CREATED_KEY, Date.now().toString());
    return true;
  } catch (error) {
    // Failed to set current session - silent failure for security
    return false;
  }
}

/**
 * Clear current session data
 */
export function clearCurrentSession(): void {
  try {
    const currentSessionId = getCurrentSessionId();
    localStorage.removeItem(THINKFORGE_CURRENT_SESSION_KEY);
    localStorage.removeItem(THINKFORGE_SESSION_USER_KEY);
    localStorage.removeItem(THINKFORGE_SESSION_CREATED_KEY);
    
    // Clean up workflow data for this session
    if (currentSessionId) {
      localStorage.removeItem(`thinkforge_workflow_${currentSessionId}`);
    }
  } catch (error) {
    // Failed to clear current session - silent failure for security
  }
}

/**
 * Get recent sessions with metadata
 */
export function getRecentSessions(): SessionMetadata[] {
  try {
    const sessionsData = localStorage.getItem(THINKFORGE_RECENT_SESSIONS_KEY);
    if (!sessionsData) return [];

    const sessions: SessionMetadata[] = JSON.parse(sessionsData);
    return sessions.filter(session => isValidSessionId(session.id));
  } catch {
    return [];
  }
}

/**
 * Add session to recent sessions list (limit to 3, remove duplicates)
 */
export function addToRecentSessions(sessionData: SessionMetadata): void {
  try {
    const recentSessions = getRecentSessions();
    
    // Remove existing session with same ID
    const filteredSessions = recentSessions.filter(s => s.id !== sessionData.id);
    
    // Add new session at the beginning
    const updatedSessions = [sessionData, ...filteredSessions].slice(0, 3);
    
    localStorage.setItem(THINKFORGE_RECENT_SESSIONS_KEY, JSON.stringify(updatedSessions));
  } catch (error) {
    // Failed to add session to recent list - silent failure for security
  }
}

/**
 * Update session metadata (mark as used, update prompt, etc.)
 */
export function updateSessionMetadata(sessionId: string, updates: Partial<SessionMetadata>): void {
  if (!isValidSessionId(sessionId)) return;

  try {
    const recentSessions = getRecentSessions();
    const sessionIndex = recentSessions.findIndex(s => s.id === sessionId);
    
    if (sessionIndex >= 0) {
      recentSessions[sessionIndex] = { 
        ...recentSessions[sessionIndex], 
        ...updates,
        lastUsed: Date.now()
      };
      localStorage.setItem(THINKFORGE_RECENT_SESSIONS_KEY, JSON.stringify(recentSessions));
    }
  } catch (error) {
    // Failed to update session metadata - silent failure for security
  }
}

/**
 * Mark session as used (has meaningful content)
 */
export function markSessionAsUsed(sessionId: string, prompt?: string, tone?: string, phase?: string): void {
  updateSessionMetadata(sessionId, {
    isUsed: true,
    prompt,
    tone,
    phase,
    lastUsed: Date.now()
  });
}

/**
 * Check if current session is stale (older than 24 hours or wrong user)
 */
export function isCurrentSessionStale(userId: string): boolean {
  try {
    const sessionUser = localStorage.getItem(THINKFORGE_SESSION_USER_KEY);
    const sessionCreated = localStorage.getItem(THINKFORGE_SESSION_CREATED_KEY);
    
    // Wrong user
    if (sessionUser !== userId) return true;
    
    // Too old (24 hours)
    if (sessionCreated) {
      const createdTime = parseInt(sessionCreated);
      const hoursSinceCreation = (Date.now() - createdTime) / (1000 * 60 * 60);
      if (hoursSinceCreation > 24) return true;
    }
    
    return false;
  } catch {
    return true;
  }
}

/**
 * Clean up unused sessions (sessions created but never used)
 */
export function cleanupUnusedSessions(): void {
  try {
    const recentSessions = getRecentSessions();
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Remove sessions that are older than 1 hour and never used
    const cleanedSessions = recentSessions.filter(session => {
      if (session.isUsed) return true; // Keep used sessions
      return session.createdAt > oneHourAgo; // Keep recent unused sessions
    });
    
    // Clean up local storage for removed sessions
    const removedSessions = recentSessions.filter(s => !cleanedSessions.includes(s));
    removedSessions.forEach(session => {
      try {
        localStorage.removeItem(`thinkforge_workflow_${session.id}`);
      } catch (error) {
        // Failed to clean up workflow data - silent failure for security
      }
    });
    
    localStorage.setItem(THINKFORGE_RECENT_SESSIONS_KEY, JSON.stringify(cleanedSessions));
    
    if (removedSessions.length > 0) {
      // Sessions cleaned up - silent operation for security
    }
  } catch (error) {
    // Failed to cleanup unused sessions - silent failure for security
  }
}

/**
 * Clear all session data (for logout)
 */
export function clearAllSessionData(): void {
  try {
    const recentSessions = getRecentSessions();
    
    // Clean up all workflow data
    recentSessions.forEach(session => {
      try {
        localStorage.removeItem(`thinkforge_workflow_${session.id}`);
      } catch (error) {
        // Failed to clean up workflow data - silent failure for security
      }
    });
    
    // Clear all session keys
    localStorage.removeItem(THINKFORGE_CURRENT_SESSION_KEY);
    localStorage.removeItem(THINKFORGE_RECENT_SESSIONS_KEY);
    localStorage.removeItem(THINKFORGE_SESSION_USER_KEY);
    localStorage.removeItem(THINKFORGE_SESSION_CREATED_KEY);
    
    // Legacy cleanup
    localStorage.removeItem('thinkforge_session_id');
    localStorage.removeItem('thinkforge_session_user');
    localStorage.removeItem('thinkforge_session_created');
    localStorage.removeItem('thinkforge:sessions');
  } catch (error) {
    // Failed to clear all session data - silent failure for security
  }
}

/**
 * Migrate from legacy session storage format
 */
export function migrateLegacySessionData(): void {
  try {
    // Migrate from old format
    const oldSessionId = localStorage.getItem('thinkforge_session_id');
    const oldSessionUser = localStorage.getItem('thinkforge_session_user');
    const oldSessionCreated = localStorage.getItem('thinkforge_session_created');
    const oldSessions = localStorage.getItem('thinkforge:sessions');
    
    if (oldSessionId && isValidSessionId(oldSessionId)) {
      // Set as current session
      if (oldSessionUser) {
        localStorage.setItem(THINKFORGE_CURRENT_SESSION_KEY, oldSessionId);
        localStorage.setItem(THINKFORGE_SESSION_USER_KEY, oldSessionUser);
        if (oldSessionCreated) {
          localStorage.setItem(THINKFORGE_SESSION_CREATED_KEY, oldSessionCreated);
        }
      }
      
      // Add to recent sessions
      const sessionMetadata: SessionMetadata = {
        id: oldSessionId,
        createdAt: oldSessionCreated ? parseInt(oldSessionCreated) : Date.now(),
        lastUsed: Date.now(),
        isUsed: true // Assume legacy sessions were used
      };
      addToRecentSessions(sessionMetadata);
    }
    
    // Handle old sessions list
    if (oldSessions) {
      try {
        const oldSessionsList: string[] = JSON.parse(oldSessions);
        oldSessionsList.forEach(sessionId => {
          if (isValidSessionId(sessionId) && sessionId !== oldSessionId) {
            const sessionMetadata: SessionMetadata = {
              id: sessionId,
              createdAt: Date.now() - Math.random() * 24 * 60 * 60 * 1000, // Random time in last 24h
              lastUsed: Date.now() - Math.random() * 24 * 60 * 60 * 1000,
              isUsed: true
            };
            addToRecentSessions(sessionMetadata);
          }
        });
      } catch (error) {
        // Failed to migrate old sessions list - silent failure for security
      }
    }
    
    // Clean up legacy keys
    localStorage.removeItem('thinkforge_session_id');
    localStorage.removeItem('thinkforge_session_user');
    localStorage.removeItem('thinkforge_session_created');
    localStorage.removeItem('thinkforge:sessions');
    
  } catch (error) {
    // Failed to migrate legacy session data - silent failure for security
  }
} 