import { createLimitMiddleware, LimitConfig } from '../limitMiddleware';

// Alyzitron service configuration - Weekly limits based on technical factors
export const ALYZITRON_LIMIT_CONFIG: LimitConfig = {
  serviceName: 'alyzitron',
  limitMappings: {
    // All analyses count toward total weekly limit (regardless of content type)
    'general': 'AnalysisMinutes',
  },
  defaultLimitType: 'AnalysisMinutes'
};

// Create Alyzitron-specific middleware instance
export const alyzitronLimitMiddleware = createLimitMiddleware(ALYZITRON_LIMIT_CONFIG);

// Enhanced limit checking for Alyzitron (checks duration-based limits)
type AlyzitronRequest = {
  videoDuration: number;
  [key: string]: unknown;
};

export const checkAlyzitronLimits = async (requestData: AlyzitronRequest) => {
  const middleware = alyzitronLimitMiddleware;
  
  // Always check total analysis minutes limit
  return middleware.checkLimits({ ...requestData, limitType: 'general' });
};

// Enhanced usage increment for Alyzitron (tracks duration in minutes)
export const incrementAlyzitronUsage = async (requestData: AlyzitronRequest, minutes: number) => {
  const middleware = alyzitronLimitMiddleware;
  
  // Always increment total analysis minutes by the specified minutes
  return middleware.incrementUsage({ ...requestData, limitType: 'general' }, minutes);
};

import type { LimitCheckResult } from '../limitMiddleware';

export const createAlyzitronLimitResponse = (result: LimitCheckResult) =>
  result.error?.type === 'LIMIT_EXCEEDED'
    ? alyzitronLimitMiddleware.createLimitExceededResponse(result)
    : alyzitronLimitMiddleware.createErrorResponse(result);