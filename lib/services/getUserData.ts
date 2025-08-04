import { auth, clerkClient } from "@clerk/nextjs/server";
import { User } from "@/schemas/user";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { UserInitializationService } from "@/lib/services/userInitializationService";
import mongoose from "mongoose";
import { UserType, User as IUser } from "@/types/userTypes";

type UserDocument = mongoose.Document & IUser & {
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
    
    await user.save();
    return true;
  }
  
  return false;
}


export async function getUserData() {
  try {
    const { userId } = await auth();
    if (!userId) {
      console.log("User is not authenticated, returning null");
      return null;
    }

    await connectToDatabase();

    let user = await User.findOne({ clerkUserId: userId });

    if (!user) {
      console.log(`User not found in database for Clerk ID: ${userId}, initializing user...`);
      
      try {
        const clerkUser = await (await clerkClient()).users.getUser(userId);
        const email = clerkUser.emailAddresses?.[0]?.emailAddress || "";
        const username = clerkUser.username;
        
        if (!email) {
          console.log("User email not found from Clerk, returning null for graceful initialization");
          return null;
        }

        if (!username) {
          console.log("Username not found for user, returning null for graceful initialization");
          return null;
        }
        
        const result = await UserInitializationService.ensureUserExists(userId, email, username);
        if (result.error) {
          console.log(`User initialization failed: ${result.error}, returning null for graceful initialization`);
          return null;
        }
        user = result.user;
        console.log(`Successfully created missing user: ${userId}`);
      } catch (createError) {
        console.error("Failed to create missing user:", createError);
        console.log("Returning null to allow graceful initialization flow");
        return null;
      }
    }

    await checkAndUpdateExpiredPlans(user);

    return {
      _id: user._id.toString(),
      clerkUserId: user.clerkUserId,
      email: user.email,
      signUpDate: user.signUpDate || new Date(),
      currentPlan: user.currentPlan,
      planHistory: user.planHistory || [],
      uiMessages: user.uiMessages || [],
      payments: user.payments || [],
      trialUsed: user.trialUsed || false,
      preferences: user.preferences || {
        currency: "USD",
        notifications: {
          planExpiry: true,
          paymentReminders: true,
        },
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      __v: user.__v,
    };
  } catch (error) {
    console.error("Failed to fetch user data:", error);
    return null;
  }
}