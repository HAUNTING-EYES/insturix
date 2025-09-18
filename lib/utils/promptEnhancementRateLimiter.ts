import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Create a rate limiter for prompt enhancement
// This will limit users to 5 prompt enhancements per minute
export const promptEnhancementRateLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 m'), // 5 requests per minute
  prefix: '@upstash/ratelimit/prompt-enhancement',
  ephemeralCache: new Map(),
});

// Helper function to get rate limit info
export async function getPromptEnhancementRateLimitInfo(userId: string) {
  const identifier = `prompt_enhancement:${userId}`;
  return await promptEnhancementRateLimiter.getRemaining(identifier);
}

export default {
  promptEnhancementRateLimiter,
  getPromptEnhancementRateLimitInfo,
};