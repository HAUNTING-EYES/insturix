import { database } from '@/lib/firebase/config';
import { ref, set, update, remove, get, onValue, off } from 'firebase/database';

export interface ThinkForgeTaskUpdate {
  taskId: string;
  status: 'listed' | 'queued' | 'processing' | 'completed' | 'failed';
  type: 'chat' | 'ideas' | 'scripts' | 'suggestions';
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  description?: string;
  result?: any;
  error?: {
    code: string;
    message: string;
  };
}

export interface RTDBConnectionHealth {
  isConnected: boolean;
  lastConnected?: number;
  connectionAttempts: number;
  lastError?: string;
}

export class ThinkForgeRTDBManager {
  private static connectionHealth: RTDBConnectionHealth = {
    isConnected: false,
    connectionAttempts: 0
  };

  private static connectionMonitor: NodeJS.Timeout | null = null;
  private static readonly MAX_RETRY_ATTEMPTS = 3;
  private static readonly RETRY_DELAY_BASE = 1000; // 1 second base delay

  // Store all task nodes under a dedicated
  // /{userId}/thinkforge/tasks/{taskId} namespace so that
  // the path matches the backend Python implementation.
  private static getUserTaskPath(userId: string, taskId: string): string {
    return `/${userId}/thinkforge/tasks/${taskId}`;
  }

  private static isPermissionError(error: any): boolean {
    const errorStr = error instanceof Error ? error.message : String(error);
    return errorStr.toLowerCase().includes('permission') || 
           errorStr.toLowerCase().includes('denied') ||
           errorStr.toLowerCase().includes('unauthorized');
  }

  private static isNetworkError(error: any): boolean {
    const errorStr = error instanceof Error ? error.message : String(error);
    return errorStr.toLowerCase().includes('network') ||
           errorStr.toLowerCase().includes('offline') ||
           errorStr.toLowerCase().includes('timeout') ||
           errorStr.toLowerCase().includes('connection');
  }

  /**
   * Enhanced retry logic with exponential backoff
   */
  private static async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxAttempts: number = this.MAX_RETRY_ATTEMPTS
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        // Reset connection health on success
        if (attempt > 1) {
          this.connectionHealth.isConnected = true;
          this.connectionHealth.lastConnected = Date.now();
          console.info(`RTDB ${operationName} succeeded after ${attempt} attempts`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        this.connectionHealth.connectionAttempts++;
        
        // Don't retry permission errors
        if (this.isPermissionError(error)) {
          console.warn(`RTDB ${operationName} failed with permission error, not retrying`);
          throw error;
        }
        
        if (attempt === maxAttempts) {
          this.connectionHealth.isConnected = false;
          this.connectionHealth.lastError = error instanceof Error ? error.message : String(error);
          console.error(`RTDB ${operationName} failed after ${maxAttempts} attempts:`, lastError);
          throw lastError;
        }
        
        // Exponential backoff with jitter
        const delay = this.RETRY_DELAY_BASE * Math.pow(2, attempt - 1) + Math.random() * 500;
        console.warn(`RTDB ${operationName} attempt ${attempt} failed, retrying in ${delay}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Start monitoring Firebase connection health
   */
  static startConnectionMonitoring(): void {
    if (this.connectionMonitor) {
      return; // Already monitoring
    }

    this.connectionMonitor = setInterval(async () => {
      try {
        // Test connectivity with a simple read operation
        const testRef = ref(database, '.info/connected');
        await get(testRef);
        
        if (!this.connectionHealth.isConnected) {
          this.connectionHealth.isConnected = true;
          this.connectionHealth.lastConnected = Date.now();
          console.info('RTDB connection restored');
        }
      } catch (error) {
        if (this.connectionHealth.isConnected) {
          this.connectionHealth.isConnected = false;
          this.connectionHealth.lastError = error instanceof Error ? error.message : String(error);
          console.warn('RTDB connection lost:', error);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop connection monitoring
   */
  static stopConnectionMonitoring(): void {
    if (this.connectionMonitor) {
      clearInterval(this.connectionMonitor);
      this.connectionMonitor = null;
    }
  }

  /**
   * Get current connection health status
   */
  static getConnectionHealth(): RTDBConnectionHealth {
    return { ...this.connectionHealth };
  }

  static async createTask(userId: string, taskId: string, type: string, sessionId: string, title?: string): Promise<void> {
    const operation = async () => {
      // "listed" is the initial state expected by the backend
      // before it flips the task to "processing".
      const taskUpdate: ThinkForgeTaskUpdate = {
        taskId,
        status: 'listed',
        type: type as any,
        sessionId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (title) {
        taskUpdate.title = title;
      }

      const taskRef = ref(database, this.getUserTaskPath(userId, taskId));
      await set(taskRef, taskUpdate);

      console.info('ThinkForge task created in RTDB', { data: { userId, taskId, status: 'queued', type } });
    };

    try {
      await this.retryOperation(operation, 'createTask');
    } catch (error) {
      if (this.isPermissionError(error)) {
        console.warn('Firebase RTDB permissions insufficient for task creation', {
          data: { userId, taskId, error: 'PERMISSION_DENIED: Permission denied' }
        });
        // Don't throw on permission errors to prevent retry loops
        return;
      }
      
      console.error('Failed to create ThinkForge task in RTDB after retries', {
        data: { userId, taskId, error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  static async updateTaskStatus(userId: string, taskId: string, status: string, result?: any, error?: any): Promise<void> {
    const operation = async () => {
      const updates: any = {
        status,
        updatedAt: new Date().toISOString(),
      };

      if (result) {
        updates.result = result;
      }

      if (error) {
        updates.error = error;
      }

      const taskRef = ref(database, this.getUserTaskPath(userId, taskId));
      await update(taskRef, updates);

      console.info('ThinkForge task status updated in RTDB', { data: { userId, taskId, status } });
    };

    try {
      await this.retryOperation(operation, 'updateTaskStatus');
    } catch (updateError) {
      if (this.isPermissionError(updateError)) {
        console.warn('Firebase RTDB permissions insufficient for task update', { 
          data: { userId, taskId, status, error: 'PERMISSION_DENIED: Permission denied' } 
        });
        // Don't throw on permission errors to prevent retry loops
        return;
      }
      
      console.error('Failed to update ThinkForge task status in RTDB after retries', { 
        data: { userId, taskId, status, error: updateError instanceof Error ? updateError.message : String(updateError) } 
      });
      throw updateError;
    }
  }

  static async removeTask(userId: string, taskId: string): Promise<void> {
    const operation = async () => {
      const taskRef = ref(database, this.getUserTaskPath(userId, taskId));
      await remove(taskRef);

      console.info('ThinkForge task removed from RTDB', { data: { userId, taskId } });
    };

    try {
      await this.retryOperation(operation, 'removeTask');
    } catch (error) {
      if (this.isPermissionError(error)) {
        console.warn('Firebase RTDB permissions insufficient for task removal', {
          data: { userId, taskId, error: 'PERMISSION_DENIED: Permission denied' }
        });
        // Don't throw on permission errors to prevent retry loops
        return;
      }
      
      console.error('Failed to remove ThinkForge task from RTDB after retries', {
        data: { userId, taskId, error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  static async getConcurrentTasksCount(userId: string): Promise<number> {
    const operation = async () => {
      // Count only under the /tasks node to match the path above.
      const userTasksRef = ref(database, `/${userId}/thinkforge/tasks`);
      const snapshot = await get(userTasksRef);
      
      if (!snapshot.exists()) {
        return 0;
      }
      
      const tasks = snapshot.val();
      let concurrentCount = 0;
      
      // Count tasks with status 'queued' or 'processing'
      for (const taskId in tasks) {
        const task = tasks[taskId];
        if (task.status === 'listed' || task.status === 'queued' || task.status === 'processing') {
          concurrentCount++;
        }
      }
      
      console.info('ThinkForge concurrent tasks counted from RTDB', {
        data: { userId, concurrentCount }
      });
      
      return concurrentCount;
    };

    try {
      return await this.retryOperation(operation, 'getConcurrentTasksCount');
    } catch (error) {
      if (this.isPermissionError(error)) {
        console.warn('Firebase RTDB permissions insufficient for task counting', {
          data: { userId, error: 'PERMISSION_DENIED: Permission denied' }
        });
        // Return 0 on permission errors to allow system to continue
        return 0;
      }
      
      console.error('Failed to count ThinkForge concurrent tasks from RTDB after retries', {
        data: { userId, error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  static async getTask(userId: string, taskId: string): Promise<ThinkForgeTaskUpdate | null> {
    const operation = async () => {
      const taskRef = ref(database, this.getUserTaskPath(userId, taskId));
      const snapshot = await get(taskRef);
      
      if (!snapshot.exists()) {
        return null;
      }
      
      return snapshot.val();
    };

    try {
      return await this.retryOperation(operation, 'getTask');
    } catch (error) {
      if (this.isPermissionError(error)) {
        console.warn('Firebase RTDB permissions insufficient for task retrieval', {
          data: { userId, taskId, error: 'PERMISSION_DENIED: Permission denied' }
        });
        // Return null on permission errors
        return null;
      }
      
      console.error('Failed to get ThinkForge task from RTDB after retries', {
        data: { userId, taskId, error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }

  /**
   * Enhanced listener creation with connection monitoring and auto-recovery
   */
  static createEnhancedListener(
    userId: string,
    taskId: string,
    callback: (task: ThinkForgeTaskUpdate | null) => void,
    errorCallback?: (error: Error) => void
  ): () => void {
    const taskPath = this.getUserTaskPath(userId, taskId);
    const taskRef = ref(database, taskPath);
    
    let isListening = true;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    
    const setupListener = () => {
      console.log(`🔥 Setting up enhanced Firebase listener for task: ${taskId} at path: ${taskPath}`);
      
      const unsubscribe = onValue(
        taskRef,
        (snapshot) => {
          if (!isListening) return;
          
          try {
            if (snapshot.exists()) {
              const task = snapshot.val();
              callback(task);
              
              // Reset reconnect attempts on successful data reception
              reconnectAttempts = 0;
              this.connectionHealth.isConnected = true;
              this.connectionHealth.lastConnected = Date.now();
            } else {
              callback(null);
            }
          } catch (callbackError) {
            console.error('Error in Firebase listener callback:', callbackError);
            if (errorCallback) {
              errorCallback(callbackError instanceof Error ? callbackError : new Error(String(callbackError)));
            }
          }
        },
        (error) => {
          if (!isListening) return;
          
          console.error(`Firebase listener error for task ${taskId}:`, error);
          this.connectionHealth.isConnected = false;
          this.connectionHealth.lastError = error.message;
          
          // Attempt to reconnect if it's a network error and we haven't exceeded max attempts
          if (this.isNetworkError(error) && reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = this.RETRY_DELAY_BASE * Math.pow(2, reconnectAttempts - 1);
            
            console.warn(`Attempting to reconnect Firebase listener (attempt ${reconnectAttempts}/${maxReconnectAttempts}) in ${delay}ms`);
            
            setTimeout(() => {
              if (isListening) {
                setupListener();
              }
            }, delay);
          } else {
            // Permanent failure or max attempts reached
            if (errorCallback) {
              errorCallback(error);
            }
          }
        }
      );
      
      return unsubscribe;
    };
    
    let currentUnsubscribe = setupListener();
    
    // Return cleanup function
    return () => {
      isListening = false;
      if (currentUnsubscribe) {
        currentUnsubscribe();
      }
    };
  }

  /**
   * Test Firebase connectivity
   */
  static async testConnection(): Promise<{
    isConnected: boolean;
    latency?: number;
    error?: string;
  }> {
    try {
      const startTime = Date.now();
      const testRef = ref(database, '.info/serverTimeOffset');
      await get(testRef);
      const latency = Date.now() - startTime;
      
      this.connectionHealth.isConnected = true;
      this.connectionHealth.lastConnected = Date.now();
      
      return {
        isConnected: true,
        latency
      };
    } catch (error) {
      this.connectionHealth.isConnected = false;
      this.connectionHealth.lastError = error instanceof Error ? error.message : String(error);
      
      return {
        isConnected: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

// Start connection monitoring when module loads
ThinkForgeRTDBManager.startConnectionMonitoring(); 