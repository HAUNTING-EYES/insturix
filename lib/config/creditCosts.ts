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
      action: 'ai_chat',
      billingType: 'per_token',
      baseCost: 0.5, // Credits per 1000 tokens (input + output combined)
      description: 'Per 1000 tokens consumed',
      // Model-specific multipliers (gemini-2.5-flash is baseline 1x)
      modelMultipliers: {
        'gemini-2.5-flash': 1,
        'gemini-2.0-flash': 1.2,
        'gemini-1.5-pro': 3,
        'gemini-1.5-flash': 0.8,
      },
    },
  ],
  
  musitron: [
    {
      service: 'musitron',
      action: 'music_generation',
      billingType: 'per_request',
      baseCost: 1, // Base is 1, multipliers define the actual model cost
      description: 'Per music track generated',
      modelMultipliers: {
        'fal-ai/minimax-music/v2': 3,
        'sonauto/v2/text-to-music': 8,
        'fal-ai/stable-audio/v2.5': 20,
      },
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

// Subscription Plans (USD Only)
export interface SubscriptionPlan {
  id: string; // Internal ID (e.g. 'plus', 'pro')
  name: string;
  description: string;
  credits: number;
  price: number; // USD
  currency: 'USD';
  features: string[];
  popular?: boolean;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plus',
    name: 'Plus',
    description: 'Perfect for growing creators',
    credits: 500,
    price: 9.99,
    currency: 'USD',
    features: [
      '500 Monthly Credits',
      'Access to all tools',
      'Priority support',
      'Rollover up to 1000 credits'
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For professional content creators',
    credits: 2000,
    price: 29.99,
    currency: 'USD',
    popular: true,
    features: [
      '2,000 Monthly Credits',
      'Access to all tools',
      'Faster processing',
      'Rollover up to 5000 credits'
    ]
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'Ultimate creator experience',
    credits: 5000,
    price: 79.99,
    currency: 'USD',
    features: [
      '5,000 Monthly Credits',
      'Access to all tools',
      'Highest priority',
      'Unlimited rollover'
    ]
  }
];

// Legacy support helpers
export const PLAN_CREDIT_ALLOCATIONS: Record<string, number> = {
  free: 50,
  plus: 500,
  pro: 2000,
  premium: 5000
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
    name: 'Standard Pack',
    credits: 100,
    prices: {
      USD: 4.99,
    },
  },
  {
    id: 'topup_500',
    name: 'Value Pack',
    credits: 500,
    prices: {
      USD: 19.99,
    },
  },
  {
    id: 'topup_1000',
    name: 'Pro Pack',
    credits: 1000,
    prices: {
      USD: 34.99,
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
