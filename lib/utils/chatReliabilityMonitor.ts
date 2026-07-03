/**
 * ThinkForge Chat Reliability Monitor
 * Tracks chat performance, failures, and provides automatic recovery mechanisms
 */

interface ChatOperation {
  id: string;
  type: 'send_message' | 'generate_ideas' | 'generate_script' | 'session_validation';
  startTime: number;
  endTime?: number;
  status: 'pending' | 'success' | 'failed' | 'timeout';
  duration?: number;
  errorType?: string;
  errorMessage?: string;
  sessionId?: string;
  userId?: string;
  retryAttempts?: number;
}

interface ReliabilityMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  timeoutOperations: number;
  averageResponseTime: number;
  successRate: number;
  commonFailureTypes: Record<string, number>;
  sessionIssues: number;
  networkIssues: number;
  aiParsingIssues: number;
  lastFailureTime?: number;
  consecutiveFailures: number;
}

interface RecoveryRecommendation {
  type: 'session_refresh' | 'network_retry' | 'backend_check' | 'user_action' | 'escalate';
  priority: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  action?: () => Promise<void>;
  estimatedFixTime?: number;
}

type ChatHealthStatus = {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  score: number;
  issues: string[];
};

class ChatReliabilityMonitor {
  private operations: Map<string, ChatOperation> = new Map();
  private metrics: ReliabilityMetrics = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    timeoutOperations: 0,
    averageResponseTime: 0,
    successRate: 100,
    commonFailureTypes: {},
    sessionIssues: 0,
    networkIssues: 0,
    aiParsingIssues: 0,
    consecutiveFailures: 0
  };
  
  private readonly MAX_STORED_OPERATIONS = 1000;
  private readonly FAILURE_THRESHOLD = 3; // Consecutive failures before escalation
  private readonly RESPONSE_TIME_WARNING = 30000; // 30 seconds
  
  /**
   * Start tracking a chat operation
   */
  startOperation(
    type: ChatOperation['type'], 
    operationId: string,
    metadata: { sessionId?: string; userId?: string } = {}
  ): void {
    const operation: ChatOperation = {
      id: operationId,
      type,
      startTime: Date.now(),
      status: 'pending',
      sessionId: metadata.sessionId,
      userId: metadata.userId,
      retryAttempts: 0
    };
    
    this.operations.set(operationId, operation);
    this.metrics.totalOperations++;
    
    console.log(`📊 Started tracking operation: ${type} (${operationId})`);
    
    // Clean up old operations to prevent memory leaks
    if (this.operations.size > this.MAX_STORED_OPERATIONS) {
      this.cleanupOldOperations();
    }
  }
  
  /**
   * Mark operation as successful
   */
  completeOperation(operationId: string): void {
    const operation = this.operations.get(operationId);
    if (!operation) {
      console.warn(`⚠️ Attempted to complete unknown operation: ${operationId}`);
      return;
    }
    
    operation.endTime = Date.now();
    operation.duration = operation.endTime - operation.startTime;
    operation.status = 'success';
    
    this.metrics.successfulOperations++;
    this.metrics.consecutiveFailures = 0; // Reset on success
    this.updateMetrics();
    
    console.log(`✅ Completed operation: ${operation.type} in ${operation.duration}ms`);
    
    // Warn about slow operations
    if (operation.duration > this.RESPONSE_TIME_WARNING) {
      console.warn(`🐌 Slow operation detected: ${operation.type} took ${operation.duration}ms`);
    }
  }
  
  /**
   * Mark operation as failed
   */
  failOperation(
    operationId: string, 
    errorType: string, 
    errorMessage: string,
    isRetry: boolean = false
  ): void {
    const operation = this.operations.get(operationId);
    if (!operation) {
      console.warn(`⚠️ Attempted to fail unknown operation: ${operationId}`);
      return;
    }
    
    operation.endTime = Date.now();
    operation.duration = operation.endTime - operation.startTime;
    operation.status = 'failed';
    operation.errorType = errorType;
    operation.errorMessage = errorMessage;
    
    if (isRetry) {
      operation.retryAttempts = (operation.retryAttempts || 0) + 1;
    }
    
    this.metrics.failedOperations++;
    this.metrics.consecutiveFailures++;
    this.metrics.lastFailureTime = Date.now();
    
    // Categorize failure types
    this.categorizeFailure(errorType, errorMessage);
    this.updateMetrics();
    
    console.error(`❌ Failed operation: ${operation.type} - ${errorType}: ${errorMessage}`);
    
    // Check if we need to escalate
    if (this.metrics.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      this.handleCriticalFailures();
    }
  }
  
  /**
   * Mark operation as timed out
   */
  timeoutOperation(operationId: string): void {
    const operation = this.operations.get(operationId);
    if (!operation) {
      console.warn(`⚠️ Attempted to timeout unknown operation: ${operationId}`);
      return;
    }
    
    operation.endTime = Date.now();
    operation.duration = operation.endTime - operation.startTime;
    operation.status = 'timeout';
    operation.errorType = 'timeout';
    operation.errorMessage = `Operation timed out after ${operation.duration}ms`;
    
    this.metrics.timeoutOperations++;
    this.metrics.failedOperations++;
    this.metrics.consecutiveFailures++;
    this.metrics.commonFailureTypes['timeout'] = (this.metrics.commonFailureTypes['timeout'] || 0) + 1;
    
    this.updateMetrics();
    
    console.warn(`⏰ Timed out operation: ${operation.type} after ${operation.duration}ms`);
  }
  
  /**
   * Get current reliability metrics
   */
  getMetrics(): ReliabilityMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Get recovery recommendations based on current state
   */
  getRecoveryRecommendations(): RecoveryRecommendation[] {
    const recommendations: RecoveryRecommendation[] = [];
    
    // High failure rate
    if (this.metrics.successRate < 50) {
      recommendations.push({
        type: 'escalate',
        priority: 'critical',
        message: `Critical: Success rate is only ${this.metrics.successRate.toFixed(1)}%. Multiple system issues detected.`,
        estimatedFixTime: 300000 // 5 minutes
      });
    }
    
    // Consecutive failures
    if (this.metrics.consecutiveFailures >= 3) {
      recommendations.push({
        type: 'session_refresh',
        priority: 'high',
        message: `${this.metrics.consecutiveFailures} consecutive failures detected. Session refresh recommended.`,
        estimatedFixTime: 30000 // 30 seconds
      });
    }
    
    // High session issues
    if (this.metrics.sessionIssues > this.metrics.totalOperations * 0.3) {
      recommendations.push({
        type: 'session_refresh',
        priority: 'medium',
        message: 'Frequent session issues detected. Consider refreshing your session.',
        estimatedFixTime: 30000
      });
    }
    
    // High network issues
    if (this.metrics.networkIssues > this.metrics.totalOperations * 0.2) {
      recommendations.push({
        type: 'network_retry',
        priority: 'medium',
        message: 'Network connectivity issues detected. Check your internet connection.',
        estimatedFixTime: 60000
      });
    }
    
    // High AI parsing issues
    if (this.metrics.aiParsingIssues > this.metrics.totalOperations * 0.1) {
      recommendations.push({
        type: 'backend_check',
        priority: 'medium',
        message: 'AI response parsing issues detected. Backend service may need attention.',
        estimatedFixTime: 120000
      });
    }
    
    // Slow response times
    if (this.metrics.averageResponseTime > this.RESPONSE_TIME_WARNING) {
      recommendations.push({
        type: 'backend_check',
        priority: 'low',
        message: `Average response time is ${(this.metrics.averageResponseTime / 1000).toFixed(1)}s. System may be under heavy load.`,
        estimatedFixTime: 180000
      });
    }
    
    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
  
  /**
   * Get health status summary
   */
  getHealthStatus(): ChatHealthStatus {
    const issues: string[] = [];
    let score = 100;
    
    // Check success rate
    if (this.metrics.successRate < 90) {
      score -= (90 - this.metrics.successRate);
      issues.push(`Low success rate: ${this.metrics.successRate.toFixed(1)}%`);
    }
    
    // Check consecutive failures
    if (this.metrics.consecutiveFailures > 0) {
      score -= this.metrics.consecutiveFailures * 10;
      issues.push(`${this.metrics.consecutiveFailures} consecutive failures`);
    }
    
    // Check response time
    if (this.metrics.averageResponseTime > this.RESPONSE_TIME_WARNING) {
      score -= 20;
      issues.push(`Slow response times: ${(this.metrics.averageResponseTime / 1000).toFixed(1)}s avg`);
    }
    
    // Check recent failures
    if (this.metrics.lastFailureTime && Date.now() - this.metrics.lastFailureTime < 60000) {
      score -= 15;
      issues.push('Recent failure detected');
    }
    
    let status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
    if (score >= 85) {
      status = 'healthy';
    } else if (score >= 60) {
      status = 'degraded';
    } else if (score >= 30) {
      status = 'unhealthy';
    } else {
      status = 'critical';
    }
    
    return {
      status,
      score: Math.max(0, score),
      issues
    };
  }
  
  /**
   * Export monitoring data for analysis
   */
  exportData(): {
    metrics: ReliabilityMetrics;
    recentOperations: ChatOperation[];
    recommendations: RecoveryRecommendation[];
    healthStatus: ChatHealthStatus;
  } {
    const recentOperations = Array.from(this.operations.values())
      .filter(op => Date.now() - op.startTime < 300000) // Last 5 minutes
      .sort((a, b) => b.startTime - a.startTime);
    
    return {
      metrics: this.getMetrics(),
      recentOperations,
      recommendations: this.getRecoveryRecommendations(),
      healthStatus: this.getHealthStatus()
    };
  }
  
  private categorizeFailure(errorType: string, errorMessage: string): void {
    this.metrics.commonFailureTypes[errorType] = (this.metrics.commonFailureTypes[errorType] || 0) + 1;
    
    const message = errorMessage.toLowerCase();
    
    if (message.includes('session') || errorType.includes('session')) {
      this.metrics.sessionIssues++;
    } else if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      this.metrics.networkIssues++;
    } else if (message.includes('json') || message.includes('parse') || errorType.includes('validation')) {
      this.metrics.aiParsingIssues++;
    }
  }
  
  private updateMetrics(): void {
    const total = this.metrics.totalOperations;
    if (total > 0) {
      this.metrics.successRate = (this.metrics.successfulOperations / total) * 100;
      
      // Calculate average response time
      const completedOps = Array.from(this.operations.values())
        .filter(op => op.duration !== undefined);
      
      if (completedOps.length > 0) {
        this.metrics.averageResponseTime = completedOps.reduce((sum, op) => sum + (op.duration || 0), 0) / completedOps.length;
      }
    }
  }
  
  private cleanupOldOperations(): void {
    const cutoffTime = Date.now() - 3600000; // 1 hour ago
    const opsToDelete: string[] = [];
    
    for (const [id, operation] of this.operations.entries()) {
      if (operation.startTime < cutoffTime) {
        opsToDelete.push(id);
      }
    }
    
    opsToDelete.forEach(id => this.operations.delete(id));
    console.log(`🧹 Cleaned up ${opsToDelete.length} old operations`);
  }
  
  private handleCriticalFailures(): void {
    console.error(`🚨 CRITICAL: ${this.metrics.consecutiveFailures} consecutive failures detected!`);
    
    // Could trigger additional recovery mechanisms here
    // - Automatic session refresh
    // - Backend health check
    // - User notification
    // - Escalation to monitoring systems
  }
}

// Singleton instance
export const chatReliabilityMonitor = new ChatReliabilityMonitor();

// Helper functions for easy integration
export const trackChatOperation = (
  type: ChatOperation['type'],
  operationId: string,
  metadata?: { sessionId?: string; userId?: string }
) => {
  chatReliabilityMonitor.startOperation(type, operationId, metadata);
};

export const completeChatOperation = (operationId: string) => {
  chatReliabilityMonitor.completeOperation(operationId);
};

export const failChatOperation = (
  operationId: string,
  errorType: string,
  errorMessage: string,
  isRetry?: boolean
) => {
  chatReliabilityMonitor.failOperation(operationId, errorType, errorMessage, isRetry);
};

export const timeoutChatOperation = (operationId: string) => {
  chatReliabilityMonitor.timeoutOperation(operationId);
};

export const getChatHealthStatus = () => {
  return chatReliabilityMonitor.getHealthStatus();
};

export const getChatMetrics = () => {
  return chatReliabilityMonitor.getMetrics();
};

export const getChatRecoveryRecommendations = () => {
  return chatReliabilityMonitor.getRecoveryRecommendations();
}; 