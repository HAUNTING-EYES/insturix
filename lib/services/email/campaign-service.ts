import { Client } from '@upstash/qstash';
import { Types } from 'mongoose';

import EmailCampaign, {
  type EmailCampaignCooldownType,
  type EmailCampaignKind,
  type IEmailCampaign,
} from '@/schemas/EmailCampaignSchema';
import { EmailCooldown } from '@/schemas/EmailCooldown';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import { User } from '@/schemas/user';
import {
  EMAIL_TOPICS,
  isValidEmailAddress,
  normalizeEmailAddress,
  type EmailTopic,
} from './contact-policy';
import { sendBatchEmailsManaged } from './helpers';
import { customUserMailingTemplate } from './templates/custom-mailing';
import { promotionalEmailTemplate } from './templates/promotional';
import type { MailMessage } from './types';

const CAMPAIGN_CHUNK_SIZE = 50;
const CAMPAIGN_LEASE_MS = 90_000;
const WORKER_PATH = '/api/email/send';
const QSTASH_RETRIES = 5;

export interface CreateEmailCampaignInput {
  kind: EmailCampaignKind;
  topic: EmailTopic;
  subject: string;
  message?: string;
  createdBy: string;
  sourceRoute: string;
  cooldownType: EmailCampaignCooldownType;
}

export interface EnqueuedEmailCampaign {
  campaignId: string;
  totalRecipients: number;
  resumed: boolean;
}

export type CampaignChunkResult =
  | {
      state: 'queued';
      campaignId: string;
      processed: number;
      sequence: number;
    }
  | {
      state: 'completed';
      campaignId: string;
      processed: number;
    }
  | {
      state: 'recovered' | 'stale';
      campaignId: string;
      sequence: number;
    };

export class EmailCampaignQueueError extends Error {
  constructor(
    message: string,
    readonly status: number = 500
  ) {
    super(message);
    this.name = 'EmailCampaignQueueError';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function validateCampaignInput(input: CreateEmailCampaignInput): void {
  if (!EMAIL_TOPICS.includes(input.topic)) {
    throw new EmailCampaignQueueError('Unsupported email topic.', 400);
  }
  if (!input.subject.trim() || input.subject.length > 200) {
    throw new EmailCampaignQueueError(
      'Campaign subject must contain 1 to 200 characters.',
      400
    );
  }
  if (
    input.kind === 'custom' &&
    (!input.message?.trim() || input.message.length > 50_000)
  ) {
    throw new EmailCampaignQueueError(
      'Custom campaign message must contain 1 to 50,000 characters.',
      400
    );
  }
}

function workerBaseUrl(): URL {
  let rawUrl =
    process.env.EMAIL_WORKER_BASE_URL ??
    process.env.EMAIL_PUBLIC_BASE_URL ??
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL;

  if (!rawUrl) {
    throw new EmailCampaignQueueError(
      'An email worker base URL is not configured.',
      503
    );
  }
  if (!/^https?:\/\//i.test(rawUrl)) {
    rawUrl = `https://${rawUrl}`;
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new EmailCampaignQueueError(
      'The configured email worker base URL is invalid.',
      503
    );
  }

  const isLocal =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !isLocal) {
    throw new EmailCampaignQueueError(
      'The email worker base URL must use HTTPS.',
      503
    );
  }
  if (url.username || url.password) {
    throw new EmailCampaignQueueError(
      'The email worker base URL cannot contain credentials.',
      503
    );
  }
  return url;
}

function qstashClient(): Client {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) {
    throw new EmailCampaignQueueError(
      'QSTASH_TOKEN is required for durable email campaigns.',
      503
    );
  }
  return new Client({
    token,
    baseUrl: process.env.QSTASH_URL || undefined,
  });
}

export async function dispatchCampaignChunk(
  campaignId: string,
  sequence: number
): Promise<void> {
  const url = new URL(WORKER_PATH, workerBaseUrl()).toString();
  await qstashClient().publishJSON({
    url,
    body: { campaignId, sequence },
    retries: QSTASH_RETRIES,
    timeout: 120,
    deduplicationId: `email-campaign-${campaignId}-${sequence}`,
    flowControl: {
      key: 'insturix-email-campaigns',
      parallelism: 1,
      rate: 1,
      period: '1s',
    },
    label: 'insturix-email-campaign',
  });
}

async function latestRecipientBoundary(): Promise<{
  totalRecipients: number;
  recipientUpperBound: Types.ObjectId;
}> {
  const latestRecipient = await User.findOne({})
    .select('_id')
    .sort({ _id: -1 });
  if (!latestRecipient?._id) {
    throw new EmailCampaignQueueError(
      'No registered users are available for this campaign.',
      404
    );
  }

  const recipientUpperBound = new Types.ObjectId(String(latestRecipient._id));
  const totalRecipients = await User.countDocuments({
    _id: { $lte: recipientUpperBound },
  });
  return { totalRecipients, recipientUpperBound };
}

async function dispatchExistingCampaign(
  campaign: IEmailCampaign
): Promise<EnqueuedEmailCampaign> {
  try {
    await dispatchCampaignChunk(
      String(campaign._id),
      campaign.dispatchSequence
    );
  } catch (error) {
    await EmailCampaign.updateOne(
      { _id: campaign._id },
      { $set: { lastError: errorMessage(error) } }
    );
    throw error;
  }

  return {
    campaignId: String(campaign._id),
    totalRecipients: campaign.totalRecipients,
    resumed: true,
  };
}

export async function createAndDispatchEmailCampaign(
  input: CreateEmailCampaignInput
): Promise<EnqueuedEmailCampaign> {
  validateCampaignInput(input);
  await connectToDatabase();
  await EmailCampaign.init();

  const activeCampaign = await EmailCampaign.findOne({
    lockKey: input.cooldownType,
    status: { $in: ['queued', 'running'] },
  });
  if (activeCampaign) {
    return dispatchExistingCampaign(activeCampaign);
  }

  const { totalRecipients, recipientUpperBound } =
    await latestRecipientBoundary();
  let campaign: IEmailCampaign;
  try {
    campaign = await EmailCampaign.create({
      ...input,
      subject: input.subject.trim(),
      message: input.message?.trim(),
      status: 'queued',
      lockKey: input.cooldownType,
      totalRecipients,
      recipientUpperBound,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const concurrentCampaign = await EmailCampaign.findOne({
      lockKey: input.cooldownType,
      status: { $in: ['queued', 'running'] },
    });
    if (!concurrentCampaign) throw error;
    return dispatchExistingCampaign(concurrentCampaign);
  }

  try {
    await dispatchCampaignChunk(String(campaign._id), 0);
  } catch (error) {
    await EmailCampaign.updateOne(
      { _id: campaign._id },
      { $set: { lastError: errorMessage(error) } }
    );
    throw error;
  }

  return {
    campaignId: String(campaign._id),
    totalRecipients,
    resumed: false,
  };
}

function safeDisplayName(value: unknown, email: string): string {
  const fallback = email.split('@')[0] || 'Valued User';
  const raw =
    typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return raw.replaceAll('<', '&lt;').replaceAll('>', '&gt;').slice(0, 120);
}

function htmlSafeSubject(subject: string): string {
  return subject
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function messageForRecipient(
  campaign: IEmailCampaign,
  recipient: { email: string; username?: string | null }
): MailMessage {
  const name = safeDisplayName(recipient.username, recipient.email);
  const content =
    campaign.kind === 'custom'
      ? customUserMailingTemplate(
          name,
          campaign.message as string,
          htmlSafeSubject(campaign.subject)
        )
      : promotionalEmailTemplate(name);

  return {
    to: recipient.email,
    subject: campaign.subject,
    htmlBody: content.html,
    textBody: content.text,
    tags: {
      campaign_id: String(campaign._id),
      campaign_kind: campaign.kind,
    },
    delivery: {
      stream: 'marketing',
      topicName: campaign.topic,
    },
  };
}

async function recordCampaignCooldown(
  campaign: IEmailCampaign
): Promise<void> {
  if (campaign.cooldownRecordedAt) return;

  const status =
    campaign.failedCount === 0
      ? 'success'
      : campaign.successfulCount === 0
        ? 'failed'
        : 'partial';
  const now = new Date();

  await EmailCooldown.collection.updateOne(
    { campaignId: campaign._id },
    {
      $setOnInsert: {
        campaignId: campaign._id,
        emailType: campaign.cooldownType,
        lastSentAt: campaign.completedAt ?? now,
        cooldownPeriodDays:
          campaign.cooldownType === 'custom-mailing' ? 1 : 3,
        sentBy: campaign.createdBy,
        recipientCount: campaign.processedCount,
        status,
        metadata: {
          successCount: campaign.successfulCount,
          failedCount: campaign.failedCount,
          skippedCount: campaign.skippedCount,
        },
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true }
  );
  await EmailCampaign.updateOne(
    { _id: campaign._id, cooldownRecordedAt: { $exists: false } },
    { $set: { cooldownRecordedAt: now } }
  );
}

async function completeCampaign(
  campaign: IEmailCampaign,
  sequence: number
): Promise<IEmailCampaign> {
  const completed = await EmailCampaign.findOneAndUpdate(
    {
      _id: campaign._id,
      status: 'running',
      dispatchSequence: sequence,
    },
    {
      $set: {
        status: 'completed',
        completedAt: new Date(),
      },
      $unset: {
        leaseUntil: 1,
        lockKey: 1,
        lastError: 1,
      },
    },
    { new: true }
  );
  if (!completed) {
    throw new EmailCampaignQueueError(
      'Campaign completion ownership was lost.',
      409
    );
  }
  await recordCampaignCooldown(completed);
  return completed;
}

async function recoverCurrentDispatch(
  campaign: IEmailCampaign
): Promise<CampaignChunkResult> {
  await dispatchCampaignChunk(
    String(campaign._id),
    campaign.dispatchSequence
  );
  return {
    state: 'recovered',
    campaignId: String(campaign._id),
    sequence: campaign.dispatchSequence,
  };
}

export async function processEmailCampaignChunk(
  campaignId: string,
  sequence: number
): Promise<CampaignChunkResult> {
  if (!Types.ObjectId.isValid(campaignId)) {
    throw new EmailCampaignQueueError('Invalid campaign id.', 400);
  }
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new EmailCampaignQueueError('Invalid campaign sequence.', 400);
  }

  await connectToDatabase();
  const existing = await EmailCampaign.findById(campaignId);
  if (!existing) {
    throw new EmailCampaignQueueError('Email campaign not found.', 404);
  }
  if (existing.status === 'completed') {
    await recordCampaignCooldown(existing);
    return {
      state: 'completed',
      campaignId,
      processed: existing.processedCount,
    };
  }
  if (sequence < existing.dispatchSequence) {
    return recoverCurrentDispatch(existing);
  }
  if (sequence > existing.dispatchSequence || existing.status === 'failed') {
    return {
      state: 'stale',
      campaignId,
      sequence: existing.dispatchSequence,
    };
  }

  const now = new Date();
  const claimed = await EmailCampaign.findOneAndUpdate(
    {
      _id: campaignId,
      dispatchSequence: sequence,
      status: { $in: ['queued', 'running'] },
      $or: [
        { leaseUntil: { $exists: false } },
        { leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        status: 'running',
        leaseUntil: new Date(now.getTime() + CAMPAIGN_LEASE_MS),
      },
      $unset: { lastError: 1 },
    },
    { new: true }
  );
  if (!claimed) {
    throw new EmailCampaignQueueError(
      'Campaign chunk is already being processed.',
      503
    );
  }

  try {
    const recipientFilter = claimed.recipientCursor
      ? {
          _id: {
            $gt: claimed.recipientCursor,
            $lte: claimed.recipientUpperBound,
          },
        }
      : { _id: { $lte: claimed.recipientUpperBound } };
    const recipients = await User.find(recipientFilter)
      .select('_id email username')
      .sort({ _id: 1 })
      .limit(CAMPAIGN_CHUNK_SIZE)
      .lean();

    if (recipients.length === 0) {
      const completed = await completeCampaign(claimed, sequence);
      return {
        state: 'completed',
        campaignId,
        processed: completed.processedCount,
      };
    }

    const validRecipients = recipients.filter(recipient => {
      const normalized = normalizeEmailAddress(recipient.email);
      return isValidEmailAddress(normalized);
    });
    const invalidRecipientCount =
      recipients.length - validRecipients.length;
    const messages = validRecipients.map(recipient =>
      messageForRecipient(claimed, {
        email: normalizeEmailAddress(recipient.email),
        username: recipient.username,
      })
    );
    const batch = await sendBatchEmailsManaged(messages, {
      batchSize: 10,
      maxConcurrent: 3,
      delayBetweenBatches: 250,
    });
    const nextSequence = sequence + 1;
    const lastRecipient = recipients.at(-1);
    if (!lastRecipient?._id) {
      throw new EmailCampaignQueueError(
        'Campaign recipient cursor could not be advanced.'
      );
    }

    const advanced = await EmailCampaign.findOneAndUpdate(
      {
        _id: campaignId,
        status: 'running',
        dispatchSequence: sequence,
      },
      {
        $set: {
          status: 'queued',
          dispatchSequence: nextSequence,
          recipientCursor: lastRecipient._id,
        },
        $inc: {
          processedCount: recipients.length,
          successfulCount: batch.summary.successful,
          skippedCount: batch.summary.skipped,
          failedCount: batch.summary.failed + invalidRecipientCount,
        },
        $unset: {
          leaseUntil: 1,
          lastError: 1,
        },
      },
      { new: true }
    );
    if (!advanced) {
      throw new EmailCampaignQueueError(
        'Campaign cursor ownership was lost.',
        409
      );
    }

    try {
      await dispatchCampaignChunk(campaignId, nextSequence);
    } catch (error) {
      await EmailCampaign.updateOne(
        { _id: campaignId, dispatchSequence: nextSequence },
        { $set: { lastError: errorMessage(error) } }
      );
      throw error;
    }

    return {
      state: 'queued',
      campaignId,
      processed: advanced.processedCount,
      sequence: nextSequence,
    };
  } catch (error) {
    await EmailCampaign.updateOne(
      {
        _id: campaignId,
        status: 'running',
        dispatchSequence: sequence,
      },
      {
        $set: {
          status: 'queued',
          lastError: errorMessage(error),
        },
        $unset: { leaseUntil: 1 },
      }
    );
    throw error;
  }
}
