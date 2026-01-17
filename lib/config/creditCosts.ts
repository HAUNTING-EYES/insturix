/**
 * Credit Cost Configuration
 * 
 * Defines how credits are consumed per service/action.
 * Multipliers TBD per implemented model - this is the framework.
 */

export type CreditBillingType = 'per_request' | 'per_minute' | 'per_token';

export interface CreditCostConfig {
  service: string;
  action: string;
  billingType: CreditBillingType;
  baseCost: number;
  description: string;
  // Model-specific multipliers (multiplied against baseCost)
  // Note: To be populated based on implemented models in codebase
  modelMultipliers?: Record<string, number>;
  // Request type multipliers (for services with different request types)
  requestTypeMultipliers?: Record<string, number>;
}

/**
 * Credit costs per service
 * 
 * Consumption order:
 * 1. Subscription credits first (they expire monthly)
 * 2. Top-up credits second (they never expire)
 */
export const CREDIT_COSTS: Record<string, CreditCostConfig[]> = {
  thinkforge: [
    {
      service: 'thinkforge',
      action: 'chat_message',
      billingType: 'per_request',
      baseCost: 1,
      description: 'Per chat message/interaction',
      // TBD: Add model multipliers when we know implemented models
      // Example: { 'gpt-4': 3, 'gpt-3.5-turbo': 1, 'gemini-pro': 2 }
      modelMultipliers: {},
    },
    {
      service: 'thinkforge',
      action: 'image_generation',
      billingType: 'per_request',
      baseCost: 5,
      description: 'Per image generated',
      modelMultipliers: {},
    },
  ],
  
  alyzitron: [
    {
      service: 'alyzitron',
      action: 'video_analysis',
      billingType: 'per_minute',
      baseCost: 2,
      description: 'Per minute of video analyzed',
      // Single model currently, flat rate
    },
  ],
  
  editron: [
    {
      service: 'editron',
      action: 'ai_operation',
      billingType: 'per_token',
      baseCost: 1, // Per 1000 tokens
      description: 'Token-based billing like ChatGPT (input + output tokens)',
      // Token pricing is calculated separately
    },
  ],
  
  musitron: [
    {
      service: 'musitron',
      action: 'music_generation',
      billingType: 'per_request',
      baseCost: 8,
      description: 'Per music track generated',
      // TBD: Add model multipliers
      modelMultipliers: {},
    },
  ],
  
  clickatron: [
    {
      service: 'clickatron',
      action: 'variation',
      billingType: 'per_request',
      baseCost: 3,
      description: 'Per image variation generated',
      modelMultipliers: {},
      requestTypeMultipliers: {
        'variation': 1,
        'generation': 1.5,
        'upscale': 0.5,
        'background_removal': 0.3,
      },
    },
  ],
};

/**
 * Subscription plan credit allocations (monthly)
 * These credits expire at the end of each billing cycle
 */
export const PLAN_CREDIT_ALLOCATIONS: Record<string, number> = {
  free: 50,
  plus: 500,
  pro: 2000,
  premium: 5000,
};

/**
 * Top-up credit packages
 */
export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  prices: Record<string, number>; // currency -> amount
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'topup_100',
    name: '100 Credits',
    credits: 100,
    prices: {
      USD: 4.99,
      INR: 399,
      EUR: 4.49,
      GBP: 3.99,
    },
  },
  {
    id: 'topup_500',
    name: '500 Credits',
    credits: 500,
    prices: {
      USD: 19.99,
      INR: 1599,
      EUR: 17.99,
      GBP: 15.99,
    },
  },
  {
    id: 'topup_1000',
    name: '1000 Credits',
    credits: 1000,
    prices: {
      USD: 34.99,
      INR: 2799,
      EUR: 31.99,
      GBP: 27.99,
    },
  },
];

/**
 * Get credit cost for a specific service action
 */
export function getCreditCost(
  service: string,
  action: string,
  options?: {
    model?: string;
    requestType?: string;
    tokenCount?: number; // For token-based billing
    durationMinutes?: number; // For per-minute billing
  }
): number {
  const serviceCosts = CREDIT_COSTS[service];
  if (!serviceCosts) {
    console.warn(`[CreditCost] Unknown service: ${service}`);
    return 0;
  }

  const costConfig = serviceCosts.find(c => c.action === action);
  if (!costConfig) {
    console.warn(`[CreditCost] Unknown action: ${action} for service: ${service}`);
    return 0;
  }

  let cost = costConfig.baseCost;

  // Apply model multiplier if specified
  if (options?.model && costConfig.modelMultipliers?.[options.model]) {
    cost *= costConfig.modelMultipliers[options.model];
  }

  // Apply request type multiplier if specified
  if (options?.requestType && costConfig.requestTypeMultipliers?.[options.requestType]) {
    cost *= costConfig.requestTypeMultipliers[options.requestType];
  }

  // Handle token-based billing
  if (costConfig.billingType === 'per_token' && options?.tokenCount) {
    // baseCost is per 1000 tokens
    cost = (options.tokenCount / 1000) * cost;
  }

  // Handle per-minute billing
  if (costConfig.billingType === 'per_minute' && options?.durationMinutes) {
    cost *= options.durationMinutes;
  }

  // Round to 2 decimal places
  return Math.round(cost * 100) / 100;
}

/**
 * Get plan credit allocation
 */
export function getPlanCreditAllocation(planType: string): number {
  const normalized = planType.toLowerCase().replace(' plan', '');
  return PLAN_CREDIT_ALLOCATIONS[normalized] ?? PLAN_CREDIT_ALLOCATIONS.free;
}
