import { createFrontendLimitUtils, ServiceLimitConfig, FrontendLimitInfo } from '../limitUtils';

// Re-export the type for convenience
export type { FrontendLimitInfo };

// ThinkForge frontend configuration (matches backend middleware)
export const THINKFORGE_FRONTEND_CONFIG: ServiceLimitConfig = {
  serviceName: 'thinkforge',
  limitMappings: {
    'general': 'maxSessions',
    'ideas': 'maxSessions',
    'scripts': 'maxSessions',
    'chat': 'maxSessions',
    'concurrent': 'maxConcurrentTasks'
  },
  defaultLimitType: 'maxSessions'
};

// Create ThinkForge-specific frontend utils
export const thinkForgeLimitUtils = createFrontendLimitUtils(THINKFORGE_FRONTEND_CONFIG);

// Enhanced frontend functions for ThinkForge
export const getThinkForgeUsage = async (requestData: any) => {
  // Get weekly sessions usage (always checked)
  return await thinkForgeLimitUtils.getCurrentUsage({ ...requestData, limitType: 'general' });
};

export const getAllThinkForgeUsage = async () => {
  const allUsage = await thinkForgeLimitUtils.getAllUsage();
  return {
    sessions: allUsage['maxSessions'],
    concurrent: allUsage['maxConcurrentTasks']
  };
};

export const canStartThinkForgeTask = async (requestData: any) => {
  try {
    // Check weekly sessions limit
    const sessionsUsage = await thinkForgeLimitUtils.getCurrentUsage({ ...requestData, limitType: 'general' });
    if (!sessionsUsage || !thinkForgeLimitUtils.canPerformAction(sessionsUsage)) {
      return { canStart: false, reason: 'Weekly session limit exceeded', usage: sessionsUsage };
    }

    // Check concurrent tasks limit
    const concurrentUsage = await thinkForgeLimitUtils.getCurrentUsage({ ...requestData, limitType: 'concurrent' });
    if (!concurrentUsage || !thinkForgeLimitUtils.canPerformAction(concurrentUsage)) {
      return { canStart: false, reason: 'Maximum concurrent AI tasks running', usage: concurrentUsage };
    }

    return { canStart: true, reason: 'All limits allow ThinkForge usage' };
  } catch (error) {
    return { canStart: false, reason: 'Error checking limits', error };
  }
};

export const getThinkForgeTaskTypeName = (requestData: any) => {
  const taskType = requestData.taskType || 'general';
  
  switch (taskType) {
    case 'ideas':
      return 'Ideas Generation';
    case 'scripts':
      return 'Script Generation';
    case 'chat':
      return 'AI Chat';
    default:
      return 'AI Task';
  }
};

// Hook for React components (follows SOP pattern)
export const useThinkForgeLimits = () => {
  return {
    getUsage: getThinkForgeUsage,
    getAllUsage: getAllThinkForgeUsage,
    canStart: canStartThinkForgeTask,
    getTypeName: getThinkForgeTaskTypeName,
    utils: thinkForgeLimitUtils
  };
}; 