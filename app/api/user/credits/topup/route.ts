/**
 * POST /api/user/credits/topup
 * 
 * Initiate a credits top-up purchase via Razorpay
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Razorpay from "razorpay";
import { CREDIT_PACKAGES } from "@/lib/config/creditCosts";

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY_ID) {
  console.error("Razorpay credentials not configured for credits topup");
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_SECRET_KEY_ID!,
});

export async function GET() {
  // Return available credit packages
  return NextResponse.json({
    success: true,
    packages: CREDIT_PACKAGES,
  });
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
    const { packageId, currency = "USD" } = body;

    if (!packageId) {
      return NextResponse.json(
        { error: "Package ID is required" },
        { status: 400 }
      );
    }

    // Find the credit package
    const creditPackage = CREDIT_PACKAGES.find(p => p.id === packageId);
    if (!creditPackage) {
      return NextResponse.json(
        { error: "Invalid package ID" },
        { status: 400 }
      );
    }

    // Get price for the selected currency
    const price = creditPackage.prices[currency];
    if (!price) {
      return NextResponse.json(
        { error: `Currency ${currency} not supported for this package` },
        { status: 400 }
      );
    }

    // Create Razorpay order for one-time payment
    const order = await razorpay.orders.create({
      amount: Math.round(price * 100), // Convert to smallest currency unit
      currency: currency,
      receipt: `credits_${userId}_${Date.now()}`,
      notes: {
        userId,
        packageId,
        credits: creditPackage.credits.toString(),
        type: "credits_topup",
      },
    });

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      package: {
        id: creditPackage.id,
        name: creditPackage.name,
        credits: creditPackage.credits,
        price,
      },
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("[POST /api/user/credits/topup] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create topup order" },
      { status: 500 }
    );
  }
}
