import mongoose, { Schema, type Document } from "mongoose";
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
  format?: string; // optional required ContentCard format for every slot in this rule
  targetDurationSeconds?: number; // explicit user requirement; final resolution stays downstream
}

/** A source material the user attaches to a campaign so generation writes FROM it, not just the brand
 *  voice. `link`/`pdf`/`doc`/`text` are deconstructed (ThinkForge IngestorAgent) into `ingested` facts
 *  fed to the writers; `image` is a visual reference kept for image generation (Clickatron
 *  referenceImageRefs) — deferred wire, but the schema supports it now. */
export type CalosReferenceType = "link" | "pdf" | "doc" | "image" | "text";
export type CalosReferenceStatus = "pending" | "ready" | "failed";

/** IngestorAgent output flattened for reuse by the writers (atomic facts + hooks + a summary). */
export interface CalosIngestedFacts {
  summary?: string;
  atomicFacts: string[];
  viralHooks: string[];
}

export interface CalosCampaignReference {
  id: string; // nanoid
  type: CalosReferenceType;
  name: string; // filename, link title, or "Pasted note"
  url?: string | null; // link URL, or the R2 URL for an uploaded pdf/doc/image
  text?: string | null; // pasted text, or extracted text (cached from link-fetch / pdf-parse)
  ingested?: CalosIngestedFacts | null; // null until deconstructed; images skip ingestion
  status: CalosReferenceStatus; // pending -> ready | failed (extraction + ingestion outcome)
  error?: string | null;
  addedAt: Date;
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
  references: CalosCampaignReference[]; // source materials fed to generation (Phase A)
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
    format: { type: String },
    targetDurationSeconds: { type: Number },
  },
  { _id: false }
);

const IngestedFactsSchema = new Schema<CalosIngestedFacts>(
  {
    summary: { type: String },
    atomicFacts: { type: [String], default: [] },
    viralHooks: { type: [String], default: [] },
  },
  { _id: false }
);

export const CampaignReferenceSchema = new Schema<CalosCampaignReference>(
  {
    id: { type: String, required: true },
    type: { type: String, required: true, enum: ["link", "pdf", "doc", "image", "text"] },
    name: { type: String, required: true },
    url: { type: String, default: null },
    text: { type: String, default: null },
    ingested: { type: IngestedFactsSchema, default: null },
    status: { type: String, required: true, enum: ["pending", "ready", "failed"], default: "pending" },
    error: { type: String, default: null },
    addedAt: { type: Date, default: () => new Date() },
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
    references: { type: [CampaignReferenceSchema], default: [] },
    startDate: { type: String, default: null },
    endDate: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CalosCampaignSchema.index({ ownerUserId: 1, brandId: 1 });
CalosCampaignSchema.index({ brandId: 1, status: 1 });

const CalosCampaign =
  mongoose.models.CalosCampaign ||
  mongoose.model<ICalosCampaign>("CalosCampaign", CalosCampaignSchema, "calos_campaigns");

export default CalosCampaign;
