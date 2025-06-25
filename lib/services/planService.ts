import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User } from "@/schemas/user";
import Plan from "@/schemas/plans";
import { UserType, IUserPlan } from "@/types/userTypes";

// Get plan price for specific currency
export async function getPlanPrice(planType: UserType, currency: string = "USD", billingCycle: 'monthly' | 'yearly' = 'monthly'): Promise<number> {
  await connectToDatabase();
  
  const plan = await Plan.findOne({ type: planType, isActive: true });
  if (!plan || !plan.pricing[currency] || !plan.pricing[currency][billingCycle]) {
    throw new Error(`Plan ${planType} not found or currency ${currency} with ${billingCycle} billing not supported`);
  }
  
  return plan.pricing[currency][billingCycle].amount;
}

// Get plan service limits
export async function getPlanServiceLimits(planType: UserType) {
  await connectToDatabase();
  
  const plan = await Plan.findOne({ type: planType, isActive: true });
  if (!plan) {
    throw new Error(`Plan ${planType} not found`);
  }
  
  return plan.serviceLimits;
}

// Get all active plans for a currency
export async function getPlansForCurrency(currency: string = "USD") {
  await connectToDatabase();
  
  const plans = await Plan.find({ isActive: true }).sort({ sortOrder: 1 });
  
  return plans.map(plan => ({
    id: plan._id.toString(),
    name: plan.name,
    type: plan.type,
    description: plan.description,
    pricing: plan.pricing[currency] || plan.pricing.USD,
    serviceLimits: plan.serviceLimits,
  }));
}

// Cancel user plan with trial refund logic
export async function cancelUserPlan(clerkUserId: string) {
  await connectToDatabase();
  
  const user = await User.findOne({ clerkUserId });
  if (!user) {
    throw new Error("User not found");
  }

  if (!user.currentPlan || user.currentPlan.name === UserType.Free) {
    throw new Error("User is already on free plan");
  }

  // Check if within trial period (7 days)
  const planStartDate = new Date(user.currentPlan.startDate);
  const now = new Date();
  const daysSinceStart = Math.floor((now.getTime() - planStartDate.getTime()) / (1000 * 60 * 60 * 24));
  const isWithinTrialPeriod = daysSinceStart <= 7;

  if (isWithinTrialPeriod && !user.trialUsed) {
    // Mark trial as used
    user.trialUsed = true;

    // Move current plan to history
    const expiredPlan = {
      ...user.currentPlan,
      status: "canceled" as const,
      endDate: now,
    };
    const planExists = user.planHistory.some((plan: IUserPlan) =>
      plan.planId === user.currentPlan.planId &&
      plan.startDate.getTime() === user.currentPlan.startDate.getTime()
    );
    if (!planExists) {
      user.planHistory.push(expiredPlan);
    }

    // Create free plan with service limits
    const freePlan = await Plan.findOne({ type: UserType.Free, isActive: true });
    if (!freePlan) {
      throw new Error("Free plan not found");
    }
    const { UserInitializationService } = await import("./userInitializationService");
    const cleanServiceLimits = freePlan.serviceLimits.toObject ? freePlan.serviceLimits.toObject() : freePlan.serviceLimits;
    const serviceLimits = UserInitializationService.convertPlanLimitsToUserLimits(cleanServiceLimits);
    user.currentPlan = {
      planId: freePlan._id.toString(),
      name: UserType.Free,
      startDate: now,
      endDate: null, // Free plan never expires
      price: 0,
      currency: user.preferences.currency,
      status: "active",
      serviceLimits,
    };
    await user.save();
    return {
      success: true,
      refundEligible: true,
      daysUsed: daysSinceStart,
      refundAmount: expiredPlan.price,
    };
  } else {
    // Not in trial: schedule cancellation at period end
    user.currentPlan.cancelAtPeriodEnd = true;
    user.currentPlan.status = "canceled";
    // Do NOT move to free plan yet; let cron/expiration handle it
    await user.save();
    return {
      success: true,
      refundEligible: false,
      daysUsed: daysSinceStart,
      refundAmount: 0,
    };
  }
}

// Check if user is eligible for trial refund
export async function checkTrialRefundEligibility(clerkUserId: string) {
  await connectToDatabase();
  
  const user = await User.findOne({ clerkUserId });
  if (!user) {
    throw new Error("User not found");
  }

  if (!user.currentPlan || user.currentPlan.name === UserType.Free) {
    return { eligible: false, reason: "User is on free plan" };
  }

  const planStartDate = new Date(user.currentPlan.startDate);
  const now = new Date();
  const daysSinceStart = Math.floor((now.getTime() - planStartDate.getTime()) / (1000 * 60 * 60 * 24));
  const isWithinTrialPeriod = daysSinceStart <= 7;

  return {
    eligible: isWithinTrialPeriod && !user.trialUsed,
    daysUsed: daysSinceStart,
    daysRemaining: Math.max(0, 7 - daysSinceStart),
    trialUsed: user.trialUsed,
    currentPlan: user.currentPlan.name,
    planStartDate: planStartDate,
  };
}

// Update user plan after successful payment
export async function updateUserPlan(
  clerkUserId: string,
  newPlanType: UserType,
  subscriptionDetails: {
    provider: 'razorpay' | 'lemonsqueezy';
    subscriptionId: string;
    planId: string;
    amount: number;
    currency: string;
    paymentMethod?: "card" | "upi" | "netbanking" | "wallet";
    latestInvoice?: string;
  }
) {
  await connectToDatabase();
  
  const user = await User.findOne({ clerkUserId });
  if (!user) {
    throw new Error("User not found");
  }

  const dbPlan = await Plan.findOne({ type: newPlanType, isActive: true });
  if (!dbPlan) {
    console.error(`Plan ${newPlanType} not found in database. Please run setupPlans script first.`);
    throw new Error(`Plan ${newPlanType} not found. Database setup is incomplete - run 'npm run setup-plans' first.`);
  }

  // If there's an active plan, move it to history
  if (user.currentPlan && user.currentPlan.status === "active") {
    const currentPlanAsHistory = {
      ...user.currentPlan.toObject(),
      status: "expired" as const,
      endDate: new Date(),
    };
    user.planHistory.push(currentPlanAsHistory);
  }

  // Create the new plan
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  const { UserInitializationService } = await import("./userInitializationService");
  const cleanServiceLimits = dbPlan.serviceLimits.toObject ? dbPlan.serviceLimits.toObject() : dbPlan.serviceLimits;
  const serviceLimits = UserInitializationService.convertPlanLimitsToUserLimits(cleanServiceLimits);

  const newPlan = {
    planId: dbPlan._id.toString(),
    name: newPlanType,
    startDate,
    endDate,
    price: subscriptionDetails.amount,
    currency: subscriptionDetails.currency,
    status: "active" as const,
    subscriptionId: { [subscriptionDetails.provider]: subscriptionDetails.subscriptionId },
    serviceLimits,
  };

  user.currentPlan = newPlan;

  // Add subscription record, preventing duplicates
  const subscriptionExists = user.subscriptions.some((s: any) => s.subscriptionId === subscriptionDetails.subscriptionId);
  if (!subscriptionExists) {
    user.subscriptions.push({
      provider: subscriptionDetails.provider,
      subscriptionId: subscriptionDetails.subscriptionId,
      planId: subscriptionDetails.planId,
      status: "active",
      startDate: new Date(),
      latestInvoice: subscriptionDetails.latestInvoice,
      paymentMethod: subscriptionDetails.paymentMethod,
    });
  }
  
  // Update user preferences if different currency
  if (user.preferences.currency !== subscriptionDetails.currency) {
    user.preferences.currency = subscriptionDetails.currency;
  }

  // Mark trial as used for first paid plan upgrade
  if (!user.trialUsed && user.currentPlan.name === UserType.Free) {
    user.trialUsed = true;
  }

  await user.save();
  return user;
}

// Get user plan with service limits
export async function getUserPlanWithServiceLimits(clerkUserId: string) {
  await connectToDatabase();
  
  const user = await User.findOne({ clerkUserId });
  if (!user) {
    throw new Error("User not found");
  }

  const serviceLimits = await user.getCurrentPlanServiceLimits();
  
  return {
    ...user.currentPlan,
    serviceLimits,
  };
}

// Check if user has specific service access
export async function checkServiceAccess(clerkUserId: string, serviceName: string, limitType: string): Promise<boolean> {
  await connectToDatabase();
  
  const user = await User.findOne({ clerkUserId });
  if (!user) {
    return false;
  }

  const usage = user.getServiceLimitUsage(serviceName, limitType);
  return usage.hasAccess && (usage.isUnlimited || usage.remaining > 0);
}

// Expire user plan (for cron jobs)
export async function expireUserPlan(clerkUserId: string) {
  await connectToDatabase();
  
  const user = await User.findOne({ clerkUserId });
  if (!user) {
    throw new Error("User not found");
  }

  if (user.currentPlan.status === "active") {
    user.currentPlan.status = "expired";
    user.currentPlan.endDate = new Date();

    // Create free plan with service limits
    const freePlan = await Plan.findOne({ type: UserType.Free, isActive: true });
    if (!freePlan) {
      throw new Error("Free plan not found");
    }

    const { UserInitializationService } = await import("./userInitializationService");
    const serviceLimits = UserInitializationService.convertPlanLimitsToUserLimits(freePlan.serviceLimits);

    const now = new Date();

    user.currentPlan = {
      planId: freePlan._id.toString(),
      name: UserType.Free,
      startDate: now,
      endDate: null, // Free plan never expires
      price: 0,
      currency: user.preferences.currency,
      status: "active",
      serviceLimits,
    };

    await user.save();
  }

  return user;
}
