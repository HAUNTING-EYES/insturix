import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ServiceUsageService } from "@/lib/services/serviceUsageService";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Fetch all usage objects for the user
    const usage = await ServiceUsageService.getServiceUsageForAllServices(userId);

    // Extract Musitron's main usage object
    const musitronUsage = usage.musitron?.maxMusicGeneration;

    return NextResponse.json({
      success: true,
      usage: musitronUsage,
    });
  } catch (error) {
    console.error("Error fetching Musitron stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}