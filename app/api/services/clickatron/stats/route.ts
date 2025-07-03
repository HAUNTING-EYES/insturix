import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getClickatronDb } from "@/lib/clickatron-mongo";
import { ServiceUsageService } from "@/lib/services/serviceUsageService";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ClickatronTask } = await getClickatronDb();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthlyTasks = await ClickatronTask.countDocuments({
      clerkUserId: userId,
      createdAt: { $gte: monthStart },
    });

    const pendingTasks = await ClickatronTask.countDocuments({
      clerkUserId: userId,
      status: { $in: ["queued", "processing"] },
    });

    const totalTasks = await ClickatronTask.countDocuments({
      clerkUserId: userId,
    });

    const usage = await ServiceUsageService.getServiceUsageForAllServices(userId);

    const clickatronUsage = usage.clickatron?.maxThumbnailGeneration;

    return NextResponse.json({
      success: true,
      monthlyTasks,
      pendingTasks,
      totalTasks,
      usage: clickatronUsage,
    });
  } catch (error) {
    console.error("Error fetching Clickatron stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}