import connectToDatabase from "@/schemas/ConnectToDatabase";
import User, { IPlan } from "@/schemas/user";
import Plan from "@/schemas/plans";
import { UserType } from "@/types/userTypes";

// Get plan price for specific currency
export async function getPlanPrice(planType: UserType, currency: string = "USD"): Promise<number> {
  await connectToDatabase();
  
  const plan = await Plan.findOne({ type: planType, isActive: true });
  if (!plan || !plan.pricing[currency]) {
    throw new Error(`Plan ${planType} not found or currency ${currency} not supported`);
  }
  
  return plan.pricing[currency].amount;
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
    billingPeriod: plan.billingPeriod
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

  // Mark trial as used if this is their first paid plan cancellation
  if (!user.trialUsed && isWithinTrialPeriod) {
    user.trialUsed = true;
  }

  // Move current plan to history
  const expiredPlan = {
    ...user.currentPlan,
    status: "canceled" as const,
    endDate: now,
  };
  
  const planExists = user.planHistory.some((plan: IPlan) =>
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
  
  // Extract clean serviceLimits from Mongoose document
  const cleanServiceLimits = freePlan.serviceLimits.toObject ? freePlan.serviceLimits.toObject() : freePlan.serviceLimits;
  
  const serviceLimits = UserInitializationService.convertPlanLimitsToUserLimits(cleanServiceLimits);

  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

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
    refundEligible: isWithinTrialPeriod && !user.trialUsed,
    daysUsed: daysSinceStart,
    refundAmount: isWithinTrialPeriod ? expiredPlan.price : 0,
  };
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
  paymentDetails: {
    paymentId: string;
    orderId: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    razorpayPaymentId?: string;
    razorpayOrderId?: string;
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


  // Add current plan to history before expiring it
  if (user.currentPlan && user.currentPlan.status === "active") {
    // Check if this plan is already in history
    const planExists = user.planHistory.some((plan: IPlan) =>
      plan.planId === user.currentPlan.planId &&
      plan.startDate.getTime() === user.currentPlan.startDate.getTime()
    );
    
    if (!planExists) {
      // Ensure all required fields are present
      const currentPlanForHistory: IPlan = {
        planId: user.currentPlan.planId || "",
        name: user.currentPlan.name,
        startDate: user.currentPlan.startDate,
        endDate: new Date(), // Set end date to now since we're expiring it
        price: user.currentPlan.price || 0,
        currency: user.currentPlan.currency || paymentDetails.currency,
        status: "expired" as const,
        serviceLimits: user.currentPlan.serviceLimits, // Keep existing service limits
      };
      
      user.planHistory.push(currentPlanForHistory);
    }
    
    // Now expire current plan
    user.currentPlan.status = "expired";
    user.currentPlan.endDate = new Date();
  }

  // Create new plan with service limits from database plan
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1);

  // Import the conversion utility
  const { UserInitializationService } = await import("./userInitializationService");
  
  // Ensure we have valid serviceLimits from the plan
  if (!dbPlan.serviceLimits) {
    console.error(`Plan ${newPlanType} does not have serviceLimits defined. Using fallback.`);
    throw new Error(`Plan ${newPlanType} configuration is invalid - missing serviceLimits`);
  }
  
  // Extract clean serviceLimits from Mongoose document
  const cleanServiceLimits = dbPlan.serviceLimits.toObject ? dbPlan.serviceLimits.toObject() : dbPlan.serviceLimits;
  
  const serviceLimits = UserInitializationService.convertPlanLimitsToUserLimits(cleanServiceLimits);

  const newPlan = {
    planId: dbPlan._id.toString(),
    name: newPlanType,
    startDate: new Date(),
    endDate,
    price: paymentDetails.amount,
    currency: paymentDetails.currency,
    status: "active" as const,
    serviceLimits,
  };

  // Add payment record
  user.payments.push({
    paymentId: paymentDetails.paymentId,
    orderId: paymentDetails.orderId,
    timestamp: new Date(),
    amount: paymentDetails.amount,
    currency: paymentDetails.currency,
    status: "completed",
    paymentMethod: paymentDetails.paymentMethod as any,
    planName: dbPlan.name,
    razorpayPaymentId: paymentDetails.razorpayPaymentId,
    razorpayOrderId: paymentDetails.razorpayOrderId,
  });

  user.currentPlan = newPlan;
  
  // Update user preferences if different currency
  if (user.preferences.currency !== paymentDetails.currency) {
    user.preferences.currency = paymentDetails.currency;
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
