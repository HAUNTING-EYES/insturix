import { createLimitMiddleware, LimitConfig } from '../limitMiddleware';
import { ServiceUsageService } from '@/lib/services/serviceUsageService';
import { ThinkForgeRTDBManager } from '@/app/api/services/thinkforge/utils/rtdb';
import { auth } from '@clerk/nextjs/server';

// ThinkForge service configuration - Weekly sessions for consistency with other services
export const THINKFORGE_LIMIT_CONFIG: LimitConfig = {
  serviceName: 'thinkforge',
  limitMappings: {
    // All AI interactions are gated by weekly sessions limit
    'general': 'maxSessions',
    // Ideas generation counts toward the same limit
    'ideas': 'maxSessions',
    // Script generation counts toward the same limit
    'scripts': 'maxSessions',
    // Chat messages count toward the same limit
    'chat': 'maxSessions',
    // Concurrent tasks count toward concurrent limit
    'concurrent': 'maxConcurrentTasks'
  },
  defaultLimitType: 'maxSessions'
};

// Create ThinkForge-specific middleware instance
export const thinkForgeLimitMiddleware = createLimitMiddleware(THINKFORGE_LIMIT_CONFIG);

// Enhanced limit checking for ThinkForge - MongoDB only (backend removed)
export const checkThinkForgeLimits = async (requestData: any) => {
  try {
    const session = await auth();
    if (!session?.userId) {
      return {
        success: false,
        hasAccess: false,
        error: {
          type: 'AUTHENTICATION_ERROR',
          message: 'User not authenticated'
        }
      };
    }

    const sessionId = requestData.sessionId || 'default_session';
    const action = requestData.type || requestData.taskType || 'chat';

    // Use MongoDB-based limits only (backend no longer handles limits)
    console.log('Using MongoDB-based limits for ThinkForge limit checking');
    
    try {
      const limitType = action === 'concurrent' ? 'maxConcurrentTasks' : 'maxSessions';
      const canUse = await ServiceUsageService.canUseService(session.userId, 'thinkforge', limitType);
      
      if (canUse.hasAccess) {
        return {
          success: true,
          hasAccess: true,
          limitInfo: {
            serviceLimits: {
              current_usage: canUse.currentUsage,
              limit: canUse.maxUsage,
              remaining: canUse.remaining,
              reset_period: canUse.resetPeriod,
              is_unlimited: canUse.isUnlimited
            },
            rateLimits: null, // Session-based limits not tracked in MongoDB
            concurrentLimits: null,
            plan: 'free' // TODO: Get actual plan from user data
          }
        };
      } else {
        const isSessionsLimit = limitType === 'maxSessions';
        const limitDisplayName = isSessionsLimit ? 'Weekly sessions' : 'Concurrent tasks';
        
        // Create user-friendly error message
        let errorMessage;
        if (canUse.isUnlimited) {
          errorMessage = 'Service temporarily unavailable';
        } else {
          errorMessage = `${limitDisplayName} limit exceeded. You have used ${canUse.currentUsage} of ${canUse.maxUsage} allowed ${isSessionsLimit ? 'sessions this week' : 'concurrent tasks'}. ${isSessionsLimit ? 'Your limit will reset weekly.' : 'Wait for current tasks to complete.'}`;
        }
        
        console.warn(`ThinkForge service limit exceeded for user:`, {
          limitType,
          currentUsage: canUse.currentUsage,
          maxUsage: canUse.maxUsage,
          remaining: canUse.remaining,
          resetPeriod: canUse.resetPeriod,
          isUnlimited: canUse.isUnlimited
        });
        
        return {
          success: true,
          hasAccess: false,
          error: {
            type: 'LIMIT_EXCEEDED',
            message: errorMessage,
            limitInfo: {
              blockingReason: 'service_limit_exceeded',
              serviceLimits: {
                current_usage: canUse.currentUsage,
                limit: canUse.maxUsage,
                remaining: canUse.remaining,
                reset_period: canUse.resetPeriod,
                is_unlimited: canUse.isUnlimited
              },
              rateLimits: null,
              concurrentLimits: null,
              recommendations: [{
                type: 'upgrade_plan',
                message: 'Upgrade your plan for more sessions'
              }],
              plan: 'free'
            }
          }
        };
      }
    } catch (mongoError) {
      console.error('Failed to check ThinkForge limits from MongoDB:', mongoError);
      
      // Final fallback to deny access on error
      return {
        success: false,
        hasAccess: false,
        error: {
          type: 'LIMIT_CHECK_ERROR',
          message: 'Unable to verify usage limits. Please try again later.'
        }
      };
    }

  } catch (error) {
    console.error('Error in ThinkForge limit checking:', error);
    
    return {
      success: false,
      hasAccess: false,
      error: {
        type: 'LIMIT_CHECK_ERROR',
        message: 'Unable to verify usage limits. Please try again.'
      }
    };
  }
};

function getLimitExceededMessage(blockingReason: string, limitCheck: any): string {
  if (blockingReason === 'service_limit_exceeded') {
    return 'Weekly session limit reached. Upgrade your plan for more sessions.';
  } else if (blockingReason === 'rate_limit_exceeded') {
    const rateLimits = limitCheck.rate_limits;
    const action = limitCheck.action;
    
    // Get specific messages based on action type
    const actionMessages: Record<string, string> = {
      'chat': 'Chat reply limit reached for this session.',
      'ideas': 'Idea reshuffle limit reached for this session.',
      'scripts': 'Script regeneration limit reached for this session.',
      'suggestions': 'AI script fix limit reached for this session.'
    };
    
    const specificMessage = actionMessages[action] || 'Session rate limit reached.';
    const usageInfo = rateLimits ? `Used ${rateLimits.current_usage || 0} of ${rateLimits.limit || 0}.` : '';
    
    return `${specificMessage} ${usageInfo} Start a new session to continue.`;
  } else if (blockingReason === 'concurrent_limit_exceeded') {
    return 'Too many concurrent tasks running. Wait for current tasks to complete.';
  }
  
  return 'Usage limit exceeded. Please try again later.';
}

// NOTE: Rate limits (session-based) are checked separately in API routes
// This creates a dual-layer protection system:
// 1. Service limits: Weekly sessions for billing and business logic
// 2. Rate limits: Session-based for user experience and abuse prevention

// Enhanced usage increment for ThinkForge - MongoDB only (backend removed)
export const incrementThinkForgeUsage = async (requestData: any, amount?: number) => {
  try {
    const session = await auth();
    if (!session?.userId) {
      return { success: false, error: 'User not authenticated' };
    }

    const action = requestData.type || requestData.taskType || 'chat';
    const incrementAmount = amount || 1;

    // Use MongoDB-based usage increment only (backend no longer handles limits)
    try {
      const limitType = action === 'concurrent' ? 'maxConcurrentTasks' : 'maxSessions';
      await ServiceUsageService.useService(session.userId, 'thinkforge', limitType, incrementAmount);
      
      return { success: true, message: 'Usage incremented via MongoDB' };
      
    } catch (mongoError) {
      console.error('Failed to increment ThinkForge usage in MongoDB:', mongoError);
      
      // Treat increment failure as limit exceeded for fail-safe behavior
      return { 
        success: false, 
        error: {
          type: 'LIMIT_EXCEEDED',
          message: 'Weekly sessions limit exceeded. Unable to verify usage limits. Please try again later or upgrade your plan.',
          limitInfo: {
            blockingReason: 'service_limit_exceeded',
            serviceLimits: {
              current_usage: 'unknown',
              limit: 'unknown',
              remaining: 0,
              reset_period: 'weekly',
              is_unlimited: false
            },
            rateLimits: null,
            concurrentLimits: null,
            recommendations: [{
              type: 'upgrade_plan',
              message: 'Upgrade your plan for more sessions'
            }],
            plan: 'free'
          }
        }
      };
    }
    
  } catch (error) {
    console.error('Error in ThinkForge usage increment:', error);
    
    // Treat increment failure as limit exceeded for fail-safe behavior
    return { 
      success: false, 
      error: {
        type: 'LIMIT_EXCEEDED',
        message: 'Weekly sessions limit exceeded. Unable to verify usage limits. Please try again later or upgrade your plan.',
        limitInfo: {
          blockingReason: 'service_limit_exceeded',
          serviceLimits: {
            current_usage: 'unknown',
            limit: 'unknown',
            remaining: 0,
            reset_period: 'weekly',
            is_unlimited: false
          },
          rateLimits: null,
          concurrentLimits: null,
          recommendations: [{
            type: 'upgrade_plan',
            message: 'Upgrade your plan for more sessions'
          }],
          plan: 'free'
        }
      }
    };
  }
};

// Note: Concurrent tasks are tracked automatically via Firebase RTDB task status
// No manual increment/decrement needed - just check RTDB for 'processing' and 'queued' tasks

export const createThinkForgeLimitResponse = (result: any) => 
  result.error?.type === 'LIMIT_EXCEEDED' 
    ? thinkForgeLimitMiddleware.createLimitExceededResponse(result)
    : thinkForgeLimitMiddleware.createErrorResponse(result); 