import { ServiceUsageInfo } from "@/lib/services/serviceUsageService";
import { IServiceLimits } from "@/schemas/user";
import { getLimitDisplayName } from "@/lib/config/serviceLimits";

export interface FrontendLimitInfo {
  hasAccess: boolean;
  currentUsage: number;
  maxUsage: number;
  remaining: number;
  resetPeriod: string;
  isUnlimited: boolean;
  displayText: string;
  progressPercentage: number;
  timeUntilReset?: { days: number; hours: number; minutes: number; totalMs: number } | null;
}

export interface ServiceLimitConfig {
  serviceName: keyof IServiceLimits;
  limitMappings: Record<string, string>;
  defaultLimitType?: string;
}

export class FrontendLimitUtils {
  private config: ServiceLimitConfig;

  constructor(config: ServiceLimitConfig) {
    this.config = config;
  }

  /**
   * Get limit type from request data (same logic as backend)
   */
  private determineLimitType(requestData: { type?: string } | Record<string, unknown>): string {
    const type = typeof (requestData as any)?.type === "string" ? String((requestData as any).type) : undefined;
    
    if (!type) {
      return this.config.defaultLimitType || Object.values(this.config.limitMappings)[0];
    }

    for (const [key, limitType] of Object.entries(this.config.limitMappings)) {
      if (type.toLowerCase().includes(key.toLowerCase())) {
        return limitType;
      }
    }

    return this.config.defaultLimitType || Object.values(this.config.limitMappings)[0];
  }

  /**
   * Fetch current usage for a specific request type
   */
  async getCurrentUsage(requestData: Record<string, unknown> | { type?: string }): Promise<FrontendLimitInfo | null> {
    try {
      const response = await fetch('/api/user/service-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceName: this.config.serviceName,
          limitType: this.determineLimitType(requestData)
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch usage info');
      }

      const usageInfo: ServiceUsageInfo = await response.json();
      return this.formatUsageInfo(usageInfo);

    } catch (error) {
      console.error('Error fetching usage info:', error);
      return null;
    }
  }

  /**
   * Get all usage info for the service
   */
  async getAllUsage(): Promise<Record<string, FrontendLimitInfo>> {
    try {
      const response = await fetch(`/api/user/service-usage?service=${this.config.serviceName}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch all usage info');
      }

      const allUsage: Record<string, ServiceUsageInfo> = await response.json();
      const result: Record<string, FrontendLimitInfo> = {};

      for (const [limitType, usageInfo] of Object.entries(allUsage)) {
        result[limitType] = this.formatUsageInfo(usageInfo);
      }

      return result;

    } catch (error) {
      console.error('Error fetching all usage info:', error);
      return {};
    }
  }

  /**
   * Check if user can perform action before attempting
   */
  canPerformAction(usageInfo: FrontendLimitInfo, amount: number = 1): boolean {
    if (usageInfo.isUnlimited) return true;
    return usageInfo.remaining >= amount;
  }

  /**
   * Format usage info for frontend display
   */
  private formatUsageInfo(usageInfo: ServiceUsageInfo): FrontendLimitInfo {
    const progressPercentage = usageInfo.isUnlimited 
      ? 0 
      : Math.min((usageInfo.currentUsage / usageInfo.maxUsage) * 100, 100);

    const displayText = usageInfo.isUnlimited
      ? `${usageInfo.currentUsage} used (Unlimited)`
      : `${usageInfo.currentUsage}/${usageInfo.maxUsage} used (${usageInfo.remaining} remaining)`;

    return {
      hasAccess: usageInfo.hasAccess,
      currentUsage: usageInfo.currentUsage,
      maxUsage: usageInfo.maxUsage,
      remaining: usageInfo.remaining,
      resetPeriod: usageInfo.resetPeriod,
      isUnlimited: usageInfo.isUnlimited,
      displayText,
      progressPercentage,
      timeUntilReset: usageInfo.timeUntilReset
    };
  }

  /**
   * Get human-readable action name
   */
  getActionName(requestData: Record<string, unknown> | { type?: string }): string {
    const limitType = this.determineLimitType(requestData);
    return getLimitDisplayName(limitType, this.config.serviceName) || limitType;
  }
}

// Factory function for creating service-specific frontend utils
export function createFrontendLimitUtils(config: ServiceLimitConfig): FrontendLimitUtils {
  return new FrontendLimitUtils(config);
}