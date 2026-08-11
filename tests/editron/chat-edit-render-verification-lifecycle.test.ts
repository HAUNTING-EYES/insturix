import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.MONGODB_URI ??= 'mongodb://localhost:27017/editron-test';
  process.env.MONGODB_DB_NAME ??= 'editron-test';
});

import { extractPersistedChatBattleRenderEvidence } from '@/lib/editron/services/chat-edit-battle-harness';
import { isEligibleForDispatchRecovery } from '@/lib/editron/services/chat-edit-render-verification-dispatch-recovery';
import {
  buildRequestedChatEditRenderVerification,
  claimChatEditRenderVerificationDispatchRecovery,
  deferChatEditRenderVerificationDispatch,
  ensureChatEditRenderVerificationLifecycle,
  markChatEditRenderVerificationDispatched,
  markChatEditRenderVerificationDelivered,
} from '@/lib/editron/services/chat-edit-render-verification-lifecycle';

const requestedAt = '2026-07-30T10:00:00.000Z';
const completedAt = '2026-07-30T10:00:05.000Z';

function failedRecordWithoutDiagnostics() {
  const requested = buildRequestedChatEditRenderVerification({
    version: 'editron-chat-render-verification-v1',
    operationId: 'op_render_truth',
    sessionId: 'session_render_truth',
    beforeCheckpointId: 'checkpoint_before',
    afterCheckpointId: 'checkpoint_after',
    requestedAt,
    modalities: ['visual'],
    targets: [{
      overlayId: 'overlay_1',
      overlayType: 'text',
      state: 'updated',
      from: 10,
      endFrame: 70,
    }],
    sampleFrames: [40],
  }, requestedAt);

  return {
    ...requested,
    status: 'fail' as const,
    startedAt: requestedAt,
    completedAt,
    reasons: [],
    issues: [],
    lifecycle: {
      ...requested.lifecycle,
      state: 'completed' as const,
      terminalStatus: 'quality-fail' as const,
      reason: 'visual_gate_needs_review',
      terminalAt: completedAt,
      updatedAt: completedAt,
    },
  };
}

describe('chat edit render-verification diagnostic truth', () => {
  it('repairs a current-version terminal record whose lifecycle reason was not persisted as evidence', () => {
    const normalized = ensureChatEditRenderVerificationLifecycle(
      failedRecordWithoutDiagnostics(),
      completedAt,
    );

    expect(normalized.reasons).toEqual(['visual_gate_needs_review']);
    expect(normalized.issues).toEqual([expect.objectContaining({
      modality: 'visual',
      severity: 'error',
      code: 'visual_gate_needs_review',
      message: 'visual_gate_needs_review',
    })]);
  });

  it('surfaces the lifecycle reason when battle evidence reads an already-persisted contradictory record', () => {
    const evidence = extractPersistedChatBattleRenderEvidence({
      intelligence: {
        latestChatEditRenderVerification: failedRecordWithoutDiagnostics(),
      },
    }, '2026-07-30T09:59:59.000Z');

    expect(evidence.status).toBe('fail');
    expect(evidence.issues).toEqual([expect.objectContaining({
      code: 'visual_gate_needs_review',
      message: 'visual_gate_needs_review',
      source: 'chat-edit-render-verification-reason',
    })]);
  });

  it('persists a server-issued attempt token and normalizes older records without one', () => {
    const requested = buildRequestedChatEditRenderVerification({
      version: 'editron-chat-render-verification-v1',
      operationId: 'op_render_attempt',
      sessionId: 'session_render_attempt',
      beforeCheckpointId: 'checkpoint_before',
      afterCheckpointId: 'checkpoint_after',
      requestedAt,
      modalities: ['visual'],
      targets: [],
      sampleFrames: [40],
    }, requestedAt);
    const delivered = markChatEditRenderVerificationDelivered(requested, {
      attemptCount: 1,
      workerRequestId: 'worker-request-1',
      attemptToken: 'attempt-token-1',
      now: completedAt,
    });
    const legacy = structuredClone(delivered) as unknown as {
      lifecycle: { attemptToken?: unknown };
    };
    delete legacy.lifecycle.attemptToken;

    expect(delivered.lifecycle.attemptToken).toBe('attempt-token-1');
    expect(ensureChatEditRenderVerificationLifecycle(
      legacy as Parameters<typeof ensureChatEditRenderVerificationLifecycle>[0],
      completedAt,
    ).lifecycle.attemptToken).toBeNull();
  });

  it('recovers a failed queue dispatch with a lease without treating proof as complete', () => {
    const requested = buildRequestedChatEditRenderVerification({
      version: 'editron-chat-render-verification-v1',
      operationId: 'op_dispatch_recovery',
      sessionId: 'session_dispatch_recovery',
      beforeCheckpointId: 'checkpoint_before',
      afterCheckpointId: 'checkpoint_after',
      subjectReceipt: {
        schemaVersion: 1,
        projectId: 'project_dispatch_recovery',
        revision: { schemaVersion: 1, value: 4, compatibilityUpdatedAt: requestedAt },
        committedAt: requestedAt,
      },
      requestedAt,
      modalities: ['visual'],
      targets: [],
      sampleFrames: [40],
    }, requestedAt);
    const failedDispatch = markChatEditRenderVerificationDispatched(requested, {
      dispatched: false,
      reason: 'qstash_publish_timeout',
    }, completedAt);
    const claimed = claimChatEditRenderVerificationDispatchRecovery(failedDispatch, {
      leaseToken: 'recovery-lease-1',
      now: completedAt,
      leaseDurationMs: 60_000,
    });
    const deferred = deferChatEditRenderVerificationDispatch(claimed, {
      reason: 'qstash_still_unavailable',
      now: completedAt,
      retryDelayMs: 60_000,
    });
    const redispatched = markChatEditRenderVerificationDispatched(claimed, {
      dispatched: true,
      messageId: 'qstash-message-2',
    }, completedAt);

    expect(claimed.status).toBe('pending');
    expect(claimed.lifecycle).toMatchObject({
      state: 'requested',
      terminalStatus: null,
      dispatchAttemptCount: 1,
      dispatchLeaseToken: 'recovery-lease-1',
    });
    expect(deferred.status).toBe('pending');
    expect(deferred.lifecycle).toMatchObject({
      state: 'requested',
      dispatchLeaseToken: null,
      lastDispatchError: 'qstash_still_unavailable',
    });
    expect(deferred.lifecycle.nextDispatchAttemptAt).toBe('2026-07-30T10:01:05.000Z');
    expect(isEligibleForDispatchRecovery(failedDispatch, new Date(completedAt))).toBe(true);
    expect(isEligibleForDispatchRecovery(deferred, new Date(completedAt))).toBe(false);
    expect(isEligibleForDispatchRecovery(deferred, new Date('2026-07-30T10:01:05.000Z'))).toBe(true);
    expect(redispatched.status).toBe('pending');
    expect(redispatched.lifecycle).toMatchObject({
      state: 'dispatched',
      qstashMessageId: 'qstash-message-2',
      dispatchLeaseToken: null,
      nextDispatchAttemptAt: null,
      lastDispatchError: null,
    });
  });
});
