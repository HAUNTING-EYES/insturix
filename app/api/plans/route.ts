import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import Plan from "@/schemas/plans";

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const currency = searchParams.get("currency") || "USD";
    const includeInactive = searchParams.get("includeInactive") === "true";

    const filter = includeInactive ? {} : { isActive: true };
    
    const plans = await Plan.find(filter)
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    const formattedPlans = plans.map((plan: any) => ({
      id: plan._id.toString(),
      name: plan.name,
      type: plan.type,
      description: plan.description,
      serviceLimits: plan.serviceLimits,
      pricing: plan.pricing[currency as keyof typeof plan.pricing] || plan.pricing.USD,
      allPricing: plan.pricing,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
    }));

    return NextResponse.json({
      success: true,
      plans: formattedPlans,
      currency,
      count: formattedPlans.length,
    });
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