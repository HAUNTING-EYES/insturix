import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getClickatronDb } from "@/lib/clickatron-mongo";
import { ServiceUsageService } from "@/lib/services/serviceUsageService";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ClickatronTask } = await getClickatronDb();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Use aggregation to get all counts in a single roundtrip
    const aggregationPipeline = [
      { $match: { clerkUserId: userId } },
      {
        $facet: {
          totalTasks: [{ $count: "count" }],
          monthlyTasks: [
            { $match: { createdAt: { $gte: monthStart } } },
            { $count: "count" }
          ],
          pendingTasks: [
            { $match: { status: { $in: ["queued", "processing"] } } },
            { $count: "count" }
          ]
        }
      }
    ];

    const results = await ClickatronTask.aggregate(aggregationPipeline as any[]);

    const totalTasks = results[0].totalTasks[0] ? results[0].totalTasks[0].count : 0;
    const monthlyTasks = results[0].monthlyTasks[0] ? results[0].monthlyTasks[0].count : 0;
    const pendingTasks = results[0].pendingTasks[0] ? results[0].pendingTasks[0].count : 0;

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