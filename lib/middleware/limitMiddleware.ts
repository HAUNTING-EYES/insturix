import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ServiceUsageService } from "@/lib/services/serviceUsageService";
import { IServiceLimits } from "@/schemas/user";
import { getLimitDisplayName } from "@/lib/config/serviceLimits";

export interface LimitConfig {
  serviceName: keyof IServiceLimits;
  limitMappings: Record<string, string>; // Maps input type to limit type
  defaultLimitType?: string;
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
  error?: {
    type: string;
    message: string;
    limitInfo?: Record<string, unknown>;
  };
}

export interface LimitIncrementResult {
  success: boolean;
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

      const limitType = this.determineLimitType(requestData);
      
      // Actually increment the usage using useService instead of just checking
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
   * Get human-readable limit name
   */
  private getHumanReadableLimitName(limitType: string): string {
    return getLimitDisplayName(this.config.serviceName, limitType) || limitType;
  }

  /**
   * Create NextResponse for limit exceeded errors
   */
  createLimitExceededResponse(result: LimitCheckResult): NextResponse {
    return NextResponse.json(
      {
        success: false,
        error: result.error
      },
      { status: 403 }
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