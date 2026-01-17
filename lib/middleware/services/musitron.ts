import { createLimitMiddleware, LimitConfig } from '../limitMiddleware';

// Musitron service configuration - Credits-based billing (per generation)
export const MUSITRON_LIMIT_CONFIG: LimitConfig = {
  serviceName: 'musitron',
  limitMappings: {
    'general': 'maxMusicGeneration',
  },
  defaultLimitType: 'maxMusicGeneration',
  // Enable credits-based billing
  useCredits: true,
  creditAction: 'music_generation',
};

export const musitronLimitMiddleware = createLimitMiddleware(MUSITRON_LIMIT_CONFIG);

type MusitronRequest = {
  type?: string;
  [key: string]: unknown;
};

export const checkMusitronLimits = async (requestData: MusitronRequest) => {
  const middleware = musitronLimitMiddleware;
  return await middleware.checkLimits({ ...requestData, limitType: 'general' });
};

export const incrementMusitronUsage = async (requestData: MusitronRequest, amount?: number) => {
  const middleware = musitronLimitMiddleware;
  return await middleware.incrementUsage({ ...requestData, limitType: 'general' }, amount);
};