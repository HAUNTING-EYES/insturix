/**
 * Credits Migration Service
 * 
 * Handles lazy migration of existing users from per-service limits to credits system.
 * Called on user activity to ensure they have credits before any operation.
 */

import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User } from "@/schemas/user";
import { CreditsService } from "./creditsService";
import { PLAN_CREDIT_ALLOCATIONS } from "@/lib/config/creditCosts";

const migrationCache = new Set<string>(); // In-memory cache to avoid repeated checks

export class CreditsMigrationService {
  /**
   * Ensure a user has been migrated to the credits system
   * Call this on any user activity (API requests, page loads, etc.)
   */
  static async ensureMigrated(clerkUserId: string): Promise<{
    migrated: boolean;
    creditsGranted?: number;
    legacyCleanedUp?: boolean;
  }> {
    // Quick in-memory check to avoid DB hit for already-migrated users this session
    if (migrationCache.has(clerkUserId)) {
      return { migrated: false };
    }

    try {
      await connectToDatabase();
      const user = await User.findOne({ clerkUserId });

      if (!user) {
        return { migrated: false };
      }

      // Check if user already has credits balance initialized
      const hasCredits = user.creditsBalance && (
        user.creditsBalance.subscriptionCredits > 0 ||
        user.creditsBalance.topupCredits > 0 ||
        user.creditsBalance.creditHistory?.length > 0
      );

      if (hasCredits) {
        // Already migrated, add to cache
        migrationCache.add(clerkUserId);
        return { migrated: false };
      }

      // User needs migration - grant credits based on their current plan
      const planType = user.currentPlan?.name?.toLowerCase() || 'free';
      const creditsToGrant = PLAN_CREDIT_ALLOCATIONS[planType] ?? PLAN_CREDIT_ALLOCATIONS.free ?? 50;

      if (!PLAN_CREDIT_ALLOCATIONS[planType]) {
        console.warn(`[CreditsMigration] Unknown plan type: ${planType} for user ${clerkUserId}, using free tier`);
      }

      // Determine billing cycle (default to monthly for migration)
      const billingCycle = user.currentPlan?.endDate 
        ? this.guessBillingCycle(user.currentPlan.startDate, user.currentPlan.endDate)
        : 'monthly';

      // Grant subscription credits
      await CreditsService.grantSubscriptionCredits(clerkUserId, planType, billingCycle);

      console.log(`[CreditsMigration] Migrated user ${clerkUserId}: ${creditsToGrant} credits (${planType}/${billingCycle})`);

      // Clean up legacy data
      const legacyCleanedUp = await this.cleanupLegacyData(clerkUserId, user);

      migrationCache.add(clerkUserId);
      return { migrated: true, creditsGranted: creditsToGrant, legacyCleanedUp };

    } catch (error) {
      console.error(`[CreditsMigration] Error migrating user ${clerkUserId}:`, error);
      return { migrated: false };
    }
  }

  /**
   * Guess billing cycle from plan dates
   */
  private static guessBillingCycle(startDate: Date | string, endDate: Date | string): 'monthly' | 'yearly' {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    // If plan duration is > 60 days, assume yearly
    return daysDiff > 60 ? 'yearly' : 'monthly';
  }

  /**
   * Clean up legacy per-service limit data from user record
   */
  private static async cleanupLegacyData(clerkUserId: string, user: any): Promise<boolean> {
    try {
      // Check if user has legacy serviceLimits with usage data
      const serviceLimits = user.currentPlan?.serviceLimits;
      if (!serviceLimits) {
        return false;
      }

      // Reset usage in legacy serviceLimits (keeps structure for backwards compat)
      let hasLegacyUsage = false;
      const cleanedLimits: Record<string, any[]> = {};

      for (const [serviceName, limits] of Object.entries(serviceLimits)) {
        if (Array.isArray(limits)) {
          cleanedLimits[serviceName] = (limits as any[]).map(limit => {
            if (limit.currentUsage > 0) {
              hasLegacyUsage = true;
              return { ...limit, currentUsage: 0 }; // Reset usage
            }
            return limit;
          });
        } else {
          cleanedLimits[serviceName] = limits as any;
        }
      }

      if (hasLegacyUsage) {
        await User.updateOne(
          { clerkUserId },
          { 
            $set: { 
              'currentPlan.serviceLimits': cleanedLimits,
              // Add migration marker
              'migrationInfo.creditsSystem': {
                migratedAt: new Date(),
                fromPlan: user.currentPlan?.name,
              }
            }
          }
        );
        console.log(`[CreditsMigration] Cleaned up legacy usage data for ${clerkUserId}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`[CreditsMigration] Error cleaning legacy data for ${clerkUserId}:`, error);
      return false;
    }
  }

  /**
   * Clear migration cache (useful for testing or force re-check)
   */
  static clearCache(clerkUserId?: string): void {
    if (clerkUserId) {
      migrationCache.delete(clerkUserId);
    } else {
      migrationCache.clear();
    }
  }
}
