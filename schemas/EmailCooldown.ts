import mongoose, { Document, Schema } from "mongoose";

/**
 * Email Cooldown Schema
 * Tracks when bulk promotional emails were last sent to prevent spam
 * and ensure compliance with email sending best practices
 */

export interface IEmailCooldown extends Document {
  emailType: 'promotional' | 'newsletter' | 'announcement' | 'ticket-confirmation' | 'custom-mailing';
  lastSentAt: Date;
  cooldownPeriodDays: number;
  sentBy: string; // Admin user ID who triggered the send
  recipientCount: number; // How many emails were sent
  status: 'success' | 'failed' | 'partial';
  metadata?: {
    successCount?: number;
    failedCount?: number;
    errorMessage?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const emailCooldownSchema = new Schema<IEmailCooldown>(
  {
    emailType: {
      type: String,
      enum: ['promotional', 'newsletter', 'announcement', 'ticket-confirmation', 'custom-mailing'],
      required: true,
    },
    lastSentAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    cooldownPeriodDays: {
      type: Number,
      required: true,
      default: 3,
      min: 1,
    },
    sentBy: {
      type: String,
      required: true,
    },
    recipientCount: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'partial'],
      required: true,
      default: 'success',
    },
    metadata: {
      successCount: { type: Number },
      failedCount: { type: Number },
      errorMessage: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
emailCooldownSchema.index({ emailType: 1, lastSentAt: -1 });

// Static method to check if cooldown period has passed
emailCooldownSchema.statics.canSendEmail = async function (
  emailType: string,
  cooldownDays: number = 3
): Promise<{ canSend: boolean; lastSent?: Date; nextAvailable?: Date }> {
  const latestSend = await this.findOne({ emailType })
    .sort({ lastSentAt: -1 })
    .lean();

  if (!latestSend) {
    return { canSend: true };
  }

  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
  const timeSinceLastSend = Date.now() - new Date(latestSend.lastSentAt).getTime();
  const canSend = timeSinceLastSend >= cooldownMs;

  const nextAvailable = new Date(
    new Date(latestSend.lastSentAt).getTime() + cooldownMs
  );

  return {
    canSend,
    lastSent: latestSend.lastSentAt,
    nextAvailable: canSend ? undefined : nextAvailable,
  };
};

// Static method to create a new cooldown record
emailCooldownSchema.statics.recordEmailSent = async function (
  emailType: string,
  sentBy: string,
  recipientCount: number,
  status: 'success' | 'failed' | 'partial',
  metadata?: { successCount?: number; failedCount?: number; errorMessage?: string }
) {
  return this.create({
    emailType,
    lastSentAt: new Date(),
    cooldownPeriodDays: 3,
    sentBy,
    recipientCount,
    status,
    metadata,
  });
};

// Static method to reset cooldown by deleting the latest record
emailCooldownSchema.statics.resetCooldown = async function (
  emailType: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await this.deleteMany({ emailType });
    
    if (result.deletedCount > 0) {
      return {
        success: true,
        message: `Cooldown reset successfully. Deleted ${result.deletedCount} record(s).`
      };
    } else {
      return {
        success: true,
        message: 'No cooldown records found to reset.'
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Failed to reset cooldown'
    };
  }
};

export const EmailCooldown =
  mongoose.models.EmailCooldown ||
  mongoose.model<IEmailCooldown>("EmailCooldown", emailCooldownSchema);
