import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCollections } from "@/app/api/services/alyzitron/utils/mongodb";
import { ServiceUsageService } from "@/lib/services/serviceUsageService";
import { getAllLimitTypesForService } from "@/lib/config/serviceLimits";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if user has access to use Alyzitron service
    try {
      const alyzitronLimits = getAllLimitTypesForService('alyzitron');
      const limitChecks = await Promise.all(
        alyzitronLimits.map(limit =>
          ServiceUsageService.canUseService(userId, 'alyzitron', limit.limitType)
        )
      );

      // If user doesn't have access to any Alyzitron features, return empty stats
      const hasAnyAccess = limitChecks.some(check => check.hasAccess);
      if (!hasAnyAccess) {
        console.warn(`User ${userId} has no access to Alyzitron services, returning empty stats`);
        return NextResponse.json({
          success: true,
          activeAnalyses: 0,
          monthlyAnalyses: 0,
          completedAnalyses: 0,
        });
      }
    } catch (error) {
      console.error("Error checking Alyzitron access:", error);
      // Continue with stats retrieval even if access check fails
    }

    const { analyses } = await getCollections();

    // Get active analyses count
    const activeAnalyses = await analyses.countDocuments({
      clerkUserId: userId,
      status: { $in: ["listed", "queued", "processing"] },
    });

    // Get monthly analyses count
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthlyAnalyses = await analyses.countDocuments({
      clerkUserId: userId,
      createdAt: { $gte: monthStart },
    });

    // Get completed analyses count
    const completedAnalyses = await analyses.countDocuments({
      clerkUserId: userId,
      status: "completed",
    });

    // Also return per-limit usage for Alyzitron so the client can render "Service Limits"
    // Use the existing public API that returns usage for all services, then pick 'alyzitron'
    const usageAll = await ServiceUsageService.getServiceUsageForAllServices(userId);
    const usageAly = (usageAll && (usageAll as any).alyzitron) || {};
    const alyzitronLimits = getAllLimitTypesForService('alyzitron');

    const serviceLimits: Record<string, {
      currentUsage: number;
      maxUsage: number; // -1 for unlimited
      remaining: number;
      resetPeriod: "daily" | "weekly" | "monthly" | "none" | string;
      isUnlimited?: boolean;
      timeUntilReset?: { days: number; hours: number; minutes: number; totalMs: number } | null;
    }> = {};

    try {
      for (const limit of alyzitronLimits) {
        const u = (usageAly as any)[limit.limitType] || {};
        const currentUsage = typeof u.currentUsage === 'number' ? u.currentUsage : 0;
        const maxUsage = typeof u.maxUsage === 'number' ? u.maxUsage : -1;
        const remaining = typeof u.remaining === 'number'
          ? u.remaining
          : (maxUsage === -1 ? Number.POSITIVE_INFINITY : Math.max(maxUsage - currentUsage, 0));
        const resetPeriod = (u.resetPeriod as any) ?? 'none';
        const isUnlimited = typeof u.isUnlimited === 'boolean' ? u.isUnlimited : (maxUsage === -1);
        const timeUntilReset = u.timeUntilReset ?? null;

        serviceLimits[limit.limitType] = {
          currentUsage,
          maxUsage,
          remaining,
          resetPeriod,
          isUnlimited,
          timeUntilReset,
        };
      }
    } catch (e) {
      // If fetching per-limit usage fails, keep serviceLimits empty but still return counters
      console.warn("Failed to assemble Alyzitron per-limit usage:", e);
    }

    return NextResponse.json({
      success: true,
      activeAnalyses,
      monthlyAnalyses,
      completedAnalyses,
      serviceLimits,
    });
  } catch (error) {
    console.error("Error fetching Alyzitron stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}