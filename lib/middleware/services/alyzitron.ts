import { createLimitMiddleware, LimitConfig } from '../limitMiddleware';

// Alyzitron service configuration - Weekly limits based on technical factors
export const ALYZITRON_LIMIT_CONFIG: LimitConfig = {
  serviceName: 'alyzitron',
  limitMappings: {
    // All analyses count toward total weekly limit (regardless of content type)
    'general': 'maxTotalAnalysis',
    // Videos over 20 minutes have additional limit
    'longVideo': 'maxOver20MinuteAnalysis',
  },
  defaultLimitType: 'maxTotalAnalysis'
};

// Create Alyzitron-specific middleware instance
export const alyzitronLimitMiddleware = createLimitMiddleware(ALYZITRON_LIMIT_CONFIG);

// Enhanced limit checking for Alyzitron (checks multiple limits)
type AlyzitronRequest = {
  type?: string;
  videoDuration?: number;
  [key: string]: unknown;
};

export const checkAlyzitronLimits = async (requestData: AlyzitronRequest) => {
  const middleware = alyzitronLimitMiddleware;
  
  // Always check total analysis limit
  const totalCheck = await middleware.checkLimits({ ...requestData, limitType: 'general' });
  if (!totalCheck.success || !totalCheck.hasAccess) {
    return totalCheck;
  }


  // Check long video limit if video duration > 20 minutes
  if (typeof requestData.videoDuration === 'number' && requestData.videoDuration > 1200) { // 20 minutes = 1200 seconds
    const longVideoCheck = await middleware.checkLimits({ ...requestData, limitType: 'longVideo' });
    if (!longVideoCheck.success || !longVideoCheck.hasAccess) {
      return longVideoCheck;
    }
  }

  return totalCheck; // All checks passed
};

// Enhanced usage increment for Alyzitron (only tracks persistent counts)
export const incrementAlyzitronUsage = async (requestData: AlyzitronRequest, amount?: number) => {
  const middleware = alyzitronLimitMiddleware;
  
  // Always increment total analysis count
  const totalResult = await middleware.incrementUsage({ ...requestData, limitType: 'general' }, amount);
  if (!totalResult.success) {
    return totalResult;
  }

  // Increment long video count if applicable
  if (typeof requestData.videoDuration === 'number' && requestData.videoDuration > 1200) {
    const longVideoResult = await middleware.incrementUsage({ ...requestData, limitType: 'longVideo' }, amount);
    if (!longVideoResult.success) {
      return longVideoResult;
    }
  }

  return totalResult;
};

import type { LimitCheckResult } from '../limitMiddleware';

export const createAlyzitronLimitResponse = (result: LimitCheckResult) =>
  result.error?.type === 'LIMIT_EXCEEDED'
    ? alyzitronLimitMiddleware.createLimitExceededResponse(result)
    : alyzitronLimitMiddleware.createErrorResponse(result);