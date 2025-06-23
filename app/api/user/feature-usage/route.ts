import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ServiceUsageService } from "@/lib/services/serviceUsageService";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const usageData = await ServiceUsageService.getServiceUsageForAllServices(userId);

    return NextResponse.json({
      success: true,
      data: usageData,
    });
  } catch (error) {
    console.error("Error fetching feature usage:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch feature usage",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}