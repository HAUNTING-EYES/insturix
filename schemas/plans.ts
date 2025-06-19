import mongoose, { Document, Schema } from "mongoose";

export interface IPricing {
  amount: number;
  currency: string;
  symbol: string;
}

export interface IPlanServiceLimit {
  limitType: string;
  description: string;
  maxUsage: number; // -1 for unlimited, 0 for not included
  resetPeriod: "weekly" | "monthly" | "daily" | "none";
}

export interface IPlanServiceLimits {
  alyzitron: IPlanServiceLimit[];
  editron: IPlanServiceLimit[];
  shield: IPlanServiceLimit[];
  socialize: IPlanServiceLimit[];
  thinkforge: IPlanServiceLimit[];
  musitron: IPlanServiceLimit[];
}

export interface IPlan extends Document {
  _id: string;
  name: string;
  type: string;
  description: string;
  serviceLimits: IPlanServiceLimits;
  pricing: {
    USD: IPricing;
    INR: IPricing;
    EUR: IPricing;
    GBP: IPricing;
    CAD: IPricing;
    AUD: IPricing;
    SGD: IPricing;
    AED: IPricing;
  };
  billingPeriod: "monthly" | "yearly";
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const pricingSchema = new Schema<IPricing>({
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    required: true,
    enum: ["USD", "INR", "EUR", "GBP", "CAD", "AUD", "SGD", "AED"],
  },
  symbol: {
    type: String,
    required: true,
  },
}, { _id: false });

const planServiceLimitSchema = new Schema<IPlanServiceLimit>({
  limitType: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  maxUsage: {
    type: Number,
    required: true,
    default: -1, // -1 = unlimited, 0 = not included
  },
  resetPeriod: {
    type: String,
    enum: ["weekly", "monthly", "daily", "none"],
    required: true,
    default: "weekly",
  },
}, { _id: false });

const planServiceLimitsSchema = new Schema<IPlanServiceLimits>({
  alyzitron: {
    type: [planServiceLimitSchema],
    default: [],
  },
  editron: {
    type: [planServiceLimitSchema],
    default: [],
  },
  shield: {
    type: [planServiceLimitSchema],
    default: [],
  },
  socialize: {
    type: [planServiceLimitSchema],
    default: [],
  },
  thinkforge: {
    type: [planServiceLimitSchema],
    default: [],
  },
  musitron: {
    type: [planServiceLimitSchema],
    default: [],
  },
}, { _id: false });

const planSchema = new Schema<IPlan>({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  type: {
    type: String,
    required: true,
    unique: true,
    enum: ["free", "plus", "pro", "premium"],
  },
  description: {
    type: String,
    required: true,
  },
  serviceLimits: {
    type: planServiceLimitsSchema,
    required: true,
  },
  pricing: {
    USD: { type: pricingSchema, required: true },
    INR: { type: pricingSchema, required: true },
    EUR: { type: pricingSchema, required: true },
    GBP: { type: pricingSchema, required: true },
    CAD: { type: pricingSchema, required: true },
    AUD: { type: pricingSchema, required: true },
    SGD: { type: pricingSchema, required: true },
    AED: { type: pricingSchema, required: true },
  },
  billingPeriod: {
    type: String,
    enum: ["monthly", "yearly"],
    default: "monthly",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  sortOrder: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

planSchema.index({ type: 1, isActive: 1 });
planSchema.index({ sortOrder: 1 });

const Plan = mongoose.models.Plan || mongoose.model<IPlan>("Plan", planSchema);
export default Plan;