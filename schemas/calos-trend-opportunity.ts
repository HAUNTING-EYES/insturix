import mongoose, { Schema, type Document } from "mongoose";
import type { CalosTrendWatchCandidate } from "@/schemas/calos-trend-watch";

export type CalosTrendOpportunityStatus =
  | "processing"
  | "suggested"
  | "accepted"
  | "dismissed"
  | "snoozed"
  | "not_relevant"
  | "blocked"
  | "failed"
  | "expired";
export type CalosTrendOpportunityRecommendation = "add" | "adapt";

export interface ICalosTrendOpportunity extends Document {
  opportunityId: string;
  sourceKey: string;
  sourceScanId: string;
  sourceCandidateIndex: number;
  policyId: string;
  scopeKey: string;
  ownerUserId: string;
  orgId?: string | null;
  brandId: string;
  candidate: CalosTrendWatchCandidate;
  status: CalosTrendOpportunityStatus;
  relevanceScore?: number | null;
  reasonCodes: string[];
  matchedSignalPaths: string[];
  recommendation?: CalosTrendOpportunityRecommendation | null;
  adaptDeliverableId?: string | null;
  calendarWindowEndsAt?: Date | null;
  matcherVersion: number;
  acceptedProfileGeneratedAt?: string | null;
  evaluatedAt?: Date | null;
  reviewedAt?: Date | null;
  reviewedBy?: string | null;
  snoozedUntil?: Date | null;
  leaseId?: string | null;
  leaseExpiresAt?: Date | null;
  nextAttemptAt?: Date | null;
  attempts: number;
  failureCode?: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CandidateSchema = new Schema<CalosTrendWatchCandidate>(
  {
    title: { type: String, required: true, maxlength: 240 },
    summary: { type: String, maxlength: 800 },
    url: { type: String, maxlength: 2_000 },
    platform: { type: String, required: true, maxlength: 80 },
    capturedAt: { type: String, maxlength: 80 },
    score: { type: Number, min: 0, max: 1 },
  },
  { _id: false },
);

const CalosTrendOpportunitySchema = new Schema<ICalosTrendOpportunity>(
  {
    opportunityId: { type: String, required: true, immutable: true, unique: true },
    sourceKey: { type: String, required: true, immutable: true, unique: true },
    sourceScanId: { type: String, required: true, immutable: true, index: true },
    sourceCandidateIndex: { type: Number, required: true, immutable: true, min: 0 },
    policyId: { type: String, required: true, immutable: true, index: true },
    scopeKey: { type: String, required: true, immutable: true, index: true },
    ownerUserId: { type: String, required: true, immutable: true },
    orgId: { type: String, default: null, immutable: true },
    brandId: { type: String, required: true, immutable: true, index: true },
    candidate: { type: CandidateSchema, required: true },
    status: {
      type: String,
      required: true,
      enum: ["processing", "suggested", "accepted", "dismissed", "snoozed", "not_relevant", "blocked", "failed", "expired"],
      index: true,
    },
    relevanceScore: { type: Number, default: null, min: 0, max: 1 },
    reasonCodes: { type: [String], default: [] },
    matchedSignalPaths: { type: [String], default: [] },
    recommendation: { type: String, enum: ["add", "adapt"], default: null },
    adaptDeliverableId: { type: String, default: null },
    calendarWindowEndsAt: { type: Date, default: null },
    matcherVersion: { type: Number, required: true, min: 1 },
    acceptedProfileGeneratedAt: { type: String, default: null, maxlength: 80 },
    evaluatedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: null },
    snoozedUntil: { type: Date, default: null },
    leaseId: { type: String, default: null },
    leaseExpiresAt: { type: Date, default: null },
    nextAttemptAt: { type: Date, default: null },
    attempts: { type: Number, required: true, min: 1, default: 1 },
    failureCode: { type: String, default: null, maxlength: 120 },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

CalosTrendOpportunitySchema.index({ status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 });
CalosTrendOpportunitySchema.index({ brandId: 1, orgId: 1, status: 1, expiresAt: 1 });
CalosTrendOpportunitySchema.index({ status: 1, snoozedUntil: 1 });

export const CalosTrendOpportunity =
  mongoose.models.CalosTrendOpportunity ||
  mongoose.model<ICalosTrendOpportunity>(
    "CalosTrendOpportunity",
    CalosTrendOpportunitySchema,
    "calos_trend_opportunities",
  );