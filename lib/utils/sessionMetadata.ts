/**
 * Session Metadata Storage
 * Stores only essential session information for the ThinkForge library view
 * Full session data is loaded on-demand from the backend
 */

import { useState, useEffect, useCallback } from 'react';

export interface SessionMetadata {
  id: string;
  name: string; // Truncated prompt
  userId: string;
  createdAt: string;
  lastModified: string;
  stage: 'idea_generation' | 'chat' | 'script_generation' | 'completed';
  isUsed: boolean; // Whether session has been actively used
  ideaCount?: number;
  chatMessageCount?: number;
  hasScript?: boolean;
}

interface SessionMetadataStore {
  sessions: SessionMetadata[];
  lastUpdated: number;
  userId: string;
}

const METADATA_STORAGE_KEY = 'thinkforge_session_metadata';
const MAX_METADATA_AGE = 24 * 60 * 60 * 1000; // 24 hours

class SessionMetadataManager {
  private store: SessionMetadataStore | null = null;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(METADATA_STORAGE_KEY);
      if (stored) {
        this.store = JSON.parse(stored);
        
        // Check if metadata is too old
        if (this.store && (Date.now() - this.store.lastUpdated) > MAX_METADATA_AGE) {
          this.clearMetadata();
        }
      }
    } catch (error) {
      // Failed to load session metadata from storage - silent failure for security
      this.clearMetadata();
    }
  }

  private saveToStorage(): void {
    if (!this.store) return;
    
    try {
      localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(this.store));
    } catch (error) {
      // Failed to save session metadata to storage - silent failure for security
    }
  }

  private clearMetadata(): void {
    this.store = null;
    try {
      localStorage.removeItem(METADATA_STORAGE_KEY);
    } catch (error) {
      // Failed to clear session metadata from storage - silent failure for security
    }
  }

  private initializeStore(userId: string): void {
    this.store = {
      sessions: [],
      lastUpdated: Date.now(),
      userId
    };
  }

  /**
   * Initialize or validate metadata store for a user
   */
  initializeForUser(userId: string): void {
    if (!this.store || this.store.userId !== userId) {
      this.initializeStore(userId);
      this.saveToStorage();
    }
  }

  /**
   * Add or update session metadata
   */
  updateSessionMetadata(metadata: SessionMetadata): void {
    if (!this.store) {
      this.initializeStore(metadata.userId);
    }

    const existingIndex = this.store!.sessions.findIndex(s => s.id === metadata.id);
    
    if (existingIndex >= 0) {
      // Update existing session
      this.store!.sessions[existingIndex] = {
        ...this.store!.sessions[existingIndex],
        ...metadata,
        lastModified: new Date().toISOString()
      };
    } else {
      // Add new session
      this.store!.sessions.unshift({
        ...metadata,
        createdAt: metadata.createdAt || new Date().toISOString(),
        lastModified: new Date().toISOString()
      });
    }

    this.store!.lastUpdated = Date.now();
    this.saveToStorage();
  }

  /**
   * Get all session metadata
   */
  getAllSessionMetadata(): SessionMetadata[] {
    return this.store?.sessions || [];
  }

  /**
   * Get session metadata by ID
   */
  getSessionMetadata(sessionId: string): SessionMetadata | null {
    return this.store?.sessions.find(s => s.id === sessionId) || null;
  }

  /**
   * Remove session metadata
   */
  removeSessionMetadata(sessionId: string): void {
    if (!this.store) return;

    this.store.sessions = this.store.sessions.filter(s => s.id !== sessionId);
    this.store.lastUpdated = Date.now();
    this.saveToStorage();
  }

  /**
   * Get sessions by stage
   */
  getSessionsByStage(stage: SessionMetadata['stage']): SessionMetadata[] {
    return this.store?.sessions.filter(s => s.stage === stage) || [];
  }

  /**
   * Get recent sessions (limited count)
   */
  getRecentSessions(limit: number = 10): SessionMetadata[] {
    const sessions = this.getAllSessionMetadata();
    return sessions
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, limit);
  }

  /**
   * Mark session as used
   */
  markSessionAsUsed(sessionId: string): void {
    if (!this.store) return;

    const session = this.store.sessions.find(s => s.id === sessionId);
    if (session && !session.isUsed) {
      session.isUsed = true;
      session.lastModified = new Date().toISOString();
      this.store.lastUpdated = Date.now();
      this.saveToStorage();
    }
  }

  /**
   * Update session stage
   */
  updateSessionStage(sessionId: string, stage: SessionMetadata['stage']): void {
    if (!this.store) return;

    const session = this.store.sessions.find(s => s.id === sessionId);
    if (session) {
      session.stage = stage;
      session.lastModified = new Date().toISOString();
      this.store.lastUpdated = Date.now();
      this.saveToStorage();
    }
  }

  /**
   * Sync with backend (fetch all session metadata)
   */
  async syncWithBackend(userId: string): Promise<boolean> {
    try {
      const response = await fetch('/api/services/thinkforge/sessions/metadata', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${userId}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        this.initializeStore(userId);
        this.store!.sessions = data.sessions.map((session: any) => ({
          id: session.id,
          name: this.truncatePrompt(session.initial_prompt || 'Untitled Session'),
          userId: session.user_id,
          createdAt: session.created_at,
          lastModified: session.updated_at || session.created_at,
          stage: this.determineStage(session),
          isUsed: this.isSessionUsed(session),
          ideaCount: session.ideas?.length || 0,
          chatMessageCount: session.chat_history?.length || 0,
          hasScript: !!session.generated_script
        }));

        this.store!.lastUpdated = Date.now();
        this.saveToStorage();
        return true;
      }

      return false;
    } catch (error) {
      // Failed to sync session metadata with backend - silent failure for security
      return false;
    }
  }

  /**
   * Clear all metadata (logout)
   */
  clearAllMetadata(): void {
    this.clearMetadata();
  }

  /**
   * Helper: Truncate prompt for display name
   */
  private truncatePrompt(prompt: string, maxLength: number = 50): string {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength).trim() + '...';
  }

  /**
   * Helper: Determine session stage from backend data
   */
  private determineStage(session: any): SessionMetadata['stage'] {
    if (session.generated_script) return 'completed';
    if (session.chat_history && session.chat_history.length > 0) return 'script_generation';
    if (session.ideas && session.ideas.length > 0) return 'chat';
    return 'idea_generation';
  }

  /**
   * Helper: Check if session has been actively used
   */
  private isSessionUsed(session: any): boolean {
    return !!(
      (session.ideas && session.ideas.length > 0) ||
      (session.chat_history && session.chat_history.length > 0) ||
      session.generated_script
    );
  }
}

// Global instance
const sessionMetadataManager = new SessionMetadataManager();

/**
 * React hook for session metadata management
 */
export function useSessionMetadata(userId?: string) {
  const [metadata, setMetadata] = useState<SessionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (userId) {
      sessionMetadataManager.initializeForUser(userId);
      setMetadata(sessionMetadataManager.getAllSessionMetadata());
    }
  }, [userId]);

  const syncMetadata = useCallback(async () => {
    if (!userId) return false;

    setIsLoading(true);
    const success = await sessionMetadataManager.syncWithBackend(userId);
    if (success) {
      setMetadata(sessionMetadataManager.getAllSessionMetadata());
    }
    setIsLoading(false);
    return success;
  }, [userId]);

  const updateSession = useCallback((sessionMetadata: SessionMetadata) => {
    sessionMetadataManager.updateSessionMetadata(sessionMetadata);
    setMetadata(sessionMetadataManager.getAllSessionMetadata());
  }, []);

  const removeSession = useCallback((sessionId: string) => {
    sessionMetadataManager.removeSessionMetadata(sessionId);
    setMetadata(sessionMetadataManager.getAllSessionMetadata());
  }, []);

  const markAsUsed = useCallback((sessionId: string) => {
    sessionMetadataManager.markSessionAsUsed(sessionId);
    setMetadata(sessionMetadataManager.getAllSessionMetadata());
  }, []);

  const updateStage = useCallback((sessionId: string, stage: SessionMetadata['stage']) => {
    sessionMetadataManager.updateSessionStage(sessionId, stage);
    setMetadata(sessionMetadataManager.getAllSessionMetadata());
  }, []);

  const getRecentSessions = useCallback((limit?: number) => {
    return sessionMetadataManager.getRecentSessions(limit);
  }, []);

  const clearAll = useCallback(() => {
    sessionMetadataManager.clearAllMetadata();
    setMetadata([]);
  }, []);

  return {
    metadata,
    isLoading,
    syncMetadata,
    updateSession,
    removeSession,
    markAsUsed,
    updateStage,
    getRecentSessions,
    clearAll
  };
}

export default sessionMetadataManager; 