/**
 * Enhanced Session Ownership Validation Utility
 * Ensures users can only access their own ThinkForge sessions with robust error handling
 */

const THINKFORGE_BACKEND_URL = process.env.THINKFORGE_BACKEND_URL || 'http://localhost:8080';
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

export interface SessionOwnershipResult {
  isValid: boolean;
  sessionId?: string;
  error?: string;
  httpStatus?: number;
  shouldRetry?: boolean;
  autoRecovered?: boolean;
}

/**
 * Enhanced retry logic with exponential backoff
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number = MAX_RETRY_ATTEMPTS,
  baseDelay: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Validate that a user owns a specific session with enhanced error handling
 */
export async function validateSessionOwnership(
  sessionId: string,
  userId: string,
  retryOnFailure: boolean = true
): Promise<SessionOwnershipResult> {
  try {
    // Basic validation
    if (!sessionId || !userId) {
      return {
        isValid: false,
        error: 'Missing sessionId or userId',
        httpStatus: 400,
        shouldRetry: false
      };
    }

    // Enhanced sessionId format validation
    if (!/^[0-9a-fA-F]{24}$/.test(sessionId)) {
      return {
        isValid: false,
        error: 'Invalid session ID format',
        httpStatus: 400,
        shouldRetry: false
      };
    }

    // Check session ownership with retry logic
    const validateSession = async (): Promise<SessionOwnershipResult> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      try {
        const response = await fetch(
          `${THINKFORGE_BACKEND_URL}/api/thinkforge/sessions/${sessionId}/ownership?user_id=${userId}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${userId}`
            },
            signal: controller.signal
          }
        );

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          return {
            isValid: true,
            sessionId: data.session_id || sessionId
          };
        } else if (response.status === 404) {
          return {
            isValid: false,
            error: 'Session not found or access denied',
            httpStatus: 404,
            shouldRetry: false // Don't retry 404s
          };
        } else if (response.status === 403) {
          return {
            isValid: false,
            error: 'Session access denied',
            httpStatus: 403,
            shouldRetry: false // Don't retry 403s
          };
        } else if (response.status >= 500) {
          // Server errors should be retried
          throw new Error(`Server error: ${response.status}`);
        } else {
          return {
            isValid: false,
            error: `Session validation failed: ${response.status}`,
            httpStatus: response.status,
            shouldRetry: response.status >= 500
          };
        }
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Session validation timeout');
        }
        throw error;
      }
    };

    if (retryOnFailure) {
      return await retryWithBackoff(validateSession);
    } else {
      return await validateSession();
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Determine if this is a retryable error
    const isRetryable = errorMessage.includes('network') || 
                       errorMessage.includes('timeout') ||
                       errorMessage.includes('Server error');

    return {
      isValid: false,
      error: `Session validation service error: ${errorMessage}`,
      httpStatus: 500,
      shouldRetry: isRetryable
    };
  }
}

/**
 * Enhanced session ownership validation with auto-recovery
 */
export async function requireSessionOwnership(
  sessionId: string,
  userId: string,
  enableAutoRecovery: boolean = true
): Promise<SessionOwnershipResult> {
  // First attempt with retry
  let validation = await validateSessionOwnership(sessionId, userId, true);
  
  // If validation failed and auto-recovery is enabled, try to recover
  if (!validation.isValid && enableAutoRecovery && validation.shouldRetry !== false) {
    console.warn(`Session ownership validation failed, attempting auto-recovery`, {
      userId: userId.substring(0, 8) + '...',
      sessionId: sessionId.substring(0, 8) + '...',
      error: validation.error,
      timestamp: new Date().toISOString()
    });

    // Try to trigger session auto-creation via backend
    try {
      const response = await fetch(
        `${THINKFORGE_BACKEND_URL}/api/thinkforge/sessions/auto-recover`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userId}`
          },
          body: JSON.stringify({
            original_session_id: sessionId,
            user_id: userId,
            recovery_reason: validation.error
          })
        }
      );

      if (response.ok) {
        const recoveryData = await response.json();
        
        // Retry validation with the recovered/new session
        const retryValidation = await validateSessionOwnership(
          recoveryData.session_id || sessionId, 
          userId, 
          false
        );

        if (retryValidation.isValid) {
          return {
            ...retryValidation,
            autoRecovered: true,
            sessionId: recoveryData.session_id || sessionId
          };
        }
      }
    } catch (recoveryError) {
      console.error('Session auto-recovery failed:', recoveryError);
    }
  }

  // Log security events for failed validations
  if (!validation.isValid) {
    console.warn(`Session ownership validation failed: ${validation.error}`, {
      userId: userId.substring(0, 8) + '...',
      sessionId: sessionId.substring(0, 8) + '...',
      httpStatus: validation.httpStatus,
      shouldRetry: validation.shouldRetry,
      timestamp: new Date().toISOString()
    });
  }

  return validation;
}

/**
 * Check session health and perform diagnostics
 */
export async function validateSessionHealth(
  sessionId: string,
  userId: string
): Promise<{
  isHealthy: boolean;
  diagnostics: {
    ownershipValid: boolean;
    backendReachable: boolean;
    sessionExists: boolean;
    mongoConnected: boolean;
  };
  recommendations: string[];
}> {
  const diagnostics = {
    ownershipValid: false,
    backendReachable: false,
    sessionExists: false,
    mongoConnected: false
  };
  const recommendations: string[] = [];

  try {
    // Test backend connectivity
    const pingResponse = await fetch(`${THINKFORGE_BACKEND_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    diagnostics.backendReachable = pingResponse.ok;

    if (!diagnostics.backendReachable) {
      recommendations.push('Backend service is unreachable - check network connectivity');
    }

    // Test session ownership
    const ownership = await validateSessionOwnership(sessionId, userId, false);
    diagnostics.ownershipValid = ownership.isValid;

    if (!diagnostics.ownershipValid) {
      recommendations.push(`Session validation failed: ${ownership.error}`);
    }

    // Test MongoDB connectivity (if backend is reachable)
    if (diagnostics.backendReachable) {
      try {
        const mongoResponse = await fetch(
          `${THINKFORGE_BACKEND_URL}/api/thinkforge/sessions/${sessionId}/exists`,
          {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${userId}` },
            signal: AbortSignal.timeout(5000)
          }
        );
        diagnostics.sessionExists = mongoResponse.ok;
        diagnostics.mongoConnected = mongoResponse.status !== 503;

        if (!diagnostics.mongoConnected) {
          recommendations.push('Database connectivity issues detected');
        }
      } catch (error) {
        recommendations.push('Unable to verify database connectivity');
      }
    }

  } catch (error) {
    recommendations.push(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  const isHealthy = diagnostics.ownershipValid && 
                   diagnostics.backendReachable && 
                   diagnostics.mongoConnected;

  return {
    isHealthy,
    diagnostics,
    recommendations
  };
} 