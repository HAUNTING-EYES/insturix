import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ServiceUsageService } from "@/lib/services/serviceUsageService";
import { UserInitializationService } from "@/lib/services/userInitializationService";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Try to get service usage directly first (for existing users)
    try {
      const serviceUsage = await ServiceUsageService.getAllServiceUsage(userId);
      
      return NextResponse.json({
        success: true,
        data: serviceUsage,
        isNewUser: false,
      });
    } catch {
      // User doesn't exist, need to initialize
      const clerkUser = await currentUser();
      if (!clerkUser) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }

      // Initialize user only when needed
      const initResult = await UserInitializationService.ensureUserExists(
        userId,
        clerkUser.emailAddresses[0]?.emailAddress || ""
      );

      if (initResult.error) {
        return NextResponse.json(
          { error: "Failed to initialize user account" },
          { status: 500 }
        );
      }

      // Get service usage for newly created user
      const serviceUsage = await ServiceUsageService.getAllServiceUsage(userId);

      return NextResponse.json({
        success: true,
        data: serviceUsage,
        isNewUser: initResult.isNewUser,
      });
    }
  } catch (error) {
    console.error("Error fetching feature usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature usage" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Ensure user exists in MongoDB (create if not)
    const initResult = await UserInitializationService.ensureUserExists(
      userId,
      clerkUser.emailAddresses[0]?.emailAddress || ""
    );

    if (initResult.error) {
      return NextResponse.json(
        { error: "Failed to initialize user account" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { serviceName, limitType, amount = 1 } = body;

    if (!serviceName || !limitType) {
      return NextResponse.json(
        { error: "Service name and limit type are required" },
        { status: 400 }
      );
    }

    // Check if user can use the service
    const canUse = await ServiceUsageService.canUseService(userId, serviceName, limitType);
    
    if (!canUse.hasAccess) {
      return NextResponse.json(
        {
          error: "Service usage limit exceeded",
          data: canUse
        },
        { status: 403 }
      );
    }

    // Use the service
    try {
      const updatedUsage = await ServiceUsageService.useService(userId, serviceName, limitType, amount);

      return NextResponse.json({
        success: true,
        data: updatedUsage,
        message: `Used ${amount} ${serviceName}.${limitType}(s). ${updatedUsage.isUnlimited ? 'Unlimited' : `${updatedUsage.remaining} remaining`}.`
      });
    } catch (usageError) {
      return NextResponse.json(
        { error: usageError instanceof Error ? usageError.message : "Failed to record service usage" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error using feature:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to use feature" },
      { status: 500 }
    );
  }
}