import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCollections } from "@/app/api/services/musitron/utils/mongodb";
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

    // Get collections (assume similar to alyzitron)
    const { tasks } = await getCollections();

    // Get monthly songs generated
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthlySongs = await tasks.countDocuments({
      clerkUserId: userId,
      createdAt: { $gte: monthStart },
    });

    // Use real Musitron limits
    const musitronLimits = getAllLimitTypesForService('musitron');
    // Find the main music generation limit
    const mainLimit = musitronLimits.find(l => l.limitType === "maxMusicGeneration");
    let maxSongs = 0;
    let resetPeriod = "monthly";
    let isUnlimited = false;

    let usageCheck: any = null;
    if (mainLimit) {
      usageCheck = await ServiceUsageService.canUseService(userId, 'musitron', mainLimit.limitType);
      maxSongs = usageCheck.maxUsage ?? 0;
      resetPeriod = usageCheck.resetPeriod ?? "monthly";
      isUnlimited = usageCheck.isUnlimited || usageCheck.maxUsage === -1;
    }

    const remaining = isUnlimited ? -1 : Math.max(0, maxSongs - monthlySongs);

    // Calculate time until reset (rolling window)
    let timeUntilReset = null;
    if (usageCheck && usageCheck.lastReset && !isUnlimited && remaining !== maxSongs) {
      const now = new Date();
      let resetDate: Date | null = null;
      if (resetPeriod === "monthly") {
        resetDate = new Date(usageCheck.lastReset);
        resetDate.setMonth(resetDate.getMonth() + 1);
      } else if (resetPeriod === "weekly") {
        resetDate = new Date(usageCheck.lastReset);
        resetDate.setDate(resetDate.getDate() + 7);
      } else if (resetPeriod === "daily") {
        resetDate = new Date(usageCheck.lastReset);
        resetDate.setDate(resetDate.getDate() + 1);
      }
      if (resetDate) {
        const msUntilReset = resetDate.getTime() - now.getTime();
        if (msUntilReset > 0) {
          const days = Math.floor(msUntilReset / (1000 * 60 * 60 * 24));
          const hours = Math.floor((msUntilReset / (1000 * 60 * 60)) % 24);
          const minutes = Math.floor((msUntilReset / (1000 * 60)) % 60);
          timeUntilReset = `${days}d ${hours}h ${minutes}m`;
        } else {
          timeUntilReset = "Resets soon";
        }
      }
    }

    return NextResponse.json({
      success: true,
      monthlySongs,
      maxSongs: isUnlimited ? -1 : maxSongs,
      remaining,
      resetPeriod,
      timeUntilReset,
      isUnlimited,
    });
  } catch (error) {
    console.error("Error fetching Musitron stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}