/**
 * Enhanced session validation utility with automatic recovery
 */

const THINKFORGE_BACKEND_URL = process.env.THINKFORGE_BACKEND_URL || 'http://localhost:8080';

export interface SessionValidationResult {
  exists: boolean;
  sessionId?: string;
  migrated?: boolean;
  error?: string;
}

/**
 * Check if a ThinkForge session exists in MongoDB
 */
export async function validateSession(
  userId: string,
  sessionId: string
): Promise<SessionValidationResult> {
  try {
    const response = await fetch(
      `${THINKFORGE_BACKEND_URL}/api/thinkforge/sessions/${sessionId}?user_id=${userId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userId}`
        }
      }
    );

    if (response.ok) {
      const sessionData = await response.json();
      return {
        exists: true,
        sessionId: sessionData.session_id
      };
    } else if (response.status === 404) {
      return {
        exists: false,
        error: 'Session not found'
      };
    } else {
      return {
        exists: false,
        error: `Validation failed: ${response.status}`
      };
    }
  } catch (error) {
    console.error('Session validation error:', error);
    return {
      exists: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Initialize a new ThinkForge session if needed
 */
export async function ensureSession(
  userId: string,
  clerkSessionId: string
): Promise<SessionValidationResult> {
  try {
    const response = await fetch('/api/services/thinkforge/sessions/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        clerk_session_id: clerkSessionId
      })
    });

    if (response.ok) {
      const result = await response.json();
      return {
        exists: true,
        sessionId: result.thinkforge_session_id
      };
    } else {
      const errorData = await response.json().catch(() => ({}));
      return {
        exists: false,
        error: errorData.error?.message || 'Session creation failed'
      };
    }
  } catch (error) {
    console.error('Session creation error:', error);
    return {
      exists: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Migrate from old session to current valid session
 */
export async function migrateSession(
  userId: string,
  oldSessionId: string
): Promise<SessionValidationResult> {
  try {
    const response = await fetch(`/api/services/thinkforge/sessions/${oldSessionId}/migrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId
      })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.current_session_id) {
        return {
          exists: true,
          sessionId: result.current_session_id,
          migrated: true
        };
      }
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      exists: false,
      error: errorData.error?.message || 'Migration failed'
    };
  } catch (error) {
    console.error('Session migration error:', error);
    return {
      exists: false,
      error: error instanceof Error ? error.message : 'Migration error'
    };
  }
}

/**
 * Enhanced validation with automatic migration fallback
 */
export async function validateOrCreateSession(
  userId: string,
  sessionId: string,
  clerkSessionId: string
): Promise<SessionValidationResult> {
  // First try to validate existing session
  const validation = await validateSession(userId, sessionId);

  if (validation.exists) {
    return validation;
  }

  // If session doesn't exist, try migration first
  console.warn(`Session ${sessionId} not found, attempting migration`);
  const migration = await migrateSession(userId, sessionId);

  if (migration.exists) {
    console.log('Session migration successful');
    return migration;
  }

  // If migration fails, create a new session
  console.warn('Session migration failed, creating new session');
  return await ensureSession(userId, clerkSessionId);
}

/**
 * Get the latest session for a user (recovery helper)
 */
export async function getLatestSession(userId: string): Promise<SessionValidationResult> {
  try {
    const response = await fetch(
      `${THINKFORGE_BACKEND_URL}/api/thinkforge/sessions/latest?user_id=${userId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userId}`
        }
      }
    );

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.session_id) {
        return {
          exists: true,
          sessionId: result.session_id
        };
      }
    }

    return {
      exists: false,
      error: 'No sessions found'
    };
  } catch (error) {
    console.error('Latest session retrieval error:', error);
    return {
      exists: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Enhanced session recovery with multiple fallback strategies
 */
export async function recoverSession(
  userId: string,
  sessionId: string,
  clerkSessionId: string
): Promise<SessionValidationResult> {
  console.log(`Attempting session recovery for ${sessionId}`);

  // Strategy 1: Try direct validation
  const directValidation = await validateSession(userId, sessionId);
  if (directValidation.exists) {
    console.log('Session recovery: Direct validation successful');
    return directValidation;
  }

  // Strategy 2: Try migration
  const migration = await migrateSession(userId, sessionId);
  if (migration.exists) {
    console.log('Session recovery: Migration successful');
    return migration;
  }

  // Strategy 3: Try getting latest session
  const latest = await getLatestSession(userId);
  if (latest.exists) {
    console.log('Session recovery: Latest session found');
    return latest;
  }

  // Strategy 4: Create new session as last resort
  console.log('Session recovery: Creating new session as last resort');
  return await ensureSession(userId, clerkSessionId);
} 