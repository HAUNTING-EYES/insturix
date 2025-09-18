import { createLimitMiddleware, LimitConfig } from '../limitMiddleware';

export const CLICKATRON_LIMIT_CONFIG: LimitConfig = {
  serviceName: 'clickatron',
  limitMappings: {
    'variation': 'maxVariationGeneration',
    'prompt': 'maxPromptEnhancements',
  },
  defaultLimitType: 'maxVariationGeneration'
};

export const clickatronLimitMiddleware = createLimitMiddleware(CLICKATRON_LIMIT_CONFIG);

type ClickatronRequest = {
  type?: string;
  [key: string]: unknown;
};

export const checkClickatronLimits = async (requestData: ClickatronRequest) => {
  const middleware = clickatronLimitMiddleware;
  return await middleware.checkLimits({ ...requestData, limitType: requestData.type || 'variation' });
};

export const incrementClickatronUsage = async (requestData: ClickatronRequest, amount?: number) => {
  const middleware = clickatronLimitMiddleware;
  return await middleware.incrementUsage({ ...requestData, limitType: requestData.type || 'variation' }, amount);
};

import type { LimitCheckResult } from '../limitMiddleware';

export const createClickatronLimitResponse = (result: LimitCheckResult) =>
  result.error?.type === 'LIMIT_EXCEEDED'
    ? clickatronLimitMiddleware.createLimitExceededResponse(result)
    : clickatronLimitMiddleware.createErrorResponse(result);