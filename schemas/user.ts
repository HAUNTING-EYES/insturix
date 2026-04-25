import mongoose, { Document, Schema } from "mongoose";
import { UserType, IUserPlan } from "@/types/userTypes";
import type { IServiceLimit } from "@/lib/config/serviceLimits";

// Re-export from unified configuration
export type { IServiceLimit } from "@/lib/config/serviceLimits";

export interface IServiceLimits {
  alyzitron: IServiceLimit[];
  editron: IServiceLimit[];
  shield: IServiceLimit[];
  // socialize: IServiceLimit[]; // Removed socialize limits
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
  status: "active" | "expired" | "canceled" | "pending";
  subscriptionId?: { [key: string]: string };
  serviceLimits: IServiceLimits;
}

export interface ISubscription {
  provider: 'razorpay';
  subscriptionId: string;
  planId: string;
  status: "active" | "pending" | "halted" | "cancelled" | "completed" | "expired";
  startDate: Date;
  endDate?: Date;
  latestInvoice?: string;
  paymentMethod?: "card" | "upi" | "netbanking" | "wallet";
}

export interface ILinkedInTokens {
  accessToken: string;
  refreshToken?: string;
  userId: string;
  userName: string;
  expiresAt: Date;
  connectedAt: Date;
  scopes?: string[];
  missingScopes?: string[];
  organizations?: Array<{
    id: string;
    name: string;
    vanityName: string;
  }>;
}

export interface IUiMessage {
  id: string; // Unique identifier for the message (e.g., a UUID)
  type: 'modal' | 'banner' | 'disclaimer'; // Type of UI element to display
  title: string;
  message: string;
  location: 'dashboard-overview' | 'manage-plan' | 'global'; // Where to display the message
  style?: { // Optional field for unique styling
    backgroundColor?: string;
    textColor?: string;
    icon?: string;
  };
}

// Credits system interfaces
export interface ICreditTransaction {
  id: string;
  type: 'subscription_grant' | 'topup' | 'usage' | 'refund' | 'expiry' | 'adjustment' | 'bonus';
  amount: number; // Positive for additions, negative for usage
  service?: string; // Which service consumed credits
  action?: string; // What action was performed
  model?: string; // Which model was used
  taskId?: string; // Reference to specific task
  timestamp: Date;
  balanceAfter: number; // Balance after this transaction
  metadata?: Record<string, unknown>; // Additional data
}

// Organization membership for user
export interface IUserOrganization {
  clerkOrgId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
}

export interface ICreditsBalance {
  subscriptionCredits: number; // Monthly credits from subscription (expire)
  topupCredits: number; // Purchased credits (never expire)
  lastSubscriptionGrant: Date | null; // When subscription credits were last granted
  subscriptionCreditsExpiry: Date | null; // When current subscription credits expire
  creditHistory: ICreditTransaction[]; // Transaction history (capped)
}

interface IUser extends Document {
  clerkUserId: string;
  username?: string; // Made optional to handle OAuth sign-ups
  email: string;
  signUpDate: Date;
  currentPlan: IUserPlan;
  planHistory: IUserPlan[];
  subscriptions: ISubscription[];
  uiMessages: IUiMessage[];
  trialUsed: boolean; // Track if user has used their one-time trial
  creditsBalance: ICreditsBalance; // Credits system balance
  organizations: IUserOrganization[]; // User's organization memberships
  preferences: {
    currency: string;
    notifications: {
      planExpiry: boolean;
      paymentReminders: boolean;
    };
  };
  facebookTokens?: {
    userAccessToken: string;
    userId: string;
    userName: string;
    pages: Array<{
      pageId: string;
      pageName: string;
      pageAccessToken: string;
    }>;
    connectedAt: Date;
  };
  instagramTokens?: {
    userAccessToken: string;
    userId: string;
    userName: string;
    accounts: Array<{
      instagramAccountId: string;
      instagramUsername: string;
      profilePictureUrl: string | null;
      facebookPageId: string;
      facebookPageName: string;
      facebookPageAccessToken: string;
    }>;
    connectedAt: Date;
  };
  twitterTokens?: {
    accessToken: string;
    refreshToken: string;
    userId: string;
    userName: string;
    expiresAt: Date;
    connectedAt: Date;
    scopes?: string[];
    missingScopes?: string[];
  };
  linkedinTokens?: ILinkedInTokens;
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
  // socialize: {
  //   type: [serviceLimitSchema],
  //   default: [],
  // },
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
    enum: ["active", "expired", "canceled", "pending"],
    required: true,
  },
  subscriptionId: {
    type: Map,
    of: String,
  },
  serviceLimits: {
    type: serviceLimitsSchema,
    required: true,
    default: undefined, // Will be populated using unified configuration
  },
}, { _id: false });

const subscriptionSchema = new Schema<ISubscription>({
  provider: { type: String, required: true, enum: ['razorpay'] },
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

// Credits transaction schema
const creditTransactionSchema = new Schema<ICreditTransaction>({
  id: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: ['subscription_grant', 'topup', 'usage', 'refund', 'expiry', 'adjustment', 'bonus'],
  },
  amount: { type: Number, required: true },
  service: { type: String },
  action: { type: String },
  model: { type: String },
  taskId: { type: String },
  timestamp: { type: Date, required: true, default: Date.now },
  balanceAfter: { type: Number, required: true },
  metadata: { type: Schema.Types.Mixed },
}, { _id: false });

// Credits balance schema
const creditsBalanceSchema = new Schema<ICreditsBalance>({
  subscriptionCredits: { type: Number, required: true, default: 0, min: 0 },
  topupCredits: { type: Number, required: true, default: 0, min: 0 },
  lastSubscriptionGrant: { type: Date, default: null },
  subscriptionCreditsExpiry: { type: Date, default: null },
  creditHistory: {
    type: [creditTransactionSchema],
    default: [],
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
  username: {
    type: String,
    required: false, // Changed from true to false to handle OAuth sign-ups
    unique: true,
    sparse: true, // Allow multiple documents with undefined username
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
  uiMessages: {
    type: [new Schema<IUiMessage>({
      id: { type: String, required: true },
      type: { type: String, required: true, enum: ['modal', 'banner', 'disclaimer'] },
      title: { type: String, required: true },
      message: { type: String, required: true },
      location: { type: String, required: true, enum: ['dashboard-overview', 'manage-plan', 'global'] },
      style: {
        backgroundColor: { type: String },
        textColor: { type: String },
        icon: { type: String },
      },
    }, { _id: false })],
    default: [],
  },
  trialUsed: {
    type: Boolean,
    default: false,
  },
  creditsBalance: {
    type: creditsBalanceSchema,
    default: () => ({
      subscriptionCredits: 0,
      topupCredits: 0,
      lastSubscriptionGrant: null,
      subscriptionCreditsExpiry: null,
      creditHistory: [],
    }),
  },
  organizations: {
    type: [new Schema<IUserOrganization>({
      clerkOrgId: { type: String, required: true },
      role: { type: String, required: true, enum: ['owner', 'admin', 'member'] },
      joinedAt: { type: Date, required: true, default: Date.now },
    }, { _id: false })],
    default: [],
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
  facebookTokens: {
    userAccessToken: String,
    userId: String,
    userName: String,
    pages: [{
      pageId: String,
      pageName: String,
      pageAccessToken: String,
      _id: false
    }],
    connectedAt: Date,
  },
  instagramTokens: {
    userAccessToken: String,
    userId: String,
    userName: String,
    accounts: [{
      instagramAccountId: String,
      instagramUsername: String,
      profilePictureUrl: String,
      facebookPageId: String,
      facebookPageName: String,
      facebookPageAccessToken: String,
      _id: false
    }],
    connectedAt: Date,
  },
  twitterTokens: {
    accessToken: String,
    refreshToken: String,
    userId: String,
    userName: String,
    expiresAt: Date,
    connectedAt: Date,
    scopes: [String],
    missingScopes: [String],
  },
  linkedinTokens: {
    accessToken: String,
    refreshToken: String,
    userId: String,
    userName: String,
    expiresAt: Date,
    connectedAt: Date,
    scopes: [String],
    missingScopes: [String],
    organizations: [{
      id: String,
      name: String,
      vanityName: String,
      _id: false
    }],
  },
}, {
  timestamps: true,
});

// Indexes for performance (clerkUserId and email already indexed via unique: true)
userSchema.index({ "currentPlan.status": 1 });
userSchema.index({ "subscriptions.subscriptionId": 1 });

// Instance method to get current plan service limits from plans collection
userSchema.methods.getCurrentPlanServiceLimits = async function () {
  const Plan = mongoose.model('Plan');
  try {
    const currentPlan = await Plan.findById(this.currentPlan.planId);
    if (!currentPlan) {
      console.error(`Plan not found for ID: ${this.currentPlan.planId}. This indicates a data inconsistency.`);
      // In a real application, you might want to log this error more robustly
      // or trigger an alert. For now, we'll return the current plan's service limits
      // as a last resort, though this should ideally not happen.
      return this.currentPlan.serviceLimits || {};
    }
    return currentPlan.serviceLimits;
  } catch (error) {
    console.error(`Error fetching plan for ID: ${this.currentPlan.planId}. Details: ${error instanceof Error ? error.message : String(error)}`);
    // If there's an error (e.g., invalid ID format, DB connection issue),
    // return the current plan's service limits as a fallback.
    return this.currentPlan.serviceLimits || {};
  }
};

// Instance method to get service limit usage info
userSchema.methods.getServiceLimitUsage = function (serviceName: string, limitType: string) {
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
userSchema.methods.incrementServiceLimitUsage = async function (serviceName: string, limitType: string, increment: number = 1) {
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
userSchema.methods.resetServiceLimitUsage = async function (serviceName?: string, limitType?: string) {
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
