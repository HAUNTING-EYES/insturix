/**
 * POST /api/user/credits/topup
 * 
 * Initiate a credits top-up purchase via Razorpay
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Razorpay from "razorpay";
import { CREDIT_PACKAGES, SUBSCRIPTION_PLANS } from "@/lib/config/creditCosts";

let _razorpay: Razorpay | null = null;
function getRazorpay() {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_SECRET_KEY_ID!,
    });
  }
  return _razorpay;
}

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
    const { packageId } = body;
    const currency = "USD";

    if (!packageId) {
      return NextResponse.json(
        { error: "Package ID is required" },
        { status: 400 }
      );
    }

    // Find the credit package or subscription plan
    let selectedItem: { price: number; name: string; credits: number; id: string; type: 'package' | 'plan' } | null = null;

    const creditPackage = CREDIT_PACKAGES.find(p => p.id === packageId);
    
    if (creditPackage) {
      selectedItem = {
        price: creditPackage.prices[currency],
        name: creditPackage.name,
        credits: creditPackage.credits,
        id: creditPackage.id,
        type: 'package',
      };
    } else {
      // Check subscription plans
      const plan = SUBSCRIPTION_PLANS.find(p => p.id === packageId);
      if (plan) {
        selectedItem = {
          price: plan.price,
          name: `${plan.name} Plan (1 Month)`,
          credits: plan.credits,
          id: plan.id,
          type: 'plan',
        };
      }
    }

    if (!selectedItem) {
       return NextResponse.json(
        { error: "Invalid package or plan ID" },
        { status: 400 }
      );
    }

    // Create Razorpay order for one-time payment
    const order = await getRazorpay().orders.create({
      amount: Math.round(selectedItem.price * 100), // Convert to smallest currency unit
      currency: currency,
      receipt: `cr_${userId.slice(-12)}_${Date.now().toString(36)}`,
      notes: {
        userId,
        packageId,
        credits: selectedItem.credits.toString(),
        type: selectedItem.type === 'plan' ? 'subscription_plan' : 'credits_topup',
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
        id: selectedItem.id,
        name: selectedItem.name,
        credits: selectedItem.credits,
        price: selectedItem.price,
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
