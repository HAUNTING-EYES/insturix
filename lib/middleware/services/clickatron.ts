import { createLimitMiddleware, LimitConfig } from '../limitMiddleware';

export const CLICKATRON_LIMIT_CONFIG: LimitConfig = {
  serviceName: 'clickatron',
  limitMappings: {
    'general': 'maxThumbnailGeneration',
  },
  defaultLimitType: 'maxThumbnailGeneration'
};

export const clickatronLimitMiddleware = createLimitMiddleware(CLICKATRON_LIMIT_CONFIG);

export const checkClickatronLimits = async (requestData: any) => {
  const middleware = clickatronLimitMiddleware;
  return await middleware.checkLimits({ ...requestData, limitType: 'general' });
};

export const incrementClickatronUsage = async (requestData: any, amount?: number) => {
  const middleware = clickatronLimitMiddleware;
  return await middleware.incrementUsage({ ...requestData, limitType: 'general' }, amount);
};

export const createClickatronLimitResponse = (result: any) =>
  result.error?.type === 'LIMIT_EXCEEDED'
    ? clickatronLimitMiddleware.createLimitExceededResponse(result)
    : clickatronLimitMiddleware.createErrorResponse(result);