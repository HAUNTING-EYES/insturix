import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cancelUserPlan, checkTrialRefundEligibility } from "@/lib/services/planService";
import Razorpay from "razorpay";
import { User } from "@/schemas/user";
import { initiateRefund } from "@/lib/services/refundService";
import connectToDatabase from "@/schemas/ConnectToDatabase";

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
      // The entire cancellation logic, including provider interaction and downgrade,
      // is now handled within the cancelUserPlan service function.
      const result = await cancelUserPlan(userId);
      return NextResponse.json(result);
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