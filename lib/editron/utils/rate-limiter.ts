/**
 * Rate Limiter
 *
 * Uses @upstash/ratelimit with Vercel KV (or skips in development)
 * - Chat: 20 requests per minute per user
 * - Expensive endpoints: 50 requests per hour per user
 */

import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';

const isDev = process.env.NODE_ENV === 'development';

let ratelimit: Ratelimit | null = null;

if (!isDev && process.env.KV_REST_API_URL) {
  ratelimit = new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(20, '1 m'),
    analytics: true,
    prefix: 'editron-chat',
  });
}

let expensiveRatelimit: Ratelimit | null = null;

if (!isDev && process.env.KV_REST_API_URL) {
  expensiveRatelimit = new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(50, '1 h'),
    analytics: true,
    prefix: 'editron-expensive',
  });
}

// Direct UI tools are deterministic project mutations. Keep their security
// ceiling separate from chat and provider-backed generation limits.
const configuredDirectToolLimit = Number.parseInt(
  process.env.EDITRON_DIRECT_TOOL_RATE_LIMIT_PER_MINUTE ?? '60',
  10,
);
const directToolLimit = Number.isFinite(configuredDirectToolLimit)
  ? Math.min(600, Math.max(1, configuredDirectToolLimit))
  : 60;
let directToolRatelimit: Ratelimit | null = null;

if (!isDev && process.env.KV_REST_API_URL) {
  directToolRatelimit = new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(directToolLimit, '1 m'),
    analytics: true,
    prefix: 'editron-direct-tool',
  });
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  reason?: 'limited' | 'unavailable';
}

export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  if (isDev) {
    return { success: true, limit: 999, remaining: 999, reset: Date.now() };
  }

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
    console.error('[RATE-LIMIT] Error checking rate limit:', error);
    return { success: true, limit: 999, remaining: 999, reset: Date.now() };
  }
}

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

/**
 * Fail-closed production limiter for direct project mutations. Unlike chat,
 * this endpoint must not expose an unlimited mutation path when KV is down.
 */
export async function checkDirectToolRateLimit(userId: string): Promise<RateLimitResult> {
  if (isDev) {
    return { success: true, limit: 999, remaining: 999, reset: Date.now() };
  }

  if (!directToolRatelimit) {
    console.error('[RATE-LIMIT] Direct tool limiter unavailable: KV is not configured');
    return {
      success: false,
      limit: directToolLimit,
      remaining: 0,
      reset: Date.now(),
      reason: 'unavailable',
    };
  }

  try {
    const result = await directToolRatelimit.limit(userId);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      reason: result.success ? undefined : 'limited',
    };
  } catch (error) {
    console.error('[RATE-LIMIT] Direct tool limiter failed:', error);
    return {
      success: false,
      limit: directToolLimit,
      remaining: 0,
      reset: Date.now(),
      reason: 'unavailable',
    };
  }
}
