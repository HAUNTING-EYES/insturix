/**
 * POST /api/user/credits/verify
 * 
 * Verify a Razorpay payment and add credits directly.
 * This is a fallback for when webhooks can't reach the server (e.g., localhost development)
 * or as an extra reliability measure.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Razorpay from "razorpay";
import crypto from "crypto";
import { CreditsService } from "@/lib/services/creditsService";
import { CREDIT_PACKAGES } from "@/lib/config/creditCosts";

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY_ID) {
  console.error("Razorpay credentials not configured for credits verify");
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_SECRET_KEY_ID!,
});

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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, packageId } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "Missing payment verification parameters" },
        { status: 400 }
      );
    }

    // Verify the payment signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET_KEY_ID!)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      console.error("[Credits Verify] Invalid signature");
      return NextResponse.json(
        { error: "Invalid payment signature" },
        { status: 400 }
      );
    }

    // Fetch the payment from Razorpay to confirm status
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    
    if (payment.status !== "captured") {
      console.error(`[Credits Verify] Payment not captured. Status: ${payment.status}`);
      return NextResponse.json(
        { error: `Payment not completed. Status: ${payment.status}` },
        { status: 400 }
      );
    }

    // Find the credit package
    const creditPackage = CREDIT_PACKAGES.find(p => p.id === packageId);
    if (!creditPackage) {
      // Fallback: try to get credits from payment notes
      const credits = parseInt((payment.notes as any)?.credits || '0', 10);
      if (credits <= 0) {
        return NextResponse.json(
          { error: "Invalid package ID and no credits in payment notes" },
          { status: 400 }
        );
      }
      
      // Add credits using notes
      const result = await CreditsService.addTopupCredits(userId, credits, {
        paymentId: razorpay_payment_id,
        packageId: packageId || 'unknown',
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || "Failed to add credits" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        creditsAdded: credits,
        balance: result.balance,
      });
    }

    // Add credits
    const result = await CreditsService.addTopupCredits(userId, creditPackage.credits, {
      paymentId: razorpay_payment_id,
      packageId,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to add credits" },
        { status: 500 }
      );
    }

    console.log(`[Credits Verify] Added ${creditPackage.credits} credits to user ${userId}`);

    return NextResponse.json({
      success: true,
      creditsAdded: creditPackage.credits,
      balance: result.balance,
    });
  } catch (error) {
    console.error("[POST /api/user/credits/verify] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify payment" },
      { status: 500 }
    );
  }
}
