import { createFrontendLimitUtils, ServiceLimitConfig, FrontendLimitInfo } from '../limitUtils';

// Re-export the type for convenience
export type { FrontendLimitInfo };

// Clickatron frontend configuration (matches backend)
export const CLICKATRON_FRONTEND_CONFIG: ServiceLimitConfig = {
  serviceName: 'clickatron',
  limitMappings: {
    'variation': 'maxVariationGeneration',
  },
  defaultLimitType: 'maxVariationGeneration'
};

// Create Clickatron-specific frontend utils
export const clickatronLimitUtils = createFrontendLimitUtils(CLICKATRON_FRONTEND_CONFIG);

// Enhanced frontend functions for Clickatron
type ClickatronRequest = {
  type?: string;
  [key: string]: unknown;
};

export const getClickatronUsage = async (requestData: ClickatronRequest) => {
  // Get variation generation usage (always checked)
  return await clickatronLimitUtils.getCurrentUsage({ ...requestData, limitType: 'variation' });
};

export const getAllClickatronUsage = async () => {
  const allUsage = await clickatronLimitUtils.getAllUsage();
  return {
    variation: allUsage['maxVariationGeneration']
  };
};

export const canGenerateVariation = async (requestData: ClickatronRequest) => {
  try {
    // Check variation generation limit
    const variationUsage = await clickatronLimitUtils.getCurrentUsage({ ...requestData, limitType: 'variation' });
    if (!variationUsage || !clickatronLimitUtils.canPerformAction(variationUsage)) {
      return { canGenerate: false, reason: 'Variation generation limit exceeded', usage: variationUsage };
    }

    return { canGenerate: true, reason: 'All limits allow variation generation' };
  } catch (error) {
    return { canGenerate: false, reason: 'Error checking limits', error };
  }
};

export const getVariationTypeName = (requestData: ClickatronRequest) => {
  return 'Variation Generation';
};

// Hook for React components
export const useClickatronLimits = () => {
  return {
    getUsage: getClickatronUsage,
    getAllUsage: getAllClickatronUsage,
    canGenerate: canGenerateVariation,
    getTypeName: getVariationTypeName,
    utils: clickatronLimitUtils
  };
};