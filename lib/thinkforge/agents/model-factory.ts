/**
 * ThinkForge AI Model Factory
 * 
 * Unified model creation with privacy-aware task routing:
 * - Private brand/user context stays on Gemini unless an approved provider is added.
 * - Safe public trend routes can opt into OpenRouter-hosted models.
 * - Legacy tier/name helpers remain as safe Gemini-backed wrappers.
 * 
 * Note: For Vertex AI with service account credentials in production,
 * consider using the native @google/genai SDK or deploying to Cloud Run
 * where ADC is automatically available.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';
import {
  assertProviderRouteAllowed,
  type ProviderPrivacyAuditRecord,
  type ProviderPrivacyClass,
  type ProviderRoutePurpose,
} from '../privacy/provider-privacy-gateway';

/**
 * Model Tier Classification
 * - Structural: schema/routing/metadata/extraction (Gemini 3.1 Flash-Lite — cheapest, fastest)
 *   $0.25/1M input, 2.5X faster TTFAT than 2.5 Flash. Ideal for Observer, Post-Mortem, fact extraction.
 *   https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-lite/
 * - Reasoning: prose/synthesis/advanced reasoning (gemini-2.5-flash)
 */
export enum ModelTier {
  Structural = 'structural',
  Reasoning = 'reasoning',
}

/**
 * Model spec map by tier
 */
const TIER_MODEL_MAP: Record<ModelTier, string> = {
  [ModelTier.Structural]: 'gemini-3.1-flash-lite-preview',
  [ModelTier.Reasoning]: 'gemini-2.5-flash',
};

export type ThinkForgeModelProvider = 'gemini' | 'openrouter';

export interface ThinkForgeProviderRoute {
  provider: ThinkForgeModelProvider;
  model: string;
  routePurpose: ProviderRoutePurpose;
  privacyClass: ProviderPrivacyClass;
  privacyAudit: ProviderPrivacyAuditRecord;
}

export interface ThinkForgeModelRouteOptions {
  routePurpose: ProviderRoutePurpose;
  privacyClass: ProviderPrivacyClass;
  preferredProvider?: ThinkForgeModelProvider;
  modelName?: string;
}

type LegacyRouteOptions = Partial<Omit<ThinkForgeModelRouteOptions, 'routePurpose' | 'privacyClass'>> & {
  routePurpose?: ProviderRoutePurpose;
  privacyClass?: ProviderPrivacyClass;
};

const DEFAULT_GEMINI_MODEL_BY_ROUTE: Record<ProviderRoutePurpose, string> = {
  structural: TIER_MODEL_MAP[ModelTier.Structural],
  creative_authoring: TIER_MODEL_MAP[ModelTier.Reasoning],
  eval: TIER_MODEL_MAP[ModelTier.Reasoning],
  public_trend: TIER_MODEL_MAP[ModelTier.Reasoning],
  private_brand_context: TIER_MODEL_MAP[ModelTier.Reasoning],
};

const DEFAULT_OPENROUTER_MODEL_BY_ROUTE: Partial<Record<ProviderRoutePurpose, string>> = {
  eval: 'deepseek/deepseek-chat',
  public_trend: 'deepseek/deepseek-chat',
};

// Cache the provider instance
let cachedGoogleProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;
let cachedOpenRouterProvider: ReturnType<typeof createOpenRouter> | null = null;

/**
 * Get API key from environment variables
 * Checks multiple common environment variable names for flexibility
 */
function getGoogleApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    null
  );
}

function getOpenRouterApiKey(): string | null {
  return process.env.OPENROUTER_API_KEY || null;
}

/**
 * Create the Google AI provider with API key authentication
 */
function createGoogleProvider(): ReturnType<typeof createGoogleGenerativeAI> {
  const apiKey = getGoogleApiKey();
  
  if (!apiKey) {
    throw new Error(
      'No Google AI API key found. Set one of: GEMINI_API_KEY, GOOGLE_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY'
    );
  }
  
  console.log('[ThinkForge] Using Google Generative AI with API key');
  return createGoogleGenerativeAI({ apiKey });
}

function createOpenRouterProvider(): ReturnType<typeof createOpenRouter> {
  const apiKey = getOpenRouterApiKey();

  if (!apiKey) {
    throw new Error('No OpenRouter API key found. Set OPENROUTER_API_KEY for safe public/eval OpenRouter routes.');
  }

  return createOpenRouter({
    apiKey,
    headers: {
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'https://insturix.local',
      'X-Title': process.env.OPENROUTER_APP_NAME ?? 'ThinkForge',
    },
  });
}

/**
 * Get or create the cached provider
 */
function getGoogleProvider(): ReturnType<typeof createGoogleGenerativeAI> {
  if (!cachedGoogleProvider) {
    cachedGoogleProvider = createGoogleProvider();
  }
  return cachedGoogleProvider;
}

function getOpenRouterProvider(): ReturnType<typeof createOpenRouter> {
  if (!cachedOpenRouterProvider) {
    cachedOpenRouterProvider = createOpenRouterProvider();
  }
  return cachedOpenRouterProvider;
}

export function resolveThinkForgeProviderRoute(options: ThinkForgeModelRouteOptions): ThinkForgeProviderRoute {
  const provider = options.preferredProvider ?? 'gemini';
  const model = options.modelName ?? defaultModelForRoute(provider, options.routePurpose);
  const privacy = assertProviderRouteAllowed({
    provider,
    model,
    routePurpose: options.routePurpose,
    privacyClass: options.privacyClass,
    fieldsSent: ['prompt'],
  });

  return {
    provider,
    model,
    routePurpose: options.routePurpose,
    privacyClass: options.privacyClass,
    privacyAudit: privacy.audit,
  };
}

export function createThinkForgeModelForRoute(options: ThinkForgeModelRouteOptions): LanguageModel {
  const route = resolveThinkForgeProviderRoute(options);

  if (route.provider === 'openrouter') {
    return getOpenRouterProvider()(route.model) as unknown as LanguageModel;
  }

  return getGoogleProvider()(route.model) as unknown as LanguageModel;
}

function defaultModelForRoute(provider: ThinkForgeModelProvider, routePurpose: ProviderRoutePurpose): string {
  if (provider === 'openrouter') {
    const model = DEFAULT_OPENROUTER_MODEL_BY_ROUTE[routePurpose];
    if (!model) {
      return 'deepseek/deepseek-chat';
    }
    return model;
  }

  return DEFAULT_GEMINI_MODEL_BY_ROUTE[routePurpose];
}

/**
 * Create a model instance by tier
 * 
 * @param tier - Model tier: Structural (lite) or Reasoning (flash/preview)
 * @returns Model instance compatible with Vercel AI SDK
 */
export function createModelByTier(tier: ModelTier, options: LegacyRouteOptions = {}): LanguageModel {
  return createThinkForgeModelForRoute({
    routePurpose: options.routePurpose ?? (tier === ModelTier.Structural ? 'structural' : 'creative_authoring'),
    privacyClass: options.privacyClass ?? 'business_confidential',
    preferredProvider: options.preferredProvider,
    modelName: options.modelName ?? (options.preferredProvider === 'openrouter' ? undefined : TIER_MODEL_MAP[tier]),
  });
}

/**
 * Create a model instance for ThinkForge agents
 * 
 * @param modelName - Model name (defaults to gemini-2.5-flash)
 * @returns Model instance compatible with Vercel AI SDK
 * @deprecated Use createModelByTier for new code
 */
export function createThinkForgeModel(
  modelName?: string,
  options: LegacyRouteOptions = {},
): LanguageModel {
  return createThinkForgeModelForRoute({
    routePurpose: options.routePurpose ?? 'creative_authoring',
    privacyClass: options.privacyClass ?? 'business_confidential',
    preferredProvider: options.preferredProvider,
    modelName: options.modelName ?? (options.preferredProvider === 'openrouter' ? undefined : modelName ?? 'gemini-2.5-flash'),
  });
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
  cachedGoogleProvider = null;
  cachedOpenRouterProvider = null;
}
