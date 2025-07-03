import mongoose, { Document, Schema } from "mongoose";
import { UserType, IUserPlan } from "@/types/userTypes";

export interface IServiceLimit {
  limitType: string;
  maxUsage: number;
  currentUsage: number;
  resetPeriod: "weekly" | "monthly" | "daily" | "none";
  lastReset?: Date;
}

export interface IServiceLimits {
  alyzitron: IServiceLimit[];
  editron: IServiceLimit[];
  shield: IServiceLimit[];
  socialize: IServiceLimit[];
  thinkforge: IServiceLimit[];
  musitron: IServiceLimit[];
  clickatron: IServiceLimit[];
}

export interface IPlan {
  planId: string; // Reference to plans collection
  name: UserType;
  startDate: Date;
  endDate: Date | null;
  price: number;
  currency: string;
  status: "active" | "expired" | "canceled";
  subscriptionId?: { [key: string]: string };
  serviceLimits: IServiceLimits;
}

export interface ISubscription {
  provider: 'razorpay' | 'lemonsqueezy';
  subscriptionId: string;
  planId: string;
  status: "active" | "pending" | "halted" | "cancelled" | "completed" | "expired";
  startDate: Date;
  endDate?: Date;
  latestInvoice?: string;
  paymentMethod?: "card" | "upi" | "netbanking" | "wallet";
}

interface IUser extends Document {
  clerkUserId: string;
  email: string;
  signUpDate: Date;
  currentPlan: IUserPlan;
  planHistory: IUserPlan[];
  subscriptions: ISubscription[];
  trialUsed: boolean; // Track if user has used their one-time trial
  preferences: {
    currency: string;
    notifications: {
      planExpiry: boolean;
      paymentReminders: boolean;
    };
  };
}

const serviceLimitSchema = new Schema<IServiceLimit>({
  limitType: {
    type: String,
    required: true,
  },
  maxUsage: {
    type: Number,
    required: true,
    min: -1, // Allow -1 for unlimited
  },
  currentUsage: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  resetPeriod: {
    type: String,
    enum: ["weekly", "monthly", "daily", "none"],
    required: true,
    default: "weekly",
  },
  lastReset: {
    type: Date,
    required: false,
  },
}, { _id: false });

const serviceLimitsSchema = new Schema<IServiceLimits>({
  alyzitron: {
    type: [serviceLimitSchema],
    default: [],
  },
  editron: {
    type: [serviceLimitSchema],
    default: [],
  },
  shield: {
    type: [serviceLimitSchema],
    default: [],
  },
  socialize: {
    type: [serviceLimitSchema],
    default: [],
  },
  thinkforge: {
    type: [serviceLimitSchema],
    default: [],
  },
  musitron: {
    type: [serviceLimitSchema],
    default: [],
  },
  clickatron: {
    type: [serviceLimitSchema],
    default: [],
  },
}, { _id: false });

const planSchema = new Schema<IPlan>({
  planId: {
    type: String,
    required: true,
    ref: 'Plan'
  },
  name: {
    type: String,
    enum: Object.values(UserType),
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: false,
    default: null,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    enum: ["USD", "INR", "EUR", "GBP", "CAD", "AUD", "SGD", "AED"],
    required: true,
  },
  status: {
    type: String,
    enum: ["active", "expired", "canceled"],
    required: true,
  },
  subscriptionId: {
    type: Map,
    of: String,
  },
  serviceLimits: {
    type: serviceLimitsSchema,
    required: true,
  },
}, { _id: false });

const subscriptionSchema = new Schema<ISubscription>({
  provider: { type: String, required: true, enum: ['razorpay', 'lemonsqueezy'] },
  subscriptionId: { type: String, required: true },
  planId: { type: String, required: true },
  status: {
    type: String,
    enum: ["active", "pending", "halted", "cancelled", "completed", "expired"],
    required: true,
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  latestInvoice: { type: String },
  paymentMethod: {
    type: String,
    enum: ["card", "upi", "netbanking", "wallet"],
  },
}, { _id: false });

const userSchema = new Schema<IUser>({
  clerkUserId: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  signUpDate: {
    type: Date,
    default: Date.now,
  },
  currentPlan: {
    type: planSchema,
    required: true,
  },
  planHistory: {
    type: [planSchema],
    default: [],
  },
  subscriptions: {
    type: [subscriptionSchema],
    default: [],
  },
  trialUsed: {
    type: Boolean,
    default: false,
  },
  preferences: {
    currency: {
      type: String,
      enum: ["USD", "INR", "EUR", "GBP", "CAD", "AUD", "SGD", "AED"],
      required: true,
      default: "USD",
    },
    notifications: {
      planExpiry: { type: Boolean, default: true },
      paymentReminders: { type: Boolean, default: true },
    },
  },
}, {
  timestamps: true,
});

// Indexes for performance (clerkUserId and email already indexed via unique: true)
userSchema.index({ "currentPlan.status": 1 });
userSchema.index({ "subscriptions.subscriptionId": 1 });

// Instance method to get current plan service limits from plans collection
userSchema.methods.getCurrentPlanServiceLimits = async function() {
  const Plan = mongoose.model('Plan');
  try {
    // Handle fallback plan IDs that don't exist in the database
    if (this.currentPlan.planId === "fallback-free-plan" ||
        this.currentPlan.planId === "TEMP-FREE-PLAN" ||
        this.currentPlan.planId === "TEMP-PREMIUM-PLAN") {
      console.warn(`Using fallback plan ID: ${this.currentPlan.planId}, returning current plan serviceLimits`);
      return this.currentPlan.serviceLimits || {};
    }
    const currentPlan = await Plan.findById(this.currentPlan.planId);
    return currentPlan?.serviceLimits || this.currentPlan.serviceLimits || {};
  } catch (error) {
    console.warn(`Invalid plan ID: ${this.currentPlan.planId}, using current plan serviceLimits`);
    return this.currentPlan.serviceLimits || {};
  }
};

// Instance method to get service limit usage info
userSchema.methods.getServiceLimitUsage = function(serviceName: string, limitType: string) {
  const serviceLimit = this.currentPlan.serviceLimits[serviceName]?.find(
    (limit: IServiceLimit) => limit.limitType === limitType
  );
  
  if (!serviceLimit) {
    return { hasAccess: false, maxUsage: 0, currentUsage: 0, remaining: 0 };
  }
  
  return {
    hasAccess: true,
    maxUsage: serviceLimit.maxUsage,
    currentUsage: serviceLimit.currentUsage,
    remaining: serviceLimit.maxUsage === -1 ? -1 : serviceLimit.maxUsage - serviceLimit.currentUsage,
    resetPeriod: serviceLimit.resetPeriod,
    lastReset: serviceLimit.lastReset,
    isUnlimited: serviceLimit.maxUsage === -1
  };
};

// Instance method to increment service limit usage
userSchema.methods.incrementServiceLimitUsage = async function(serviceName: string, limitType: string, increment: number = 1) {
  const serviceLimit = this.currentPlan.serviceLimits[serviceName]?.find(
    (limit: IServiceLimit) => limit.limitType === limitType
  );
  
  if (!serviceLimit) {
    throw new Error(`Service limit not found for: ${serviceName}.${limitType}`);
  }
  
  if (serviceLimit.maxUsage !== -1 && serviceLimit.currentUsage + increment > serviceLimit.maxUsage) {
    throw new Error(`Service usage limit exceeded for: ${serviceName}.${limitType}`);
  }
  
  serviceLimit.currentUsage += increment;
  this.markModified('currentPlan.serviceLimits');
  await this.save();
  
  return serviceLimit.currentUsage;
};

// Instance method to reset service limit usage (for periodic resets)
userSchema.methods.resetServiceLimitUsage = async function(serviceName?: string, limitType?: string) {
  const now = new Date();
  
  if (serviceName && limitType) {
    const serviceLimit = this.currentPlan.serviceLimits[serviceName]?.find(
      (limit: IServiceLimit) => limit.limitType === limitType
    );
    if (serviceLimit) {
      serviceLimit.currentUsage = 0;
      serviceLimit.lastReset = now;
    }
  } else if (serviceName) {
    this.currentPlan.serviceLimits[serviceName]?.forEach((limit: IServiceLimit) => {
      limit.currentUsage = 0;
      limit.lastReset = now;
    });
  } else {
    Object.keys(this.currentPlan.serviceLimits).forEach(service => {
      this.currentPlan.serviceLimits[service].forEach((limit: IServiceLimit) => {
        limit.currentUsage = 0;
        limit.lastReset = now;
      });
    });
  }
  
  this.markModified('currentPlan.serviceLimits');
  await this.save();
};

export const User = mongoose.models.User || mongoose.model<IUser>("User", userSchema);