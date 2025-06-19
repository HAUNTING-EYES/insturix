import { createLimitMiddleware, LimitConfig } from '../limitMiddleware';
import { ServiceUsageService } from '@/lib/services/serviceUsageService';
import { RTDBManager } from '@/app/api/services/alyzitron/utils/rtdb';
import { auth } from '@clerk/nextjs/server';

// Alyzitron service configuration - Weekly limits based on technical factors
export const ALYZITRON_LIMIT_CONFIG: LimitConfig = {
  serviceName: 'alyzitron',
  limitMappings: {
    // All analyses count toward total weekly limit (regardless of content type)
    'general': 'maxTotalAnalysis',
    // Videos over 20 minutes have additional limit
    'longVideo': 'maxOver20MinuteAnalysis',
    // Active/running analyses count toward concurrent limit (checked via Firebase RTDB)
    'concurrent': 'maxConcurrentTasks'
  },
  defaultLimitType: 'maxTotalAnalysis'
};

// Create Alyzitron-specific middleware instance
export const alyzitronLimitMiddleware = createLimitMiddleware(ALYZITRON_LIMIT_CONFIG);

// Enhanced limit checking for Alyzitron (checks multiple limits)
export const checkAlyzitronLimits = async (requestData: any) => {
  const middleware = alyzitronLimitMiddleware;
  
  // Always check total analysis limit
  const totalCheck = await middleware.checkLimits({ ...requestData, limitType: 'general' });
  if (!totalCheck.success || !totalCheck.hasAccess) {
    return totalCheck;
  }

  // Check concurrent tasks limit using Firebase RTDB
  const session = await auth();
  if (session?.userId) {
    try {
      const currentConcurrentTasks = await RTDBManager.getConcurrentTasksCount(session.userId);
      const concurrentLimit = await ServiceUsageService.canUseService(session.userId, 'alyzitron', 'maxConcurrentTasks');
      
      if (!concurrentLimit.isUnlimited && currentConcurrentTasks >= concurrentLimit.maxUsage) {
        return {
          success: true,
          hasAccess: false,
          error: {
            type: 'LIMIT_EXCEEDED',
            message: `Concurrent tasks limit exceeded. Currently running: ${currentConcurrentTasks}/${concurrentLimit.maxUsage}`,
            limitInfo: {
              current: currentConcurrentTasks,
              max: concurrentLimit.maxUsage,
              remaining: Math.max(0, concurrentLimit.maxUsage - currentConcurrentTasks),
              resetPeriod: concurrentLimit.resetPeriod,
              limitType: 'maxConcurrentTasks'
            }
          }
        };
      }
    } catch (error) {
      console.error('Failed to check concurrent tasks from Firebase RTDB:', error);
      // Continue without concurrent check if Firebase fails (degraded mode)
    }
  }

  // Check long video limit if video duration > 20 minutes
  if (requestData.videoDuration && requestData.videoDuration > 1200) { // 20 minutes = 1200 seconds
    const longVideoCheck = await middleware.checkLimits({ ...requestData, limitType: 'longVideo' });
    if (!longVideoCheck.success || !longVideoCheck.hasAccess) {
      return longVideoCheck;
    }
  }

  return totalCheck; // All checks passed
};

// Enhanced usage increment for Alyzitron (only tracks persistent counts)
export const incrementAlyzitronUsage = async (requestData: any, amount?: number) => {
  const middleware = alyzitronLimitMiddleware;
  
  // Always increment total analysis count
  const totalResult = await middleware.incrementUsage({ ...requestData, limitType: 'general' }, amount);
  if (!totalResult.success) {
    return totalResult;
  }

  // Increment long video count if applicable
  if (requestData.videoDuration && requestData.videoDuration > 1200) {
    const longVideoResult = await middleware.incrementUsage({ ...requestData, limitType: 'longVideo' }, amount);
    if (!longVideoResult.success) {
      return longVideoResult;
    }
  }

  return totalResult;
};

// Note: Concurrent tasks are now tracked automatically via Firebase RTDB task status
// No manual increment/decrement needed - just check RTDB for 'queued' and 'processing' tasks

export const createAlyzitronLimitResponse = (result: any) => 
  result.error?.type === 'LIMIT_EXCEEDED' 
    ? alyzitronLimitMiddleware.createLimitExceededResponse(result)
    : alyzitronLimitMiddleware.createErrorResponse(result);