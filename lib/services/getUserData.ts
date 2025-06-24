import { auth, clerkClient } from "@clerk/nextjs/server";
import User from "@/schemas/user";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { UserInitializationService } from "@/lib/services/userInitializationService";
import mongoose from "mongoose";
import { UserType, User as IUser, IPlan } from "@/types/userTypes";

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
    
    user.currentPlan = {
      planId: "fallback-free-plan",
      name: UserType.Free,
      startDate: now,
      endDate: oneMonthLater,
      price: 0,
      currency: user.currentPlan.currency || "USD",
      status: "active",
      serviceLimits: {
        alyzitron: [],
        editron: [],
        shield: [],
        socialize: [],
        thinkforge: [],
        musitron: [],
      },
    };
    
    await user.save();
    return true;
  }
  
  return false;
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
      _id: user._id.toString(),
      clerkUserId: user.clerkUserId,
      email: user.email,
      signUpDate: user.signUpDate || new Date(),
      currentPlan: user.currentPlan,
      planHistory: user.planHistory || [],
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