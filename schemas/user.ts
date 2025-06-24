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
}

export interface IPlan {
  planId: string; // Reference to plans collection
  name: UserType;
  startDate: Date;
  endDate: Date | null;
  price: number;
  currency: string;
  status: "active" | "expired" | "canceled";
  razorpaySubscriptionId?: string;
  serviceLimits: IServiceLimits;
}

interface IPayment {
  paymentId: string;
  orderId: string;
  timestamp: Date;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded";
  paymentMethod: "card" | "upi" | "netbanking" | "wallet";
  planName: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
}

interface IUser extends Document {
  clerkUserId: string;
  email: string;
  signUpDate: Date;
  currentPlan: IUserPlan;
  planHistory: IUserPlan[];
  payments: IPayment[];
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
  serviceLimits: {
    type: serviceLimitsSchema,
    required: true,
    default: function() {
      const now = new Date();
      return {
        alyzitron: [
          {
            limitType: "maxTotalAnalysis",
            maxUsage: 10,
            currentUsage: 0,
            resetPeriod: "weekly",
            lastReset: now,
          },
          {
            limitType: "maxOver20MinuteAnalysis",
            maxUsage: 3,
            currentUsage: 0,
            resetPeriod: "weekly",
            lastReset: now,
          },
          {
            limitType: "maxConcurrentTasks",
            maxUsage: 2,
            currentUsage: 0,
            resetPeriod: "none",
            lastReset: now,
          },
        ],
        editron: [
          {
            limitType: "maxVideoEdits",
            maxUsage: 1,
            currentUsage: 0,
            resetPeriod: "monthly",
            lastReset: now,
          },
        ],
        shield: [
          {
            limitType: "maxScans",
            maxUsage: 3,
            currentUsage: 0,
            resetPeriod: "monthly",
            lastReset: now,
          },
        ],
        socialize: [
          {
            limitType: "maxSocialLinks",
            maxUsage: 5,
            currentUsage: 0,
            resetPeriod: "none",
            lastReset: now,
          },
        ],
        thinkforge: [
          {
            limitType: "maxAIChats",
            maxUsage: 10,
            currentUsage: 0,
            resetPeriod: "monthly",
            lastReset: now,
          },
        ],
        musitron: [
          {
            limitType: "maxMusicGeneration",
            maxUsage: 3,
            currentUsage: 0,
            resetPeriod: "monthly",
            lastReset: now,
          },
        ],
      };
    },
  },
}, { _id: false });

const paymentSchema = new Schema<IPayment>({
  paymentId: {
    type: String,
    required: true,
  },
  orderId: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    required: true,
  },
  amount: {
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
    enum: ["pending", "completed", "failed", "refunded"],
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ["card", "upi", "netbanking", "wallet"],
    required: true,
  },
  planName: {
    type: String,
    required: true,
  },
  razorpayPaymentId: {
    type: String,
    required: false,
  },
  razorpayOrderId: {
    type: String,
    required: false,
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
  payments: {
    type: [paymentSchema],
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
userSchema.index({ "payments.paymentId": 1 });

// Automatically add to plan history when plan changes
userSchema.pre("save", function (next) {
  if (this.isNew || this.isModified("currentPlan")) {
    // Ensure currentPlan is valid before adding to history
    if (this.currentPlan && this.currentPlan.planId && this.currentPlan.currency && this.currentPlan.name) {
      const planExists = this.planHistory.some((plan) =>
        plan.planId === this.currentPlan.planId &&
        plan.startDate.getTime() === this.currentPlan.startDate.getTime()
      );
      
      if (!planExists) {
        this.planHistory.push(this.currentPlan);
      }
    }
  }
  next();
});

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

const User = mongoose.models.User || mongoose.model<IUser>("User", userSchema);
export default User;