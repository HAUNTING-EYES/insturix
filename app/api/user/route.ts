import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import User from "@/schemas/user";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { UserType } from "@/types/userTypes";
import { UserInitializationService } from "@/lib/services/userInitializationService";
import mongoose from "mongoose";

type UserDocument = {
  _id: mongoose.Types.ObjectId;
  clerkUserId: string;
  email: string;
  currentPlan: {
    name: UserType;
    startDate: Date;
    endDate: Date;
    price: number;
    status: "active" | "expired" | "canceled";
    features: string[];
  };
  save: () => Promise<UserDocument>;
};

async function checkAndUpdateExpiredPlans(user: UserDocument) {
  const now = new Date();
  
  if (user.currentPlan && 
      user.currentPlan.endDate && 
      user.currentPlan.status === "active" && 
      new Date(user.currentPlan.endDate) < now && 
      user.currentPlan.name !== UserType.Free) {
    
    user.currentPlan.status = "expired";
    
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    
    user.currentPlan = {
      name: UserType.Free,
      startDate: now,
      endDate: oneMonthLater,
      price: 0,
      status: "active",
      features: getPlanFeatures(UserType.Free),
    };
    
    await user.save();
    return true;
  }
  
  return false;
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    await connectToDatabase();
    
    // First try to find existing user
    let user = await User.findOne({ clerkUserId: userId });
    
    // If user doesn't exist, create them (webhook might have failed)
    if (!user) {
      console.log(`User not found in database for Clerk ID: ${userId}, attempting to create...`);
      
      try {
        // Get user details from Clerk
        const clerkUser = await (await clerkClient()).users.getUser(userId);
        const email = clerkUser.emailAddresses?.[0]?.emailAddress || "";
        
        if (!email) {
          console.error("No email found for user:", userId);
          return NextResponse.json({ error: "User email not found" }, { status: 400 });
        }
        
        // Create user using the fallback mechanism
        user = await UserInitializationService.ensureUserExists(userId, email);
        console.log(`Successfully created missing user: ${userId}`);
      } catch (createError) {
        console.error("Failed to create missing user:", createError);
        return NextResponse.json({ error: "User not found and creation failed" }, { status: 404 });
      }
    }
    
    const wasUpdated = await checkAndUpdateExpiredPlans(user);

    return NextResponse.json({
      id: user._id,
      clerkUserId: user.clerkUserId,
      email: user.email,
      payments: user.payments,
      currentPlan: user.currentPlan,
      planUpdated: wasUpdated,
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

    const requestData = await request.json();
    const { userType, cycleDuration = 30 } = requestData;

    if (!userType || !Object.values(UserType).includes(userType as UserType)) {
      return NextResponse.json(
        { error: "Invalid user type. Must be one of: " + Object.values(UserType).join(", ") },
        { status: 400 }
      );
    }

    await connectToDatabase(process.env.MONGODB_URI as string);
    
    const user = await User.findOne({ clerkUserId: userId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    await checkAndUpdateExpiredPlans(user);

    let price = 0;
    if (userType === UserType.Plus) {
      price = 9.99;
    } else if (userType === UserType.Pro) {
      price = 19.99;
    } else if (userType === UserType.Premium) {
      price = 29.99;
    } 

    const now = new Date();
    const cycleEnd = new Date(now);
    cycleEnd.setDate(cycleEnd.getDate() + cycleDuration);
    
    const endDate = userType === UserType.Free ? new Date(cycleEnd.setMonth(cycleEnd.getMonth() + 1)) : cycleEnd;
    
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
      currentPlan: user.currentPlan,
      cycleEnd: endDate.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update user type", details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const requestData = await request.json();
    const { email, userType, cycleDuration = 30 } = requestData;

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

    await connectToDatabase(process.env.MONGODB_URI as string);
    
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    let price = 0;
    if (userType === UserType.Pro) {
      price = 9.99;
    } else if (userType === UserType.Plus) {
      price = 19.99;
    } else if (userType === UserType.Premium) {
      price = 29.99;
    } 

    const now = new Date();
    const cycleEnd = new Date(now);
    cycleEnd.setDate(cycleEnd.getDate() + cycleDuration);
    
    const endDate = userType === UserType.Free ? new Date(cycleEnd.setMonth(cycleEnd.getMonth() + 1)) : cycleEnd;
    
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
      currentPlan: user.currentPlan,
      cycleEnd: endDate.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update user type", details: (error as Error).message },
      { status: 500 }
    );
  }
}

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
