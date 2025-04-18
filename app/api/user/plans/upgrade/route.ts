import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { updateUserPlan } from "@/lib/services/planService";
import { UserType } from "@/types/userTypes";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized: User not authenticated" },
        { status: 401 }
      );
    }

    const { planType, paymentId } = await request.json();

    // Validate inputs
    if (!planType || !paymentId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate plan type
    if (!Object.values(UserType).includes(planType as UserType)) {
      return NextResponse.json({ error: "Invalid plan type" }, { status: 400 });
    }

    await connectToDatabase(process.env.MONGODB_URI as string);

    // Update user plan
    const updatedUser = await updateUserPlan(
      userId,
      planType as UserType,
      paymentId
    );

    return NextResponse.json({
      success: true,
      message: `Plan upgraded to ${planType}`,
      currentPlan: {
        id: updatedUser.currentPlan._id?.toString() || "",
        name: updatedUser.currentPlan.name,
        startDate: updatedUser.currentPlan.startDate,
        endDate: updatedUser.currentPlan.endDate,
        price: updatedUser.currentPlan.price,
        status: updatedUser.currentPlan.status,
        features: updatedUser.currentPlan.features || [],
      },
    });
  } catch (error) {
    console.error("Error upgrading plan:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
