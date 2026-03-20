import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import Plan from "@/schemas/plans";
import { UserType } from "@/types/userTypes";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_SECRET_KEY_ID!,
});

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { planType, currency, billingCycle }: { planType: UserType; currency: string; billingCycle: 'monthly' | 'yearly' } = await request.json();

    // Find the plan in our database
    const dbPlan = await Plan.findOne({ type: planType });
    if (!dbPlan) {
      return NextResponse.json({ error: "Plan not found in database" }, { status: 404 });
    }

    // Get the specific Razorpay Plan ID for the selected currency and cycle
    const planObj = dbPlan.toObject();
    const currencyPricing = planObj.pricing?.[currency];
    const pricing = currencyPricing?.[billingCycle];
    
    console.log(`[Subscription] Debugging pricing for ${planType} ${currency} ${billingCycle}:`, {
      hasCurrencyPricing: !!currencyPricing,
      hasPricing: !!pricing,
      providerPlanIds: pricing?.providerPlanIds
    });

    let razorpayPlanId = null;
    if (pricing?.providerPlanIds) {
      if (pricing.providerPlanIds instanceof Map) {
        razorpayPlanId = pricing.providerPlanIds.get('razorpay');
      } else {
        razorpayPlanId = pricing.providerPlanIds.razorpay;
      }
    }

    if (!razorpayPlanId) {
      return NextResponse.json({ 
        error: `Razorpay plan ID not found for ${planType} ${currency} ${billingCycle}. Please re-seed plans.`,
        debug: { pricing }
      }, { status: 400 });
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: razorpayPlanId,
      customer_notify: 1,
      quantity: 1,
      total_count: billingCycle === 'monthly' ? 12 : 1, // 12 monthly payments or 1 yearly payment
      notes: {
        userId: userId,
        planType: planType,
        billingCycle: billingCycle,
        dbPlanId: dbPlan._id.toString(),
      },
    });

    return NextResponse.json({
      subscriptionId: subscription.id,
      razorpayKey: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error: any) {
    console.error("Error creating Razorpay subscription:", error);
    return NextResponse.json(
      {
        error: "Failed to create subscription",
        details: error.message,
      },
      { status: 500 }
    );
  }
}