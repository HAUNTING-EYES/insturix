/**
 * Secure Error Handling System
 * Sanitizes error messages to prevent information disclosure while maintaining usability
 */

export type ErrorLevel = 'info' | 'warning' | 'error' | 'critical';

export interface SecureError {
  id: string;
  message: string;
  level: ErrorLevel;
  timestamp: number;
  userFriendly: boolean;
  action?: string;
  retry?: boolean;
}

interface ErrorPattern {
  pattern: RegExp;
  level: ErrorLevel;
  userMessage: string | null;
  action?: string;
  retry?: boolean;
}

/**
 * Predefined error patterns and their secure user messages
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // Network errors
  {
    pattern: /network|fetch|connection|timeout|ECONNREFUSED/i,
    level: 'warning',
    userMessage: 'Connection issue. Please check your internet connection.',
    action: 'Try again in a moment',
    retry: true
  },
  
  // Authentication errors
  {
    pattern: /unauthorized|401|403|auth|token|invalid.*session/i,
    level: 'warning',
    userMessage: 'Authentication required. Please sign in again.',
    action: 'Sign in to continue',
    retry: false
  },
  
  // Rate limiting
  {
    pattern: /rate.*limit|429|too.*many.*requests/i,
    level: 'warning',
    userMessage: 'You\'re doing that too quickly. Please slow down.',
    action: 'Wait a moment before trying again',
    retry: true
  },
  
  // Service limit exceeded (ThinkForge, Alyzitron, etc.)
  {
    pattern: /weekly.*sessions.*limit.*exceeded|session.*limit.*exceeded|sessions.*limit.*exceeded|usage.*limit.*exceeded|service.*limit.*exceeded|limit.*exceeded.*sessions|limit.*exceeded.*usage/i,
    level: 'warning',
    userMessage: null, // Use original message for service limits
    action: 'Upgrade your plan for more sessions',
    retry: false
  },
  
  // Server errors
  {
    pattern: /500|internal.*server|server.*error/i,
    level: 'error',
    userMessage: 'Our servers are experiencing issues.',
    action: 'Please try again later',
    retry: true
  },
  
  // Validation errors
  {
    pattern: /validation|invalid.*input|bad.*request|400/i,
    level: 'warning',
    userMessage: 'Please check your input and try again.',
    action: 'Review the information you provided',
    retry: true
  },
  
  // Resource not found
  {
    pattern: /not.*found|404|does.*not.*exist/i,
    level: 'info',
    userMessage: 'The requested information could not be found.',
    action: 'Please try a different approach',
    retry: false
  },
  
  // Session/data errors
  {
    pattern: /session.*expired|session.*invalid|corrupted|malformed/i,
    level: 'warning',
    userMessage: 'Your session has expired. Please refresh and try again.',
    action: 'Refresh the page',
    retry: true
  },
  
  // File/upload errors
  {
    pattern: /file.*too.*large|upload.*failed|invalid.*file/i,
    level: 'warning',
    userMessage: 'File upload issue. Please check the file and try again.',
    action: 'Ensure your file meets the requirements',
    retry: true
  },
  
  // Payment errors
  {
    pattern: /payment.*failed|card.*declined|insufficient.*funds/i,
    level: 'error',
    userMessage: 'Payment could not be processed.',
    action: 'Please check your payment details',
    retry: true
  }
];

/**
 * Default error messages based on level
 */
const DEFAULT_MESSAGES: Record<ErrorLevel, string> = {
  info: 'Something needs your attention.',
  warning: 'Something went wrong. Please try again.',
  error: 'An error occurred. We\'re working to fix it.',
  critical: 'A critical error occurred. Please contact support if this persists.'
};

/**
 * Default actions based on level
 */
const DEFAULT_ACTIONS: Record<ErrorLevel, string> = {
  info: 'No action required',
  warning: 'Please try again',
  error: 'Please try again later',
  critical: 'Contact support if this persists'
};

class SecureErrorHandler {
  private static instance: SecureErrorHandler;
  private errorHistory: SecureError[] = [];
  private maxHistorySize = 50;

  private constructor() {}

  static getInstance(): SecureErrorHandler {
    if (!SecureErrorHandler.instance) {
      SecureErrorHandler.instance = new SecureErrorHandler();
    }
    return SecureErrorHandler.instance;
  }

  /**
   * Generate a unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sanitize error message to prevent information disclosure
   */
  private sanitizeMessage(error: any): string {
    if (!error) return '';
    
    const message = typeof error === 'string' ? error : error.message || error.toString();
    
    // Remove potentially sensitive information
    const sanitized = message
      .replace(/\/[a-zA-Z0-9\/\-_.]+\.[a-zA-Z]{2,4}/g, '[PATH]') // File paths
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]') // Email addresses
      .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '[UUID]') // UUIDs
      .replace(/[a-zA-Z0-9+/]{20,}/g, '[TOKEN]') // Tokens/hashes
      .replace(/localhost|127\.0\.0\.1|0\.0\.0\.0/g, '[HOST]') // Local hosts
      .replace(/:\d{2,5}/g, ':[PORT]') // Port numbers
      .replace(/at .+\(.+\)/g, '[STACK_TRACE]') // Stack trace lines
      .replace(/Error: /g, '') // Remove "Error:" prefix
      .trim();

    return sanitized.slice(0, 200); // Limit length
  }

  /**
   * Determine error level based on error content
   */
  private determineLevel(error: any): ErrorLevel {
    const message = this.sanitizeMessage(error);
    
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.pattern.test(message)) {
        return pattern.level;
      }
    }
    
    // Default to 'error' for unmatched patterns
    return 'error';
  }

  /**
   * Find matching error pattern
   */
  private findErrorPattern(message: string): ErrorPattern | null {
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.pattern.test(message)) {
        return pattern;
      }
    }
    return null;
  }

  /**
   * Process and sanitize an error
   */
  processError(error: any, customLevel?: ErrorLevel): SecureError {
    const originalMessage = typeof error === 'string' ? error : error.message || error.toString();
    const sanitizedMessage = this.sanitizeMessage(error);
    const level = customLevel || this.determineLevel(error);
    const pattern = this.findErrorPattern(sanitizedMessage);
    
    const secureError: SecureError = {
      id: this.generateErrorId(),
      message: pattern?.userMessage === null ? originalMessage : (pattern?.userMessage || DEFAULT_MESSAGES[level]),
      level,
      timestamp: Date.now(),
      userFriendly: true,
      action: pattern?.action || DEFAULT_ACTIONS[level],
      retry: pattern?.retry ?? (level === 'warning' || level === 'error')
    };

    // Add to history
    this.addToHistory(secureError);
    
    // Log internally (without exposing to user)
    this.logInternally(error, secureError);
    
    return secureError;
  }

  /**
   * Add error to history
   */
  private addToHistory(error: SecureError): void {
    this.errorHistory.unshift(error);
    
    // Limit history size
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Log error internally (for debugging, not shown to user)
   */
  private logInternally(originalError: any, secureError: SecureError): void {
    // In production, this would go to a secure logging service
    // For now, we'll use a secure console method
    const logData = {
      errorId: secureError.id,
      level: secureError.level,
      timestamp: new Date(secureError.timestamp).toISOString(),
      // Original error details (internal only)
      originalMessage: typeof originalError === 'string' ? originalError : originalError?.message,
      userMessage: secureError.message
    };

    // Only log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.group(`🔒 Secure Error [${secureError.level.toUpperCase()}] - ${secureError.id}`);
      console.warn('User Message:', secureError.message);
      console.error('Original Error:', originalError);
      console.groupEnd();
    }

    // In production, send to monitoring service
    this.sendToMonitoring(logData).catch(() => {
      // Silent failure for monitoring
    });
  }

  /**
   * Send error to monitoring service
   */
  private async sendToMonitoring(logData: any): Promise<void> {
    try {
      await fetch('/api/monitoring/errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logData)
      });
    } catch (error) {
      // Silent failure - don't create error loops
    }
  }

  /**
   * Get recent error history
   */
  getErrorHistory(): SecureError[] {
    return [...this.errorHistory];
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Create a user-friendly error response for API routes
   */
  createApiErrorResponse(error: any, statusCode: number = 500): { error: string; action: string; code: string } {
    const secureError = this.processError(error);
    
    return {
      error: secureError.message,
      action: secureError.action || 'Please try again',
      code: secureError.id
    };
  }

  /**
   * Check if error should trigger a retry
   */
  shouldRetry(error: SecureError): boolean {
    return error.retry || false;
  }

  /**
   * Get retry delay based on error level
   */
  getRetryDelay(error: SecureError): number {
    switch (error.level) {
      case 'warning': return 1000; // 1 second
      case 'error': return 3000; // 3 seconds
      case 'critical': return 10000; // 10 seconds
      default: return 2000; // 2 seconds
    }
  }
}

// Global instance
const errorHandler = SecureErrorHandler.getInstance();

/**
 * Sanitize error message for user display
 */
export function sanitizeErrorForUser(error: any): string {
  const secureError = errorHandler.processError(error);
  return secureError.message;
}

/**
 * Secure logging function
 */
export function logSecurely(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, any>): void {
  const logEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    data: data || {}
  };

  // Only log to console in development
  if (process.env.NODE_ENV === 'development') {
    const consoleMethod = level === 'info' ? console.info : level === 'warn' ? console.warn : console.error;
    consoleMethod(`🔒 [${level.toUpperCase()}] ${message}`, data || '');
  }

  // In production, send to monitoring service
  if (process.env.NODE_ENV === 'production') {
    fetch('/api/monitoring/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(logEntry)
    }).catch(() => {
      // Silent failure for monitoring
    });
  }
}

/**
 * Main error processing function
 */
export function handleSecureError(error: any, customLevel?: ErrorLevel): SecureError {
  return errorHandler.processError(error, customLevel);
}

/**
 * Create sanitized API error response
 */
export function createSecureApiError(error: any, statusCode?: number) {
  return errorHandler.createApiErrorResponse(error, statusCode);
}

export default errorHandler; 