import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User } from "@/schemas/user";
import { getUserPlanWithServiceLimits } from "@/lib/services/planService";
import { IUserPlan } from "@/types/userTypes";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized: User not authenticated" },
        { status: 401 }
      );
    }

    await connectToDatabase();

    const user = await User.findOne({ clerkUserId: userId });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get user plan with service limits from plans collection
    const userPlanWithServiceLimits = await getUserPlanWithServiceLimits(userId);
    
    const formattedPlans = user.planHistory ? user.planHistory.map((plan: IUserPlan, index: number) => ({
      id: plan.planId || `plan-${index}`, // Use planId or fallback to generated ID
      name: plan.name,
      startDate: plan.startDate,
      endDate: plan.endDate,
      price: plan.price,
      currency: plan.currency,
      status: plan.status,
      features: [], // Add empty features array for backward compatibility
    })) : [];

    return NextResponse.json({
      currentPlan: userPlanWithServiceLimits ? {
        id: userPlanWithServiceLimits.planId || 'current',
        name: userPlanWithServiceLimits.name,
        startDate: userPlanWithServiceLimits.startDate,
        endDate: userPlanWithServiceLimits.endDate,
        price: userPlanWithServiceLimits.price,
        currency: userPlanWithServiceLimits.currency,
        status: userPlanWithServiceLimits.status,
        features: [], // Return empty features for backward compatibility
        serviceLimits: userPlanWithServiceLimits.serviceLimits, // Include service limits
      } : null,
      plans: formattedPlans,
      userType: user.currentPlan?.name || "free",
      signUpDate: user.signUpDate,
    });
  } catch (error) {
    console.error("Error fetching user plans:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
} 

export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized: User not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { name, price, durationInMonths } = body;

    if (!name || price === undefined || !durationInMonths) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const user = await User.findOne({ clerkUserId: userId });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + durationInMonths);

    // This POST method is deprecated - use proper plan upgrade endpoints instead
    user.currentPlan = {
      planId: "", // This should be updated to use proper plan creation
      name,
      startDate: now,
      endDate,
      price,
      currency: user.preferences?.currency || "USD",
      status: "active",
      serviceLimits: user.currentPlan.serviceLimits, // Keep existing service limits
    };

    user.markModified("currentPlan");

    await user.save();

    return NextResponse.json({ message: "Plan updated successfully" });

  } catch (error) {
    console.error("Error updating user plan:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}