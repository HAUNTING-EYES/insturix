import mongoose, { Schema, type Document } from "mongoose";
import type { PublisherMediaKind } from "@/lib/calos/publish/contract";

export type CalosPublishPlatform =
  | "youtube"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "twitter"
  | "tiktok";

export type CalosPublishStatus =
  | "pending"
  | "claimed"
  | "publishing"
  | "published"
  | "failed"
  | "superseded";

export interface CalosPublishMediaSnapshot {
  readonly kind: PublisherMediaKind;
  readonly url: string | null;
}

export interface CalosPublishPayload {
  readonly schemaVersion: 1;
  readonly approvalVersion: number;
  readonly contentFormat: string;
  readonly caption: string;
  readonly title?: string;
  readonly media: CalosPublishMediaSnapshot;
  readonly videoUuid?: string;
  readonly gcsPath?: string;
  readonly options?: Record<string, unknown>;
}

/**
 * CalOS delivery queue. One row per approved (deliverable, platform, version) occurrence. Delivery state lives
 * HERE, not on the deliverable — a single content card fans out to many platforms with
 * independent outcomes (YouTube can publish while LinkedIn fails). The card's "published"
 * badge is derived from these rows.
 */
export interface ICalosScheduledPublish extends Document {
  deliverableId: string; // the calos_deliverables card this publish belongs to
  ownerUserId: string; // whose connected-account token performs the publish (sessionless cron context)
  orgId?: string | null;
  brandId?: string | null;
  platform: CalosPublishPlatform;
  approvalVersion?: number | null; // null only on legacy rows created before versioned occurrences
  accountRef?: string | null; // page / account / organization id on the platform
  payload: CalosPublishPayload; // version-bound reviewed content/media snapshot used by the worker
  publishAt: Date;
  status: CalosPublishStatus;
  attempts: number;
  maxAttempts: number;
  lockedAt?: Date | null;
  /** audit 6b: structured ambiguity — provider outcome UNKNOWN (may have
   *  posted); such rows are never auto-retried. */
  outcomeAmbiguous?: boolean;
  lastError?: string | null;
  postId?: string | null;
  postUrl?: string | null;
  idempotencyKey: string; // `${deliverableId}:${platform}:v${approvalVersion}` prevents duplicate approval occurrences
  createdAt: Date;
  updatedAt: Date;
}

const CalosScheduledPublishSchema = new Schema<ICalosScheduledPublish>(
  {
    deliverableId: { type: String, required: true, index: true },
    ownerUserId: { type: String, required: true },
    orgId: { type: String, default: null },
    brandId: { type: String, default: null },
    platform: {
      type: String,
      required: true,
      enum: ["youtube", "facebook", "instagram", "linkedin", "twitter", "tiktok"],
    },
    approvalVersion: { type: Number, default: null },
    accountRef: { type: String, default: null },
    payload: { type: Object, default: {} },
    publishAt: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "claimed", "publishing", "published", "failed", "superseded"],
      default: "pending",
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 }, // standard retry budget; overridable per row
    lockedAt: { type: Date, default: null },
    /** audit 6b: structured ambiguity — the provider outcome is UNKNOWN (may
   *  have posted); such rows are never auto-retried. Belt-and-braces with the
   *  legacy prose marker for pre-flag rows. */
  outcomeAmbiguous: {
    type: Boolean,
    default: false,
  },
  lastError: { type: String, default: null },
    postId: { type: String, default: null },
    postUrl: { type: String, default: null },
    idempotencyKey: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

// Sweeper scans: due rows by publishAt and abandoned leases by lockedAt.
CalosScheduledPublishSchema.index({ status: 1, publishAt: 1 });
CalosScheduledPublishSchema.index({ status: 1, lockedAt: 1 });
CalosScheduledPublishSchema.index({ orgId: 1, brandId: 1 });
CalosScheduledPublishSchema.index({ deliverableId: 1, status: 1, approvalVersion: -1, updatedAt: -1 });

const CalosScheduledPublish =
  mongoose.models.CalosScheduledPublish ||
  mongoose.model<ICalosScheduledPublish>(
    "CalosScheduledPublish",
    CalosScheduledPublishSchema,
    "calos_scheduled_publishes"
  );

export default CalosScheduledPublish;
