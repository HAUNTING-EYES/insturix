/**
 * @deprecated This file is deprecated. Billing is now handled via the credits system.
 * See `lib/services/creditsService.ts` and `lib/config/creditCosts.ts` for the new implementation.
 * 
 * This file is retained for:
 * - Legacy data reference
 * - Potential migration scripts
 * - Historical plan limit information
 * 
 * DO NOT add new service limits here. Use credit costs in `creditCosts.ts` instead.
 */

// Central configuration for all service limits
// This is the single source of truth for limit types, names, descriptions, and plan configurations

export interface ServiceLimitConfig {
  name: string;
  description: string;
  icon?: string;
  defaultResetPeriod: "weekly" | "monthly" | "daily" | "none";
  category?: "count" | "duration" | "storage" | "time";
  unit?: string;
  planLimits: {
    free: number;
    plus: number;
    pro: number;
    premium: number;
  };
  resetPeriods?: {
    free?: "weekly" | "monthly" | "daily" | "none";
    plus?: "weekly" | "monthly" | "daily" | "none";
    pro?: "weekly" | "monthly" | "daily" | "none";
    premium?: "weekly" | "monthly" | "daily" | "none";
  };
}

export interface IServiceLimit {
  limitType: string;
  maxUsage: number;
  currentUsage: number;
  resetPeriod: "weekly" | "monthly" | "daily" | "none";
  lastReset?: Date;
}

export const UNIFIED_SERVICE_LIMITS: Record<string, Record<string, ServiceLimitConfig>> = {
  alyzitron: {
    AnalysisMinutes: {
      name: 'Total Analysis Minutes',
      description: 'Total minutes of video analyses you can perform per week, regardless of video type or content category.',
      icon: 'BarChart2',
      defaultResetPeriod: 'weekly',
      category: 'duration',
      unit: 'minutes',
      planLimits: {
        free: 30,
        plus: 200,
        pro: 400,
        premium: 700
      }
    }
  },
  clickatron: {
    maxVariationGeneration: {
      name: 'Variation Generations',
      description: 'Number of image variations you can generate per week.',
      icon: 'ImageIcon',
      defaultResetPeriod: 'weekly',
      category: 'count',
      unit: 'variations',
      planLimits: {
        free: 20,
        plus: 100,
        pro: 300,
        premium: -1
      }
    }
  },
  editron: {
    maxVideoEdits: {
      name: 'Video Edits',
      description: 'Number of video editing sessions per month.',
      icon: 'Scissors',
      defaultResetPeriod: 'monthly',
      category: 'count',
      unit: 'edits',
      planLimits: {
        free: 1,
        plus: 8,
        pro: 25,
        premium: -1
      }
    }
  },
  shield: {
    maxScans: {
      name: 'Security Scans',
      description: 'Security vulnerability scans per month.',
      icon: 'Shield',
      defaultResetPeriod: 'monthly',
      category: 'count',
      unit: 'scans',
      planLimits: {
        free: 1,
        plus: 15,
        pro: -1,
        premium: -1
      }
    }
  },
  thinkforge: {
    maxSessions: {
      name: 'Weekly Sessions',
      description: 'Number of ThinkForge sessions you can start per week. Each session allows multiple AI interactions.',
      icon: 'MessageSquare',
      defaultResetPeriod: 'weekly',
      category: 'count',
      unit: 'sessions',
      planLimits: {
        free: 10,
        plus: 25,
        pro: 100,
        premium: -1
      }
    }
  },
  musitron: {
    maxMusicGeneration: {
      name: 'Music Tracks',
      description: 'AI-generated music tracks per month.',
      icon: 'Music',
      defaultResetPeriod: 'monthly',
      category: 'count',
      unit: 'tracks',
      planLimits: {
        free: 3,
        plus: 30,
        pro: 50,
        premium: -1
      }
    }
  }
};

// Helper functions to get limit information
export const getLimitDisplayName = (limitType: string, serviceName?: string): string => {
  if (serviceName && UNIFIED_SERVICE_LIMITS[serviceName]?.[limitType]) {
    return UNIFIED_SERVICE_LIMITS[serviceName][limitType].name;
  }

  // Fallback: search across all services
  for (const service of Object.values(UNIFIED_SERVICE_LIMITS)) {
    if (service[limitType]) {
      return service[limitType].name;
    }
  }

  return limitType;
};

export const getLimitDescription = (limitType: string, serviceName?: string): string => {
  if (serviceName && UNIFIED_SERVICE_LIMITS[serviceName]?.[limitType]) {
    return UNIFIED_SERVICE_LIMITS[serviceName][limitType].description;
  }

  // Fallback: search across all services
  for (const service of Object.values(UNIFIED_SERVICE_LIMITS)) {
    if (service[limitType]) {
      return service[limitType].description;
    }
  }

  return '';
};

export const getAllLimitTypesForService = (serviceName: string): ServiceLimitConfig[] => {
  const serviceLimits = UNIFIED_SERVICE_LIMITS[serviceName] || {};
  return Object.values(serviceLimits);
};

export const getAllServiceLimitMappings = (): Record<string, string> => {
  const mappings: Record<string, string> = {};

  Object.entries(UNIFIED_SERVICE_LIMITS).forEach(([, limits]) => {
    Object.entries(limits).forEach(([limitType, config]) => {
      mappings[limitType] = config.name;
    });
  });

  return mappings;
};

// Utility functions for limit management
export const getPlanLimits = (serviceName: string, planType: "free" | "plus" | "pro" | "premium", forUser: boolean = false): any[] => {
  const serviceLimits = UNIFIED_SERVICE_LIMITS[serviceName];

  if (!serviceLimits) {
    console.warn(`Service not found: ${serviceName}`);
    return [];
  }

  return Object.entries(serviceLimits).map(([limitType, config]) => {
    const maxUsage = config.planLimits[planType];
    const resetPeriod = config.resetPeriods?.[planType] || config.defaultResetPeriod;

    const baseLimit = {
      limitType,
      description: config.description,
      maxUsage,
      resetPeriod
    };

    // Add user-specific fields only for users
    if (forUser) {
      return {
        ...baseLimit,
        currentUsage: 0,
        lastReset: new Date()
      };
    }

    return baseLimit;
  });
};

export const getLimitByCategory = (category: "count" | "duration" | "storage" | "time") => {
  const results: ServiceLimitConfig[] = [];

  Object.values(UNIFIED_SERVICE_LIMITS).forEach(serviceLimits => {
    Object.values(serviceLimits).forEach(config => {
      if (config.category === category) {
        results.push(config);
      }
    });
  });

  return results;
};



// Pricing configuration for all plans and currencies
export interface PricingDetail {
  amount: number;
  currency: string;
  symbol: string;
  providerPlanIds?: Map<string, string>;
}

export interface CurrencyPricing {
  monthly: PricingDetail;
  yearly: PricingDetail;
}

// Razorpay seed pricing. SUBSCRIPTION_PLANS in creditCosts.ts is the public source of truth.
// Agency plans are $100/$500/$1000 per month and yearly = 10x monthly.
// Legacy plus/pro/premium entries remain for historical DB records; new seed data uses agency_* keys.
export const SERVICE_PRICING_CONFIGS: Record<string, Record<string, CurrencyPricing>> = {
  plus: {
    USD: {
      monthly: { amount: 20, currency: "USD", symbol: "$" },
      yearly: { amount: 200, currency: "USD", symbol: "$" },
    },
    INR: {
      monthly: { amount: 1899, currency: "INR", symbol: "₹" },
      yearly: { amount: 18899, currency: "INR", symbol: "₹" },
    },
    EUR: {
      monthly: { amount: 18.99, currency: "EUR", symbol: "€" },
      yearly: { amount: 189.99, currency: "EUR", symbol: "€" },
    },
    GBP: {
      monthly: { amount: 15.99, currency: "GBP", symbol: "£" },
      yearly: { amount: 159.99, currency: "GBP", symbol: "£" },
    },
    CAD: {
      monthly: { amount: 27.99, currency: "CAD", symbol: "C$" },
      yearly: { amount: 273.99, currency: "CAD", symbol: "C$" },
    },
    AUD: {
      monthly: { amount: 29.99, currency: "AUD", symbol: "A$" },
      yearly: { amount: 299.99, currency: "AUD", symbol: "A$" },
    },
    SGD: {
      monthly: { amount: 27.99, currency: "SGD", symbol: "S$" },
      yearly: { amount: 279.99, currency: "SGD", symbol: "S$" },
    },
    AED: {
      monthly: { amount: 73.99, currency: "AED", symbol: "د.إ" },
      yearly: { amount: 739.99, currency: "AED", symbol: "د.إ" },
    },
  },
  pro: {
    USD: {
      monthly: { amount: 49, currency: "USD", symbol: "$" },
      yearly: { amount: 490, currency: "USD", symbol: "$" },
    },
    INR: {
      monthly: { amount: 4699, currency: "INR", symbol: "₹" },
      yearly: { amount: 46399, currency: "INR", symbol: "₹" },
    },
    EUR: {
      monthly: { amount: 44.99, currency: "EUR", symbol: "€" },
      yearly: { amount: 449.99, currency: "EUR", symbol: "€" },
    },
    GBP: {
      monthly: { amount: 38.99, currency: "GBP", symbol: "£" },
      yearly: { amount: 389.99, currency: "GBP", symbol: "£" },
    },
    CAD: {
      monthly: { amount: 66.99, currency: "CAD", symbol: "C$" },
      yearly: { amount: 669.99, currency: "CAD", symbol: "C$" },
    },
    AUD: {
      monthly: { amount: 73.99, currency: "AUD", symbol: "A$" },
      yearly: { amount: 739.99, currency: "AUD", symbol: "A$" },
    },
    SGD: {
      monthly: { amount: 66.99, currency: "SGD", symbol: "S$" },
      yearly: { amount: 669.99, currency: "SGD", symbol: "S$" },
    },
    AED: {
      monthly: { amount: 179.99, currency: "AED", symbol: "د.إ" },
      yearly: { amount: 1799.99, currency: "AED", symbol: "د.إ" },
    },
  },
  premium: {
    USD: {
      monthly: { amount: 99, currency: "USD", symbol: "$" },
      yearly: { amount: 990, currency: "USD", symbol: "$" },
    },
    INR: {
      monthly: { amount: 9399, currency: "INR", symbol: "₹" },
      yearly: { amount: 93599, currency: "INR", symbol: "₹" },
    },
    EUR: {
      monthly: { amount: 92.99, currency: "EUR", symbol: "€" },
      yearly: { amount: 929.99, currency: "EUR", symbol: "€" },
    },
    GBP: {
      monthly: { amount: 79.99, currency: "GBP", symbol: "£" },
      yearly: { amount: 799.99, currency: "GBP", symbol: "£" },
    },
    CAD: {
      monthly: { amount: 135.99, currency: "CAD", symbol: "C$" },
      yearly: { amount: 1353.99, currency: "CAD", symbol: "C$" },
    },
    AUD: {
      monthly: { amount: 149.99, currency: "AUD", symbol: "A$" },
      yearly: { amount: 1499.99, currency: "AUD", symbol: "A$" },
    },
    SGD: {
      monthly: { amount: 134.99, currency: "SGD", symbol: "S$" },
      yearly: { amount: 1349.99, currency: "SGD", symbol: "S$" },
    },
    AED: {
      monthly: { amount: 363.99, currency: "AED", symbol: "د.إ" },
      yearly: { amount: 3635.99, currency: "AED", symbol: "د.إ" },
    },
  },
};
function roundCurrencyAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function buildAgencyPricing(base: Record<string, CurrencyPricing>, usdMonthly: number): Record<string, CurrencyPricing> {
  const multiplier = usdMonthly / base.USD.monthly.amount;
  return Object.fromEntries(
    Object.entries(base).map(([currency, pricing]) => {
      const monthlyAmount = currency === "USD"
        ? usdMonthly
        : roundCurrencyAmount(pricing.monthly.amount * multiplier);
      return [currency, {
        monthly: {
          amount: monthlyAmount,
          currency: pricing.monthly.currency,
          symbol: pricing.monthly.symbol,
        },
        yearly: {
          amount: currency === "USD" ? usdMonthly * 10 : roundCurrencyAmount(monthlyAmount * 10),
          currency: pricing.yearly.currency,
          symbol: pricing.yearly.symbol,
        },
      }];
    })
  );
}

SERVICE_PRICING_CONFIGS.agency_starter = buildAgencyPricing(SERVICE_PRICING_CONFIGS.plus, 100);
SERVICE_PRICING_CONFIGS.agency_growth = buildAgencyPricing(SERVICE_PRICING_CONFIGS.pro, 500);
SERVICE_PRICING_CONFIGS.agency_scale = buildAgencyPricing(SERVICE_PRICING_CONFIGS.premium, 1000);