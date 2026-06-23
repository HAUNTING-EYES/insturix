import mongoose, { Schema, Document, models } from "mongoose";
import { CALOS_OBJECTIVES, DEFAULT_OBJECTIVE, type CalosObjective } from "@/lib/calos/campaign-intent";

export type CalosCampaignStatus = "draft" | "active" | "archived";

/**
 * A cadence rule = a per-platform posting target for a campaign. The auto-fill / AI-plan
 * engines read these to propose how many posts of each kind land where, and on which days.
 */
export interface CalosCadenceRule {
  platform: string; // 'youtube' | 'instagram' | 'linkedin' | 'facebook' | 'twitter' | string
  perWeek: number; // target posts per week for this platform
  preferredDays: number[]; // 0=Sun .. 6=Sat (date-fns convention)
}

/**
 * CalOS campaign = the strategy container for a client/brand. It owns cadence + goals + a
 * date range; deliverables reference it via campaignId. Brand-scoped, owner-scoped (mirrors
 * calos_deliverables: ownerUserId + brandId, orgId an optional future team layer).
 */
export interface ICalosCampaign extends Document {
  ownerUserId: string;
  brandId: string; // the client this campaign belongs to
  orgId?: string | null; // optional agency/team-share layer (future)
  name: string;
  goal?: string; // free-text, specific target (e.g. "500 signups")
  objective: CalosObjective; // structured goal type — drives the planner's funnel + content mix
  theme?: string; // the campaign's big idea / through-line every post ladders up to
  status: CalosCampaignStatus;
  cadenceRules: CalosCadenceRule[];
  startDate?: string | null;
  endDate?: string | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CadenceRuleSchema = new Schema<CalosCadenceRule>(
  {
    platform: { type: String, required: true },
    perWeek: { type: Number, required: true, default: 1 },
    preferredDays: { type: [Number], default: [] },
  },
  { _id: false }
);

const CalosCampaignSchema = new Schema<ICalosCampaign>(
  {
    ownerUserId: { type: String, required: true },
    brandId: { type: String, required: true },
    orgId: { type: String, default: null },
    name: { type: String, required: true },
    goal: { type: String, default: "" },
    objective: {
      type: String,
      enum: [...CALOS_OBJECTIVES],
      default: DEFAULT_OBJECTIVE,
    },
    theme: { type: String, default: "" },
    status: {
      type: String,
      required: true,
      enum: ["draft", "active", "archived"],
      default: "active",
    },
    cadenceRules: { type: [CadenceRuleSchema], default: [] },
    startDate: { type: String, default: null },
    endDate: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CalosCampaignSchema.index({ ownerUserId: 1, brandId: 1 });
CalosCampaignSchema.index({ brandId: 1, status: 1 });

const CalosCampaign =
  models.CalosCampaign ||
  mongoose.model<ICalosCampaign>("CalosCampaign", CalosCampaignSchema, "calos_campaigns");

export default CalosCampaign;
