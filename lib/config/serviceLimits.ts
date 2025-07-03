// Central configuration for all service limits
// This is the single source of truth for limit types, names, and descriptions

export interface ServiceLimitType {
  limitType: string;
  name: string;
  description: string;
  icon?: string;
}

export const SERVICE_LIMIT_DEFINITIONS: Record<string, Record<string, ServiceLimitType>> = {
  alyzitron: {
    maxTotalAnalysis: {
      limitType: 'maxTotalAnalysis',
      name: 'Total Weekly Analyses',
      description: 'Total number of video analyses you can perform per week, regardless of video type or content category.',
      icon: 'BarChart2'
    },
    maxOver20MinuteAnalysis: {
      limitType: 'maxOver20MinuteAnalysis',
      name: 'Long Video Analyses (>20min)',
      description: 'Special weekly limit for analyzing videos longer than 20 minutes, which require more processing resources.',
      icon: 'Video'
    },
  },
  editron: {
    maxVideoEdits: {
      limitType: 'maxVideoEdits',
      name: 'Video Edits',
      description: 'Number of video editing sessions per month.',
      icon: 'Scissors'
    }
  },
  shield: {
    maxScans: {
      limitType: 'maxScans',
      name: 'Security Scans',
      description: 'Security vulnerability scans per month.',
      icon: 'Shield'
    }
  },
  socialize: {
    maxSocialLinks: {
      limitType: 'maxSocialLinks',
      name: 'Social Links',
      description: 'Maximum social media links you can manage.',
      icon: 'Share2'
    }
  },
  thinkforge: {
    maxAIChats: {
      limitType: 'maxAIChats',
      name: 'AI Conversations',
      description: 'AI-powered conversations per month.',
      icon: 'MessageSquare'
    }
  },
  musitron: {
    maxMusicGeneration: {
      limitType: 'maxMusicGeneration',
      name: 'Music Tracks',
      description: 'AI-generated music tracks per month.',
      icon: 'Music'
    }
  },
  clickatron: {
    maxThumbnailGeneration: {
      limitType: 'maxThumbnailGeneration',
      name: 'Thumbnail Generations',
      description: 'Number of thumbnails you can generate per week.',
      icon: 'ImageIcon'
    }
  }
};

// Helper functions to get limit information
export const getLimitDisplayName = (serviceName: string, limitType: string): string => {
  return SERVICE_LIMIT_DEFINITIONS[serviceName]?.[limitType]?.name || limitType;
};

export const getLimitDescription = (serviceName: string, limitType: string): string => {
  return SERVICE_LIMIT_DEFINITIONS[serviceName]?.[limitType]?.description || '';
};

export const getAllLimitTypesForService = (serviceName: string): ServiceLimitType[] => {
  return Object.values(SERVICE_LIMIT_DEFINITIONS[serviceName] || {});
};

export const getAllServiceLimitMappings = (): Record<string, string> => {
  const mappings: Record<string, string> = {};
  
  Object.entries(SERVICE_LIMIT_DEFINITIONS).forEach(([serviceName, limits]) => {
    Object.keys(limits).forEach(limitType => {
      const displayName = limits[limitType].name;
      mappings[limitType] = displayName;
    });
  });
  
  return mappings;
};

// Default fallback limits for new users (used when plans collection is unavailable)
export const DEFAULT_FREE_PLAN_LIMITS = {
  alyzitron: [
    { limitType: "maxTotalAnalysis", maxUsage: 10, resetPeriod: "weekly", description: "Total video analyses per week" },
    { limitType: "maxOver20MinuteAnalysis", maxUsage: 3, resetPeriod: "weekly", description: "Analyses for videos over 20 minutes" }
  ],
  editron: [
    { limitType: "maxVideoEdits", maxUsage: 1, resetPeriod: "monthly", description: "Edit videos with Editron" }
  ],
  shield: [
    { limitType: "maxScans", maxUsage: 3, resetPeriod: "monthly", description: "Security scans with Shield" }
  ],
  socialize: [
    { limitType: "maxSocialLinks", maxUsage: 5, resetPeriod: "none", description: "Social media links" }
  ],
  thinkforge: [
    { limitType: "maxAIChats", maxUsage: 10, resetPeriod: "monthly", description: "AI conversations with ThinkForge" }
  ],
  musitron: [
    { limitType: "maxMusicGeneration", maxUsage: 3, resetPeriod: "monthly", description: "Generate music tracks" }
  ],
  clickatron: [
    { limitType: "maxThumbnailGeneration", maxUsage: 5, resetPeriod: "weekly", description: "Generate thumbnails with Clickatron" }
  ]
};