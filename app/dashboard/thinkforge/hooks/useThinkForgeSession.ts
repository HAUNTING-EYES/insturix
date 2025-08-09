import { useState, useCallback, useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { ref, onValue, off, remove } from 'firebase/database';
import { database } from '@/lib/firebase/config';
import { 
  getCurrentSessionId,
  setCurrentSessionId,
  clearCurrentSession,
  getRecentSessions,
  addToRecentSessions,
  updateSessionMetadata,
  markSessionAsUsed,
  isCurrentSessionStale,
  cleanupUnusedSessions,
  clearAllSessionData,
  migrateLegacySessionData,
  isValidSessionId,
  THINKFORGE_RECENT_SESSIONS_KEY,
  type SessionMetadata
} from '@/lib/utils/thinkforgeSession';

export function useThinkForgeSession() {
  const { user } = useUser();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const lastSavedSnapshotRef = useRef<string>('');

  // Migrate legacy data on first load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      migrateLegacySessionData();
    }
  }, []);

  // Update session ID and store it properly
  const updateSessionId = useCallback((newSessionId: string): boolean => {
    if (!user?.id || !isValidSessionId(newSessionId)) {
      console.error('Invalid session ID update attempt:', newSessionId);
      return false;
    }

    try {
      setSessionId(newSessionId);
      
      // Store session with proper user tracking
      const success = setCurrentSessionId(newSessionId, user.id);
      if (success) {
        console.log('Session ID updated successfully:', newSessionId);
        
        // Add to recent sessions list
        addToRecentSessions({
          id: newSessionId,
          createdAt: Date.now(),
          lastUsed: Date.now(),
          isUsed: false // Will be marked as used when content is added
        });
      }
      
      return success;
    } catch (error) {
      console.error('Failed to update session ID:', error);
      return false;
    }
  }, [user?.id]);

  // Create new session
  const createNewSession = useCallback(async (): Promise<string | null> => {
    if (!user?.id) {
      console.error('Cannot create session without user');
      return null;
    }

    try {
      setIsCreatingSession(true);  // Use separate state for session creation
      
      console.log('Creating new ThinkForge session');
      const response = await fetch('/api/services/thinkforge/sessions/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('Session creation failed:', data);
        throw new Error(data.error?.message || 'Failed to create session');
      }

      if (data.success && data.thinkforge_session_id) {
        console.log('New session created successfully:', data.thinkforge_session_id);
        
        // Update current session
        const updateSuccess = updateSessionId(data.thinkforge_session_id);
        if (!updateSuccess) {
          throw new Error('Failed to store new session ID');
        }
        
        return data.thinkforge_session_id;
      } else {
        throw new Error('Invalid session creation response');
      }
    } catch (error) {
      console.error('Failed to create new session:', error);
      return null;
    } finally {
      setIsCreatingSession(false);
    }
  }, [user?.id, updateSessionId]);

  // Initialize session - always create new session for home/landing page entry
  const initializeSession = useCallback(async (): Promise<string | null> => {
    try {
      if (!user?.id) {
        console.error('Cannot initialize session without user');
        return null;
      }

      // Clean up unused sessions first
      cleanupUnusedSessions();

      // Always create a new session for fresh start
      console.log('Initializing new session for home/landing page');
      return await createNewSession();
      
    } catch (error) {
      console.error('Failed to initialize session:', error);
      return null;
    }
  }, [user?.id, createNewSession]);

  // Recover/load an existing session
  const recoverSession = useCallback(async (sessionIdToRecover: string): Promise<any> => {
    if (!user?.id || !isValidSessionId(sessionIdToRecover)) {
      console.error('Invalid session recovery request');
      return null;
    }

    try {
      setIsRecovering(true);
      
      console.log('Recovering session:', sessionIdToRecover);
      
      // Try to recover from backend
      const response = await fetch(`/api/services/thinkforge/sessions/${sessionIdToRecover}/recover?user_id=${user.id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log('Session recovered from backend successfully');
          updateSessionId(sessionIdToRecover);
          
          // Update session metadata
          updateSessionMetadata(sessionIdToRecover, {
            lastUsed: Date.now(),
            isUsed: true
          });
          
          return data.state || {};
        }
      }
      
      // If backend recovery fails, try local storage
      const localState = localStorage.getItem(`thinkforge_workflow_${sessionIdToRecover}`);
      if (localState) {
        console.log('Session recovered from local storage');
        updateSessionId(sessionIdToRecover);
        
        try {
          return JSON.parse(localState);
        } catch (error) {
          console.error('Failed to parse local session state:', error);
        }
      }
      
      console.log('Session recovery failed, creating new session');
      // If all recovery attempts fail, create a new session
      await createNewSession();
      return { workflowPhase: 'PROMPT' }; // Start fresh
      
    } catch (error) {
      console.error('Failed to recover session:', error);
      
      // Create new session as fallback
      try {
        await createNewSession();
        return { workflowPhase: 'PROMPT' };
      } catch (createError) {
        console.error('Failed to create fallback session:', createError);
        return null;
      }
    } finally {
      setIsRecovering(false);
    }
  }, [user?.id, updateSessionId, createNewSession]);

  // Load a specific session (from library)
  const loadSession = useCallback(async (sessionIdToLoad: string): Promise<boolean> => {
    if (!user?.id || !isValidSessionId(sessionIdToLoad)) {
      console.error('Invalid session load request');
      return false;
    }

    try {
      const state = await recoverSession(sessionIdToLoad);
      return state !== null;
    } catch (error) {
      console.error('Failed to load session:', error);
      return false;
    }
  }, [user?.id, recoverSession]);

  // Auto-save workflow state
  const autoSave = useCallback(async (workflowState: any) => {
    if (!sessionId || !isValidSessionId(sessionId)) {
      console.error('Cannot auto-save without valid session ID');
      return;
    }

    // Skip if nothing changed
    const snapshot = JSON.stringify(workflowState);
    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }
    lastSavedSnapshotRef.current = snapshot;
    
    try {
      // Save to backend
      const response = await fetch(`/api/services/thinkforge/sessions/${sessionId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          state_data: workflowState,
          timestamp: Date.now()
        })
      });
      
      if (!response.ok) {
        console.error('Failed to save session state to backend');
      }
      
      // Save locally for quick recovery
      localStorage.setItem(`thinkforge_workflow_${sessionId}`, snapshot);
      
      // Update session metadata if this is meaningful content
      if (workflowState.prompt || workflowState.selectedIdea || workflowState.ideas?.length > 0) {
        markSessionAsUsed(
          sessionId, 
          workflowState.prompt, 
          workflowState.selectedIdea?.tone || workflowState.defaultTone,
          workflowState.workflowPhase
        );
      }
      
    } catch (error) {
      console.error('Failed to auto-save workflow state:', error);
    }
  }, [sessionId, user?.id]);

  // Start new session (for home navigation)
  const startNewSession = useCallback(async (): Promise<string | null> => {
    try {
      // Clear current session
      clearCurrentSession();
      setSessionId(null);
      
      // Clean up unused sessions
      cleanupUnusedSessions();
      
      // Create new session
      return await createNewSession();
      
    } catch (error) {
      console.error('Failed to start new session:', error);
      return null;
    }
  }, [createNewSession]);

  // Cleanup session (for logout or tab close)
  const cleanupSession = useCallback(() => {
    try {
      clearCurrentSession();
      setSessionId(null);
      cleanupUnusedSessions();
    } catch (error) {
      console.error('Failed to cleanup session:', error);
    }
  }, []);

  // Cleanup all sessions (for logout)
  const cleanupAllSessions = useCallback(() => {
    try {
      clearAllSessionData();
      setSessionId(null);
    } catch (error) {
      console.error('Failed to cleanup all sessions:', error);
    }
  }, []);

  // Validate session exists and is accessible
  const validateSession = useCallback(async (sessionIdToValidate: string): Promise<boolean> => {
    if (!user?.id || !isValidSessionId(sessionIdToValidate)) {
      return false;
    }
    
    try {
      const response = await fetch(`/api/services/thinkforge/sessions/${sessionIdToValidate}/recover?user_id=${user.id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      return response.ok;
    } catch (error) {
      console.error('Session validation failed:', error);
      return false;
    }
  }, [user?.id]);

  // Listen for session updates from Firebase RTDB
  useEffect(() => {
    if (!user?.id || !sessionId) return;

    const sessionUpdatePath = `${user.id}/thinkforge/session_updated`;
    const sessionUpdateRef = ref(database, sessionUpdatePath);
    
    const unsubscribe = onValue(sessionUpdateRef, (snapshot) => {
      const updateData = snapshot.val();
      if (updateData && updateData.old_session_id === sessionId && updateData.new_session_id) {
        console.log('Session migration detected via RTDB:', updateData);
        updateSessionId(updateData.new_session_id);
        // Clear the update notification
        remove(sessionUpdateRef).catch(console.error);
      }
    });

    return () => {
      off(sessionUpdateRef, 'value', unsubscribe);
    };
  }, [user?.id, sessionId, updateSessionId]);

  // Initialize session on mount or user change
  useEffect(() => {
    if (!user?.id || isInitialized) return;
    
    const currentSession = getCurrentSessionId();
    
    // Check if we have a valid current session
    if (currentSession && !isCurrentSessionStale(user.id)) {
      console.log('Restoring existing session:', currentSession);
      setSessionId(currentSession);
    }
    
    setIsInitialized(true);
  }, [user?.id, isInitialized]);

  // Handle user logout - cleanup all sessions
  useEffect(() => {
    if (!user && isInitialized) {
      console.log('User logged out, cleaning up all sessions');
      cleanupAllSessions();
      setIsInitialized(false);
    }
  }, [user, isInitialized, cleanupAllSessions]);

  // Periodic cleanup of unused sessions (every 10 minutes)
  useEffect(() => {
    if (!isInitialized) return;

    const cleanupInterval = setInterval(() => {
      console.log('Running periodic session cleanup');
      cleanupUnusedSessions();
    }, 10 * 60 * 1000); // 10 minutes

    return () => clearInterval(cleanupInterval);
  }, [isInitialized]);

  // Handle tab close/navigation - cleanup current session if unused
  useEffect(() => {
    if (typeof window === 'undefined' || !sessionId) return;

    const handleBeforeUnload = () => {
      const recentSessions = getRecentSessions();
      const currentSession = recentSessions.find(s => s.id === sessionId);
      
      // If current session is not used and less than 1 hour old, remove it
      if (currentSession && !currentSession.isUsed) {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        if (currentSession.createdAt > oneHourAgo) {
          try {
            // Remove from recent sessions
            const filteredSessions = recentSessions.filter(s => s.id !== sessionId);
                         localStorage.setItem(THINKFORGE_RECENT_SESSIONS_KEY, JSON.stringify(filteredSessions));
            
            // Clean up workflow data
            localStorage.removeItem(`thinkforge_workflow_${sessionId}`);
            console.log('Cleaned up unused session on tab close:', sessionId);
          } catch (error) {
            console.error('Failed to cleanup unused session on tab close:', error);
          }
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionId]);

  return {
    sessionId,
    isRecovering,
    isCreatingSession,
    isInitialized,
    
    // Session lifecycle
    initializeSession,
    startNewSession,
    loadSession,
    recoverSession,
    
    // Session management  
    updateSessionId,
    validateSession,
    autoSave,
    
    // Cleanup
    cleanupSession,
    cleanupAllSessions
  };
}