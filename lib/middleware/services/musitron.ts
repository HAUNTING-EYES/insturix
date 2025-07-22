import { createLimitMiddleware, LimitConfig } from '../limitMiddleware';

export const MUSITRON_LIMIT_CONFIG: LimitConfig = {
  serviceName: 'musitron',
  limitMappings: {
    'general': 'maxMusicGeneration',
  },
  defaultLimitType: 'maxMusicGeneration'
};

export const musitronLimitMiddleware = createLimitMiddleware(MUSITRON_LIMIT_CONFIG);

export const checkMusitronLimits = async (requestData: any) => {
  const middleware = musitronLimitMiddleware;
  return await middleware.checkLimits({ ...requestData, limitType: 'general' });
};

export const incrementMusitronUsage = async (requestData: any, amount?: number) => {
  const middleware = musitronLimitMiddleware;
  return await middleware.incrementUsage({ ...requestData, limitType: 'general' }, amount);
};