import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ServiceUsageService } from "@/lib/services/serviceUsageService";
import { IServiceLimits } from "@/schemas/user";
import { getLimitDisplayName } from "@/lib/config/serviceLimits";
import { CreditsService } from "@/lib/services/creditsService";
import { getCreditCost } from "@/lib/config/creditCosts";

export interface LimitConfig {
  serviceName: keyof IServiceLimits;
  limitMappings: Record<string, string>; // Maps input type to limit type
  defaultLimitType?: string;
  // Credits mode configuration
  useCredits?: boolean;
  creditAction?: string; // Action name for credit cost lookup (e.g., 'video_analysis')
}

export interface LimitCheckResult {
  success: boolean;
  hasAccess: boolean;
  limitInfo?: {
    current: number;
    max: number;
    remaining: number;
    resetPeriod: string;
    limitType: string;
  };
  // Credits-specific info
  creditsInfo?: {
    required: number;
    available: number;
  };
  error?: {
    type: string;
    message: string;
    limitInfo?: Record<string, unknown>;
  };
}

export interface LimitIncrementResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export class LimitMiddleware {
  private config: LimitConfig;

  constructor(config: LimitConfig) {
    this.config = config;
  }

  /**
   * Determines the appropriate limit type based on input parameters
   */
  private determineLimitType(requestData: Record<string, unknown>): string {
    const { limitType, type } = requestData;
    
    // If limitType is explicitly provided, map it to the actual limit type
    if (limitType && typeof limitType === 'string') {
      const mappedLimitType = this.config.limitMappings[limitType];
      if (mappedLimitType) {
        return mappedLimitType;
      }
    }
    
    if (!type) {
      return this.config.defaultLimitType || Object.values(this.config.limitMappings)[0];
    }

    // Check exact matches first
    for (const [key, limitType] of Object.entries(this.config.limitMappings)) {
      if (String(type).toLowerCase().includes(key.toLowerCase())) {
        return limitType;
      }
    }

    return this.config.defaultLimitType || Object.values(this.config.limitMappings)[0];
  }

  /**
   * Check if user can use the service based on request data
   * Supports both legacy limits and new credits system
   */
  async checkLimits(requestData: Record<string, unknown>): Promise<LimitCheckResult> {
    try {
      const session = await auth();
      if (!session?.userId) {
        return {
          success: false,
          hasAccess: false,
          error: {
            type: 'UNAUTHORIZED',
            message: 'User not authenticated'
          }
        };
      }

      // Credits mode check
      if (this.config.useCredits) {
        const action = this.config.creditAction || this.config.defaultLimitType || 'default';
        const durationMinutes = requestData.videoDuration 
          ? Math.ceil(Number(requestData.videoDuration) / 60) 
          : undefined;
        
        const check = await CreditsService.hasCredits(
          session.userId,
          this.config.serviceName,
          action,
          { durationMinutes }
        );

        if (!check.hasCredits) {
          return {
            success: true,
            hasAccess: false,
            creditsInfo: {
              required: check.required,
              available: check.available,
            },
            error: {
              type: 'INSUFFICIENT_CREDITS',
              message: `Insufficient credits. Required: ${check.required}, Available: ${check.available}`,
              limitInfo: {
                required: check.required,
                available: check.available,
              }
            }
          };
        }

        return {
          success: true,
          hasAccess: true,
          creditsInfo: {
            required: check.required,
            available: check.available,
          }
        };
      }

      // Legacy limits mode
      const limitType = this.determineLimitType(requestData);
      const canUse = await ServiceUsageService.canUseService(
        session.userId, 
        this.config.serviceName, 
        limitType
      );

      if (!canUse.hasAccess) {
        return {
          success: true,
          hasAccess: false,
          error: {
            type: 'LIMIT_EXCEEDED',
            message: `${this.getHumanReadableLimitName(limitType)} limit exceeded. Used ${canUse.currentUsage}/${canUse.maxUsage}`,
            limitInfo: {
              current: canUse.currentUsage,
              max: canUse.maxUsage,
              remaining: canUse.remaining,
              resetPeriod: canUse.resetPeriod,
              limitType
            }
          }
        };
      }

      return {
        success: true,
        hasAccess: true,
        limitInfo: {
          current: canUse.currentUsage,
          max: canUse.maxUsage,
          remaining: canUse.remaining,
          resetPeriod: canUse.resetPeriod,
          limitType
        }
      };

    } catch {
      return {
        success: false,
        hasAccess: false,
        error: {
          type: 'LIMIT_CHECK_ERROR',
          message: 'Unable to verify service limits'
        }
      };
    }
  }

  /**
   * Increment usage after successful operation
   * Supports both legacy limits and new credits system
   */
  async incrementUsage(requestData: Record<string, unknown>, amount: number = 1): Promise<LimitIncrementResult> {
    try {
      const session = await auth();
      if (!session?.userId) {
        return {
          success: false,
          error: 'User not authenticated'
        };
      }

      // Credits mode
      if (this.config.useCredits) {
        const action = this.config.creditAction || this.config.defaultLimitType || 'default';
        
        const result = await CreditsService.deductCredits(
          session.userId,
          this.config.serviceName,
          action,
          {
            durationMinutes: amount, // For per-minute billing
            taskId: requestData.taskId as string | undefined,
          }
        );

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to deduct credits'
          };
        }

        return { 
          success: true,
          transactionId: result.transactionId,
        };
      }

      // Legacy limits mode
      const limitType = this.determineLimitType(requestData);
      
      // Server-side service usage increment (no React hooks involved)
      // This is a static method call, not a React Hook
      // eslint-disable-next-line react-hooks/rules-of-hooks
      await ServiceUsageService.useService(
        session.userId,
        this.config.serviceName,
        limitType,
        amount
      );

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to increment usage'
      };
    }
  }

  /**
   * Refund credits (only applicable in credits mode)
   */
  async refundUsage(amount: number, reason: string): Promise<LimitIncrementResult> {
    if (!this.config.useCredits) {
      // Legacy mode doesn't support refunds through this interface
      return { success: true };
    }

    try {
      const session = await auth();
      if (!session?.userId) {
        return { success: false, error: 'User not authenticated' };
      }

      const action = this.config.creditAction || this.config.defaultLimitType || 'default';
      const cost = getCreditCost(this.config.serviceName, action, { durationMinutes: amount });

      const result = await CreditsService.refundCredits(
        session.userId,
        cost,
        reason,
        { service: this.config.serviceName, action }
      );

      return { success: result.success };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refund credits'
      };
    }
  }

  /**
   * Get human-readable limit name
   */
  private getHumanReadableLimitName(limitType: string): string {
    return getLimitDisplayName(limitType, this.config.serviceName) || limitType;
  }

  /**
   * Create NextResponse for limit exceeded or insufficient credits errors
   */
  createLimitExceededResponse(result: LimitCheckResult): NextResponse {
    const status = result.error?.type === 'INSUFFICIENT_CREDITS' ? 402 : 403;
    return NextResponse.json(
      {
        success: false,
        error: result.error
      },
      { status }
    );
  }

  /**
   * Create NextResponse for general errors
   */
  createErrorResponse(result: LimitCheckResult): NextResponse {
    const status = result.error?.type === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json(
      {
        success: false,
        error: result.error
      },
      { status }
    );
  }
}

/**
 * Factory function to create service-specific limit middleware
 */
export function createLimitMiddleware(config: LimitConfig): LimitMiddleware {
  return new LimitMiddleware(config);
}