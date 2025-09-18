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

export const SERVICE_PRICING_CONFIGS: Record<string, Record<string, CurrencyPricing>> = {
  plus: {
    USD: {
      monthly: { amount: 9.99, currency: "USD", symbol: "$" },
      yearly: { amount: 99.99, currency: "USD", symbol: "$" },
    },
    INR: {
      monthly: { amount: 799, currency: "INR", symbol: "₹" },
      yearly: { amount: 7999, currency: "INR", symbol: "₹" },
    },
    EUR: {
      monthly: { amount: 8.99, currency: "EUR", symbol: "€" },
      yearly: { amount: 89.99, currency: "EUR", symbol: "€" },
    },
    GBP: {
      monthly: { amount: 7.99, currency: "GBP", symbol: "£" },
      yearly: { amount: 79.99, currency: "GBP", symbol: "£" },
    },
    CAD: {
      monthly: { amount: 12.99, currency: "CAD", symbol: "C$" },
      yearly: { amount: 129.99, currency: "CAD", symbol: "C$" },
    },
    AUD: {
      monthly: { amount: 14.99, currency: "AUD", symbol: "A$" },
      yearly: { amount: 149.99, currency: "AUD", symbol: "A$" },
    },
    SGD: {
      monthly: { amount: 13.99, currency: "SGD", symbol: "S$" },
      yearly: { amount: 139.99, currency: "SGD", symbol: "S$" },
    },
    AED: {
      monthly: { amount: 36.99, currency: "AED", symbol: "د.إ" },
      yearly: { amount: 369.99, currency: "AED", symbol: "د.إ" },
    },
  },
  pro: {
    USD: {
      monthly: { amount: 19.99, currency: "USD", symbol: "$" },
      yearly: { amount: 199.99, currency: "USD", symbol: "$" },
    },
    INR: {
      monthly: { amount: 1599, currency: "INR", symbol: "₹" },
      yearly: { amount: 15999, currency: "INR", symbol: "₹" },
    },
    EUR: {
      monthly: { amount: 17.99, currency: "EUR", symbol: "€" },
      yearly: { amount: 179.99, currency: "EUR", symbol: "€" },
    },
    GBP: {
      monthly: { amount: 15.99, currency: "GBP", symbol: "£" },
      yearly: { amount: 159.99, currency: "GBP", symbol: "£" },
    },
    CAD: {
      monthly: { amount: 25.99, currency: "CAD", symbol: "C$" },
      yearly: { amount: 259.99, currency: "CAD", symbol: "C$" },
    },
    AUD: {
      monthly: { amount: 29.99, currency: "AUD", symbol: "A$" },
      yearly: { amount: 299.99, currency: "AUD", symbol: "A$" },
    },
    SGD: {
      monthly: { amount: 26.99, currency: "SGD", symbol: "S$" },
      yearly: { amount: 269.99, currency: "SGD", symbol: "S$" },
    },
    AED: {
      monthly: { amount: 73.99, currency: "AED", symbol: "د.إ" },
      yearly: { amount: 739.99, currency: "AED", symbol: "د.إ" },
    },
  },
  premium: {
    USD: {
      monthly: { amount: 29.99, currency: "USD", symbol: "$" },
      yearly: { amount: 299.99, currency: "USD", symbol: "$" },
    },
    INR: {
      monthly: { amount: 2499, currency: "INR", symbol: "₹" },
      yearly: { amount: 24999, currency: "INR", symbol: "₹" },
    },
    EUR: {
      monthly: { amount: 27.99, currency: "EUR", symbol: "€" },
      yearly: { amount: 279.99, currency: "EUR", symbol: "€" },
    },
    GBP: {
      monthly: { amount: 24.99, currency: "GBP", symbol: "£" },
      yearly: { amount: 249.99, currency: "GBP", symbol: "£" },
    },
    CAD: {
      monthly: { amount: 39.99, currency: "CAD", symbol: "C$" },
      yearly: { amount: 399.99, currency: "CAD", symbol: "C$" },
    },
    AUD: {
      monthly: { amount: 44.99, currency: "AUD", symbol: "A$" },
      yearly: { amount: 449.99, currency: "AUD", symbol: "A$" },
    },
    SGD: {
      monthly: { amount: 40.99, currency: "SGD", symbol: "S$" },
      yearly: { amount: 409.99, currency: "SGD", symbol: "S$" },
    },
    AED: {
      monthly: { amount: 109.99, currency: "AED", symbol: "د.إ" },
      yearly: { amount: 1099.99, currency: "AED", symbol: "د.إ" },
    },
  },
};