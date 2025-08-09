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
    maxSessions: {
      limitType: 'maxSessions',
      name: 'Weekly Sessions',
      description: 'Number of ThinkForge sessions you can start per week. Each session allows multiple AI interactions.',
      icon: 'MessageSquare'
    },
    maxConcurrentTasks: {
      limitType: 'maxConcurrentTasks',
      name: 'Concurrent Tasks',
      description: 'Maximum number of AI tasks that can run simultaneously.',
      icon: 'Activity'
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
  
  Object.entries(SERVICE_LIMIT_DEFINITIONS).forEach(([, serviceLimits]) => {
    Object.keys(serviceLimits).forEach(limitType => {
      const displayName = serviceLimits[limitType].name;
      mappings[limitType] = displayName;
    });
  });
  
  return mappings;
};