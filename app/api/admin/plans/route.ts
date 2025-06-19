import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import Plan from "@/schemas/plans";
import { validateAdminAuth, createUnauthorizedResponse } from "@/lib/adminAuth";

export async function GET(request: NextRequest) {
  try {
    if (!validateAdminAuth(request)) {
      return createUnauthorizedResponse();
    }

    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const filter = includeInactive ? {} : { isActive: true };
    const plans = await Plan.find(filter).sort({ sortOrder: 1, createdAt: 1 });

    return NextResponse.json({
      success: true,
      plans,
      count: plans.length,
    });
  } catch (error) {
    console.error("Error fetching plans:", error);
    return NextResponse.json(
      { error: "Failed to fetch plans" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!validateAdminAuth(request)) {
      return createUnauthorizedResponse();
    }

    await connectToDatabase();

    const planData = await request.json();
    
    const existingPlan = await Plan.findOne({ 
      $or: [
        { name: planData.name },
        { type: planData.type }
      ]
    });

    if (existingPlan) {
      return NextResponse.json(
        { error: "Plan with this name or type already exists" },
        { status: 400 }
      );
    }
    
    const plan = new Plan(planData);
    await plan.save();

    return NextResponse.json({
      success: true,
      plan,
      message: "Plan created successfully",
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating plan:", error);
    return NextResponse.json(
      { error: "Failed to create plan" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!validateAdminAuth(request)) {
      return createUnauthorizedResponse();
    }

    await connectToDatabase();

    const { planId, ...updateData } = await request.json();
    
    if (!planId) {
      return NextResponse.json(
        { error: "Plan ID is required" },
        { status: 400 }
      );
    }

    const plan = await Plan.findByIdAndUpdate(
      planId,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!plan) {
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      plan,
      message: "Plan updated successfully",
    });
  } catch (error) {
    console.error("Error updating plan:", error);
    return NextResponse.json(
      { error: "Failed to update plan" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!validateAdminAuth(request)) {
      return createUnauthorizedResponse();
    }

    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const planId = searchParams.get("planId");
    
    if (!planId) {
      return NextResponse.json(
        { error: "Plan ID is required" },
        { status: 400 }
      );
    }

    const plan = await Plan.findByIdAndUpdate(
      planId,
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );

    if (!plan) {
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Plan deactivated successfully",
    });
  } catch (error) {
    console.error("Error deactivating plan:", error);
    return NextResponse.json(
      { error: "Failed to deactivate plan" },
      { status: 500 }
    );
  }
}