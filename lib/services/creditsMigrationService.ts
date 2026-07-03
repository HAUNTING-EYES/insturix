/**
 * Credits Migration Service
 * 
 * Handles lazy migration of existing users from per-service limits to credits system.
 * Called on user activity to ensure they have credits before any operation.
 */

import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User, ICreditTransaction } from "@/schemas/user";
import { CreditsService } from "./creditsService";
import { PLAN_CREDIT_ALLOCATIONS, getPlanMediaCreditAllocation } from "@/lib/config/creditCosts";
import { UserInitializationService } from "./userInitializationService";
import { currentUser } from "@clerk/nextjs/server";
import { nanoid } from "nanoid";

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
      let user = await User.findOne({ clerkUserId });

      if (!user) {
        // If user doesn't exist in MongoDB yet, try to initialize them
        console.log(`[CreditsMigration] User ${clerkUserId} not found in DB, attempting auto-initialization`);
        try {
          const clerkUser = await currentUser();
          if (clerkUser) {
            const initResult = await UserInitializationService.ensureUserExists(
              clerkUserId,
              clerkUser.emailAddresses[0]?.emailAddress || "",
              clerkUser.username || clerkUser.firstName || clerkUser.lastName || "default-username",
              clerkUser.imageUrl
            );
            user = initResult.user;
          }
        } catch (initError) {
          console.error(`[CreditsMigration] Failed to auto-initialize user ${clerkUserId}:`, initError);
        }

        if (!user) {
          return { migrated: false };
        }
      }

      // Check if user already has credits balance initialized
      const hasCredits = user.creditsBalance && (
        user.creditsBalance.subscriptionCredits > 0 ||
        user.creditsBalance.topupCredits > 0 ||
        user.creditsBalance.creditHistory?.length > 0
      );

      if (hasCredits) {
        // Already migrated on the main pool — but users who predate the media
        // pool need a one-time media backfill. (New activations already receive
        // media via grantSubscriptionCredits, so this only heals legacy users.)
        await this.ensureMediaPool(clerkUserId, user);
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
   * One-time media-pool backfill for users who predate the media pool.
   *
   * Grants the plan's media allocation WITHOUT touching the main pool, so a
   * mid-cycle user's already-spent workflow credits are never refilled. Fully
   * idempotent: the atomic filter only matches when no media grant has ever
   * happened, so repeated calls (every balance fetch) are safe no-ops.
   */
  static async ensureMediaPool(clerkUserId: string, user: any): Promise<boolean> {
    try {
      const planType = (user.currentPlan?.name || 'free').toLowerCase();
      const mediaAllocation = getPlanMediaCreditAllocation(planType);
      if (mediaAllocation <= 0) return false; // plan has no media pool

      // Never re-grant / never refill: skip if a media grant already happened.
      const alreadyGranted = user.creditsBalance?.lastMediaGrant != null
        || (user.creditsBalance?.mediaCredits ?? 0) > 0;
      if (alreadyGranted) return false;

      const now = new Date();
      const expiry = user.currentPlan?.endDate ? new Date(user.currentPlan.endDate) : new Date(now);
      if (!user.currentPlan?.endDate) expiry.setMonth(expiry.getMonth() + 1);

      const grantTxn: ICreditTransaction = {
        id: `txn_${nanoid(12)}`,
        type: 'subscription_grant',
        amount: mediaAllocation,
        timestamp: now,
        balanceAfter: 0,
        metadata: { pool: 'media', planType, reason: 'media_pool_backfill', expiry: expiry.toISOString() },
      };

      // Atomic + idempotent: only grant when NO prior media grant exists.
      const res = await User.updateOne(
        {
          clerkUserId,
          $and: [
            { $or: [{ 'creditsBalance.lastMediaGrant': null }, { 'creditsBalance.lastMediaGrant': { $exists: false } }] },
            { $or: [{ 'creditsBalance.mediaCredits': { $lte: 0 } }, { 'creditsBalance.mediaCredits': { $exists: false } }] },
          ],
        },
        {
          $set: {
            'creditsBalance.mediaCredits': mediaAllocation,
            'creditsBalance.lastMediaGrant': now,
            'creditsBalance.mediaCreditsExpiry': expiry,
          },
          $push: { 'creditsBalance.creditHistory': { $each: [grantTxn], $slice: -100 } },
        },
      );

      if (res.modifiedCount > 0) {
        console.log(`[CreditsMigration] Backfilled ${mediaAllocation} media credits for ${clerkUserId} (${planType})`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[CreditsMigration] Error backfilling media pool for ${clerkUserId}:`, error);
      return false;
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
