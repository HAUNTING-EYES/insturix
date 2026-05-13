import { auth, currentUser } from "@clerk/nextjs/server";
import { User } from "@/schemas/user";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { UserInitializationService } from "@/lib/services/userInitializationService";
import mongoose from "mongoose";
import { UserType, User as IUser } from "@/types/userTypes";

type UserDocument = mongoose.Document & IUser & {
  save: () => Promise<UserDocument>;
};

async function _checkAndUpdateExpiredPlans(user: UserDocument) {
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
      console.log(`User not found in database for Clerk ID: ${userId}, initializing server-side`);
      
      // Server-side initialization for new users
      const clerkUser = await currentUser();
      if (clerkUser) {
        const initResult = await UserInitializationService.ensureUserExists(
          userId,
          clerkUser.emailAddresses[0]?.emailAddress || "",
          clerkUser.username || clerkUser.firstName || clerkUser.lastName || "default-username",
          clerkUser.imageUrl
        );
        
        if (initResult.error) {
          console.error(`Failed to initialize user server-side: ${initResult.error}`);
          return null;
        }
        
        console.log(`Server-side user initialization successful for ${userId}, isNewUser: ${initResult.isNewUser}`);
        
        // Refetch user after initialization
        const refetchPromise = (async () => {
          await connectToDatabase();
          return User.findOne({ clerkUserId: userId }).lean();
        })();
        
        user = await Promise.race([refetchPromise, timeoutPromise]) as any;
        
        if (!user) {
          console.error(`Failed to refetch user after server-side initialization: ${userId}`);
          return null;
        }
      } else {
        console.error("Clerk user not found during server-side initialization");
        return null;
      }
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