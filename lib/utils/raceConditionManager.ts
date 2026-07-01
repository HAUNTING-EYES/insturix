/**
 * Race Condition Manager - Prevents timing-related race conditions
 * Created for ThinkForge security vulnerability fixes
 */

export interface PendingOperation {
  id: string;
  type: string;
  timeout: NodeJS.Timeout;
  cleanup?: () => void;
}

export class RaceConditionManager {
  private pendingOperations = new Map<string, PendingOperation>();
  private operationCounters = new Map<string, number>();
  
  /**
   * Create a safe timeout that can be cancelled and prevents race conditions
   */
  public createSafeTimeout(
    operationType: string,
    operationId: string,
    callback: () => void,
    delayMs: number,
    cleanup?: () => void
  ): string {
    // Cancel any existing operation of the same type and ID
    this.cancelOperation(operationType, operationId);
    
    // Increment counter for this operation type to detect race conditions
    const currentCount = (this.operationCounters.get(operationType) || 0) + 1;
    this.operationCounters.set(operationType, currentCount);
    
    const safeId = `${operationType}-${operationId}-${currentCount}`;
    
    // Create wrapped callback that checks if operation is still valid
    const safeCallback = () => {
      const operation = this.pendingOperations.get(safeId);
      if (!operation) {
        // Operation was cancelled, don't execute
        return;
      }
      
      // Check if this is still the latest operation of this type
      const latestCount = this.operationCounters.get(operationType) || 0;
      if (currentCount !== latestCount) {
        // Newer operation exists, don't execute this one
        this.pendingOperations.delete(safeId);
        return;
      }
      
      try {
        callback();
      } catch (error) {
        console.error('Safe timeout callback error:', error);
      } finally {
        this.pendingOperations.delete(safeId);
      }
    };
    
    const timeout = setTimeout(safeCallback, delayMs);
    
    this.pendingOperations.set(safeId, {
      id: safeId,
      type: operationType,
      timeout,
      cleanup
    });
    
    return safeId;
  }
  
  /**
   * Cancel a specific operation
   */
  public cancelOperation(operationType: string, operationId: string): boolean {
    let cancelled = false;
    
    // Find and cancel operations matching the type and ID pattern
    for (const [safeId, operation] of this.pendingOperations.entries()) {
      if (operation.type === operationType && safeId.includes(operationId)) {
        clearTimeout(operation.timeout);
        if (operation.cleanup) {
          try {
            operation.cleanup();
          } catch (error) {
            console.error('Operation cleanup error:', error);
          }
        }
        this.pendingOperations.delete(safeId);
        cancelled = true;
      }
    }
    
    return cancelled;
  }
  
  /**
   * Cancel all operations of a specific type
   */
  public cancelAllOfType(operationType: string): number {
    let cancelledCount = 0;
    
    for (const [safeId, operation] of this.pendingOperations.entries()) {
      if (operation.type === operationType) {
        clearTimeout(operation.timeout);
        if (operation.cleanup) {
          try {
            operation.cleanup();
          } catch (error) {
            console.error('Operation cleanup error:', error);
          }
        }
        this.pendingOperations.delete(safeId);
        cancelledCount++;
      }
    }
    
    return cancelledCount;
  }
  
  /**
   * Cancel all pending operations
   */
  public cancelAllOperations(): number {
    let cancelledCount = 0;
    
    for (const [safeId, operation] of this.pendingOperations.entries()) {
      clearTimeout(operation.timeout);
      if (operation.cleanup) {
        try {
          operation.cleanup();
        } catch (error) {
          console.error('Operation cleanup error:', error);
        }
      }
      cancelledCount++;
    }
    
    this.pendingOperations.clear();
    this.operationCounters.clear();
    
    return cancelledCount;
  }
  
  /**
   * Get pending operation count
   */
  public getPendingCount(operationType?: string): number {
    if (!operationType) {
      return this.pendingOperations.size;
    }
    
    let count = 0;
    for (const operation of this.pendingOperations.values()) {
      if (operation.type === operationType) {
        count++;
      }
    }
    return count;
  }
  
  /**
   * Create a debounced function that prevents race conditions
   */
  public createDebouncedFunction<T extends (...args: any[]) => void>(
    operationType: string,
    operationId: string,
    func: T,
    delayMs: number
  ): T {
    return ((...args: any[]) => {
      this.createSafeTimeout(
        operationType,
        operationId,
        () => func(...args),
        delayMs
      );
    }) as T;
  }
  
  /**
   * Create a singleton instance manager for components
   */
  public static getInstance(instanceId: string): RaceConditionManager {
    if (!globalThis.__raceConditionManagers) {
      globalThis.__raceConditionManagers = new Map();
    }
    
    let manager = globalThis.__raceConditionManagers.get(instanceId);
    if (!manager) {
      manager = new RaceConditionManager();
      globalThis.__raceConditionManagers.set(instanceId, manager);
    }
    
    return manager;
  }
  
  /**
   * Cleanup singleton instance
   */
  public static cleanupInstance(instanceId: string): void {
    if (globalThis.__raceConditionManagers) {
      const manager = globalThis.__raceConditionManagers.get(instanceId);
      if (manager) {
        manager.cancelAllOperations();
        globalThis.__raceConditionManagers.delete(instanceId);
      }
    }
  }
}

// Global type augmentation for singleton storage
declare global {
  var __raceConditionManagers: Map<string, RaceConditionManager> | undefined;
}

/**
 * Hook for React components to use race condition manager
 */
export function useRaceConditionManager(componentId: string) {
  const manager = RaceConditionManager.getInstance(componentId);
  
  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      RaceConditionManager.cleanupInstance(componentId);
    };
  }, [componentId]);
  
  return manager;
}

// React import for the hook
import React from 'react';

/**
 * Utility function for safe promise-based timeouts
 */
export function createSafePromiseTimeout<T>(
  operationType: string,
  operationId: string,
  promiseFactory: () => Promise<T>,
  timeoutMs: number,
  timeoutErrorMessage?: string
): Promise<T> {
  const manager = RaceConditionManager.getInstance('global');
  
  return new Promise<T>((resolve, reject) => {
    let completed = false;
    
    // Create timeout
    const timeoutId = manager.createSafeTimeout(
      operationType,
      operationId,
      () => {
        if (!completed) {
          completed = true;
          reject(new Error(timeoutErrorMessage || `Operation timeout: ${operationType}`));
        }
      },
      timeoutMs
    );
    
    // Execute promise
    promiseFactory()
      .then((result) => {
        if (!completed) {
          completed = true;
          manager.cancelOperation(operationType, operationId);
          resolve(result);
        }
      })
      .catch((error) => {
        if (!completed) {
          completed = true;
          manager.cancelOperation(operationType, operationId);
          reject(error);
        }
      });
  });
}

/**
 * Safe async retry with exponential backoff and race condition protection
 */
export async function safeAsyncRetry<T>(
  operationType: string,
  operationId: string,
  asyncFunction: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  const manager = RaceConditionManager.getInstance('global');
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Cancel any previous attempts
      manager.cancelOperation(operationType, `${operationId}-retry`);
      
      const result = await asyncFunction();
      return result;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait with exponential backoff
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      await new Promise<void>((resolve) => {
        manager.createSafeTimeout(
          operationType,
          `${operationId}-retry`,
          () => resolve(),
          delayMs
        );
      });
    }
  }
  
  throw new Error('Retry logic error'); // Should never reach here
} 