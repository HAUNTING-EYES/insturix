/**
 * Rate Limiter
 *
 * Uses @upstash/ratelimit with Vercel KV (or skips in development)
 * - Chat: 20 requests per minute per user
 * - Expensive endpoints: 5 requests per hour per user
 */

import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';

// Skip rate limiting in development
const isDev = process.env.NODE_ENV === 'development';

// Create rate limiter only if KV is configured
let ratelimit: Ratelimit | null = null;

if (!isDev && process.env.KV_REST_API_URL) {
  ratelimit = new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(20, '1 m'), // 20 requests per minute
    analytics: true,
    prefix: 'editron-chat',
  });
}

// Stricter rate limiter for expensive endpoints (analysis, director, storyboard gen)
let expensiveRatelimit: Ratelimit | null = null;

if (!isDev && process.env.KV_REST_API_URL) {
  expensiveRatelimit = new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(5, '1 h'), // 5 requests per hour
    analytics: true,
    prefix: 'editron-expensive',
  });
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Check if a user is rate limited
 * @param userId - The user's ID
 * @returns Rate limit result, or success if in dev/not configured
 */
export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  // Skip in development
  if (isDev) {
    return { success: true, limit: 999, remaining: 999, reset: Date.now() };
  }

  // Skip if KV not configured
  if (!ratelimit) {
    console.warn('[RATE-LIMIT] KV not configured, skipping rate limit');
    return { success: true, limit: 999, remaining: 999, reset: Date.now() };
  }

  try {
    const result = await ratelimit.limit(userId);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    // If rate limiter fails, allow the request (fail open)
    console.error('[RATE-LIMIT] Error checking rate limit:', error);
    return { success: true, limit: 999, remaining: 999, reset: Date.now() };
  }
}

/**
 * Check rate limit for expensive endpoints (analysis, director, storyboard gen)
 * Stricter: 5 requests per hour per user
 */
export async function checkExpensiveRateLimit(userId: string): Promise<RateLimitResult> {
  if (isDev) {
    return { success: true, limit: 999, remaining: 999, reset: Date.now() };
  }

  if (!expensiveRatelimit) {
    console.warn('[RATE-LIMIT] KV not configured, skipping expensive rate limit');
    return { success: true, limit: 999, remaining: 999, reset: Date.now() };
  }

  try {
    const result = await expensiveRatelimit.limit(userId);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    console.error('[RATE-LIMIT] Error checking expensive rate limit:', error);
    return { success: true, limit: 999, remaining: 999, reset: Date.now() };
  }
}
