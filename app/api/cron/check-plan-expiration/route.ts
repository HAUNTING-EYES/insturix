import { NextRequest, NextResponse } from "next/server";
import { 
  checkAndHandleExpiredPlans, 
  checkPlanExpiringSoon 
} from "@/lib/services/planExpirationService";

export async function GET(request: NextRequest) {
  try {
    // Vercel cron jobs are automatically authenticated
    // For manual testing, check for cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isVercelCron = request.headers.get('user-agent')?.includes('vercel-cron');

    if (!isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const expiredResults = await checkAndHandleExpiredPlans();
    const expiringSoon = await checkPlanExpiringSoon(7);

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      expired_plans_processed: expiredResults.length,
      plans_expiring_soon: expiringSoon.length,
      expired_users: expiredResults.map(r => ({
        userId: r.userId,
        previousPlan: r.previousPlan,
        downgraded_to: r.newPlan
      })),
      expiring_soon_users: expiringSoon.map(u => ({
        userId: u.userId,
        planName: u.planName,
        days_until_expiry: u.daysUntilExpiry
      }))
    };

    console.log("Plan expiration check completed:", response);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Plan expiration check failed:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { action, userId, extensionMonths } = await request.json();

    if (action === "extend_plan" && userId) {
      const { extendPlan } = await import("@/lib/services/planExpirationService");
      await extendPlan(userId, extensionMonths || 1);
      
      return NextResponse.json({
        success: true,
        message: `Plan extended for user ${userId}`
      });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Plan extension failed:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}