import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { UserInitializationService } from "@/lib/services/userInitializationService";

export async function POST() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user details from Clerk
    const clerkUser = await currentUser();
    if (!clerkUser) {
      return NextResponse.json(
        { error: "User not found in Clerk" },
        { status: 404 }
      );
    }

    // Ensure user exists in MongoDB
    const initResult = await UserInitializationService.ensureUserExists(
      userId,
      clerkUser.emailAddresses[0]?.emailAddress || ""
    );

    if (initResult.error) {
      return NextResponse.json(
        { error: initResult.error },
        { status: 500 }
      );
    }

    // Sync any updated data from Clerk
    await UserInitializationService.syncUserFromClerk(userId, {
      email: clerkUser.emailAddresses[0]?.emailAddress,
      emailAddresses: clerkUser.emailAddresses
    });

    return NextResponse.json({
      success: true,
      isNewUser: initResult.isNewUser,
      user: {
        id: initResult.user._id,
        clerkUserId: initResult.user.clerkUserId,
        email: initResult.user.email,
        currentPlan: initResult.user.currentPlan,
        signUpDate: initResult.user.signUpDate,
        trialUsed: initResult.user.trialUsed,
      },
      message: initResult.isNewUser 
        ? "User account created successfully" 
        : "User account verified"
    });
  } catch (error) {
    console.error("Error initializing user:", error);
    return NextResponse.json(
      { error: "Failed to initialize user account" },
      { status: 500 }
    );
  }
}

// GET method for checking user initialization status
export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user details from Clerk
    const clerkUser = await currentUser();
    if (!clerkUser) {
      return NextResponse.json(
        { error: "User not found in Clerk" },
        { status: 404 }
      );
    }

    // Check if user exists and initialize if needed
    const initResult = await UserInitializationService.ensureUserExists(
      userId,
      clerkUser.emailAddresses[0]?.emailAddress || ""
    );

    if (initResult.error) {
      return NextResponse.json(
        { error: initResult.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      userExists: !initResult.isNewUser,
      isNewUser: initResult.isNewUser,
      user: {
        id: initResult.user._id,
        clerkUserId: initResult.user.clerkUserId,
        email: initResult.user.email,
        currentPlan: {
          name: initResult.user.currentPlan.name,
          status: initResult.user.currentPlan.status,
          startDate: initResult.user.currentPlan.startDate,
          endDate: initResult.user.currentPlan.endDate,
        },
        signUpDate: initResult.user.signUpDate,
        trialUsed: initResult.user.trialUsed,
      }
    });
  } catch (error) {
    console.error("Error checking user initialization:", error);
    return NextResponse.json(
      { error: "Failed to check user status" },
      { status: 500 }
    );
  }
}