import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCollections } from "@/app/api/services/alyzitron/utils/mongodb";
import { CreditsService } from "@/lib/services/creditsService";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check user's credits for access
    let creditsBalance = null;
    try {
      creditsBalance = await CreditsService.getBalance(userId);
    } catch (error) {
      console.error("Error checking credits:", error);
      // Continue even if credits check fails
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
      // Credits-based info (replaces legacy serviceLimits)
      credits: creditsBalance ? {
        available: creditsBalance.subscriptionCredits + creditsBalance.topupCredits,
        subscriptionCredits: creditsBalance.subscriptionCredits,
        topupCredits: creditsBalance.topupCredits,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching Alyzitron stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}