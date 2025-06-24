import User from "@/schemas/user";
import { UserType } from "@/types/userTypes";
import connectToDatabase from "@/schemas/ConnectToDatabase";

interface ExpirationCheckResult {
  userId: string;
  previousPlan: string;
  newPlan: string;
  expiredAt: Date;
}


export async function checkAndHandleExpiredPlans(): Promise<ExpirationCheckResult[]> {
  await connectToDatabase();
  
  const now = new Date();
  const results: ExpirationCheckResult[] = [];

  const usersWithExpiredPlans = await User.find({
    "currentPlan.endDate": { $lt: now },
    "currentPlan.status": "active",
    "currentPlan.name": { $ne: UserType.Free }
  });

  console.log(`Found ${usersWithExpiredPlans.length} users with expired plans`);

  for (const user of usersWithExpiredPlans) {
    try {
      const previousPlanName = user.currentPlan.name;
      
      user.currentPlan.status = "expired";
      
      const freePlan = {
        planId: "fallback-free-plan",
        name: UserType.Free,
        startDate: now,
        endDate: null,
        price: 0,
        currency: user.currentPlan.currency || "USD",
        status: "active" as const,
        serviceLimits: {
          alyzitron: [],
          editron: [],
          shield: [],
          socialize: [],
          thinkforge: [],
          musitron: [],
        },
      };

      user.currentPlan = freePlan;
      user.markModified('currentPlan');
      await user.save();

      results.push({
        userId: user.clerkUserId,
        previousPlan: previousPlanName,
        newPlan: UserType.Free,
        expiredAt: now,
      });

      console.log(`Downgraded user ${user.clerkUserId} from ${previousPlanName} to Free`);
    } catch (error) {
      console.error(`Failed to downgrade user ${user.clerkUserId}:`, error);
    }
  }

  return results;
}

export async function checkPlanExpiringSoon(daysAhead: number = 7): Promise<any[]> {
  await connectToDatabase();
  
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const usersWithExpiringSoon = await User.find({
    "currentPlan.endDate": { 
      $gte: new Date(),
      $lte: futureDate 
    },
    "currentPlan.status": "active",
    "currentPlan.name": { $ne: UserType.Free }
  }).select('clerkUserId email currentPlan');

  return usersWithExpiringSoon.map(user => ({
    userId: user.clerkUserId,
    email: user.email,
    planName: user.currentPlan.name,
    expiresAt: user.currentPlan.endDate,
    daysUntilExpiry: Math.ceil(
      ((user.currentPlan.endDate?.getTime() || 0) - Date.now()) / (1000 * 60 * 60 * 24)
    )
  }));
}

export async function extendPlan(
  clerkUserId: string, 
  extensionMonths: number = 1
): Promise<boolean> {
  await connectToDatabase();
  
  const user = await User.findOne({ clerkUserId });
  if (!user) {
    throw new Error("User not found");
  }

  if (user.currentPlan.status !== "active") {
    throw new Error("Cannot extend inactive plan");
  }

  const currentEndDate = user.currentPlan.endDate || new Date();
  const newEndDate = new Date(currentEndDate);
  newEndDate.setMonth(newEndDate.getMonth() + extensionMonths);

  user.currentPlan.endDate = newEndDate;
  user.markModified('currentPlan');
  await user.save();

  console.log(`Extended plan for user ${clerkUserId} until ${newEndDate}`);
  return true;
}

export async function getUserPlanStatus(clerkUserId: string): Promise<{
  isActive: boolean;
  planName: string;
  expiresAt: Date | null;
  daysUntilExpiry: number | null;
  isExpired: boolean;
}> {
  await connectToDatabase();
  
  const user = await User.findOne({ clerkUserId });
  if (!user) {
    throw new Error("User not found");
  }

  const now = new Date();
  const endDate = user.currentPlan.endDate;
  const isExpired = endDate ? endDate < now : false;
  const daysUntilExpiry = endDate ? 
    Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

  return {
    isActive: user.currentPlan.status === "active" && !isExpired,
    planName: user.currentPlan.name,
    expiresAt: endDate,
    daysUntilExpiry,
    isExpired,
  };
}