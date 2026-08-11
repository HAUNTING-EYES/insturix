import { randomUUID } from 'node:crypto';

import { COLLECTIONS, getDatabase } from '@/lib/editron/db/mongodb';
import type { Checkpoint } from '@/lib/editron/services/checkpoint-service';
import {
  dispatchPhase0RenderedEvidenceJob,
  type ChatEditRenderVerificationRequest,
  type Phase0RenderedEvidenceDispatchResult,
} from '@/lib/editron/services/phase0-rendered-evidence-worker';
import {
  claimChatEditRenderVerificationDispatchRecovery,
  deferChatEditRenderVerificationDispatch,
  ensureChatEditRenderVerificationLifecycle,
  markChatEditRenderVerificationDispatched,
  type ChatEditRenderVerificationRecord,
  type PersistedChatEditRenderVerificationRecord,
} from '@/lib/editron/services/chat-edit-render-verification-lifecycle';

const RECOVERY_GRACE_MS = 5 * 60_000;
const DISPATCH_LEASE_MS = 2 * 60_000;
const DISPATCH_RETRY_DELAY_MS = 5 * 60_000;
const MAX_BATCH_SIZE = 25;

type EditronDatabase = Awaited<ReturnType<typeof getDatabase>>;

interface VerificationCheckpoint extends Checkpoint {
  chatEditRenderVerification?: PersistedChatEditRenderVerificationRecord;
}

export interface ChatEditRenderVerificationDispatchSweepResult {
  scanned: number;
  eligible: number;
  claimed: number;
  dispatched: number;
  deferred: number;
  skipped: number;
  errors: number;
}

export async function sweepChatEditRenderVerificationDispatches(input: {
  now?: Date;
  batchSize?: number;
  db?: EditronDatabase;
  dispatch?: (
    payload: Parameters<typeof dispatchPhase0RenderedEvidenceJob>[0],
  ) => Promise<Phase0RenderedEvidenceDispatchResult>;
} = {}): Promise<ChatEditRenderVerificationDispatchSweepResult> {
  const now = input.now ?? new Date();
  const recoveryBefore = new Date(now.getTime() - RECOVERY_GRACE_MS);
  const db = input.db ?? await getDatabase();
  const dispatch = input.dispatch ?? dispatchPhase0RenderedEvidenceJob;
  const checkpoints = db.collection<VerificationCheckpoint>(COLLECTIONS.CHECKPOINTS);
  const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, input.batchSize ?? MAX_BATCH_SIZE));
  const candidates = await checkpoints.find({
    'chatEditRenderVerification.request.version': 'editron-chat-render-verification-v1',
    $or: [
      { 'chatEditRenderVerification.lifecycle.state': 'requested' },
      {
        'chatEditRenderVerification.lifecycle.state': 'failed',
        'chatEditRenderVerification.lifecycle.terminalStatus': 'dispatch-error',
      },
    ],
  }).limit(batchSize).toArray();

  const result: ChatEditRenderVerificationDispatchSweepResult = {
    scanned: candidates.length,
    eligible: 0,
    claimed: 0,
    dispatched: 0,
    deferred: 0,
    skipped: 0,
    errors: 0,
  };

  for (const checkpoint of candidates) {
    const record = checkpoint.chatEditRenderVerification
      ? ensureChatEditRenderVerificationLifecycle(checkpoint.chatEditRenderVerification, now)
      : null;
    const request = record ? recoveryRequest(record) : null;
    if (!record || !request || !isEligibleForDispatchRecovery(record, now, recoveryBefore)) {
      result.skipped += 1;
      continue;
    }
    result.eligible += 1;

    const leaseToken = randomUUID();
    const claimedRecord = claimChatEditRenderVerificationDispatchRecovery(record, {
      leaseToken,
      now,
      leaseDurationMs: DISPATCH_LEASE_MS,
    });
    const claim = await checkpoints.updateOne(
      checkpointRecordFilter(checkpoint, record),
      { $set: { chatEditRenderVerification: claimedRecord, updatedAt: now } },
    );
    if (claim.matchedCount !== 1) {
      result.skipped += 1;
      continue;
    }
    result.claimed += 1;

    let dispatchResult: Phase0RenderedEvidenceDispatchResult;
    try {
      dispatchResult = await dispatch({
        projectId: checkpoint.projectId,
        userId: checkpoint.userId,
        requestedAt: request.requestedAt,
        chatEditVerification: request,
      });
    } catch (error: unknown) {
      dispatchResult = {
        dispatched: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    const updatedRecord = dispatchResult.dispatched
      ? markChatEditRenderVerificationDispatched(claimedRecord, dispatchResult, now)
      : deferChatEditRenderVerificationDispatch(claimedRecord, {
          reason: dispatchResult.reason ?? 'render_verification_dispatch_deferred',
          now,
          retryDelayMs: DISPATCH_RETRY_DELAY_MS,
        });
    const persisted = await checkpoints.updateOne(
      {
        checkpointId: checkpoint.checkpointId,
        projectId: checkpoint.projectId,
        userId: checkpoint.userId,
        'chatEditRenderVerification.operationId': record.operationId,
        'chatEditRenderVerification.sessionId': record.sessionId,
        'chatEditRenderVerification.lifecycle.state': 'requested',
        'chatEditRenderVerification.lifecycle.dispatchLeaseToken': leaseToken,
      },
      { $set: { chatEditRenderVerification: updatedRecord, updatedAt: now } },
    );
    if (persisted.matchedCount !== 1) {
      // A worker or a newer recovery attempt already won the checkpoint CAS.
      // The queue may contain a duplicate message, but the receipt/attempt CAS
      // on the worker keeps it from applying a second proof result.
      result.skipped += 1;
      continue;
    }
    if (dispatchResult.dispatched) result.dispatched += 1;
    else result.deferred += 1;
  }

  return result;
}

export function isEligibleForDispatchRecovery(
  record: ChatEditRenderVerificationRecord,
  now: Date,
  recoveryBefore: Date = new Date(now.getTime() - RECOVERY_GRACE_MS),
): boolean {
  if (!recoveryRequest(record)) return false;
  const lifecycle = record.lifecycle;
  const leaseExpiresAt = parseIso(lifecycle.dispatchLeaseExpiresAt);
  if (leaseExpiresAt && leaseExpiresAt > now) return false;
  const retryAt = parseIso(lifecycle.nextDispatchAttemptAt);
  if (retryAt && retryAt > now) return false;
  if (lifecycle.state === 'failed' && lifecycle.terminalStatus === 'dispatch-error') return true;
  if (lifecycle.state === 'requested' && retryAt) return true;
  return lifecycle.state === 'requested' && parseIso(record.requestedAt) !== null
    && parseIso(record.requestedAt)! <= recoveryBefore;
}

function checkpointRecordFilter(
  checkpoint: VerificationCheckpoint,
  record: ChatEditRenderVerificationRecord,
) {
  return {
    checkpointId: checkpoint.checkpointId,
    projectId: checkpoint.projectId,
    userId: checkpoint.userId,
    'chatEditRenderVerification.operationId': record.operationId,
    'chatEditRenderVerification.sessionId': record.sessionId,
    'chatEditRenderVerification.lifecycle.updatedAt': record.lifecycle.updatedAt,
  };
}

function recoveryRequest(
  record: ChatEditRenderVerificationRecord,
): ChatEditRenderVerificationRequest | null {
  const request = record.request;
  if (
    !request
    || request.version !== 'editron-chat-render-verification-v1'
    || request.operationId !== record.operationId
    || request.sessionId !== record.sessionId
    || request.beforeCheckpointId !== record.beforeCheckpointId
    || request.afterCheckpointId !== record.afterCheckpointId
    || !request.subjectReceipt
    || !request.requestedAt
  ) {
    return null;
  }
  return structuredClone(request);
}

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
