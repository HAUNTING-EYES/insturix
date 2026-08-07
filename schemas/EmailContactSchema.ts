import mongoose, { Document, Schema } from "mongoose";
import {
  EMAIL_TOPICS,
  type EmailTopic,
} from "@/lib/services/email/contact-policy";

export const EMAIL_CONTACT_STATUSES = [
  "active",
  "unsubscribed",
  "suppressed",
] as const;
export const EMAIL_PREFERENCE_STATUSES = ["opted_in", "opted_out"] as const;

export type EmailContactStatus = (typeof EMAIL_CONTACT_STATUSES)[number];
export type EmailPreferenceStatus =
  (typeof EMAIL_PREFERENCE_STATUSES)[number];

export interface IEmailTopicPreference {
  status: EmailPreferenceStatus;
  source: string;
  updatedAt: Date;
}

export interface IEmailContact extends Document {
  email: string;
  normalizedEmail: string;
  userId?: string;
  status: EmailContactStatus;
  unsubscribeAll: boolean;
  source: string;
  preferences: Map<EmailTopic, IEmailTopicPreference>;
  lastConsentAt?: Date;
  lastEngagedAt?: Date;
  locale?: string;
  timezone?: string;
  createdAt: Date;
  updatedAt: Date;
}

const emailTopicPreferenceSchema = new Schema<IEmailTopicPreference>(
  {
    status: {
      type: String,
      enum: EMAIL_PREFERENCE_STATUSES,
      required: true,
    },
    source: {
      type: String,
      required: true,
      trim: true,
    },
    updatedAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false }
);

const emailContactSchema = new Schema<IEmailContact>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    normalizedEmail: {
      type: String,
      trim: true,
    },
    userId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: EMAIL_CONTACT_STATUSES,
      required: true,
      default: "active",
    },
    unsubscribeAll: {
      type: Boolean,
      required: true,
      default: false,
    },
    source: {
      type: String,
      required: true,
      default: "legacy_newsletter",
      trim: true,
    },
    preferences: {
      type: Map,
      of: emailTopicPreferenceSchema,
      default: () => new Map(),
      validate: {
        validator(value: Map<string, IEmailTopicPreference>) {
          return Array.from(value.keys()).every((topic) =>
            EMAIL_TOPICS.includes(topic as EmailTopic)
          );
        },
        message: "Email preferences contain an unsupported topic",
      },
    },
    lastConsentAt: {
      type: Date,
    },
    lastEngagedAt: {
      type: Date,
    },
    locale: {
      type: String,
      trim: true,
    },
    timezone: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

emailContactSchema.index(
  { normalizedEmail: 1 },
  {
    unique: true,
    partialFilterExpression: { normalizedEmail: { $type: "string" } },
  }
);
emailContactSchema.index({ userId: 1 }, { sparse: true });
emailContactSchema.index({ status: 1, unsubscribeAll: 1 });

const EmailContact =
  mongoose.models.EmailContact ||
  mongoose.model<IEmailContact>(
    "EmailContact",
    emailContactSchema,
    "newsletters"
  );

export default EmailContact;
