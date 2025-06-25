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
      // Cancel the plan in DB
      const result = await cancelUserPlan(userId);

      // Fetch user to get subscription/payment info
      await connectToDatabase();
      const user = await User.findOne({ clerkUserId: userId });
      let razorpayCancelResult = null;
      let refundResult = null;

      // Cancel Razorpay subscription if present
      if (user && user.planHistory && user.planHistory.length > 0) {
        // Find the most recent non-free plan in history (just canceled)
        const lastPlan = user.planHistory[user.planHistory.length - 1];
        if (lastPlan.razorpaySubscriptionId) {
          try {
            const razorpay = new Razorpay({
              key_id: process.env.RAZORPAY_KEY_ID!,
              key_secret: process.env.RAZORPAY_SECRET_KEY_ID!,
            });
            await razorpay.subscriptions.cancel(lastPlan.razorpaySubscriptionId);
            razorpayCancelResult = { success: true, message: "Razorpay subscription cancelled." };
          } catch (e) {
            razorpayCancelResult = { success: false, error: (e as Error).message };
          }
        }
      }

      // If refund eligible, find latest completed payment and refund
      if (result.refundEligible && user && user.payments && user.payments.length > 0) {
        // Find the latest completed payment for the canceled plan
        const lastPlan = user.planHistory[user.planHistory.length - 1];
        const payment = user.payments
          .filter((p: any) => p.status === "completed" && p.planName === lastPlan.name)
          .sort((a: any, b: any) => b.timestamp.getTime() - a.timestamp.getTime())[0];
        if (payment) {
          refundResult = await initiateRefund(userId, {
            paymentId: payment.paymentId,
            amount: Math.round(payment.amount * 100), // Razorpay expects paise
            reason: "Trial period cancellation refund"
          });
        } else {
          refundResult = { success: false, error: "No payment found for refund." };
        }
      }

      return NextResponse.json({
        ...result,
        razorpayCancelResult,
        refundResult,
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