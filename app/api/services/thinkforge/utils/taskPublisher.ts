/**
 * Enhanced Task Publisher for ThinkForge
 * Validates sessions, checks limits, and handles session migrations
 */

import { validateOrCreateSession, recoverSession, SessionValidationResult } from './sessionValidator';
import { listenToTaskStatus, TaskStatus, TaskStatusCallback } from './rtdbListener';

export interface TaskPublishRequest {
  userId: string;
  sessionId: string;
  clerkSessionId: string;
  taskType: 'ideas' | 'chat' | 'scripts';
  taskData: Record<string, any>;
}

export interface TaskPublishResult {
  success: boolean;
  taskId?: string;
  sessionId?: string;
  sessionUpdated?: boolean;
  error?: string;
  validatedSession?: SessionValidationResult;
}

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Enhanced task publishing with session validation, limits checking, and migration
 */
export async function publishTaskWithValidation(
  request: TaskPublishRequest
): Promise<TaskPublishResult> {
  try {
    console.log(`Publishing ${request.taskType} task for session ${request.sessionId}`);
    
    // Step 1: Enhanced session validation with migration fallback
    const sessionValidation = await validateOrCreateSession(
      request.userId,
      request.sessionId,
      request.clerkSessionId
    );
    
    if (!sessionValidation.exists) {
      return {
        success: false,
        error: `Session validation failed: ${sessionValidation.error}`,
        validatedSession: sessionValidation
      };
    }
    
    const validSessionId = sessionValidation.sessionId!;
    const sessionUpdated = sessionValidation.migrated || validSessionId !== request.sessionId;

    // Step 1.5: Check limits before proceeding
    const limitsCheck = await checkTaskLimits(request.userId, validSessionId, request.taskType);
    if (!limitsCheck.allowed) {
      return {
        success: false,
        error: `Limits exceeded: ${limitsCheck.reason}`,
        validatedSession: sessionValidation
      };
    }
    
    // Step 2: Generate task ID and prepare task data
    const taskId = generateTaskId();
    const taskPayload = {
      taskId,
      userId: request.userId,
      sessionId: validSessionId,
      type: request.taskType,
      data: request.taskData,
      timestamp: Date.now()
    };
    
    // Step 3: Create task in RTDB first (listed status)
    try {
      await fetch('/api/services/thinkforge/tasks/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: request.userId,
          taskId,
          taskType: request.taskType,
          sessionId: validSessionId,
          status: 'listed'
        })
      });
    } catch (rtdbError) {
      console.warn('Failed to create task in RTDB, continuing with PubSub publish:', rtdbError);
    }
    
    // Step 4: Publish to backend with session recovery
    const publishResult = await publishToBackendWithRetry(taskPayload, request.userId, request.clerkSessionId);
    
    if (!publishResult.success) {
      return {
        success: false,
        error: publishResult.error,
        taskId,
        sessionId: validSessionId,
        sessionUpdated,
        validatedSession: sessionValidation
      };
    }
    
    return {
      success: true,
      taskId,
      sessionId: validSessionId,
      sessionUpdated,
      validatedSession: sessionValidation
    };
    
  } catch (error) {
    console.error('Task publishing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Publish to backend with automatic retry on session errors
 */
async function publishToBackendWithRetry(
  taskPayload: any, 
  userId: string, 
  clerkSessionId: string,
  retryCount = 0
): Promise<{ success: boolean; error?: string; sessionUpdated?: boolean }> {
  try {
    const endpoint = getBackendEndpoint(taskPayload.type);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_id: taskPayload.sessionId,
        user_id: taskPayload.userId,
        ...taskPayload.data
      })
    });
    
    const data = await response.json();
    
    // Check for session updates in response
    let sessionUpdated = false;
    if (data.sessionId && data.sessionId !== taskPayload.sessionId) {
      console.log(`Session updated in API response: ${taskPayload.sessionId} -> ${data.sessionId}`);
      taskPayload.sessionId = data.sessionId;
      sessionUpdated = true;
    }
    
    if (response.ok) {
      return { success: true, sessionUpdated };
    } 
    
    // Check if error is session-related and we haven't retried yet
    const isSessionError = data.detail && (
      data.detail.includes('session not found') ||
      data.detail.includes('invalid session') ||
      data.detail.includes('session expired') ||
      response.status === 404
    );
    
    if (isSessionError && retryCount < 1) {
      console.log('Session error detected, attempting recovery and retry...');
      
      // Attempt session recovery
      const recovery = await recoverSession(userId, taskPayload.sessionId, clerkSessionId);
      if (recovery.exists && recovery.sessionId) {
        console.log('Session recovered, retrying task submission...');
        taskPayload.sessionId = recovery.sessionId;
        return await publishToBackendWithRetry(taskPayload, userId, clerkSessionId, retryCount + 1);
      }
    }
    
    return { 
      success: false, 
      error: data.detail || `API error: ${response.status}`,
      sessionUpdated 
    };
    
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'API call failed' 
    };
  }
}

/**
 * Get backend endpoint for task type
 */
function getBackendEndpoint(taskType: string): string {
  const THINKFORGE_BACKEND_URL = process.env.THINKFORGE_BACKEND_URL || 'http://localhost:8080';
  
  const endpoints: Record<string, string> = {
    ideas: `${THINKFORGE_BACKEND_URL}/api/thinkforge/ideas/generate`,
    chat: `${THINKFORGE_BACKEND_URL}/api/thinkforge/chat/message`,
    scripts: `${THINKFORGE_BACKEND_URL}/api/thinkforge/scripts/generate`
  };
  
  return endpoints[taskType] || `${THINKFORGE_BACKEND_URL}/api/thinkforge/${taskType}`;
}

/**
 * Check limits before publishing task
 */
async function checkTaskLimits(userId: string, sessionId: string, taskType: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Call the frontend limits checking API (MongoDB only, no backend limits)
    const response = await fetch('/api/services/thinkforge/limits/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        sessionId,
        type: taskType
      })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.hasAccess) {
        return { allowed: true };
      } else {
        return { 
          allowed: false, 
          reason: result.error?.message || 'Limits exceeded' 
        };
      }
    } else {
      // If limits check fails, allow the task (degraded mode)
      console.warn('Limits check API unavailable, allowing task');
      return { allowed: true };
    }
  } catch (error) {
    console.error('Error checking task limits:', error);
    // If limits check fails, allow the task (degraded mode)
    return { allowed: true };
  }
}

/**
 * Publish task and wait for completion with session handling
 */
export async function publishAndWaitForCompletion(
  request: TaskPublishRequest,
  timeoutMs: number = 300000, // 5 minutes default
  onProgress?: TaskStatusCallback
): Promise<TaskStatus> {
  const { RaceConditionManager } = await import('@/lib/utils/raceConditionManager');
  const raceManager = RaceConditionManager.getInstance('task-publisher');
  
  // Publish task
  const publishResult = await publishTaskWithValidation(request);
  
  if (!publishResult.success) {
    throw new Error(publishResult.error || 'Task publishing failed');
  }
  
  const { taskId } = publishResult;
  
  // Set up listener for real-time updates
  return new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | null = null;
    let completed = false;
    
    const cleanup = () => {
      if (unsubscribe) unsubscribe();
      raceManager.cancelOperation('task-completion-timeout', taskId || 'unknown');
    };
    
    // Set safe timeout
    raceManager.createSafeTimeout(
      'task-completion-timeout',
      taskId || 'unknown',
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
    unsubscribe = listenToTaskStatus(request.userId, taskId!, (taskStatus) => {
      if (onProgress) onProgress(taskStatus);
      
      if (taskStatus.status === 'completed' || taskStatus.status === 'failed') {
        if (!completed) {
          completed = true;
          cleanup();
          resolve(taskStatus);
        }
      }
    });
  });
}

/**
 * Enhanced task publisher with simplified interface
 */
export class ThinkForgeTaskPublisher {
  constructor(
    private userId: string,
    private clerkSessionId: string
  ) {}

  async publishIdeasTask(sessionId: string, prompt: string, preferences?: any): Promise<TaskPublishResult> {
    return publishTaskWithValidation({
      userId: this.userId,
      sessionId,
      clerkSessionId: this.clerkSessionId,
      taskType: 'ideas',
      taskData: { prompt, preferences }
    });
  }

  async publishChatTask(sessionId: string, message: string, context?: any): Promise<TaskPublishResult> {
    return publishTaskWithValidation({
      userId: this.userId,
      sessionId,
      clerkSessionId: this.clerkSessionId,
      taskType: 'chat',
      taskData: { message, context }
    });
  }

  async publishScriptTask(sessionId: string, selectedIdea: any, chatHistory: any[]): Promise<TaskPublishResult> {
    return publishTaskWithValidation({
      userId: this.userId,
      sessionId,
      clerkSessionId: this.clerkSessionId,
      taskType: 'scripts',
      taskData: { selectedIdea, chatHistory }
    });
  }

  // publishSuggestionsTask removed – suggestions now delivered with chat turns
} 