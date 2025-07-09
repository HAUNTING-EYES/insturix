import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@clerk/nextjs/server";
import { updateUserPlan } from "@/lib/services/planService";
import { UserType } from "@/types/userTypes";
import { User } from "@/schemas/user";
import Plan from "@/schemas/plans";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      planType,
      billingCycle,
      currency,
    }: {
      razorpay_payment_id: string;
      razorpay_subscription_id: string;
      razorpay_signature: string;
      planType: UserType;
      billingCycle: 'monthly' | 'yearly';
      currency: 'INR' | 'USD';
    } = await request.json();

    const keySecret = process.env.RAZORPAY_SECRET_KEY_ID!;
    const body = `${razorpay_payment_id}|${razorpay_subscription_id}`;

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // The webhook will handle the plan update.
    // This endpoint just confirms the subscription was created successfully on the client-side.
    const user = await User.findOne({ clerkUserId: userId });
    const plan = await Plan.findOne({ type: planType });

    if (user && plan) {
      // 1. Add a "pending activation" message
      const pendingMessage = {
        id: "plan-activation-pending",
        type: 'banner',
        title: 'Plan Activation Pending',
        message: 'Your payment was successful. Your plan is being activated and should be ready in 1-2 minutes. Please refresh the page shortly.',
        location: 'dashboard-overview',
        style: {
            backgroundColor: '#EBF8FF', // A light blue background
            textColor: '#2C5282', // A dark blue text
            icon: 'hourglass'
        }
      };
      user.uiMessages.push(pendingMessage);

      // 2. Add a new entry to planHistory with "pending" status
      const priceInfo = plan.pricing[currency][billingCycle];

      const newPlan = {
          planId: plan._id.toString(),
          name: planType,
          startDate: new Date(),
          endDate: null,
          price: priceInfo.amount,
          currency: currency,
          status: "pending",
          subscriptionId: { razorpay: razorpay_subscription_id },
          serviceLimits: plan.serviceLimits,
      };
      // @ts-ignore
      user.planHistory.push(newPlan);

      await user.save();
    }

    return NextResponse.json({ isOk: true, message: "Subscription initiated successfully. Your plan will be updated shortly." });
  } catch (error: any) {
    console.error("Error verifying Razorpay subscription:", error);
    return NextResponse.json(
      {
        error: "Failed to verify subscription",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
