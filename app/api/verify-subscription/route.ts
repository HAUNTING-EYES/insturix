import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Razorpay from "razorpay";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { IUserPlan } from "@/types/userTypes";
import Plan from "@/schemas/plans";
import { UserType } from "@/types/userTypes";
import User from "@/schemas/user";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    const { razorpay_payment_id, razorpay_subscription_id } = await request.json();

    if (!userId || !razorpay_payment_id || !razorpay_subscription_id) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }
    
    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID!,
        key_secret: process.env.RAZORPAY_SECRET_KEY_ID!,
    });

    // Fetch payment and subscription to verify
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    const subscription = await razorpay.subscriptions.fetch(razorpay_subscription_id);

    if (payment.status !== 'captured' || payment.subscription_id !== subscription.id) {
        return NextResponse.json({ error: "Payment not captured or subscription mismatch." }, { status: 400 });
    }

    const clerkUserId = subscription.notes?.clerkUserId;
    const dbPlanId = subscription.notes?.dbPlanId;

    if (clerkUserId !== userId || !dbPlanId) {
        return NextResponse.json({ error: "Subscription does not belong to this user." }, { status: 403 });
    }

    await connectToDatabase();
    const user = await User.findOne({ clerkUserId });
    const plan = await Plan.findById(dbPlanId);

    if (!user || !plan) {
        return NextResponse.json({ error: "User or Plan not found." }, { status: 404 });
    }

    // --- Same logic as the webhook handler ---
    if (user.currentPlan?.razorpaySubscriptionId !== subscription.id) {
        if (user.currentPlan && user.currentPlan.status === "active") {
          const oldPlan: IUserPlan = { ...user.currentPlan.toObject(), status: "expired", endDate: new Date() };
          user.planHistory.push(oldPlan);
        }

        const { UserInitializationService } = await import("@/lib/services/userInitializationService");
        const serviceLimits = UserInitializationService.convertPlanLimitsToUserLimits(plan.serviceLimits.toObject());

        const newPlan: IUserPlan = {
            planId: plan._id.toString(),
            name: plan.type as UserType,
            startDate: new Date(),
            endDate: subscription.current_end ? new Date(subscription.current_end * 1000) : new Date(new Date().setMonth(new Date().getMonth() + 1)),
            price: Number(payment.amount) / 100,
            currency: payment.currency,
            status: "active",
            serviceLimits,
            razorpaySubscriptionId: subscription.id,
            cancelAtPeriodEnd: false,
        };

        user.currentPlan = newPlan;
        await user.save();
        console.log(`INSTANT UPGRADE: Successfully activated new subscription for user ${clerkUserId}`);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Verify Subscription Error:", error);
    return NextResponse.json({ error: "Failed to verify subscription" }, { status: 500 });
  }
} 