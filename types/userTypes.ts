export enum UserType {
  Free = "free",
  Plus = "plus",
  Pro = "pro",
  Premium = "premium",
}

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
  // socialize: IServiceLimit[]; // Removed socialize limits
  thinkforge: IServiceLimit[];
  musitron: IServiceLimit[];
  clickatron: IServiceLimit[];
}

export interface IPlan {
  planId: string;
  name: UserType;
  startDate: Date;
  endDate: Date | null;
  price: number;
  currency: string;
  status: "active" | "expired" | "canceled" | "pending";
  serviceLimits: IServiceLimits;
}

export interface IPayment {
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

export interface IUiMessage {
  id: string;
  type: 'modal' | 'banner' | 'disclaimer';
  title: string;
  message: string;
  location: 'dashboard-overview' | 'manage-plan' | 'global';
  style?: {
    backgroundColor?: string;
    textColor?: string;
    icon?: string;
  };
}

export interface User {
  _id?: string;
  clerkUserId: string;
  email: string;
  signUpDate: Date;
  currentPlan: IUserPlan;
  planHistory: IUserPlan[];
  payments: IPayment[];
  trialUsed: boolean;
  uiMessages: IUiMessage[];
  preferences: {
    currency: string;
    notifications: {
      planExpiry: boolean;
      paymentReminders: boolean;
    };
  };
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
}

export interface IUserPlan extends IPlan {
  razorpaySubscriptionId?: string;
  cancelAtPeriodEnd?: boolean;
}
