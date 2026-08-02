import mongoose, { Schema, type Document, type Model } from "mongoose";

/**
 * Audit record for one outreach lead import run.
 *
 * Every import - including a dry run - writes one of these. It is the answer to
 * "where did this contact come from, when, under which rules, and what did the
 * run reject?". Rollback targets `OutreachContact.importBatchId`.
 */

export const OUTREACH_IMPORT_STATUSES = [
  "running",
  "completed",
  "failed",
] as const;
export type OutreachImportStatus = (typeof OUTREACH_IMPORT_STATUSES)[number];

export interface IOutreachImportCounts {
  examined: number;
  withEmail: number;
  imported: number;
  updated: number;
  skippedDuplicate: number;
  blockedInvalid: number;
  blockedDisposable: number;
  blockedSuppressed: number;
  customerLifecycleOnly: number;
  tierA: number;
  tierB: number;
  tierC: number;
  tierD: number;
}

export interface IOutreachImportBatch extends Document {
  batchId: string;
  sourceSystem: string;
  sourceLabel?: string;
  dryRun: boolean;
  status: OutreachImportStatus;
  counts: IOutreachImportCounts;
  /** Named importErrors, not errors: "errors" is a reserved Mongoose path. */
  importErrors: string[];
  initiatedBy?: string;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const countsSchema = new Schema<IOutreachImportCounts>(
  {
    examined: { type: Number, required: true, default: 0 },
    withEmail: { type: Number, required: true, default: 0 },
    imported: { type: Number, required: true, default: 0 },
    updated: { type: Number, required: true, default: 0 },
    skippedDuplicate: { type: Number, required: true, default: 0 },
    blockedInvalid: { type: Number, required: true, default: 0 },
    blockedDisposable: { type: Number, required: true, default: 0 },
    blockedSuppressed: { type: Number, required: true, default: 0 },
    customerLifecycleOnly: { type: Number, required: true, default: 0 },
    tierA: { type: Number, required: true, default: 0 },
    tierB: { type: Number, required: true, default: 0 },
    tierC: { type: Number, required: true, default: 0 },
    tierD: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const outreachImportBatchSchema = new Schema<IOutreachImportBatch>(
  {
    batchId: { type: String, required: true, unique: true, trim: true },
    sourceSystem: { type: String, required: true, trim: true },
    sourceLabel: { type: String, trim: true },
    dryRun: { type: Boolean, required: true, default: true },
    status: {
      type: String,
      enum: OUTREACH_IMPORT_STATUSES,
      required: true,
      default: "running",
    },
    counts: { type: countsSchema, required: true, default: () => ({}) },
    importErrors: { type: [String], required: true, default: [] },
    initiatedBy: { type: String, trim: true },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

outreachImportBatchSchema.index({ startedAt: -1 });

const OutreachImportBatch =
  (mongoose.models.OutreachImportBatch as
    | Model<IOutreachImportBatch>
    | undefined) ??
  mongoose.model<IOutreachImportBatch>(
    "OutreachImportBatch",
    outreachImportBatchSchema,
    "outreach_import_batches"
  );

export default OutreachImportBatch;
