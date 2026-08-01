import mongoose, { Schema, type Document } from "mongoose";
import type { ContentCard } from "@/lib/thinkforge/planning/content-card-contract";

export type CalosEditorialStatus =
  | "idea"
  | "drafting"
  | "generated"
  | "in_review"
  | "approved"
  | "changes_requested";

export type CalosService = "thinkforge" | "clickatron" | "editron" | "musitron";

export interface CalosServiceRef {
  service?: CalosService;
  jobId?: string;
  deliverableVersion?: number; // generation claim: callbacks may write only while this is current
  sessionId?: string;
  projectId?: string;
  variationId?: string;
}

export interface CalosApproval {
  actor: string; // clerkUserId, or an external review-link token id
  decision: "approved" | "rejected" | "changes_requested";
  version: number; // approvals are version-bound: editing an approved card resets review
  at: Date;
  notes?: string;
}

/**
 * CalOS deliverable = the spine entity. It persists the rich ContentCard payload (the
 * content the calendar already understands) PLUS first-class CalOS columns for scoping,
 * the EDITORIAL state machine, and service-generation linkage.
 *
 * DELIVERY state does NOT live here. It lives per-platform in calos_scheduled_publishes
 * (one card fans out to many platforms with independent outcomes); the card's "published"
 * badge is derived from those rows.
 */
export interface ICalosDeliverable extends Document {
  ownerUserId: string; // creator; also the connected-account owner for downstream publish
  orgId?: string | null; // optional agency/team-share layer (future); P0 scopes by ownerUserId + brandId
  brandId: string; // client brand -- scoping
  campaignId?: string | null;
  /** Immutable provenance for a draft created from one accepted CalOS trend opportunity. */
  sourceTrendOpportunityId?: string;
  editorialStatus: CalosEditorialStatus;
  version: number; // bumped on content edits; approvals bind to a version
  serviceRef?: CalosServiceRef;
  assetUrl?: string | null;
  assetText?: string | null;
  /** Pending image-generation prompt for a graphics card (PostWriter's singleImagePrompt), stashed at
   *  generate time so the explicit "Make image" action can kick off Clickatron later. Null once no
   *  image is pending (never generated, or already produced -> see assetUrl). */
  imagePrompt?: string | null;
  errorMessage?: string | null;
  approvals: CalosApproval[];
  // Hoisted for calendar window queries + indexing:
  plannedDates: string[];
  platform: string;
  // The full ContentCard payload (validated by content-card-contract at the API layer):
  card: ContentCard;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceRefSchema = new Schema<CalosServiceRef>(
  {
    service: { type: String, enum: ["thinkforge", "clickatron", "editron", "musitron"] },
    jobId: String,
    deliverableVersion: Number,
    sessionId: String,
    projectId: String,
    variationId: String,
  },
  { _id: false }
);

const ApprovalSchema = new Schema<CalosApproval>(
  {
    actor: { type: String, required: true },
    decision: {
      type: String,
      required: true,
      enum: ["approved", "rejected", "changes_requested"],
    },
    version: { type: Number, required: true },
    at: { type: Date, required: true },
    notes: String,
  },
  { _id: false }
);

const CalosDeliverableSchema = new Schema<ICalosDeliverable>(
  {
    ownerUserId: { type: String, required: true },
    orgId: { type: String, default: null },
    brandId: { type: String, required: true },
    campaignId: { type: String, default: null },
    sourceTrendOpportunityId: { type: String, immutable: true },
    editorialStatus: {
      type: String,
      required: true,
      enum: ["idea", "drafting", "generated", "in_review", "approved", "changes_requested"],
      default: "idea",
    },
    version: { type: Number, default: 1 },
    serviceRef: { type: ServiceRefSchema, default: undefined },
    assetUrl: { type: String, default: null },
    assetText: { type: String, default: null },
    imagePrompt: { type: String, default: null },
    errorMessage: { type: String, default: null },
    approvals: { type: [ApprovalSchema], default: [] },
    plannedDates: { type: [String], default: [] },
    platform: { type: String, default: "generic" },
    card: { type: Schema.Types.Mixed, required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Calendar window query (per owner+client, by date) + editorial filters + campaign rollups.
CalosDeliverableSchema.index({ ownerUserId: 1, brandId: 1, plannedDates: 1 });
CalosDeliverableSchema.index({ ownerUserId: 1, brandId: 1, editorialStatus: 1 });
CalosDeliverableSchema.index({ campaignId: 1 });
// Retries after a client timeout reuse the original trend draft instead of creating a duplicate.
CalosDeliverableSchema.index({ sourceTrendOpportunityId: 1 }, { unique: true, sparse: true });

const CalosDeliverable =
  mongoose.models.CalosDeliverable ||
  mongoose.model<ICalosDeliverable>(
    "CalosDeliverable",
    CalosDeliverableSchema,
    "calos_deliverables"
  );

export default CalosDeliverable;
