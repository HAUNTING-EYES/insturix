import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { UserInitializationService } from "@/lib/services/userInitializationService";
import type { Document } from "mongoose";
import { getUserData } from "@/lib/services/getUserData";

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
      clerkUser.emailAddresses[0]?.emailAddress || "",
      clerkUser.username || clerkUser.firstName || clerkUser.lastName || "default-username",
      clerkUser.imageUrl
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
      username: clerkUser.username,
      imageUrl: clerkUser.imageUrl,
      emailAddresses: clerkUser.emailAddresses
    });

    // Get full user data after initialization
    const fullUserData = await getUserData();

    if (!fullUserData) {
      return NextResponse.json(
        { error: "Failed to retrieve user data after initialization" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      isNewUser: initResult.isNewUser,
      user: fullUserData,
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
      clerkUser.emailAddresses[0]?.emailAddress || "",
      clerkUser.username || clerkUser.firstName || clerkUser.lastName || "default-username"
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
      user: initResult.user ? {
        id: (initResult.user as any)._id || (initResult.user as any).id,
        clerkUserId: (initResult.user as Document & { clerkUserId: string }).clerkUserId,
        email: (initResult.user as Document & { email: string }).email,
        currentPlan: {
          name: (initResult.user as Document & { currentPlan: { name: string; status: string; startDate: Date; endDate: Date | null } }).currentPlan.name,
          status: (initResult.user as Document & { currentPlan: { name: string; status: string; startDate: Date; endDate: Date | null } }).currentPlan.status,
          startDate: (initResult.user as Document & { currentPlan: { name: string; status: string; startDate: Date; endDate: Date | null } }).currentPlan.startDate,
          endDate: (initResult.user as Document & { currentPlan: { name: string; status: string; startDate: Date; endDate: Date | null } }).currentPlan.endDate,
        },
        signUpDate: (initResult.user as Document & { signUpDate: Date }).signUpDate,
        trialUsed: (initResult.user as Document & { trialUsed: boolean }).trialUsed,
      } : null
    });
  } catch (error) {
    console.error("Error checking user initialization:", error);
    return NextResponse.json(
      { error: "Failed to check user status" },
      { status: 500 }
    );
  }
}