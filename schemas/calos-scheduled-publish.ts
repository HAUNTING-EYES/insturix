import mongoose, { Schema, Document, models } from "mongoose";

export type CalosPublishPlatform =
  | "youtube"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "twitter";

export type CalosPublishStatus =
  | "pending"
  | "claimed"
  | "publishing"
  | "published"
  | "failed";

/**
 * CalOS delivery queue. One row per (deliverable, platform) target. Delivery state lives
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
  accountRef?: string | null; // page / account / organization id on the platform
  payload: Record<string, unknown>; // platform publish args (caption, title, videoUuid, gcsPath, ...)
  publishAt: Date;
  status: CalosPublishStatus;
  attempts: number;
  maxAttempts: number;
  lockedAt?: Date | null;
  lastError?: string | null;
  postId?: string | null;
  postUrl?: string | null;
  idempotencyKey: string; // `${deliverableId}:${platform}` — UNIQUE, blocks double-posting at the data layer
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
      enum: ["youtube", "facebook", "instagram", "linkedin", "twitter"],
    },
    accountRef: { type: String, default: null },
    payload: { type: Object, default: {} },
    publishAt: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "claimed", "publishing", "published", "failed"],
      default: "pending",
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 }, // standard retry budget; overridable per row
    lockedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    postId: { type: String, default: null },
    postUrl: { type: String, default: null },
    idempotencyKey: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

// Sweeper scan: due/pending or stale-claimed rows, ordered by publishAt.
CalosScheduledPublishSchema.index({ status: 1, publishAt: 1 });
CalosScheduledPublishSchema.index({ orgId: 1, brandId: 1 });

const CalosScheduledPublish =
  models.CalosScheduledPublish ||
  mongoose.model<ICalosScheduledPublish>(
    "CalosScheduledPublish",
    CalosScheduledPublishSchema,
    "calos_scheduled_publishes"
  );

export default CalosScheduledPublish;
