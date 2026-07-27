import mongoose, { Document, Schema, Types } from 'mongoose';

import {
  EMAIL_TOPICS,
  type EmailTopic,
} from '@/lib/services/email/contact-policy';

export const EMAIL_CAMPAIGN_KINDS = ['custom', 'promotional'] as const;
export const EMAIL_CAMPAIGN_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
] as const;
export const EMAIL_CAMPAIGN_COOLDOWN_TYPES = [
  'custom-mailing',
  'bulk-template',
] as const;

export type EmailCampaignKind = (typeof EMAIL_CAMPAIGN_KINDS)[number];
export type EmailCampaignStatus = (typeof EMAIL_CAMPAIGN_STATUSES)[number];
export type EmailCampaignCooldownType =
  (typeof EMAIL_CAMPAIGN_COOLDOWN_TYPES)[number];

export interface IEmailCampaign extends Document {
  kind: EmailCampaignKind;
  status: EmailCampaignStatus;
  topic: EmailTopic;
  subject: string;
  message?: string;
  createdBy: string;
  sourceRoute: string;
  cooldownType: EmailCampaignCooldownType;
  lockKey?: EmailCampaignCooldownType;
  totalRecipients: number;
  recipientUpperBound: Types.ObjectId;
  processedCount: number;
  successfulCount: number;
  skippedCount: number;
  failedCount: number;
  dispatchSequence: number;
  recipientCursor?: Types.ObjectId;
  leaseUntil?: Date;
  lastError?: string;
  completedAt?: Date;
  cooldownRecordedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const emailCampaignSchema = new Schema<IEmailCampaign>(
  {
    kind: {
      type: String,
      enum: EMAIL_CAMPAIGN_KINDS,
      required: true,
    },
    status: {
      type: String,
      enum: EMAIL_CAMPAIGN_STATUSES,
      required: true,
      default: 'queued',
    },
    topic: {
      type: String,
      enum: EMAIL_TOPICS,
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      maxlength: 50_000,
    },
    createdBy: {
      type: String,
      required: true,
      trim: true,
    },
    sourceRoute: {
      type: String,
      required: true,
      trim: true,
    },
    cooldownType: {
      type: String,
      enum: EMAIL_CAMPAIGN_COOLDOWN_TYPES,
      required: true,
    },
    lockKey: {
      type: String,
      enum: EMAIL_CAMPAIGN_COOLDOWN_TYPES,
    },
    totalRecipients: {
      type: Number,
      required: true,
      min: 0,
    },
    recipientUpperBound: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    processedCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    successfulCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    skippedCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    failedCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    dispatchSequence: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    recipientCursor: {
      type: Schema.Types.ObjectId,
    },
    leaseUntil: {
      type: Date,
    },
    lastError: {
      type: String,
      maxlength: 2_000,
    },
    completedAt: {
      type: Date,
    },
    cooldownRecordedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'email_campaigns',
  }
);

emailCampaignSchema.pre('validate', function validateCampaignContent() {
  if (this.kind === 'custom' && !this.message?.trim()) {
    this.invalidate('message', 'A custom campaign requires a message');
  }
});

emailCampaignSchema.index(
  { lockKey: 1 },
  {
    unique: true,
    partialFilterExpression: { lockKey: { $type: 'string' } },
  }
);
emailCampaignSchema.index({ status: 1, leaseUntil: 1 });
emailCampaignSchema.index({ createdAt: -1 });

const EmailCampaign =
  mongoose.models.EmailCampaign ||
  mongoose.model<IEmailCampaign>('EmailCampaign', emailCampaignSchema);

export default EmailCampaign;
