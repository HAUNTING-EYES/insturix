import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import User, { IPlan } from "@/schemas/user";
import { getAndCleanLatestPlan } from "@/lib/services/planService";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized: User not authenticated" },
        { status: 401 }
      );
    }

    await connectToDatabase(process.env.MONGODB_URI as string);

    // Find the user by clerkUserId
    const user = await User.findOne({ clerkUserId: userId });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Clean up any duplicate active plans before returning to frontend
    await getAndCleanLatestPlan(userId);
    
    // Reload user after cleanup
    const updatedUser = await User.findOne({ clerkUserId: userId });
    if (!updatedUser) {
      return NextResponse.json(
        { error: "User not found after cleanup" },
        { status: 404 }
      );
    }

    // Format plan history for the client
    const formattedPlans = updatedUser.planHistory ? updatedUser.planHistory.map((plan: IPlan) => ({
      id: plan._id?.toString() || "",
      name: plan.name,
      startDate: plan.startDate,
      endDate: plan.endDate,
      price: plan.price,
      status: plan.status,
      features: plan.features || [],
    })) : [];

    return NextResponse.json({
      currentPlan: updatedUser.currentPlan ? {
        id: updatedUser.currentPlan._id?.toString() || "",
        name: updatedUser.currentPlan.name,
        startDate: updatedUser.currentPlan.startDate,
        endDate: updatedUser.currentPlan.endDate,
        price: updatedUser.currentPlan.price,
        status: updatedUser.currentPlan.status,
        features: updatedUser.currentPlan.features || [],
      } : null,
      plans: formattedPlans,
      userType: updatedUser.userType,
      signUpDate: updatedUser.signUpDate,
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
    const { name, price, features, durationInMonths } = body;

    if (!name || price === undefined || !durationInMonths) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    await connectToDatabase(process.env.MONGODB_URI as string);
    const user = await User.findOne({ clerkUserId: userId });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + durationInMonths);

    user.currentPlan = {
      name,
      startDate: now,
      endDate,
      price,
      status: "active",
      features,
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