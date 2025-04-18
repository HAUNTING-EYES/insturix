import User from "@/schemas/user";
import { UserType } from "@/types/userTypes";
import { IPlan } from "@/schemas/user";

interface PlanPricing {
  [key: string]: number;
}

// Plan prices
const planPrices: PlanPricing = {
  [UserType.Free]: 0,
  [UserType.Pro]: 9.99,
  [UserType.Premium]: 19.99,
  [UserType.Ultra]: 29.99,
  [UserType.Exclusive]: 49.99,
};

// Features for each plan type
const planFeatures: { [key: string]: string[] } = {
  [UserType.Free]: ["Basic access", "Limited storage", "Community support"],
  [UserType.Pro]: [
    "Everything in Free",
    "Advanced features",
    "Priority support",
    "More storage",
  ],
  [UserType.Premium]: [
    "Everything in Pro",
    "Premium features",
    "Dedicated support",
    "Enhanced storage",
    "Custom integrations",
  ],
  [UserType.Ultra]: [
    "Everything in Premium",
    "Ultra features",
    "24/7 support",
    "Unlimited storage",
    "Advanced analytics",
    "Custom solutions",
  ],
  [UserType.Exclusive]: [
    "Everything in Ultra",
    "Exclusive features",
    "Personal account manager",
    "White-glove support",
    "Enterprise solutions",
    "Custom development",
  ],
};

// Create a new user with free plan
export async function createUserWithFreePlan(clerkUserId: string, email: string) {
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
) {
  const user = await User.findOne({ clerkUserId });

  if (!user) {
    throw new Error("User not found");
  }

  // Mark the current plan as expired if it exists
  if (user.currentPlan && user.currentPlan.status === "active") {
    user.currentPlan.status = "expired";
    user.currentPlan.endDate = new Date();

    // Find the plan in the history and update it too
    const planIndex = user.planHistory.findIndex(
      (plan: IPlan) => 
        plan.status === "active" && 
        plan.name === user.currentPlan.name
    );

    if (planIndex !== -1) {
      user.planHistory[planIndex].status = "expired";
      user.planHistory[planIndex].endDate = new Date();
    }
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
  });

  // Update user type
  user.userType = newPlanType;

  // Set current plan
  user.currentPlan = newPlan;
  // No need to push to planHistory here as the pre-save middleware will handle it

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

  // Find the plan in the history and update it too
  const planIndex = user.planHistory.findIndex(
    (plan: IPlan) => 
      plan.status === "active" && 
      plan.name === user.currentPlan.name
  );

  if (planIndex !== -1) {
    user.planHistory[planIndex].status = "canceled";
    user.planHistory[planIndex].endDate = new Date();
  }

  // Set user type back to Free
  user.userType = UserType.Free;

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
  // No need to push to planHistory here as the pre-save middleware will handle it

  await user.save();
  return user;
} 