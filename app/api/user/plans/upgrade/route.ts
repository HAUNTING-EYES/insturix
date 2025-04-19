import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { UserType } from "@/types/userTypes";
import User from "@/schemas/user";

export async function PATCH(request: Request) {
  try {
    // Get authenticated user ID from Clerk
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized: User not authenticated" },
        { status: 401 }
      );
    }

    // Parse request body
    const { userType, planDetails } = await request.json();

    // Validate user type
    if (!userType || !Object.values(UserType).includes(userType as UserType)) {
      return NextResponse.json(
        { error: "Invalid or missing user type" },
        { status: 400 }
      );
    }

    // Connect to database
    await connectToDatabase(process.env.MONGODB_URI as string);

    // Get the user first to handle both userType and currentPlan together
    const user = await User.findOne({ clerkUserId: userId });
    
    if (!user) {
      return NextResponse.json(
        { error: "User not found in database" },
        { status: 404 }
      );
    }
    
    // Update userType
    user.userType = userType;
    
    // If this is an upgrade (not Free), update the currentPlan as well
    if (userType !== UserType.Free && planDetails) {
      const now = new Date();
      const endDate = planDetails.endDate || new Date(now);
      // If using a monthly subscription, set end date to one month later by default
      if (!planDetails.endDate) {
        endDate.setMonth(endDate.getMonth() + 1);
      }
      
      // Update or create currentPlan - ensure all required fields are present
      user.currentPlan = {
        name: userType as UserType, // Use the userType as the plan name for consistency
        startDate: planDetails.startDate ? new Date(planDetails.startDate) : now,
        endDate: endDate,
        price: planDetails.price || 0,
        status: "active",
        features: planDetails.features || [],
      };
      
      // We don't need to manually add to plan history as the pre-save middleware will handle it
    } 
    // If downgrading to Free, mark current plan as canceled
    else if (userType === UserType.Free && user.currentPlan) {
      // Set current plan's endDate to now and status to canceled
      user.currentPlan.endDate = new Date();
      user.currentPlan.status = "canceled";
      
      // We don't need to manually add to plan history as the pre-save middleware will handle it
      
      // Create a new Free plan
      user.currentPlan = {
        name: UserType.Free,
        startDate: new Date(),
        endDate: null,
        price: 0,
        status: "active",
        features: ["Basic features"]
      };
    }

    // Mark modified nested objects
    user.markModified('currentPlan');
    
    // Save the updated user document
    await user.save();

    // Return success response
    return NextResponse.json({
      success: true,
      message: `User plan updated to ${userType}`,
      userType: user.userType,
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
