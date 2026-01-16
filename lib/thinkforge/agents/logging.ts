/**
 * AI Invocation Logging
 * 
 * Tracks all agent invocations for debugging and analytics.
 * This is how you debug AI later.
 */

import type { AIInvocationLog } from './types';

/**
 * In-memory log buffer for development
 * In production, this should write to a persistent store
 */
const logBuffer: AIInvocationLog[] = [];
const MAX_BUFFER_SIZE = 1000;

/**
 * Log an AI invocation event
 * 
 * Every agent run should log:
 * - type: "ai_invocation"
 * - agent: which agent was invoked
 * - model: which model was used
 * - artifactId: optional, what artifact was affected
 * - versionCreated: optional, if a new version was created
 * - durationMs: how long the invocation took
 * - success: whether it succeeded
 * - error: error message if failed
 */
export function logAIInvocation(event: AIInvocationLog): void {
  // Add timestamp if not present
  if (!event.timestamp) {
    event.timestamp = new Date();
  }
  
  // Console log in development
  const logLevel = event.success ? 'info' : 'error';
  const logMessage = formatLogMessage(event);
  
  if (logLevel === 'error') {
    console.error('[ThinkForge AI]', logMessage);
  } else if (process.env.NODE_ENV === 'development') {
    console.log('[ThinkForge AI]', logMessage);
  }
  
  // Add to buffer
  logBuffer.push(event);
  
  // Trim buffer if too large
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.splice(0, logBuffer.length - MAX_BUFFER_SIZE);
  }
  
  // In production, you would also:
  // - Send to analytics service
  // - Write to database
  // - Stream to logging service
}

/**
 * Format log message for console output
 */
function formatLogMessage(event: AIInvocationLog): string {
  const parts = [
    `agent=${event.agent}`,
    `model=${event.model}`,
    `success=${event.success}`,
  ];
  
  if (event.durationMs !== undefined) {
    parts.push(`duration=${event.durationMs}ms`);
  }
  
  if (event.sessionId) {
    parts.push(`session=${event.sessionId.slice(0, 8)}...`);
  }
  
  if (event.artifactId) {
    parts.push(`artifact=${event.artifactId.slice(0, 8)}...`);
  }
  
  if (event.versionCreated) {
    parts.push(`version=${event.versionCreated.slice(0, 8)}...`);
  }
  
  if (event.error) {
    parts.push(`error="${event.error.slice(0, 100)}"`);
  }
  
  return parts.join(' ');
}

/**
 * Get recent logs (useful for debugging)
 */
export function getRecentLogs(count: number = 50): AIInvocationLog[] {
  return logBuffer.slice(-count);
}

/**
 * Get logs by agent type
 */
export function getLogsByAgent(agent: AIInvocationLog['agent']): AIInvocationLog[] {
  return logBuffer.filter(log => log.agent === agent);
}

/**
 * Get failed invocations
 */
export function getFailedLogs(): AIInvocationLog[] {
  return logBuffer.filter(log => !log.success);
}

/**
 * Clear log buffer (useful for testing)
 */
export function clearLogs(): void {
  logBuffer.length = 0;
}

/**
 * Get aggregate stats
 */
export function getLogStats(): {
  total: number;
  byAgent: Record<string, number>;
  successRate: number;
  avgDurationMs: number;
} {
  const total = logBuffer.length;
  const successful = logBuffer.filter(l => l.success).length;
  
  const byAgent: Record<string, number> = {};
  let totalDuration = 0;
  let durationCount = 0;
  
  for (const log of logBuffer) {
    byAgent[log.agent] = (byAgent[log.agent] || 0) + 1;
    if (log.durationMs !== undefined) {
      totalDuration += log.durationMs;
      durationCount++;
    }
  }
  
  return {
    total,
    byAgent,
    successRate: total > 0 ? successful / total : 1,
    avgDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
  };
}
