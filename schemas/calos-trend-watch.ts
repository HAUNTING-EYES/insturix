import mongoose, { Schema, type Document } from "mongoose";

export type CalosTrendWatchScanStatus = "running" | "completed" | "unavailable" | "failed";

export interface CalosTrendWatchCandidate {
  title: string;
  summary?: string;
  url?: string;
  platform: string;
  capturedAt?: string;
  score?: number;
}

export interface ICalosTrendWatchPolicy extends Document {
  scopeKey: string;
  ownerUserId: string;
  orgId?: string | null;
  brandId: string;
  enabled: boolean;
  publicNiche: string;
  platforms: string[];
  location?: string | null;
  intervalHours: number;
  calendarWindowDays: number;
  nextScanAt: Date;
  lastScanAt?: Date | null;
  lastAttemptAt?: Date | null;
  consecutiveFailures: number;
  leaseId?: string | null;
  leaseExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICalosTrendWatchScan extends Document {
  scanId: string;
  policyId: string;
  scopeKey: string;
  ownerUserId: string;
  orgId?: string | null;
  brandId: string;
  queryFingerprint: string;
  query: { niche: string; platforms: string[]; location?: string };
  status: CalosTrendWatchScanStatus;
  provider: string;
  resultSource: "live" | "cached";
  candidates: CalosTrendWatchCandidate[];
  candidateCount: number;
  startedAt: Date;
  completedAt?: Date | null;
  failureCode?: "provider_unavailable" | "provider_request_failed" | "invalid_public_query" | "scan_abandoned" | null;
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

const TrendQuerySchema = new Schema(
  {
    niche: { type: String, required: true, maxlength: 300 },
    platforms: { type: [String], default: [] },
    location: { type: String, maxlength: 120 },
  },
  { _id: false },
);

const CalosTrendWatchPolicySchema = new Schema<ICalosTrendWatchPolicy>(
  {
    scopeKey: { type: String, required: true, immutable: true },
    ownerUserId: { type: String, required: true, immutable: true },
    orgId: { type: String, default: null, immutable: true },
    brandId: { type: String, required: true, immutable: true },
    enabled: { type: Boolean, default: false },
    publicNiche: { type: String, required: true, trim: true, maxlength: 300 },
    platforms: { type: [String], default: [] },
    location: { type: String, default: null, maxlength: 120 },
    intervalHours: { type: Number, default: 72, min: 24, max: 168 },
    calendarWindowDays: { type: Number, default: 21, min: 7, max: 60 },
    nextScanAt: { type: Date, required: true, default: Date.now },
    lastScanAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
    consecutiveFailures: { type: Number, default: 0, min: 0 },
    leaseId: { type: String, default: null },
    leaseExpiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

CalosTrendWatchPolicySchema.index({ scopeKey: 1 }, { unique: true });
CalosTrendWatchPolicySchema.index({ enabled: 1, nextScanAt: 1, leaseExpiresAt: 1 });

const CalosTrendWatchScanSchema = new Schema<ICalosTrendWatchScan>(
  {
    scanId: { type: String, required: true, immutable: true, unique: true },
    policyId: { type: String, required: true, immutable: true, index: true },
    scopeKey: { type: String, required: true, immutable: true, index: true },
    ownerUserId: { type: String, required: true, immutable: true },
    orgId: { type: String, default: null, immutable: true },
    brandId: { type: String, required: true, immutable: true, index: true },
    queryFingerprint: { type: String, required: true, immutable: true, index: true },
    query: { type: TrendQuerySchema, required: true },
    status: { type: String, required: true, enum: ["running", "completed", "unavailable", "failed"] },
    provider: { type: String, required: true, maxlength: 120 },
    resultSource: { type: String, required: true, enum: ["live", "cached"] },
    candidates: { type: [CandidateSchema], default: [] },
    candidateCount: { type: Number, required: true, min: 0, max: 12 },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    failureCode: {
      type: String,
      default: null,
      enum: [null, "provider_unavailable", "provider_request_failed", "invalid_public_query", "scan_abandoned"],
    },
  },
  { timestamps: true },
);

CalosTrendWatchScanSchema.index({ queryFingerprint: 1, status: 1, completedAt: -1 });
CalosTrendWatchScanSchema.index({ scopeKey: 1, startedAt: -1 });
CalosTrendWatchScanSchema.index({ status: 1, startedAt: 1 });

export const CalosTrendWatchPolicy =
  mongoose.models.CalosTrendWatchPolicy ||
  mongoose.model<ICalosTrendWatchPolicy>("CalosTrendWatchPolicy", CalosTrendWatchPolicySchema, "calos_trend_watch_policies");

export const CalosTrendWatchScan =
  mongoose.models.CalosTrendWatchScan ||
  mongoose.model<ICalosTrendWatchScan>("CalosTrendWatchScan", CalosTrendWatchScanSchema, "calos_trend_watch_scans");
