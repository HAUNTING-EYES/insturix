/**
 * Fast Router - Rule-based routing without LLM calls
 * Target: <1ms response time
 */

export type RouteDecision = 'chat' | 'script' | 'idea';

/**
 * Fast router that determines intent without calling any model
 * Uses pattern matching for instant routing
 */
export function fastRouter(input: string, hasScript: boolean): RouteDecision {
  const text = (input || '').trim().toLowerCase();
  
  if (!text) return 'chat';
  
  // Content creation keywords - highest priority
  const CONTENT_KEYWORDS = /(write|create|generate|make|draft|edit|change|modify|fix|update|improve|rewrite|add|remove|script|content)/i;
  
  // Question patterns - typically chat
  const QUESTION_PATTERNS = /^(how|what|why|when|where|explain|tell me|help with|what is|describe)/i;
  
  // Edit patterns when script exists
  const EDIT_PATTERNS = /(edit|change|modify|fix|update|improve|rewrite|add|remove)/i;
  
  // Check for content creation first
  if (CONTENT_KEYWORDS.test(text)) {
    return 'script';
  }
  
  // Check for questions
  if (QUESTION_PATTERNS.test(text)) {
    return 'chat';
  }
  
  // If script exists and contains edit keywords, route to script
  if (hasScript && EDIT_PATTERNS.test(text)) {
    return 'script';
  }
  
  // Default to chat
  return 'chat';
}

