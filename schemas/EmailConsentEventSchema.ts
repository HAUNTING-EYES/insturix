import mongoose, { Document, Schema } from "mongoose";
import {
  EMAIL_TOPICS,
  type EmailTopic,
} from "@/lib/services/email/contact-policy";

export const EMAIL_CONSENT_ACTIONS = ["opt_in", "opt_out"] as const;
export const EMAIL_CONSENT_ACTOR_TYPES = [
  "visitor",
  "user",
  "admin",
  "system",
] as const;

export type EmailConsentAction = (typeof EMAIL_CONSENT_ACTIONS)[number];
export type EmailConsentActorType =
  (typeof EMAIL_CONSENT_ACTOR_TYPES)[number];

export interface IEmailConsentEvent extends Document {
  eventId: string;
  normalizedEmail: string;
  topic: EmailTopic;
  action: EmailConsentAction;
  actorType: EmailConsentActorType;
  source: string;
  noticeVersion: string;
  requestFingerprint?: string;
  occurredAt: Date;
  createdAt: Date;
}

const emailConsentEventSchema = new Schema<IEmailConsentEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    normalizedEmail: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    topic: {
      type: String,
      enum: EMAIL_TOPICS,
      required: true,
      immutable: true,
    },
    action: {
      type: String,
      enum: EMAIL_CONSENT_ACTIONS,
      required: true,
      immutable: true,
    },
    actorType: {
      type: String,
      enum: EMAIL_CONSENT_ACTOR_TYPES,
      required: true,
      immutable: true,
    },
    source: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    noticeVersion: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    requestFingerprint: {
      type: String,
      trim: true,
      immutable: true,
    },
    occurredAt: {
      type: Date,
      required: true,
      immutable: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

emailConsentEventSchema.index({ normalizedEmail: 1, occurredAt: -1 });
emailConsentEventSchema.index({ topic: 1, action: 1, occurredAt: -1 });

const EmailConsentEvent =
  mongoose.models.EmailConsentEvent ||
  mongoose.model<IEmailConsentEvent>(
    "EmailConsentEvent",
    emailConsentEventSchema,
    "email_consent_events"
  );

export default EmailConsentEvent;
