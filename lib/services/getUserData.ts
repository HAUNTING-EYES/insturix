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

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database connection timeout')), 5000);
    });

    const dbPromise = (async () => {
      await connectToDatabase();
      return User.findOne({ clerkUserId: userId }).lean(); // Use lean() for better performance
    })();

    let user = await Promise.race([dbPromise, timeoutPromise]) as any;

    if (!user) {
      console.log(`User not found in database for Clerk ID: ${userId}, returning null for client-side initialization`);
      return null; // Let client handle user creation
    }

    // Quick plan expiration check without saving (non-blocking)
    const now = new Date();
    let planExpired = false;
    if (user.currentPlan &&
        user.currentPlan.endDate &&
        user.currentPlan.status === "active" &&
        new Date(user.currentPlan.endDate) < now &&
        user.currentPlan.name !== "Free") {
      planExpired = true;
    }

    return {
      _id: user._id.toString(),
      clerkUserId: user.clerkUserId,
      email: user.email,
      username: user.username, // Add username to return
      signUpDate: user.signUpDate || new Date(),
      currentPlan: planExpired ? { ...user.currentPlan, status: "expired" } : user.currentPlan,
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