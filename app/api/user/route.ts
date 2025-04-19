import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import User from "@/schemas/user";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { UserType } from "@/types/userTypes";
import mongoose from "mongoose";

// Define a type for the user document based on the schema
type UserDocument = {
  _id: mongoose.Types.ObjectId;
  clerkUserId: string;
  userType: UserType;
  email: string;
  currentPlan: {
    name: UserType;
    startDate: Date;
    endDate: Date | null;
    price: number;
    status: "active" | "expired" | "canceled";
    features: string[];
  };
  save: () => Promise<UserDocument>;
};

// Helper function to check and update expired plans
async function checkAndUpdateExpiredPlans(user: UserDocument) {
  const now = new Date();
  
  // Check if the current plan has expired
  if (user.currentPlan && 
      user.currentPlan.endDate && 
      user.currentPlan.status === "active" && 
      new Date(user.currentPlan.endDate) < now && 
      user.currentPlan.name !== UserType.Free) {
    
    // Set the current plan to expired
    user.currentPlan.status = "expired";
    
    // Create a new Free plan
    user.currentPlan = {
      name: UserType.Free,
      startDate: now,
      endDate: null, // Free plan doesn't expire
      price: 0,
      status: "active",
      features: getPlanFeatures(UserType.Free),
    };
    
    // Update user type to Free
    user.userType = UserType.Free;
    
    // Save the changes
    await user.save();
    
    return true; // Plan was expired and updated
  }
  
  return false; // No update needed
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectToDatabase(process.env.MONGODB_URI as string);
    const user = await User.findOne({ clerkUserId: userId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    // Check if the plan has expired and update if necessary
    const wasUpdated = await checkAndUpdateExpiredPlans(user);

    // Return user data
    return NextResponse.json({
      id: user._id,
      clerkUserId: user.clerkUserId,
      email: user.email,
      userType: user.userType,
      payments: user.payments,
      currentPlan: user.currentPlan,
      planUpdated: wasUpdated, // Indicates if the plan was automatically updated
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch user data", details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const requestData = await request.json();
    const { userType, cycleDuration = 30 } = requestData; // Default cycle is 30 days

    // Validate user type
    if (!userType || !Object.values(UserType).includes(userType as UserType)) {
      return NextResponse.json(
        { error: "Invalid user type. Must be one of: " + Object.values(UserType).join(", ") },
        { status: 400 }
      );
    }

    // Connect to database
    await connectToDatabase(process.env.MONGODB_URI as string);
    
    // Find user
    const user = await User.findOne({ clerkUserId: userId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    // Check if current plan has expired before applying a new one
    await checkAndUpdateExpiredPlans(user);

    // Calculate pricing based on user type
    let price = 0;
    if (userType === UserType.Plus) {
      price = 9.99;
    } else if (userType === UserType.Pro) {
      price = 19.99;
    } else if (userType === UserType.Premium) {
      price = 29.99;
    } 

    // Set up cycle dates
    const now = new Date();
    const cycleEnd = new Date(now);
    cycleEnd.setDate(cycleEnd.getDate() + cycleDuration);
    
    // Free plan doesn't have an end date
    const endDate = userType === UserType.Free ? null : cycleEnd;
    
    // Update user type
    user.userType = userType;
    
    // Create or update current plan with the new cycle
    user.currentPlan = {
      name: userType as UserType,
      startDate: now,
      endDate: endDate,
      price: price,
      status: "active",
      features: getPlanFeatures(userType as UserType),
    };

    await user.save();

    return NextResponse.json({
      success: true,
      message: `User upgraded to ${userType}`,
      userType: user.userType,
      currentPlan: user.currentPlan,
      cycleEnd: endDate ? endDate.toISOString() : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update user type", details: (error as Error).message },
      { status: 500 }
    );
  }
}

// Add a PATCH endpoint for external updates with JSON payloads
export async function PATCH(request: Request) {
  try {
    // Parse request body
    const requestData = await request.json();
    const { email, userType, cycleDuration = 30 } = requestData;

    // Validate required fields
    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (!userType || !Object.values(UserType).includes(userType as UserType)) {
      return NextResponse.json(
        { error: "Invalid user type. Must be one of: " + Object.values(UserType).join(", ") },
        { status: 400 }
      );
    }

    // Connect to database
    await connectToDatabase(process.env.MONGODB_URI as string);
    
    // Find user by email - this allows updating without authentication
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    // Calculate pricing based on user type
    let price = 0;
    if (userType === UserType.Pro) {
      price = 9.99;
    } else if (userType === UserType.Plus) {
      price = 19.99;
    } else if (userType === UserType.Premium) {
      price = 29.99;
    } 

    // Set up cycle dates
    const now = new Date();
    const cycleEnd = new Date(now);
    cycleEnd.setDate(cycleEnd.getDate() + cycleDuration);
    
    // Free plan doesn't have an end date
    const endDate = userType === UserType.Free ? null : cycleEnd;
    
    // Update user type
    user.userType = userType;
    
    // Create or update current plan with the new cycle
    user.currentPlan = {
      name: userType as UserType,
      startDate: now,
      endDate: endDate,
      price: price,
      status: "active",
      features: getPlanFeatures(userType as UserType),
    };

    await user.save();

    return NextResponse.json({
      success: true,
      message: `User ${email} updated to ${userType}`,
      userType: user.userType,
      currentPlan: user.currentPlan,
      cycleEnd: endDate ? endDate.toISOString() : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update user type", details: (error as Error).message },
      { status: 500 }
    );
  }
}

// Helper function to get features based on plan type
function getPlanFeatures(userType: UserType): string[] {
  switch (userType) {
    case UserType.Free:
      return ["Basic access", "Limited storage", "Community support"];
    case UserType.Plus:
      return ["Plus access", "10GB storage", "Priority support", "Advanced features"];
    case UserType.Pro:
      return ["Premium access", "50GB storage", "24/7 support", "All features", "Custom branding"];
    case UserType.Premium:
      return ["Ultra access", "100GB storage", "Dedicated support", "All features", "Custom branding", "API access"];
    default:
      return ["Basic access"];
  }
}
