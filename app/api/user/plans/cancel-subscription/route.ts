import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Razorpay from "razorpay";
import { User } from "@/schemas/user";
import connectToDatabase from "@/schemas/ConnectToDatabase";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const user = await User.findOne({ clerkUserId: userId });

    if (!user) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    // Resolve subscription ID from multiple possible storage formats:
    // 1. IUserPlan.razorpaySubscriptionId (flat string, legacy)
    // 2. currentPlan.subscriptionId.razorpay (object, from updateUserPlan in planService)
    // 3. currentPlan.subscriptionId (flat string, from verify route)
    // 4. subscriptions array (last resort)
    const currentPlan = user.currentPlan;
    const subIdObj = currentPlan?.subscriptionId;
    const razorpaySubId =
      currentPlan?.razorpaySubscriptionId ||
      (typeof subIdObj === 'object' && subIdObj !== null ? subIdObj.razorpay : null) ||
      (typeof subIdObj === 'string' && subIdObj.startsWith('sub_') ? subIdObj : null) ||
      user.subscriptions?.find((s: any) => s.status === 'active')?.subscriptionId ||
      null;

    if (!razorpaySubId) {
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
    await razorpay.subscriptions.cancel(razorpaySubId);

    // Update user's plan status in our DB
    currentPlan.cancelAtPeriodEnd = true;
    currentPlan.status = "canceled";
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