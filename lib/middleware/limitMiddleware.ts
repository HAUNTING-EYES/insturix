/**
 * Limit Middleware (Credits-Only Mode)
 *
 * All service limits are now enforced via the credits system.
 * The legacy ServiceUsageService is deprecated and no longer called.
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { IServiceLimits } from "@/schemas/user";
import { CreditsService } from "@/lib/services/creditsService";
import { getCreditCost } from "@/lib/config/creditCosts";

export interface LimitConfig {
  serviceName: keyof IServiceLimits;
  creditAction: string; // Action name for credit cost lookup (e.g., 'video_analysis')
  /**
   * @deprecated useCredits is now always true. This field is ignored.
   */
  useCredits?: boolean;
  /**
   * @deprecated limitMappings is no longer used. Credits are the single source of truth.
   */
  limitMappings?: Record<string, string>;
  /**
   * @deprecated defaultLimitType is no longer used.
   */
  defaultLimitType?: string;
}

export interface LimitCheckResult {
  success: boolean;
  hasAccess: boolean;
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
   * Check if user has enough credits to use the service
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

      const action = this.config.creditAction;
      const durationMinutes = requestData.videoDuration
        ? Math.ceil(Number(requestData.videoDuration) / 60)
        : undefined;
      const model = requestData.model as string | undefined;

      const check = await CreditsService.hasCredits(
        session.userId,
        this.config.serviceName,
        action,
        { durationMinutes, model }
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
    } catch (err) {
      console.error('[LimitMiddleware] checkLimits error:', err);
      return {
        success: false,
        hasAccess: false,
        error: {
          type: 'LIMIT_CHECK_ERROR',
          message: 'Unable to verify credits'
        }
      };
    }
  }

  /**
   * Deduct credits after successful operation
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

      const action = this.config.creditAction;
      const model = requestData.model as string | undefined;

      const result = await CreditsService.deductCredits(
        session.userId,
        this.config.serviceName,
        action,
        {
          durationMinutes: amount, // For per-minute billing
          model,
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
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to increment usage'
      };
    }
  }

  /**
   * Refund credits (e.g., when a task fails)
   */
  async refundUsage(amount: number, reason: string): Promise<LimitIncrementResult> {
    try {
      const session = await auth();
      if (!session?.userId) {
        return { success: false, error: 'User not authenticated' };
      }

      const action = this.config.creditAction;
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
   * Create NextResponse for insufficient credits errors
   */
  createLimitExceededResponse(result: LimitCheckResult): NextResponse {
    return NextResponse.json(
      {
        success: false,
        error: result.error
      },
      { status: 402 } // Payment Required
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