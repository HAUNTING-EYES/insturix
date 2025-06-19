import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCollections } from "@/app/api/services/alyzitron/utils/mongodb";
import { ServiceUsageService } from "@/lib/services/serviceUsageService";
import { getAllLimitTypesForService } from "@/lib/config/serviceLimits";

export async function GET(request: NextRequest) {
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

    return NextResponse.json({
      success: true,
      activeAnalyses,
      monthlyAnalyses,
      completedAnalyses,
    });
  } catch (error) {
    console.error("Error fetching Alyzitron stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}