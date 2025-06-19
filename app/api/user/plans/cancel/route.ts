import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cancelUserPlan, checkTrialRefundEligibility } from "@/lib/services/planService";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { action } = await request.json();

    if (action === "check") {
      // Check trial refund eligibility
      const eligibility = await checkTrialRefundEligibility(userId);
      return NextResponse.json(eligibility);
    } else if (action === "cancel") {
      // Cancel the plan
      const result = await cancelUserPlan(userId);
      return NextResponse.json({
        ...result,
        message: result.refundEligible
          ? `Plan cancelled with refund of $${result.refundAmount}. Refund will be processed within 5-7 business days.`
          : "Plan cancelled. You will continue to have access until the current billing period ends."
      });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'check' or 'cancel'" },
        { status: 400 }
      );
    }

  } catch (error: any) {
    console.error("Plan cancellation error:", error);
    return NextResponse.json(
      { 
        error: error.message || "Failed to process plan cancellation",
        success: false 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check trial refund eligibility
    const eligibility = await checkTrialRefundEligibility(userId);
    return NextResponse.json(eligibility);

  } catch (error: any) {
    console.error("Check eligibility error:", error);
    return NextResponse.json(
      { 
        error: error.message || "Failed to check eligibility",
        success: false 
      },
      { status: 500 }
    );
  }
}