/**
 * POST /api/user/plans/verify
 * 
 * Verify a Razorpay payment for a subscription plan and activate it.
 * Supports both native subscriptions (subscription_id) and manual payments (order_id).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User } from "@/schemas/user";
import Plan from "@/schemas/plans";
import { SUBSCRIPTION_PLANS } from "@/lib/config/creditCosts";
import { UserType } from "@/types/userTypes";
import { addMonths } from "date-fns";
import { CreditsService } from "@/lib/services/creditsService";

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY_ID) {
  console.error("Razorpay credentials not configured for plan verify");
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, razorpay_subscription_id, packageId } = body;

    if (!razorpay_payment_id || !razorpay_signature || !packageId) {
      return NextResponse.json(
        { error: "Missing verification parameters" },
        { status: 400 }
      );
    }

    // Verify signature
    // For subscriptions, Razorpay uses subscription_id | payment_id
    // For orders, it uses order_id | payment_id
    const secret = process.env.RAZORPAY_SECRET_KEY_ID!;
    let generated_signature = "";
    
    if (razorpay_subscription_id) {
        generated_signature = crypto
            .createHmac("sha256", secret)
            .update(razorpay_subscription_id + "|" + razorpay_payment_id)
            .digest("hex");
    } else if (razorpay_order_id) {
        generated_signature = crypto
            .createHmac("sha256", secret)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest("hex");
    } else {
        return NextResponse.json({ error: "No order or subscription ID provided" }, { status: 400 });
    }

    if (generated_signature !== razorpay_signature) {
        console.error("[Plan Verify] Signature mismatch", {
            expected: generated_signature,
            received: razorpay_signature,
            subId: razorpay_subscription_id,
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id
        });
        return NextResponse.json(
            { error: "Invalid payment signature" },
            { status: 400 }
        );
    }

    await connectToDatabase();

    // 1. Find the plan definition
    const planDef = SUBSCRIPTION_PLANS.find(p => p.id === packageId);
    if (!planDef) {
       return NextResponse.json(
        { error: "Invalid plan ID" },
        { status: 400 }
      );
    }

    // 2. Find the Plan document in DB by type field (indexed, matches plan schema)
    // packageId is 'plus', 'pro', or 'premium' — matches Plan.type enum
    const dbPlan = await Plan.findOne({ type: packageId, isActive: true });

    // 3. Update User Plan
    const user = await User.findOne({ clerkUserId: userId });
    if (!user) {
         return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const startDate = new Date();
    const endDate = addMonths(startDate, 1);

    const newPlan = {
        planId: dbPlan?._id?.toString() || `manual_${planDef.id}`,
        name: planDef.id as UserType,
        price: planDef.price,
        currency: 'USD',
        status: 'active' as const,
        startDate: startDate,
        endDate: endDate,
        provider: 'razorpay',
        subscriptionId: razorpay_subscription_id || `sub_manual_${razorpay_payment_id}`,
    };

    // Add to history and set as current
    if (!user.planHistory) user.planHistory = [];
    user.planHistory.push(newPlan);
    
    // Set current plan type for convenience if used elsewhere
    user.userType = planDef.id as any; 

    await user.save();

    // 4. Grant Credits
    await CreditsService.addCredits(
        userId, 
        planDef.credits, 
        'subscription_grant', 
        `Monthly Plan Grant: ${planDef.name}`, 
        razorpay_subscription_id || razorpay_payment_id
    );

    return NextResponse.json({ 
        success: true, 
        creditsAdded: planDef.credits,
        plan: newPlan 
    });

  } catch (error) {
    console.error("Plan verification failed:", error);
    return NextResponse.json(
      { error: "Failed to verify plan purchase" },
      { status: 500 }
    );
  }
}
