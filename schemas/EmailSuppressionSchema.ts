import mongoose, { Document, Schema } from "mongoose";
import {
  EMAIL_TOPICS,
  type EmailTopic,
} from "@/lib/services/email/contact-policy";

export const EMAIL_SUPPRESSION_SCOPES = ["global", "topic"] as const;
export const EMAIL_SUPPRESSION_REASONS = [
  "hard_bounce",
  "complaint",
  "unsubscribe",
  "manual",
  "invalid",
] as const;
export const EMAIL_SUPPRESSION_SOURCES = [
  "ses",
  "user",
  "admin",
  "system",
] as const;

export type EmailSuppressionScope =
  (typeof EMAIL_SUPPRESSION_SCOPES)[number];
export type EmailSuppressionReason =
  (typeof EMAIL_SUPPRESSION_REASONS)[number];
export type EmailSuppressionSource =
  (typeof EMAIL_SUPPRESSION_SOURCES)[number];

export interface IEmailSuppression extends Document {
  normalizedEmail: string;
  scope: EmailSuppressionScope;
  topic?: EmailTopic;
  reason: EmailSuppressionReason;
  source: EmailSuppressionSource;
  providerEventId?: string;
  active: boolean;
  liftedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const emailSuppressionSchema = new Schema<IEmailSuppression>(
  {
    normalizedEmail: {
      type: String,
      required: true,
      trim: true,
    },
    scope: {
      type: String,
      enum: EMAIL_SUPPRESSION_SCOPES,
      required: true,
    },
    topic: {
      type: String,
      enum: EMAIL_TOPICS,
    },
    reason: {
      type: String,
      enum: EMAIL_SUPPRESSION_REASONS,
      required: true,
    },
    source: {
      type: String,
      enum: EMAIL_SUPPRESSION_SOURCES,
      required: true,
    },
    providerEventId: {
      type: String,
      trim: true,
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
    },
    liftedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

emailSuppressionSchema.pre("validate", function validateScopeAndTopic() {
  if (this.scope === "topic" && !this.topic) {
    this.invalidate("topic", "A topic-scoped suppression requires a topic");
  }

  if (this.scope === "global" && this.topic) {
    this.invalidate("topic", "A global suppression cannot specify a topic");
  }

  if (this.active && this.liftedAt) {
    this.invalidate("liftedAt", "An active suppression cannot be lifted");
  }
});

emailSuppressionSchema.index(
  { normalizedEmail: 1, scope: 1, topic: 1 },
  {
    unique: true,
    partialFilterExpression: { active: true },
  }
);
emailSuppressionSchema.index({ providerEventId: 1 }, { sparse: true });

const EmailSuppression =
  mongoose.models.EmailSuppression ||
  mongoose.model<IEmailSuppression>(
    "EmailSuppression",
    emailSuppressionSchema,
    "email_suppressions"
  );

export default EmailSuppression;
