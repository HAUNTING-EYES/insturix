/**
 * Firebase RTDB Listener utility for ThinkForge task status updates
 * Provides real-time updates and session management notifications
 */

import { ref, onValue, off, DataSnapshot, remove } from 'firebase/database';
import { database } from '@/lib/firebase/config';

export interface TaskStatus {
  taskId: string;
  taskType: string;
  status: 'listed' | 'processing' | 'completed' | 'failed';
  sessionId?: string;
  result?: any;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
    session_related?: boolean;
  };
  updatedAt: string;
  createdAt?: string;
}

export interface SessionProgress {
  sessionId: string;
  workflowPhase: string;
  updatedAt: string;
  [key: string]: any; // Additional progress data
}

export interface SessionUpdate {
  old_session_id: string;
  new_session_id: string;
  migration_reason: string;
  timestamp: string;
}

export type TaskStatusCallback = (taskStatus: TaskStatus) => void;
export type SessionProgressCallback = (progress: SessionProgress) => void;
export type SessionUpdateCallback = (update: SessionUpdate) => void;

/**
 * Listen to task status updates for a specific task
 */
export function listenToTaskStatus(
  userId: string,
  taskId: string,
  callback: TaskStatusCallback
): () => void {
  const taskPath = `${userId}/thinkforge/tasks/${taskId}`;
  const taskRef = ref(database, taskPath);
  
  const unsubscribe = onValue(taskRef, (snapshot: DataSnapshot) => {
    const taskData = snapshot.val();
    if (taskData) {
      callback(taskData as TaskStatus);
    }
  }, (error) => {
    console.error('Task status listener error:', error);
  });
  
  // Return cleanup function
  return () => {
    off(taskRef, 'value', unsubscribe);
  };
}

/**
 * Listen to session progress updates
 */
export function listenToSessionProgress(
  userId: string,
  sessionId: string,
  callback: SessionProgressCallback
): () => void {
  const sessionPath = `${userId}/thinkforge/sessions/${sessionId}/progress`;
  const sessionRef = ref(database, sessionPath);
  
  const unsubscribe = onValue(sessionRef, (snapshot: DataSnapshot) => {
    const progressData = snapshot.val();
    if (progressData) {
      callback(progressData as SessionProgress);
    }
  }, (error) => {
    console.error('Session progress listener error:', error);
  });
  
  // Return cleanup function
  return () => {
    off(sessionRef, 'value', unsubscribe);
  };
}

/**
 * Listen to session updates/migrations for a user
 */
export function listenToSessionUpdates(
  userId: string,
  callback: SessionUpdateCallback
): () => void {
  const sessionUpdatePath = `${userId}/thinkforge/session_updated`;
  const sessionUpdateRef = ref(database, sessionUpdatePath);
  
  const unsubscribe = onValue(sessionUpdateRef, (snapshot: DataSnapshot) => {
    const updateData = snapshot.val();
    if (updateData) {
      callback(updateData as SessionUpdate);
      // Auto-clear the notification after processing
      remove(snapshot.ref).catch(console.error);
    }
  }, (error) => {
    console.error('Session update listener error:', error);
  });
  
  // Return cleanup function
  return () => {
    off(sessionUpdateRef, 'value', unsubscribe);
  };
}

/**
 * Listen to all tasks for a user (useful for dashboard)
 */
export function listenToUserTasks(
  userId: string,
  callback: (tasks: Record<string, TaskStatus>) => void
): () => void {
  const tasksPath = `${userId}/thinkforge/tasks`;
  const tasksRef = ref(database, tasksPath);
  
  const unsubscribe = onValue(tasksRef, (snapshot: DataSnapshot) => {
    const tasksData = snapshot.val();
    if (tasksData) {
      callback(tasksData as Record<string, TaskStatus>);
    }
  }, (error) => {
    console.error('User tasks listener error:', error);
  });
  
  // Return cleanup function
  return () => {
    off(tasksRef, 'value', unsubscribe);
  };
}

/**
 * One-time task status check (no real-time listening)
 */
export async function getTaskStatus(
  userId: string,
  taskId: string
): Promise<TaskStatus | null> {
  return new Promise((resolve, reject) => {
    const taskPath = `${userId}/thinkforge/tasks/${taskId}`;
    const taskRef = ref(database, taskPath);
    
    onValue(taskRef, (snapshot: DataSnapshot) => {
      const taskData = snapshot.val();
      resolve(taskData as TaskStatus | null);
    }, (error) => {
      reject(error);
    }, { onlyOnce: true });
  });
}

/**
 * Wait for task completion with timeout and session error handling
 */
export async function waitForTaskCompletion(
  userId: string,
  taskId: string,
  timeoutMs: number = 300000, // 5 minutes default
  onSessionError?: (taskStatus: TaskStatus) => void
): Promise<TaskStatus> {
  const { RaceConditionManager } = await import('@/lib/utils/raceConditionManager');
  const raceManager = RaceConditionManager.getInstance('rtdb-listener');
  
  return new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | null = null;
    let completed = false;
    
    const cleanup = () => {
      if (unsubscribe) unsubscribe();
      raceManager.cancelOperation('task-wait-timeout', taskId);
    };
    
    // Set safe timeout
    raceManager.createSafeTimeout(
      'task-wait-timeout',
      taskId,
      () => {
        if (!completed) {
          completed = true;
          cleanup();
          reject(new Error('Task completion timeout'));
        }
      },
      timeoutMs
    );
    
    // Listen for task updates
    unsubscribe = listenToTaskStatus(userId, taskId, (taskStatus) => {
      if (taskStatus.status === 'completed') {
        if (!completed) {
          completed = true;
          cleanup();
          resolve(taskStatus);
        }
      } else if (taskStatus.status === 'failed') {
        // Check if it's a session-related error
        const isSessionError = taskStatus.error?.session_related || 
          (taskStatus.error?.message && (
            taskStatus.error.message.includes('session not found') ||
            taskStatus.error.message.includes('invalid session') ||
            taskStatus.error.message.includes('session expired')
          ));
        
        if (isSessionError && onSessionError) {
          onSessionError(taskStatus);
          // Don't resolve/reject yet, let the caller handle session recovery
        } else {
          if (!completed) {
            completed = true;
            cleanup();
            resolve(taskStatus); // Return the failed status instead of rejecting
          }
        }
      }
    });
  });
}

/**
 * Enhanced task manager with session awareness
 */
export class TaskManager {
  private listeners: Map<string, () => void> = new Map();
  private sessionUpdateListener: (() => void) | null = null;
  
  constructor(private userId: string) {}
  
  /**
   * Start listening to a task with session error handling
   */
  startListening(
    taskId: string,
    callback: TaskStatusCallback,
    onSessionError?: (taskStatus: TaskStatus) => void
  ): void {
    // Stop existing listener for this task if any
    this.stopListening(taskId);
    
    // Start new listener with enhanced error handling
    const unsubscribe = listenToTaskStatus(this.userId, taskId, (taskStatus) => {
      // Check for session-related errors
      const isSessionError = taskStatus.error?.session_related || 
        (taskStatus.error?.message && (
          taskStatus.error.message.includes('session not found') ||
          taskStatus.error.message.includes('invalid session') ||
          taskStatus.error.message.includes('session expired')
        ));
      
      if (taskStatus.status === 'failed' && isSessionError && onSessionError) {
        onSessionError(taskStatus);
      }
      
      callback(taskStatus);
    });
    
    this.listeners.set(taskId, unsubscribe);
  }
  
  /**
   * Start listening to session updates
   */
  startSessionUpdateListener(callback: SessionUpdateCallback): void {
    this.stopSessionUpdateListener();
    this.sessionUpdateListener = listenToSessionUpdates(this.userId, callback);
  }
  
  /**
   * Stop listening to session updates
   */
  stopSessionUpdateListener(): void {
    if (this.sessionUpdateListener) {
      this.sessionUpdateListener();
      this.sessionUpdateListener = null;
    }
  }
  
  /**
   * Stop listening to a specific task
   */
  stopListening(taskId: string): void {
    const unsubscribe = this.listeners.get(taskId);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(taskId);
    }
  }
  
  /**
   * Stop all listeners
   */
  stopAllListeners(): void {
    for (const unsubscribe of this.listeners.values()) {
      unsubscribe();
    }
    this.listeners.clear();
    this.stopSessionUpdateListener();
  }
  
  /**
   * Get count of active listeners
   */
  getActiveListenerCount(): number {
    return this.listeners.size;
  }
  
  /**
   * Check if listening to a specific task
   */
  isListening(taskId: string): boolean {
    return this.listeners.has(taskId);
  }
} 