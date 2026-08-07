import mongoose, { Schema, type Document, type Model } from "mongoose";

export const EMAIL_LIFECYCLE_DELIVERY_STATUSES = [
  "queued",
  "sending",
  "sent",
  "failed",
] as const;

export type EmailLifecycleDeliveryStatus =
  (typeof EMAIL_LIFECYCLE_DELIVERY_STATUSES)[number];

export interface IEmailLifecycleDelivery extends Document {
  idempotencyKey: string;
  kind: "welcome";
  userId: string;
  normalizedEmail: string;
  displayName: string;
  sourceEventId?: string;
  status: EmailLifecycleDeliveryStatus;
  attempts: number;
  leaseUntil?: Date;
  providerMessageId?: string;
  lastError?: string;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const emailLifecycleDeliverySchema = new Schema<IEmailLifecycleDelivery>(
  {
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    kind: {
      type: String,
      enum: ["welcome"],
      required: true,
    },
    userId: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedEmail: {
      type: String,
      required: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    sourceEventId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: EMAIL_LIFECYCLE_DELIVERY_STATUSES,
      required: true,
      default: "queued",
    },
    attempts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    leaseUntil: {
      type: Date,
    },
    providerMessageId: {
      type: String,
      trim: true,
    },
    lastError: {
      type: String,
      trim: true,
    },
    sentAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

emailLifecycleDeliverySchema.index({ status: 1, leaseUntil: 1 });

const EmailLifecycleDelivery =
  (mongoose.models.EmailLifecycleDelivery as
    | Model<IEmailLifecycleDelivery>
    | undefined) ??
  mongoose.model<IEmailLifecycleDelivery>(
    "EmailLifecycleDelivery",
    emailLifecycleDeliverySchema,
    "email_lifecycle_deliveries"
  );

export default EmailLifecycleDelivery;
