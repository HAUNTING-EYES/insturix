import { auth, clerkClient } from "@clerk/nextjs/server";
import User from "@/schemas/user";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { UserInitializationService } from "@/lib/services/userInitializationService";
import mongoose from "mongoose";
import { UserType } from "@/types/userTypes";

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

export async function getUserData() {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new Error("User is not authenticated.");
    }

    await connectToDatabase();

    let user = await User.findOne({ clerkUserId: userId });

    if (!user) {
      console.log(`User not found in database for Clerk ID: ${userId}, attempting to create...`);
      
      try {
        const clerkUser = await (await clerkClient()).users.getUser(userId);
        const email = clerkUser.emailAddresses?.[0]?.emailAddress || "";
        
        if (!email) {
          throw new Error("User email not found");
        }
        
        const result = await UserInitializationService.ensureUserExists(userId, email);
        if (result.error) {
          throw new Error(result.error);
        }
        user = result.user;
        console.log(`Successfully created missing user: ${userId}`);
      } catch (createError) {
        console.error("Failed to create missing user:", createError);
        throw new Error("User not found and creation failed");
      }
    }

    const wasUpdated = await checkAndUpdateExpiredPlans(user);

    return {
      id: user._id.toString(),
      clerkUserId: user.clerkUserId,
      email: user.email,
      payments: user.payments,
      currentPlan: user.currentPlan,
      planUpdated: wasUpdated,
    };
  } catch (error) {
    console.error("Failed to fetch user data:", error);
    return null;
  }
}