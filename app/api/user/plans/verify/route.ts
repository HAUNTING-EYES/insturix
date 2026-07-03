/**
 * POST /api/user/plans/verify
 * 
 * Verify a Razorpay payment for a subscription plan and activate it.
 * Supports both native subscriptions (subscription_id) and manual payments (order_id).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";

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

    // Verify signature (fail-closed). Official Razorpay concatenation order:
    //   subscription: hmac_sha256(razorpay_payment_id + "|" + subscription_id, secret)
    //   order:        hmac_sha256(order_id + "|" + razorpay_payment_id, secret)
    const secret = process.env.RAZORPAY_SECRET_KEY_ID!;
    let generated_signature = "";

    if (razorpay_subscription_id) {
        generated_signature = crypto
            .createHmac("sha256", secret)
            .update(razorpay_payment_id + "|" + razorpay_subscription_id)
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
            subId: razorpay_subscription_id,
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
        });
        return NextResponse.json(
            { error: "Invalid payment signature" },
            { status: 400 }
        );
    }

    // DEPRECATED activation path removed (2026-07-01).
    // This route used to client-activate the plan (push an 'active' planHistory entry +
    // grant credits), which competed with the Razorpay webhook and left `currentPlan`
    // stale (split-brain). Subscription activation + credit grants are now owned SOLELY by
    // the webhook (app/api/webhooks/razorpay). The client checkout uses
    // /api/verify-subscription (pending-only). This route is retained so any in-flight or
    // cached client fails SAFE: it confirms the signature but never mutates plan/credits.
    return NextResponse.json({
        success: true,
        pending: true,
        message: "Payment verified. Your plan is being activated by our payment webhook and will be ready shortly.",
    });

  } catch (error) {
    console.error("Plan verification failed:", error);
    return NextResponse.json(
      { error: "Failed to verify plan purchase" },
      { status: 500 }
    );
  }
}
