import { randomUUID } from 'node:crypto';

import { COLLECTIONS, getDatabase } from '@/lib/editron/db/mongodb';
import type { Checkpoint } from '@/lib/editron/services/checkpoint-service';
import { chatService } from '@/lib/editron/services/chat-service';
import {
  ensureChatEditRenderVerificationLifecycle,
  type ChatEditRenderVerificationRecord,
  type PersistedChatEditRenderVerificationRecord,
} from '@/lib/editron/services/chat-edit-render-verification-lifecycle';

const NOTIFICATION_LEASE_MS = 2 * 60_000;
const NOTIFICATION_RECOVERY_GRACE_MS = 5 * 60_000;
const MAX_BATCH_SIZE = 25;

type EditronDatabase = Awaited<ReturnType<typeof getDatabase>>;

interface VerificationCheckpoint extends Checkpoint {
  chatEditRenderVerification?: PersistedChatEditRenderVerificationRecord;
}

export interface ChatEditRenderVerificationNotificationSweepResult {
  scanned: number;
  notified: number;
  skipped: number;
  errors: number;
}

export function chatEditRenderVerificationNotificationIdempotencyKey(input: {
  projectId: string;
  sessionId: string;
  operationId: string;
}): string {
  return `editron:chat-render-verification:notification:${input.projectId}:${input.sessionId}:${input.operationId}`
    .slice(0, 240);
}

export async function deliverChatEditRenderVerificationNotification(input: {
  db: EditronDatabase;
  projectId: string;
  userId: string;
  checkpointId: string;
  record: ChatEditRenderVerificationRecord;
  now?: Date;
}): Promise<'sent' | 'skipped'> {
  if (!isTerminalRecord(input.record)) return 'skipped';
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const staleBeforeIso = new Date(now.getTime() - NOTIFICATION_RECOVERY_GRACE_MS).toISOString();
  const leaseExpiresAt = new Date(now.getTime() + NOTIFICATION_LEASE_MS).toISOString();
  const leaseToken = randomUUID();
  const checkpoints = input.db.collection<VerificationCheckpoint>(COLLECTIONS.CHECKPOINTS);
  const notificationBase = {
    checkpointId: input.checkpointId,
    projectId: input.projectId,
    userId: input.userId,
    'chatEditRenderVerification.operationId': input.record.operationId,
    'chatEditRenderVerification.sessionId': input.record.sessionId,
  };
  const claim = await checkpoints.updateOne(
    {
      ...notificationBase,
      $or: [
        { 'chatEditRenderVerification.notificationStatus': 'pending' },
        { 'chatEditRenderVerification.notificationStatus': { $exists: false } },
        {
          'chatEditRenderVerification.notificationStatus': 'sending',
          'chatEditRenderVerification.notificationLeaseExpiresAt': { $lt: nowIso },
        },
        {
          'chatEditRenderVerification.notificationStatus': 'sending',
          'chatEditRenderVerification.notificationLeaseExpiresAt': { $exists: false },
          'chatEditRenderVerification.completedAt': { $lt: staleBeforeIso },
        },
      ],
    },
    {
      $set: {
        'chatEditRenderVerification.notificationStatus': 'sending',
        'chatEditRenderVerification.notificationLeaseToken': leaseToken,
        'chatEditRenderVerification.notificationLeaseExpiresAt': leaseExpiresAt,
        'chatEditRenderVerification.notificationLastError': null,
      },
      $inc: { 'chatEditRenderVerification.notificationAttemptCount': 1 },
    },
  );
  if (claim.matchedCount !== 1) return 'skipped';

  try {
    await chatService.saveMessage(input.record.sessionId, input.userId, input.projectId, {
      role: 'assistant',
      content: notificationContent(input.record),
      checkpointIds: [input.record.beforeCheckpointId, input.record.afterCheckpointId],
      idempotencyKey: chatEditRenderVerificationNotificationIdempotencyKey({
        projectId: input.projectId,
        sessionId: input.record.sessionId,
        operationId: input.record.operationId,
      }),
    });
    const confirmed = await checkpoints.updateOne(
      {
        ...notificationBase,
        'chatEditRenderVerification.notificationStatus': 'sending',
        'chatEditRenderVerification.notificationLeaseToken': leaseToken,
      },
      {
        $set: {
          'chatEditRenderVerification.notificationStatus': 'sent',
          'chatEditRenderVerification.notificationSentAt': new Date().toISOString(),
          'chatEditRenderVerification.notificationLeaseToken': null,
          'chatEditRenderVerification.notificationLeaseExpiresAt': null,
          'chatEditRenderVerification.notificationLastError': null,
        },
      },
    );
    if (confirmed.matchedCount !== 1) {
      throw new Error('Unable to confirm a checkpoint-owned chat render-verification notification.');
    }
    return 'sent';
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    await checkpoints.updateOne(
      {
        ...notificationBase,
        'chatEditRenderVerification.notificationStatus': 'sending',
        'chatEditRenderVerification.notificationLeaseToken': leaseToken,
      },
      {
        $set: {
          'chatEditRenderVerification.notificationStatus': 'pending',
          'chatEditRenderVerification.notificationLeaseToken': null,
          'chatEditRenderVerification.notificationLeaseExpiresAt': null,
          'chatEditRenderVerification.notificationLastError': reason.slice(0, 500),
        },
      },
    );
    throw error;
  }
}

export async function sweepChatEditRenderVerificationNotifications(input: {
  now?: Date;
  batchSize?: number;
  db?: EditronDatabase;
} = {}): Promise<ChatEditRenderVerificationNotificationSweepResult> {
  const db = input.db ?? await getDatabase();
  const now = input.now ?? new Date();
  const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, input.batchSize ?? MAX_BATCH_SIZE));
  const checkpoints = db.collection<VerificationCheckpoint>(COLLECTIONS.CHECKPOINTS);
  const candidates = await checkpoints.find({
    'chatEditRenderVerification.status': { $in: ['pass', 'warn', 'fail', 'error'] },
    'chatEditRenderVerification.notificationStatus': { $ne: 'sent' },
  }).limit(batchSize).toArray();
  const result: ChatEditRenderVerificationNotificationSweepResult = {
    scanned: candidates.length,
    notified: 0,
    skipped: 0,
    errors: 0,
  };

  for (const checkpoint of candidates) {
    const record = checkpoint.chatEditRenderVerification
      ? ensureChatEditRenderVerificationLifecycle(checkpoint.chatEditRenderVerification, now)
      : null;
    if (!record) {
      result.skipped += 1;
      continue;
    }
    try {
      const outcome = await deliverChatEditRenderVerificationNotification({
        db,
        projectId: checkpoint.projectId,
        userId: checkpoint.userId,
        checkpointId: checkpoint.checkpointId,
        record,
        now,
      });
      if (outcome === 'sent') result.notified += 1;
      else result.skipped += 1;
    } catch (error: unknown) {
      result.errors += 1;
      console.error(
        `[ChatRenderVerificationNotificationRecovery] ${checkpoint.projectId}/${record.operationId}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return result;
}

function isTerminalRecord(record: ChatEditRenderVerificationRecord): boolean {
  return record.status === 'pass'
    || record.status === 'warn'
    || record.status === 'fail'
    || record.status === 'error';
}

function notificationContent(record: ChatEditRenderVerificationRecord): string {
  const operationContent = record.status === 'pass'
    ? `Rendered verification passed for edit operation ${record.operationId}. The affected ${record.modalities.join(' and ')} output changed and passed the rendered quality checks.`
    : record.status === 'warn'
      ? `Rendered verification completed for edit operation ${record.operationId} with advisory quality warnings: ${record.reasons.join('; ') || 'review the persisted rendered evidence'}. The edit remains applied, and the warning evidence is available for review.`
      : `The edit was saved, but rendered verification did not pass for operation ${record.operationId}: ${record.reasons.join('; ') || 'unknown verification failure'}. I am not marking this edit as successful; review the persisted before/after evidence for the affected frames or audio windows.`;
  const eligibility = record.projectRenderEligibility;
  const projectContent = eligibility?.status === 'blocked'
    ? ` Final project rendering is still blocked by ${eligibility.issueCount} existing render-eligibility issue${eligibility.issueCount === 1 ? '' : 's'}: ${eligibility.issues.map((issue) => issue.reason).slice(0, 3).join('; ')}.`
    : eligibility?.status === 'unknown'
      ? ' Final project render eligibility could not be evaluated and remains unknown.'
      : '';
  return `${operationContent}${projectContent}`;
}
