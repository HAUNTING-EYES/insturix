import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  DURABLE_WORKFLOW_JOB_VERSION_V1,
  type DurableWorkflowJobSnapshotV1,
} from '@/lib/editron/services/durable-workflow-job-v1';
import { createNativeMediaFinalRenderExecutionBudgetReservedRecordV1 }
  from '@/lib/editron/services/native-media-final-render-execution-budget-ledger-record-v1';
import type { NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1 }
  from '@/lib/editron/services/native-media-final-render-execution-budget-ledger-owner-v1';
import { createNativeMediaFinalRenderExecutionBudgetPolicyV1 }
  from '@/lib/editron/services/native-media-final-render-execution-budget-policy-v1';
import {
  createNativeMediaFinalRenderExecutionBudgetAuthorizationV1,
  createNativeMediaFinalRenderExecutionBudgetReservationV1,
  nativeMediaFinalRenderExecutionBudgetReservationRefV1,
} from '@/lib/editron/services/native-media-final-render-execution-budget-reservation-v1';
import { createNativeMediaFinalRenderExecutionBudgetSettlementV1 }
  from '@/lib/editron/services/native-media-final-render-execution-budget-settlement-v1';
import { createNativeMediaFinalRenderExecutionBudgetWorkerOwnerV1 }
  from '@/lib/editron/services/native-media-final-render-execution-budget-worker-owner-v1';
import { NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-ffmpeg-encoder-v1';
import { NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-materializer-v1';
import {
  buildNativeMediaFinalRenderPreparationJobContractV1,
} from '@/lib/editron/services/native-media-final-render-preparation-job-v1';
import {
  createNativeMediaFinalRenderPreparationResumeStateV1,
  createNativeMediaFinalRenderPreparationTerminalReceiptV1,
} from '@/lib/editron/services/native-media-final-render-preparation-result-v1';
import { createNativeMediaFinalRenderPreparationRuntimePolicyV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-runtime-policy-v1';
import { NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-profile-v1';
import { NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-r2-private-artifact-v1';
import { createNativeMediaFinalRenderArtifactV1 }
  from '@/lib/editron/services/native-media-final-render-source-preparation-v1';

const HASH = (character: string) => character.repeat(64);
const NOW = '2026-08-30T00:10:00.000Z';
describe('native final-render execution-budget durable worker owner v1', () => {
  it('authorizes only the exact running job, reservation, scope and policy', async () => {
    const fixture = build();
    const authorized = await fixture.owner.authorize({
      job: snapshot(fixture), jobInput: fixture.contract.payload,
    });
    expect(authorized).toMatchObject({
      disposition: 'AUTHORIZED', reservationId: fixture.reservation.reservationId,
      reservationBindingSha256: fixture.reservation.reservationSha256,
    });
    expect(authorized).toHaveProperty('authorizationReceiptSha256', expect.stringMatching(
      /^[a-f0-9]{64}$/,
    ));

    await expect(fixture.owner.authorize({
      job: snapshot(fixture, { attemptCount: 0 }),
      jobInput: fixture.contract.payload,
    })).resolves.toMatchObject({ disposition: 'BLOCKED', retryable: false,
      errorCode: expect.stringContaining('JOB_BINDING_MISMATCH') });
  });

  it('blocks expired and foreign-scope reservations before preparation', async () => {
    const fixture = build('2026-08-30T01:00:00.000Z');
    await expect(fixture.owner.authorize({
      job: snapshot(fixture), jobInput: fixture.contract.payload,
    })).resolves.toMatchObject({ disposition: 'BLOCKED',
      errorCode: expect.stringContaining('RESERVATION_EXPIRED') });

    const current = await fixture.resolve.mock.results[0]?.value;
    fixture.resolve.mockResolvedValueOnce({
      ...current,
      record: {
        ...current.record,
        authorization: {
          ...current.record.authorization,
          scope: { ...current.record.authorization.scope, projectId: 'foreign-project' },
        },
      },
    } as never);
    await expect(fixture.owner.authorize({
      job: snapshot(fixture), jobInput: fixture.contract.payload,
    })).resolves.toMatchObject({ disposition: 'BLOCKED',
      errorCode: expect.stringContaining('SCOPE_OR_POLICY_MISMATCH') });
  });

  it('meters a one-attempt PASS from the validated artifact', async () => {
    const fixture = build();
    const terminal = passSnapshot(fixture, 1);
    const settlement = await fixture.owner.settleTerminal(terminal) as {
      mode: string; usage: Record<string, string>;
    };
    expect(settlement).toMatchObject({
      mode: 'METERED_FINAL_ARTIFACT',
      usage: {
        encodedFrameAttempts: '60',
        artifactBytesWritten: '123456', artifactBytesVerified: '123456',
      },
    });
    expect(fixture.settle).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'METERED_FINAL_ARTIFACT',
    }));
  });

  it('settles a successful retry conservatively without inventing usage', async () => {
    const fixture = build();
    await fixture.owner.settleTerminal(passSnapshot(fixture, 2));
    expect(fixture.settle).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'CONSERVATIVE_MAX_PASS_RETRY_ACCOUNTING_UNKNOWN', usage: null,
    }));
  });

  it.each([
    [0, 'RELEASED_NO_EXECUTION'],
    [1, 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN'],
  ] as const)('classifies cancellation after %i attempts as %s', async (attemptCount, mode) => {
    const fixture = build();
    await fixture.owner.settleTerminal(cancelledSnapshot(fixture, attemptCount));
    expect(fixture.settle).toHaveBeenCalledWith(expect.objectContaining({ mode, usage: null }));
  });

  it('uses conservative accounting for dead letter and rejects forged PASS evidence', async () => {
    const fixture = build();
    await fixture.owner.settleTerminal(deadLetterSnapshot(fixture));
    expect(fixture.settle).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN', usage: null,
    }));

    const forged = { ...passSnapshot(fixture, 1), resumeState: null };
    await expect(fixture.owner.settleTerminal(forged)).rejects.toThrow(
      'PASS_RESUME_EVIDENCE_INVALID',
    );
  });
});

function build(now = NOW) {
  const policy = createNativeMediaFinalRenderExecutionBudgetPolicyV1({
    ownerVersion: 'finance-render-v1',
    effectiveAt: '2026-08-30T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
    encodedFrameAttempt: { nanoUsdNumerator: '3', unitsDenominator: '2' },
    artifactByteWritten: { nanoUsdNumerator: '1', unitsDenominator: '1000' },
    artifactByteVerified: { nanoUsdNumerator: '1', unitsDenominator: '1000' },
  });
  const revision = { schemaVersion: 1 as const, value: 12,
    compatibilityUpdatedAt: '2026-08-30T00:00:00.000Z' };
  const exactSourceRequest = {
    overlayId: 'overlay_1', assetId: 'asset_1', overlayTimingSha256: HASH('1'),
    assetTimingStateSha256: HASH('2'), sourceVersionSha256: HASH('3'),
    storageVersionSha256: HASH('4'), sourceBindingSha256: HASH('5'),
    sourcePtsCadenceMapStateSha256V3: HASH('6'), renderNativeAudio: true,
  };
  const authorization = createNativeMediaFinalRenderExecutionBudgetAuthorizationV1({
    policy,
    scope: {
      tenantId: 'tenant_1', userId: 'user_1', orgId: null,
      projectId: 'project_1', sequenceId: 'main',
      projectRevisionSha256: hashEditronCanonicalJsonV1(revision),
      admissionReceiptSha256: HASH('7'),
      exactSourceRequestSha256: hashEditronCanonicalJsonV1(exactSourceRequest),
    },
    maximumUsage: { encodedFrameAttempts: '300',
      artifactBytesWritten: '1000000', artifactBytesVerified: '1000000' },
    approvedBy: 'finance-admin', approvedAt: '2026-08-30T00:01:00.000Z',
    expiresAt: '2026-08-30T01:00:00.000Z',
  });
  const reservation = createNativeMediaFinalRenderExecutionBudgetReservationV1({
    policy, authorization, reservationId: 'nmfr_budget_1', reservedAt: NOW,
  });
  const contract = buildNativeMediaFinalRenderPreparationJobContractV1({
    tenantId: 'tenant_1', userId: 'user_1', orgId: null,
    projectId: 'project_1', sequenceId: 'main', projectRevision: revision,
    admissionReceiptSha256: HASH('7'),
    budgetReservation: nativeMediaFinalRenderExecutionBudgetReservationRefV1(reservation),
    exactSourceRequest,
    policyBindings: {
      materializerPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
      materializerPolicySha256: HASH('8'),
      encoderPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
      encoderPolicySha256: HASH('9'),
      privateArtifactPolicyVersion:
        NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
      privateArtifactPolicySha256: HASH('a'),
      runtimePolicy: createNativeMediaFinalRenderPreparationRuntimePolicyV1({
        executionBudget: { ownerId: policy.ownerId, ownerVersion: policy.ownerVersion,
          policySha256: policy.policySha256 },
        retryPolicy: { ownerId: 'render-retry', ownerVersion: '1', policySha256: HASH('b') },
        heartbeatPolicySha256: HASH('c'),
      }),
    },
    executionProfile: { workerImageDigest: `sha256:${HASH('d')}`,
      compatibilityProfileVersion: NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1,
      compatibilityReceiptSha256: HASH('e') },
  });
  const record = createNativeMediaFinalRenderExecutionBudgetReservedRecordV1(
    policy, authorization, reservation,
  );
  const resolve = vi.fn(async () => ({ policy, record }));
  const settle = vi.fn(async (request: Parameters<
    NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1['settle']
  >[0]) => createNativeMediaFinalRenderExecutionBudgetSettlementV1({
    policy, authorization, reservation, ...request, settledAt: NOW,
  }));
  const ledgerOwner: NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1 = {
    reserve: async () => reservation, resolve, settle,
  };
  return { policy, authorization, reservation, contract, resolve, settle, ledgerOwner,
    owner: createNativeMediaFinalRenderExecutionBudgetWorkerOwnerV1({
      ledgerOwner, policy, clock: () => new Date(now),
    }) };
}

type Fixture = ReturnType<typeof build>;

function snapshot(fixture: Fixture, overrides: Partial<DurableWorkflowJobSnapshotV1> = {}) {
  const job = fixture.contract;
  const attemptCount = overrides.attemptCount ?? 1;
  return {
    jobId: 'dwj_exact_1', version: DURABLE_WORKFLOW_JOB_VERSION_V1,
    tenantId: job.payload.tenantId, userId: job.payload.userId, orgId: job.payload.orgId,
    projectId: job.payload.projectId, operationOwner: 'NATIVE_MEDIA_FINAL_RENDER',
    operationKind: 'native_media_final_render_prepare_source', operationId: job.operationIdentity,
    parentCommandId: null, parentReceiptId: null, idempotencyKey: job.operationIdentity,
    input: { schemaId: job.payload.version, bindingSha256: job.bindingSha256,
      payload: job.payload }, dependencies: job.dependencies,
    budgetReservation: job.payload.budgetReservation, status: 'running' as const,
    attemptCount, maxAttempts: 3, remainingAttempts: 3 - attemptCount,
    retryCursor: null, leaseOwnerId: 'worker_1', leaseExpiresAt: '2026-08-30T00:15:00.000Z',
    nextAttemptAt: null, cancelRequestedAt: null, cancelRequestedBy: null,
    cancelReason: null, resumeState: null, terminalReceipt: null, error: null,
    dispatchTransport: 'QSTASH', dispatchMessageId: 'message_1', dispatchCount: 1,
    createdAt: '2026-08-30T00:00:00.000Z', updatedAt: NOW,
    expiresAt: '2026-08-31T00:00:00.000Z', ...overrides,
  } satisfies DurableWorkflowJobSnapshotV1;
}

function passSnapshot(fixture: Fixture, attemptCount: number) {
  const artifact = artifactFor(fixture);
  const resume = createNativeMediaFinalRenderPreparationResumeStateV1({
    jobInput: fixture.contract.payload, jobInputBindingSha256: fixture.contract.bindingSha256,
    publishHandle: `nmfrpubv1_${HASH('f')}`, artifact,
  });
  const receipt = createNativeMediaFinalRenderPreparationTerminalReceiptV1({
    jobId: 'dwj_exact_1', operationId: fixture.contract.operationIdentity,
    jobInput: fixture.contract.payload, jobInputBindingSha256: fixture.contract.bindingSha256,
    result: resume.payload, executionAuthorizationReceiptSha256: HASH('0'),
    completedAt: new Date(NOW),
  });
  return snapshot(fixture, { status: 'completed', attemptCount,
    remainingAttempts: 3 - attemptCount, leaseOwnerId: null, leaseExpiresAt: null,
    resumeState: { ...resume, sequence: 1, committedAt: NOW },
    terminalReceipt: { ...receipt, completedAt: receipt.completedAt.toISOString() } });
}

function cancelledSnapshot(fixture: Fixture, attemptCount: number) {
  return snapshot(fixture, { status: 'cancelled', attemptCount,
    remainingAttempts: 3 - attemptCount, leaseOwnerId: null, leaseExpiresAt: null,
    terminalReceipt: { disposition: 'CANCELLED', receiptId: 'cancel_1',
      receiptSha256: HASH('1'), proofReferences: [], completedAt: NOW } });
}

function deadLetterSnapshot(fixture: Fixture) {
  return snapshot(fixture, { status: 'dead_letter', attemptCount: 1,
    remainingAttempts: 2, leaseOwnerId: null, leaseExpiresAt: null,
    error: { code: 'ENCODER_FAILED', message: 'ENCODER_FAILED', retryable: false,
      occurredAt: NOW } });
}

function artifactFor(fixture: Fixture) {
  const job = fixture.contract.payload;
  const request = job.exactSourceRequest;
  return createNativeMediaFinalRenderArtifactV1({
    schemaVersion: 1, kind: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_V1',
    artifactHandle: `nmfrv1_${HASH('f')}`, projectId: job.projectId,
    sequenceId: job.sequenceId, projectRevision: job.projectRevision,
    overlayId: request.overlayId, assetId: request.assetId,
    overlayTimingSha256: request.overlayTimingSha256,
    assetTimingStateSha256: request.assetTimingStateSha256,
    sourceVersionSha256: request.sourceVersionSha256,
    storageVersionSha256: request.storageVersionSha256,
    sourceBindingSha256: request.sourceBindingSha256,
    sourcePtsCadenceMapStateSha256V3: request.sourcePtsCadenceMapStateSha256V3,
    transformSha256: HASH('2'), projectRate: { numerator: '30', denominator: '1' },
    timelineStartFrame: '90', timelineFrameCount: '60',
    artifactProfile: 'EDITRON_EXACT_TIMESTAMP_AV_MEZZANINE_V1',
    container: 'matroska', videoCodec: 'h264', pixelFormat: 'gbrp',
    videoFrameCount: '60', decodedFrameSequenceSha256: HASH('3'),
    remotionCompatibilityReceiptSha256: HASH('e'),
    audio: { disposition: 'EMBEDDED_EXACT_NATIVE_PCM', audioCodec: 'pcm_s32le',
      audioMappingSha256: HASH('4'), sourceDecodedPcmSha256: HASH('5'),
      artifactDecodedPcmSha256: HASH('6'), decodedPcmEquivalenceReceiptSha256: HASH('7'),
      sampleRate: '48000', channelCount: 2, decodedSampleFrameCount: '96000' },
    contentType: 'video/x-matroska', artifactContentSha256: HASH('f'),
    artifactByteLength: '123456',
  });
}
