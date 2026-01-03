/**
 * Google AI Model Factory
 * 
 * Unified model creation with authentication:
 * - Uses @ai-sdk/google with API key authentication
 * - Supports multiple API key environment variables for flexibility
 * - Model tier routing: Structural (lite) vs. Reasoning (flash/preview)
 * 
 * Note: For Vertex AI with service account credentials in production,
 * consider using the native @google/genai SDK or deploying to Cloud Run
 * where ADC is automatically available.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

/**
 * Model Tier Classification
 * - Structural: schema/routing/metadata generation (lite model)
 * - Reasoning: prose/synthesis/advanced reasoning (flash/preview models)
 */
export enum ModelTier {
  Structural = 'structural',  // gemini-2.5-flash-lite
  Reasoning = 'reasoning',    // gemini-2.5-flash or gemini-3-flash-preview
}

/**
 * Model spec map by tier
 */
const TIER_MODEL_MAP: Record<ModelTier, string> = {
  [ModelTier.Structural]: 'gemini-2.5-flash-lite',
  [ModelTier.Reasoning]: 'gemini-2.5-flash',
};

// Cache the provider instance
let cachedProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;

/**
 * Get API key from environment variables
 * Checks multiple common environment variable names for flexibility
 */
function getApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    null
  );
}

/**
 * Create the Google AI provider with API key authentication
 */
function createProvider(): ReturnType<typeof createGoogleGenerativeAI> {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error(
      'No Google AI API key found. Set one of: GEMINI_API_KEY, GOOGLE_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY'
    );
  }
  
  console.log('[ThinkForge] Using Google Generative AI with API key');
  return createGoogleGenerativeAI({ apiKey });
}

/**
 * Get or create the cached provider
 */
function getProvider(): ReturnType<typeof createGoogleGenerativeAI> {
  if (!cachedProvider) {
    cachedProvider = createProvider();
  }
  return cachedProvider;
}

/**
 * Create a model instance by tier
 * 
 * @param tier - Model tier: Structural (lite) or Reasoning (flash/preview)
 * @returns Model instance compatible with Vercel AI SDK
 */
export function createModelByTier(tier: ModelTier): LanguageModel {
  const modelName = TIER_MODEL_MAP[tier];
  const provider = getProvider();
  return provider(modelName) as unknown as LanguageModel;
}

/**
 * Create a model instance for ThinkForge agents
 * 
 * @param modelName - Model name (defaults to gemini-2.5-flash)
 * @returns Model instance compatible with Vercel AI SDK
 * @deprecated Use createModelByTier for new code
 */
export function createThinkForgeModel(modelName: string = 'gemini-2.5-flash'): LanguageModel {
  const provider = getProvider();
  return provider(modelName) as unknown as LanguageModel;
}

/**
 * Safeguard: warn if lite model is used for prose generation
 */
export function validateTierForTask(tier: ModelTier, taskType: 'prose' | 'structure' | 'reasoning'): void {
  if (tier === ModelTier.Structural && (taskType === 'prose' || taskType === 'reasoning')) {
    const msg = `[ThinkForge Warning] lite model requested for ${taskType} task; use Reasoning tier instead`;
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
      throw new Error(msg);
    }
    console.warn(msg);
  }
}

/**
 * Get the current authentication method being used
 */
export function getAuthMethod(): 'apikey' {
  return 'apikey';
}

/**
 * Clear the cached provider (useful for testing or credential rotation)
 */
export function clearProviderCache() {
  cachedProvider = null;
}
