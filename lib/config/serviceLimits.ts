// Central configuration for all service limits
// This is the single source of truth for limit types, names, descriptions, and plan configurations

export interface ServiceLimitConfig {
  name: string;
  description: string;
  icon?: string;
  defaultResetPeriod: "weekly" | "monthly" | "daily" | "none";
  category?: "count" | "duration" | "storage" | "time";
  unit?: string; // More flexible unit type
}

export interface ServicePlanConfig {
  serviceName: string;
  planType: "free" | "plus" | "pro" | "premium";
  limits: Record<string, number>; // limitType -> maxUsage
  resetPeriods?: Record<string, "weekly" | "monthly" | "daily" | "none">; // Optional override
}

export interface IServiceLimit {
  limitType: string;
  maxUsage: number;
  currentUsage: number;
  resetPeriod: "weekly" | "monthly" | "daily" | "none";
  lastReset?: Date;
}

export const SERVICE_LIMIT_DEFINITIONS: Record<string, ServiceLimitConfig> = {
  // Alyzitron Limits
  AnalysisMinutes: {
    name: 'Total Analysis Minutes',
    description: 'Total minutes of video analyses you can perform per week, regardless of video type or content category.',
    icon: 'BarChart2',
    defaultResetPeriod: 'weekly',
    category: 'duration',
    unit: 'minutes'
  },
  // maxTotalAnalysis: {
  //   name: 'Total Analysis',
  //   description: 'Total number of video analyses you can perform per month.',
  //   icon: 'BarChart2',
  //   defaultResetPeriod: 'monthly',
  //   category: 'count',
  //   unit: 'analyses'
  // },
  // maxOver20MinuteAnalysis: {
  //   name: 'Over 20 Minute Analyses',
  //   description: 'Number of analyses for videos longer than 20 minutes you can perform per month.',
  //   icon: 'Clock',
  //   defaultResetPeriod: 'monthly',
  //   category: 'count',
  //   unit: 'analyses'
  // },

  // Editron Limits
  maxVideoEdits: {
    name: 'Video Edits',
    description: 'Number of video editing sessions per month.',
    icon: 'Scissors',
    defaultResetPeriod: 'monthly',
    category: 'count',
    unit: 'edits'
  },

  // Shield Limits
  maxScans: {
    name: 'Security Scans',
    description: 'Security vulnerability scans per month.',
    icon: 'Shield',
    defaultResetPeriod: 'monthly',
    category: 'count',
    unit: 'scans'
  },

  // Socialize Limits
  maxSocialLinks: {
    name: 'Social Links',
    description: 'Maximum social media links you can manage.',
    icon: 'Share2',
    defaultResetPeriod: 'none',
    category: 'count',
    unit: 'links'
  },

  // ThinkForge Limits
  maxSessions: {
    name: 'Weekly Sessions',
    description: 'Number of ThinkForge sessions you can start per week. Each session allows multiple AI interactions.',
    icon: 'MessageSquare',
    defaultResetPeriod: 'weekly',
    category: 'count',
    unit: 'sessions'
  },

  // Musitron Limits
  maxMusicGeneration: {
    name: 'Music Tracks',
    description: 'AI-generated music tracks per month.',
    icon: 'Music',
    defaultResetPeriod: 'monthly',
    category: 'count',
    unit: 'tracks'
  },

  // Clickatron Limits
  maxThumbnailGeneration: {
    name: 'Thumbnail Generations',
    description: 'Number of thumbnails you can generate per week.',
    icon: 'ImageIcon',
    defaultResetPeriod: 'weekly',
    category: 'count',
    unit: 'thumbnails'
  }
};

export const SERVICE_PLAN_CONFIGS: ServicePlanConfig[] = [
  {
    serviceName: 'alyzitron',
    planType: 'free',
    limits: {
      AnalysisMinutes: 30,
    }
  },
  {
    serviceName: 'alyzitron',
    planType: 'plus',
    limits: {
      AnalysisMinutes: 200,
    }
  },
  {
    serviceName: 'alyzitron',
    planType: 'pro',
    limits: {
      AnalysisMinutes: 400,
    }
  },
  {
    serviceName: 'alyzitron',
    planType: 'premium',
    limits: {
      AnalysisMinutes: 700,
    }
  },
  // {
  //   serviceName: 'alyzitron',
  //   planType: 'free',
  //   limits: {
  //     maxTotalAnalysis: 10,
  //     maxOver20MinuteAnalysis: 3
  //   }
  // },
  // {
  //   serviceName: 'alyzitron',
  //   planType: 'plus',
  //   limits: {
  //     maxTotalAnalysis: 40,
  //     maxOver20MinuteAnalysis: 15
  //   }
  // },
  // {
  //   serviceName: 'alyzitron',
  //   planType: 'pro',
  //   limits: {
  //     maxTotalAnalysis: 120,
  //     maxOver20MinuteAnalysis: 40
  //   }
  // },
  // {
  //   serviceName: 'alyzitron',
  //   planType: 'premium',
  //   limits: {
  //     maxTotalAnalysis: -1,
  //     maxOver20MinuteAnalysis: -1
  //   }
  // },
  {
    serviceName: 'clickatron',
    planType: 'free',
    limits: {
      maxThumbnailGeneration: 12
    }
  },
  {
    serviceName: 'clickatron',
    planType: 'plus',
    limits: {
      maxThumbnailGeneration: 45
    }
  },
  {
    serviceName: 'clickatron',
    planType: 'pro',
    limits: {
      maxThumbnailGeneration: 120
    }
  },
  {
    serviceName: 'clickatron',
    planType: 'premium',
    limits: {
      maxThumbnailGeneration: -1 // Unlimited
    }
  },
  {
    serviceName: 'editron',
    planType: 'free',
    limits: {
      maxVideoEdits: 1
    }
  },
  {
    serviceName: 'editron',
    planType: 'plus',
    limits: {
      maxVideoEdits: 8
    }
  },
  {
    serviceName: 'editron',
    planType: 'pro',
    limits: {
      maxVideoEdits: 25
    }
  },
  {
    serviceName: 'editron',
    planType: 'premium',
    limits: {
      maxVideoEdits: -1 // Unlimited
    }
  },
  {
    serviceName: 'shield',
    planType: 'free',
    limits: {
      maxScans: 1
    }
  },
  {
    serviceName: 'shield',
    planType: 'plus',
    limits: {
      maxScans: 15
    }
  },
  {
    serviceName: 'shield',
    planType: 'pro',
    limits: {
      maxScans: -1 // Unlimited
    }
  },
  {
    serviceName: 'shield',
    planType: 'premium',
    limits: {
      maxScans: -1 // Unlimited
    }
  },
  {
    serviceName: 'socialize',
    planType: 'free',
    limits: {
      maxSocialLinks: 5
    }
  },
  {
    serviceName: 'socialize',
    planType: 'plus',
    limits: {
      maxSocialLinks: -1 // Unlimited
    }
  },
  {
    serviceName: 'socialize',
    planType: 'pro',
    limits: {
      maxSocialLinks: -1 // Unlimited
    }
  },
  {
    serviceName: 'socialize',
    planType: 'premium',
    limits: {
      maxSocialLinks: -1 // Unlimited
    }
  },
  {
    serviceName: 'thinkforge',
    planType: 'free',
    limits: {
      maxSessions: 10
    }
  },
  {
    serviceName: 'thinkforge',
    planType: 'plus',
    limits: {
      maxSessions: 25
    }
  },
  {
    serviceName: 'thinkforge',
    planType: 'pro',
    limits: {
      maxSessions: 100
    }
  },
  {
    serviceName: 'thinkforge',
    planType: 'premium',
    limits: {
      maxSessions: -1 // Unlimited
    }
  },
  {
    serviceName: 'musitron',
    planType: 'free',
    limits: {
      maxMusicGeneration: 3
    }
  },
  {
    serviceName: 'musitron',
    planType: 'plus',
    limits: {
      maxMusicGeneration: 30
    }
  },
  {
    serviceName: 'musitron',
    planType: 'pro',
    limits: {
      maxMusicGeneration: 50
    }
  },
  {
    serviceName: 'musitron',
    planType: 'premium',
    limits: {
      maxMusicGeneration: -1 // Unlimited
    }
  }
];

// Helper functions to get limit information
export const getLimitDisplayName = (limitType: string): string => {
  return SERVICE_LIMIT_DEFINITIONS[limitType]?.name || limitType;
};

export const getLimitDescription = (limitType: string): string => {
  return SERVICE_LIMIT_DEFINITIONS[limitType]?.description || '';
};

export const getAllLimitTypesForService = (serviceName: string): ServiceLimitType[] => {
  const serviceLimits = SERVICE_PLAN_CONFIGS.find(p => p.serviceName === serviceName)?.limits || {};
  return Object.values(SERVICE_LIMIT_DEFINITIONS).filter(config =>
    Object.keys(serviceLimits).includes(config.name)
  );
};

export const getAllServiceLimitMappings = (): Record<string, string> => {
  const mappings: Record<string, string> = {};
  
  Object.entries(SERVICE_LIMIT_DEFINITIONS).forEach(([limitType, config]) => {
    mappings[limitType] = config.name;
  });
  
  return mappings;
};

// Utility functions for limit management
export const getPlanLimits = (serviceName: string, planType: string): any[] => {
  const planConfig = SERVICE_PLAN_CONFIGS.find(
    p => p.serviceName === serviceName && p.planType === planType
  );
  
  if (!planConfig) {
    console.warn(`Plan not found for service: ${serviceName}, planType: ${planType}`);
    return [];
  }
  
  return Object.entries(SERVICE_LIMIT_DEFINITIONS)
    .filter(([limitType, config]) => planConfig.limits[limitType] !== undefined)
    .map(([limitType, config]) => {
      const planValue = planConfig.limits[limitType];
      const resetPeriod = planConfig.resetPeriods?.[limitType] || config.defaultResetPeriod;
      
      return {
        limitType,
        description: config.description,
        maxUsage: planValue,
        resetPeriod
      };
    });
};


export const getLimitByCategory = (category: "count" | "duration" | "storage" | "time") => {
  return Object.entries(SERVICE_LIMIT_DEFINITIONS)
    .filter(([_, config]) => config.category === category)
    .map(([_, config]) => config);
};

// Type compatibility with existing code
export type ServiceLimitType = ServiceLimitConfig;

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

export const SERVICE_PRICING_CONFIGS: Record<string, CurrencyPricing> = {
  USD: {
    monthly: { amount: 0, currency: "USD", symbol: "$" },
    yearly: { amount: 0, currency: "USD", symbol: "$" },
  },
  INR: {
    monthly: { amount: 0, currency: "INR", symbol: "₹" },
    yearly: { amount: 0, currency: "INR", symbol: "₹" },
  },
  EUR: {
    monthly: { amount: 0, currency: "EUR", symbol: "€" },
    yearly: { amount: 0, currency: "EUR", symbol: "€" },
  },
  GBP: {
    monthly: { amount: 0, currency: "GBP", symbol: "£" },
    yearly: { amount: 0, currency: "GBP", symbol: "£" },
  },
  CAD: {
    monthly: { amount: 0, currency: "CAD", symbol: "C$" },
    yearly: { amount: 0, currency: "CAD", symbol: "C$" },
  },
  AUD: {
    monthly: { amount: 0, currency: "AUD", symbol: "A$" },
    yearly: { amount: 0, currency: "AUD", symbol: "A$" },
  },
  SGD: {
    monthly: { amount: 0, currency: "SGD", symbol: "S$" },
    yearly: { amount: 0, currency: "SGD", symbol: "S$" },
  },
  AED: {
    monthly: { amount: 0, currency: "AED", symbol: "د.إ" },
    yearly: { amount: 0, currency: "AED", symbol: "د.إ" },
  },
};

// Set Plus Plan Pricing
SERVICE_PRICING_CONFIGS.USD.monthly.amount = 9.99; SERVICE_PRICING_CONFIGS.USD.yearly.amount = 99.99;
SERVICE_PRICING_CONFIGS.INR.monthly.amount = 799; SERVICE_PRICING_CONFIGS.INR.yearly.amount = 7999;
SERVICE_PRICING_CONFIGS.EUR.monthly.amount = 8.99; SERVICE_PRICING_CONFIGS.EUR.yearly.amount = 89.99;
SERVICE_PRICING_CONFIGS.GBP.monthly.amount = 7.99; SERVICE_PRICING_CONFIGS.GBP.yearly.amount = 79.99;
SERVICE_PRICING_CONFIGS.CAD.monthly.amount = 12.99; SERVICE_PRICING_CONFIGS.CAD.yearly.amount = 129.99;
SERVICE_PRICING_CONFIGS.AUD.monthly.amount = 14.99; SERVICE_PRICING_CONFIGS.AUD.yearly.amount = 149.99;
SERVICE_PRICING_CONFIGS.SGD.monthly.amount = 13.99; SERVICE_PRICING_CONFIGS.SGD.yearly.amount = 139.99;
SERVICE_PRICING_CONFIGS.AED.monthly.amount = 36.99; SERVICE_PRICING_CONFIGS.AED.yearly.amount = 369.99;

// Set Pro Plan Pricing
SERVICE_PRICING_CONFIGS.USD.monthly.amount = 19.99; SERVICE_PRICING_CONFIGS.USD.yearly.amount = 199.99;
SERVICE_PRICING_CONFIGS.INR.monthly.amount = 1599; SERVICE_PRICING_CONFIGS.INR.yearly.amount = 15999;
SERVICE_PRICING_CONFIGS.EUR.monthly.amount = 17.99; SERVICE_PRICING_CONFIGS.EUR.yearly.amount = 179.99;
SERVICE_PRICING_CONFIGS.GBP.monthly.amount = 15.99; SERVICE_PRICING_CONFIGS.GBP.yearly.amount = 159.99;
SERVICE_PRICING_CONFIGS.CAD.monthly.amount = 25.99; SERVICE_PRICING_CONFIGS.CAD.yearly.amount = 259.99;
SERVICE_PRICING_CONFIGS.AUD.monthly.amount = 29.99; SERVICE_PRICING_CONFIGS.AUD.yearly.amount = 299.99;
SERVICE_PRICING_CONFIGS.SGD.monthly.amount = 26.99; SERVICE_PRICING_CONFIGS.SGD.yearly.amount = 269.99;
SERVICE_PRICING_CONFIGS.AED.monthly.amount = 73.99; SERVICE_PRICING_CONFIGS.AED.yearly.amount = 739.99;

// Set Premium Plan Pricing
SERVICE_PRICING_CONFIGS.USD.monthly.amount = 29.99; SERVICE_PRICING_CONFIGS.USD.yearly.amount = 299.99;
SERVICE_PRICING_CONFIGS.INR.monthly.amount = 2499; SERVICE_PRICING_CONFIGS.INR.yearly.amount = 24999;
SERVICE_PRICING_CONFIGS.EUR.monthly.amount = 27.99; SERVICE_PRICING_CONFIGS.EUR.yearly.amount = 279.99;
SERVICE_PRICING_CONFIGS.GBP.monthly.amount = 24.99; SERVICE_PRICING_CONFIGS.GBP.yearly.amount = 249.99;
SERVICE_PRICING_CONFIGS.CAD.monthly.amount = 39.99; SERVICE_PRICING_CONFIGS.CAD.yearly.amount = 399.99;
SERVICE_PRICING_CONFIGS.AUD.monthly.amount = 44.99; SERVICE_PRICING_CONFIGS.AUD.yearly.amount = 449.99;
SERVICE_PRICING_CONFIGS.SGD.monthly.amount = 40.99; SERVICE_PRICING_CONFIGS.SGD.yearly.amount = 409.99;
SERVICE_PRICING_CONFIGS.AED.monthly.amount = 109.99; SERVICE_PRICING_CONFIGS.AED.yearly.amount = 1099.99;