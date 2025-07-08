import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import Plan, { IPlanDocument, ClientPlan, PlansResponse, IPricing, ClientPricingInfo } from "@/schemas/plans";

const transformPricing = (pricing: IPricing, currency: string): ClientPricingInfo => {
  const { amount, symbol, providerPlanIds } = pricing;
  const result: ClientPricingInfo = { amount, currency, symbol };

  if (providerPlanIds) {
    if (currency === 'INR' && providerPlanIds.razorpay) {
      result.paymentProvider = {
        provider: 'razorpay',
        planId: providerPlanIds.razorpay,
      };
    } else if (providerPlanIds.lemonsqueezy) {
      result.paymentProvider = {
        provider: 'lemonsqueezy',
        planId: providerPlanIds.lemonsqueezy,
      };
    }
  }
  return result;
};

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const currency = searchParams.get("currency")?.toUpperCase() || "USD";
    const includeInactive = searchParams.get("includeInactive") === "true";

    const filter = includeInactive ? {} : { isActive: true };
    
    const plans = await Plan.find(filter)
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean<IPlanDocument[]>();

    const formattedPlans: ClientPlan[] = plans.map((plan) => {
      const currencyPricing = plan.pricing[currency as keyof typeof plan.pricing];
      
      if (!currencyPricing) {
        throw new Error(`Pricing for currency ${currency} not found for plan ${plan.name}`);
      }

      return {
        id: (plan._id as any).toString(),
        name: plan.name,
        type: plan.type,
        description: plan.description,
        serviceLimits: plan.serviceLimits,
        pricing: {
          monthly: transformPricing(currencyPricing.monthly, currency),
          yearly: transformPricing(currencyPricing.yearly, currency),
        },
        isActive: plan.isActive,
        sortOrder: plan.sortOrder,
      };
    });

    const response: PlansResponse = {
      success: true,
      plans: formattedPlans,
      currency,
      count: formattedPlans.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching plans:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch plans",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const planData = await request.json();
    
    const plan = new Plan({
      name: planData.name,
      type: planData.type,
      description: planData.description,
      serviceLimits: planData.serviceLimits,
      pricing: planData.pricing,
      isActive: planData.isActive !== undefined ? planData.isActive : true,
      sortOrder: planData.sortOrder || 0,
    });

    await plan.save();

    return NextResponse.json({
      success: true,
      plan: {
        id: plan._id.toString(),
        name: plan.name,
        type: plan.type,
        description: plan.description,
        serviceLimits: plan.serviceLimits,
        pricing: plan.pricing,
        isActive: plan.isActive,
        sortOrder: plan.sortOrder,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating plan:", error);
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to create plan",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}