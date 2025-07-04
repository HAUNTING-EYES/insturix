import { createFrontendLimitUtils, ServiceLimitConfig, FrontendLimitInfo } from '../limitUtils';

// Re-export the type for convenience
export type { FrontendLimitInfo };

// Alyzitron frontend configuration (matches backend)
export const ALYZITRON_FRONTEND_CONFIG: ServiceLimitConfig = {
  serviceName: 'alyzitron',
  limitMappings: {
    'general': 'maxTotalAnalysis',
    'longVideo': 'maxOver20MinuteAnalysis',
  },
  defaultLimitType: 'maxTotalAnalysis'
};

// Create Alyzitron-specific frontend utils
export const alyzitronLimitUtils = createFrontendLimitUtils(ALYZITRON_FRONTEND_CONFIG);

// Enhanced frontend functions for Alyzitron
export const getAlyzitronUsage = async (requestData: any) => {
  // Get total analysis usage (always checked)
  return await alyzitronLimitUtils.getCurrentUsage({ ...requestData, limitType: 'general' });
};

export const getAllAlyzitronUsage = async () => {
  const allUsage = await alyzitronLimitUtils.getAllUsage();
  return {
    total: allUsage['maxTotalAnalysis'],
    longVideo: allUsage['maxOver20MinuteAnalysis']
  };
};

export const canStartAnalysis = async (requestData: any) => {
  try {
    // Check total analysis limit
    const totalUsage = await alyzitronLimitUtils.getCurrentUsage({ ...requestData, limitType: 'general' });
    if (!totalUsage || !alyzitronLimitUtils.canPerformAction(totalUsage)) {
      return { canStart: false, reason: 'Total weekly analysis limit exceeded', usage: totalUsage };
    }

    // Check long video limit if applicable
    if (requestData.videoDuration && requestData.videoDuration > 1200) {
      const longVideoUsage = await alyzitronLimitUtils.getCurrentUsage({ ...requestData, limitType: 'longVideo' });
      if (!longVideoUsage || !alyzitronLimitUtils.canPerformAction(longVideoUsage)) {
        return { canStart: false, reason: 'Long video (>20min) analysis limit exceeded', usage: longVideoUsage };
      }
    }

    return { canStart: true, reason: 'All limits allow analysis' };
  } catch (error) {
    return { canStart: false, reason: 'Error checking limits', error };
  }
};

export const getAnalysisTypeName = (requestData: any) => {
  if (requestData.videoDuration && requestData.videoDuration > 1200) {
    return 'Long Video Analysis (>20min)';
  }
  return 'Video Analysis';
};

// Hook for React components
export const useAlyzitronLimits = () => {
  return {
    getUsage: getAlyzitronUsage,
    getAllUsage: getAllAlyzitronUsage,
    canStart: canStartAnalysis,
    getTypeName: getAnalysisTypeName,
    utils: alyzitronLimitUtils
  };
};