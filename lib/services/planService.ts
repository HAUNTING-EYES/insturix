import User from "@/schemas/user";
import { UserType } from "@/types/userTypes";
import type { IPlan } from "@/schemas/user";

interface PlanPricing {
  [key: string]: number;
}

// Plan prices - updated to match the current user types
const planPrices: PlanPricing = {
  [UserType.Free]: 0,
  [UserType.Plus]: 9.99,
  [UserType.Pro]: 19.99,
  [UserType.Premium]: 29.99,
};

// Features for each plan type - updated to match the current user types
const planFeatures: { [key: string]: string[] } = {
  [UserType.Free]: ["Basic access", "Limited storage", "Community support"],
  [UserType.Plus]: [
    "Plus access",
    "10GB storage",
    "Priority support",
    "Advanced features",
  ],
  [UserType.Pro]: [
    "Premium access",
    "50GB storage",
    "24/7 support",
    "All features",
    "Custom branding",
  ],
  [UserType.Premium]: [
    "Ultra access",
    "100GB storage",
    "Dedicated support",
    "All features",
    "Custom branding",
    "API access",
  ],
};

// Create a new user with free plan
export async function createUserWithFreePlan(
  clerkUserId: string,
  email: string
) {
  const user = new User({
    clerkUserId,
    email,
    userType: UserType.Free,
    signUpDate: new Date(),
    payments: [],
  });

  // The default free plan is set in the schema
  await user.save();
  return user;
}

// Update user to a new plan
export async function updateUserPlan(
  clerkUserId: string,
  newPlanType: UserType,
  paymentId: string,
  phoneNumber: string
) {
  const user = await User.findOne({ clerkUserId });

  if (!user) {
    throw new Error("User not found");
  }

  // Mark ALL existing active plans as expired
  for (let i = 0; i < user.planHistory.length; i++) {
    if (user.planHistory[i].status === "active") {
      user.planHistory[i].status = "expired";
      user.planHistory[i].endDate = new Date();
    }
  }

  // Mark the current plan as expired if it exists
  if (user.currentPlan && user.currentPlan.status === "active") {
    user.currentPlan.status = "expired";
    user.currentPlan.endDate = new Date();
  }

  // Calculate end date (1 month from now)
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1);

  // Create a new plan
  const newPlan = {
    name: newPlanType,
    startDate: new Date(),
    endDate,
    price: planPrices[newPlanType],
    status: "active" as const,
    features: planFeatures[newPlanType],
  };

  // Add payment record
  user.payments.push({
    date: new Date(),
    time: new Date().toLocaleTimeString(),
    amount: planPrices[newPlanType],
    payment_id: paymentId,
    phone_number: phoneNumber,
  });

  // Update user type
  user.userType = newPlanType;

  // Set current plan
  user.currentPlan = newPlan;

  // Explicitly add to plan history instead of relying on middleware
  user.planHistory.push(newPlan);

  // Mark modified nested objects
  user.markModified("currentPlan");
  user.markModified("planHistory");
  user.markModified("payments");

  await user.save();
  return user;
}

// Cancel user's current plan
export async function cancelUserPlan(clerkUserId: string) {
  const user = await User.findOne({ clerkUserId });

  if (!user) {
    throw new Error("User not found");
  }

  // Only proceed if there's an active plan
  if (!user.currentPlan || user.currentPlan.status !== "active") {
    throw new Error("No active plan to cancel");
  }

  // Mark the current plan as canceled
  user.currentPlan.status = "canceled";
  user.currentPlan.endDate = new Date();

  // Find and update the plan in the history
  const planIndex = user.planHistory.findIndex(
    (plan: IPlan) =>
      plan.status === "active" && plan.name === user.currentPlan.name
  );

  if (planIndex !== -1) {
    user.planHistory[planIndex].status = "canceled";
    user.planHistory[planIndex].endDate = new Date();
  }

  // Set user type back to Free
  user.userType = UserType.Free;

  // CRITICAL FIX: Remove any existing active Free plans from history
  // This prevents duplicate Free plans when canceling
  for (let i = 0; i < user.planHistory.length; i++) {
    if (
      user.planHistory[i].name === UserType.Free &&
      user.planHistory[i].status === "active"
    ) {
      // Either remove it or mark as expired
      user.planHistory[i].status = "expired";
      user.planHistory[i].endDate = new Date();
    }
  }

  // Set up a new free plan
  const oneMonthLater = new Date();
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

  const freePlan = {
    name: UserType.Free,
    startDate: new Date(),
    endDate: oneMonthLater,
    price: 0,
    status: "active" as const,
    features: planFeatures[UserType.Free],
  };

  // Set current plan
  user.currentPlan = freePlan;

  // Explicitly add to plan history instead of relying on middleware
  user.planHistory.push(freePlan);

  // Mark modified nested objects
  user.markModified("currentPlan");
  user.markModified("planHistory");

  await user.save();
  return user;
}

// Add this function to fix existing users with duplicate Free plans
export async function fixDuplicateFreePlans(clerkUserId: string) {
  const user = await User.findOne({ clerkUserId });

  if (!user) {
    throw new Error("User not found");
  }

  // Count active Free plans
  let activeFreePlans = 0;
  let lastActiveFreePlanIndex = -1;

  for (let i = 0; i < user.planHistory.length; i++) {
    if (
      user.planHistory[i].name === UserType.Free &&
      user.planHistory[i].status === "active"
    ) {
      activeFreePlans++;
      lastActiveFreePlanIndex = i;
    }
  }

  // If there are multiple active Free plans, fix them
  if (activeFreePlans > 1) {
    for (let i = 0; i < user.planHistory.length; i++) {
      if (
        user.planHistory[i].name === UserType.Free &&
        user.planHistory[i].status === "active" &&
        i !== lastActiveFreePlanIndex
      ) {
        // Mark all but the last one as expired
        user.planHistory[i].status = "expired";
        user.planHistory[i].endDate = new Date();
      }
    }

    // Make sure currentPlan points to the remaining active Free plan
    if (lastActiveFreePlanIndex !== -1) {
      user.currentPlan = user.planHistory[lastActiveFreePlanIndex];
    }

    user.markModified("currentPlan");
    user.markModified("planHistory");

    await user.save();
  }

  return user;
}

// Get the latest plan and clean up duplicate active plans
export async function getAndCleanLatestPlan(clerkUserId: string) {
  const user = await User.findOne({ clerkUserId });

  if (!user) {
    throw new Error("User not found");
  }

  // Find all active plans first
  const activePlans: IPlan[] = user.planHistory.filter((plan: IPlan) => plan.status === "active");
  
  // If we have more than one active plan, we need to fix this
  if (activePlans.length > 1) {
    // Sort by start date (newest first)
    const sortedActivePlans = [...activePlans].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );

    // Keep only the first one (most recent) active
    const mostRecentPlan = sortedActivePlans[0];
    
    // Deactivate all other plans
    for (let i = 0; i < user.planHistory.length; i++) {
      const plan = user.planHistory[i];
      if (plan.status === "active" && 
          !(plan.name === mostRecentPlan.name && 
            plan.startDate.toString() === mostRecentPlan.startDate.toString())) {
        user.planHistory[i].status = "expired";
        user.planHistory[i].endDate = new Date();
      }
    }

    // Make sure currentPlan points to the most recent active plan
    user.currentPlan = mostRecentPlan;

    user.markModified("currentPlan");
    user.markModified("planHistory");

    await user.save();
    
    return mostRecentPlan;
  }

  // If we have exactly one active plan, make sure it's set as current
  if (activePlans.length === 1) {
    // Make sure currentPlan points to the active plan
    user.currentPlan = activePlans[0];
    user.markModified("currentPlan");
    await user.save();
    return activePlans[0];
  }

  // If no active plans, return the current plan
  return user.currentPlan;
}
