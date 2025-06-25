import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Razorpay from "razorpay";
import { User } from "@/schemas/user";
import connectToDatabase from "@/schemas/ConnectToDatabase";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const user = await User.findOne({ clerkUserId: userId });

    if (!user || !user.currentPlan.razorpaySubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription found to cancel." },
        { status: 400 }
      );
    }
    
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_SECRET_KEY_ID!,
    });

    // Cancel subscription on Razorpay. By default, it cancels at the end of the period.
    await razorpay.subscriptions.cancel(user.currentPlan.razorpaySubscriptionId);

    // Update user's plan status in our DB
    user.currentPlan.cancelAtPeriodEnd = true;
    user.currentPlan.status = "canceled";
    await user.save();

    return NextResponse.json({
      success: true,
      message: "Your subscription has been scheduled for cancellation. You will have access until the end of your current billing period.",
    });

  } catch (error: any) {
    console.error("Subscription cancellation error:", error);
    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: 500 }
    );
  }
} 