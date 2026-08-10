import { describe, expect, it } from 'vitest';

import { extractPersistedChatBattleRenderEvidence } from '@/lib/editron/services/chat-edit-battle-harness';
import {
  buildRequestedChatEditRenderVerification,
  ensureChatEditRenderVerificationLifecycle,
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
});
