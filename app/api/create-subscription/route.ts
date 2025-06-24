import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Razorpay from "razorpay";
import Plan from "@/schemas/plans";
import User from "@/schemas/user";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId, currency } = await request.json(); // planId from our DB

    if (!planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }
    
    const user = await User.findOne({ clerkUserId: userId });
    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const plan = await Plan.findById(planId);
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    console.log("Found plan in DB:", JSON.stringify(plan, null, 2));

    // Find the razorpay plan_id from our plan schema
    // Use .get() method for safe access on Mongoose Map
    const razorpayPlanId = plan.razorpayPlanId?.get(currency);

    if (!razorpayPlanId) {
        console.error(`Razorpay plan ID not found for currency ${currency} in plan:`, plan.razorpayPlanId);
        return NextResponse.json({ error: `Razorpay plan ID not found for currency ${currency}`}, { status: 400 });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_SECRET_KEY_ID!,
    });

    const subscription = await razorpay.subscriptions.create({
      plan_id: razorpayPlanId,
      customer_notify: 1,
      quantity: 1,
      total_count: 12, // Default to 12 cycles, can be configured
      notes: {
        clerkUserId: userId,
        dbPlanId: planId,
      },
    });

    // We might need to associate the subscription with the user here,
    // or wait for the webhook after first payment.
    // For now, we return the subscription_id to the client.

    return NextResponse.json({
      subscriptionId: subscription.id,
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error("Error creating Razorpay subscription:", error);
    return NextResponse.json(
      { error: "Failed to create subscription" },
      { status: 500 }
    );
  }
} 