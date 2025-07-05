import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { UserType } from "@/types/userTypes";
import { User } from "@/schemas/user";

export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized: User not authenticated" },
        { status: 401 }
      );
    }

    const { userType, planDetails } = await request.json();

    if (!userType || !Object.values(UserType).includes(userType as UserType)) {
      return NextResponse.json(
        { error: "Invalid or missing user type" },
        { status: 400 }
      );
    }

    await connectToDatabase(process.env.MONGODB_URI as string);

    const user = await User.findOne({ clerkUserId: userId });
    
    if (!user) {
      return NextResponse.json(
        { error: "User not found in database" },
        { status: 404 }
      );
    }
    
    // This endpoint is deprecated - plan upgrades should go through payment system
    return NextResponse.json(
      { error: "This upgrade endpoint is deprecated. Use the payment system for plan upgrades." },
      { status: 400 }
    );

    user.markModified('currentPlan');
    await user.save();

    return NextResponse.json({
      success: true,
      message: `User plan updated to ${userType}`,
      currentPlan: user.currentPlan
    });
  } catch (error) {
    console.error("Error updating user plan:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
