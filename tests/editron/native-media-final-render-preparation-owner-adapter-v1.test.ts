import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
  DurableWorkflowJobLeaseLostErrorV1,
} from '@/lib/editron/services/durable-workflow-job-v1';
import { NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-ffmpeg-encoder-v1';
import {
  buildNativeMediaFinalRenderPreparationJobContractV1,
} from '@/lib/editron/services/native-media-final-render-preparation-job-v1';
import { createNativeMediaFinalRenderPreparationRuntimePolicyV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-runtime-policy-v1';
import {
  createNativeMediaFinalRenderPreparationHeartbeatPolicyV1,
  createNativeMediaFinalRenderPreparationOwnerAdapterV1,
} from '@/lib/editron/services/native-media-final-render-preparation-owner-adapter-v1';
import {
  NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
  type NativeMediaFinalRenderArtifactPreparerPortV1,
}
  from '@/lib/editron/services/native-media-final-render-materializer-v1';
import { NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-profile-v1';
import { NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-r2-private-artifact-v1';
import { createNativeMediaFinalRenderArtifactV1 }
  from '@/lib/editron/services/native-media-final-render-source-preparation-v1';

const sha = (character: string) => character.repeat(64);
const revision = Object.freeze({
  schemaVersion: 1 as const,
  value: 17,
  compatibilityUpdatedAt: '2026-08-30T02:00:00.000Z',
});

afterEach(() => {
  vi.useRealTimers();
});

function contract() {
  return buildNativeMediaFinalRenderPreparationJobContractV1({
    tenantId: 'tenant_1', userId: 'user_1', orgId: null,
    projectId: 'project_1', sequenceId: 'main', projectRevision: revision,
    admissionReceiptSha256: sha('7'),
    budgetReservation: { reservationId: 'render_budget_1', bindingSha256: sha('0') },
    exactSourceRequest: {
      overlayId: 'overlay_1', assetId: 'asset_1', overlayTimingSha256: sha('1'),
      assetTimingStateSha256: sha('2'), sourceVersionSha256: sha('3'),
      storageVersionSha256: sha('4'), sourceBindingSha256: sha('5'),
      sourcePtsCadenceMapStateSha256V3: sha('6'), renderNativeAudio: false,
    },
    policyBindings: {
      materializerPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
      materializerPolicySha256: sha('8'),
      encoderPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
      encoderPolicySha256: sha('9'),
      privateArtifactPolicyVersion:
        NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
      privateArtifactPolicySha256: sha('a'),
      runtimePolicy: runtimePolicy(),
    },
    executionProfile: {
      workerImageDigest: `sha256:${sha('b')}`,
      compatibilityProfileVersion: NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1,
      compatibilityReceiptSha256: sha('c'),
    },
  });
}

function runtimePolicy() {
  return createNativeMediaFinalRenderPreparationRuntimePolicyV1({
    executionBudget: {
      ownerId: 'TEST_RENDER_BUDGET_OWNER',
      ownerVersion: 'TEST_RENDER_BUDGET_OWNER_V1',
      policySha256: sha('e'),
    },
    retryPolicy: {
      ownerId: 'TEST_RENDER_RETRY_POLICY',
      ownerVersion: 'TEST_RENDER_RETRY_POLICY_V1',
      policySha256: sha('f'),
    },
    heartbeatPolicySha256: sha('0'),
  });
}

function artifact() {
  const job = contract().payload;
  const request = job.exactSourceRequest;
  return createNativeMediaFinalRenderArtifactV1({
    schemaVersion: 1, kind: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_V1',
    artifactHandle: `nmfrv1_${sha('d')}`, projectId: job.projectId,
    sequenceId: job.sequenceId, projectRevision: job.projectRevision,
    overlayId: request.overlayId, assetId: request.assetId,
    overlayTimingSha256: request.overlayTimingSha256,
    assetTimingStateSha256: request.assetTimingStateSha256,
    sourceVersionSha256: request.sourceVersionSha256,
    storageVersionSha256: request.storageVersionSha256,
    sourceBindingSha256: request.sourceBindingSha256,
    sourcePtsCadenceMapStateSha256V3: request.sourcePtsCadenceMapStateSha256V3,
    transformSha256: sha('e'), projectRate: { numerator: '30', denominator: '1' },
    timelineStartFrame: '90', timelineFrameCount: '60',
    artifactProfile: 'EDITRON_EXACT_TIMESTAMP_AV_MEZZANINE_V1',
    container: 'matroska', videoCodec: 'h264', pixelFormat: 'gbrp',
    videoFrameCount: '60', decodedFrameSequenceSha256: sha('f'),
    remotionCompatibilityReceiptSha256: sha('c'),
    audio: {
      disposition: 'NO_AUDIO_MAPPING_REQUESTED', audioCodec: null,
      audioMappingSha256: null, sourceDecodedPcmSha256: null,
      artifactDecodedPcmSha256: null, decodedPcmEquivalenceReceiptSha256: null,
      sampleRate: null, channelCount: null, decodedSampleFrameCount: null,
    },
    contentType: 'video/x-matroska', artifactContentSha256: sha('d'),
    artifactByteLength: '123456',
  });
}

function snapshot() {
  const current = contract();
  return {
    jobId: 'job_1', tenantId: current.payload.tenantId,
    userId: current.payload.userId, projectId: current.payload.projectId,
    operationOwner: 'NATIVE_MEDIA_FINAL_RENDER',
    operationKind: 'native_media_final_render_prepare_source',
    input: {
      schemaId: current.payload.version,
      bindingSha256: current.bindingSha256,
      payload: current.payload,
    },
  } as never;
}

function preparedOutcome() {
  return {
    disposition: 'ARTIFACT_PREPARED' as const,
    artifact: artifact(),
    publishHandle: `nmfrpubv1_${sha('d')}`,
  };
}

function owner(input: Readonly<{
  prepare: NativeMediaFinalRenderArtifactPreparerPortV1['prepare'];
  heartbeatIntervalMs?: number;
}>) {
  return createNativeMediaFinalRenderPreparationOwnerAdapterV1({
    artifactPreparer: { prepare: input.prepare },
    heartbeatPolicy: createNativeMediaFinalRenderPreparationHeartbeatPolicyV1({
      heartbeatIntervalMs: input.heartbeatIntervalMs ?? 10,
    }),
  });
}

function ownerInput(heartbeat: () => Promise<void> = vi.fn(async () => undefined)) {
  const current = contract();
  return {
    job: snapshot(),
    jobInput: current.payload,
    lifecycle: { heartbeat },
  };
}

describe('native final-render preparation owner adapter v1', () => {
  it('returns only a result-validated URL-free artifact and publish handle', async () => {
    const prepare = vi.fn(async () => preparedOutcome());
    const heartbeat = vi.fn(async () => undefined);

    const result = await owner({ prepare }).prepare(ownerInput(heartbeat));

    expect(result).toMatchObject({
      disposition: 'PREPARED',
      publishHandle: `nmfrpubv1_${sha('d')}`,
      artifact: { artifactHandle: `nmfrv1_${sha('d')}` },
    });
    expect(JSON.stringify(result)).not.toMatch(/sourceUrl|https?:\/\//i);
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1', projectId: 'project_1', sequenceId: 'main',
      abortSignal: expect.any(AbortSignal),
    }));
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it('renews the lease sequentially while artifact preparation is running', async () => {
    vi.useFakeTimers();
    let finishPreparation: ((value: ReturnType<typeof preparedOutcome>) => void) | undefined;
    const prepare = vi.fn(() => new Promise<ReturnType<typeof preparedOutcome>>((resolve) => {
      finishPreparation = resolve;
    }));
    let concurrentHeartbeats = 0;
    let maximumConcurrentHeartbeats = 0;
    const heartbeat = vi.fn(async () => {
      concurrentHeartbeats += 1;
      maximumConcurrentHeartbeats = Math.max(maximumConcurrentHeartbeats, concurrentHeartbeats);
      await Promise.resolve();
      concurrentHeartbeats -= 1;
    });
    const pending = owner({ prepare }).prepare(ownerInput(heartbeat));

    await vi.advanceTimersByTimeAsync(35);
    expect(heartbeat.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(maximumConcurrentHeartbeats).toBe(1);

    finishPreparation?.(preparedOutcome());
    await expect(pending).resolves.toMatchObject({ disposition: 'PREPARED' });
  });

  it('aborts preparation and rejects its late result when the durable lease is lost', async () => {
    vi.useFakeTimers();
    const leaseFailure = new DurableWorkflowJobLeaseLostErrorV1('DURABLE_JOB_LEASE_LOST');
    let observedSignal: AbortSignal | undefined;
    const prepare = vi.fn(({
      abortSignal,
    }: Parameters<NativeMediaFinalRenderArtifactPreparerPortV1['prepare']>[0]) => {
      observedSignal = abortSignal;
      return new Promise<Awaited<ReturnType<
        NativeMediaFinalRenderArtifactPreparerPortV1['prepare']
      >>>((resolve) => {
        const finish = () => resolve({
          disposition: 'UNVERIFIABLE' as const,
          diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_EXECUTION_CANCELLED',
        });
        abortSignal?.addEventListener('abort', finish, { once: true });
        if (abortSignal?.aborted) finish();
      });
    });
    const heartbeat = vi.fn(async () => { throw leaseFailure; });
    const pending = owner({ prepare }).prepare(ownerInput(heartbeat));
    const rejected = expect(pending).rejects.toBe(leaseFailure);

    await vi.advanceTimersByTimeAsync(10);

    await rejected;
    expect(observedSignal?.aborted).toBe(true);
    expect(heartbeat).toHaveBeenCalledTimes(1);
  });

  it('creates deterministic proof for an owner-declared materialization gap', async () => {
    const prepare = vi.fn(async () => ({
      disposition: 'UNVERIFIABLE' as const,
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_SOURCE_SCOPE_STALE',
    }));
    const adapter = owner({ prepare });

    const first = await adapter.prepare(ownerInput());
    const second = await adapter.prepare(ownerInput());

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      disposition: 'UNVERIFIABLE',
      diagnosticCode: 'NATIVE_MEDIA_FINAL_RENDER_SOURCE_SCOPE_STALE',
    });
    expect(first.disposition === 'UNVERIFIABLE' ? first.proofSha256 : '')
      .toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects an unsafe or forged heartbeat policy before owner creation', () => {
    expect(() => createNativeMediaFinalRenderPreparationHeartbeatPolicyV1({
      heartbeatIntervalMs: Math.floor(DURABLE_WORKFLOW_JOB_LEASE_MS_V1 / 3) + 1,
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_INVALID');

    const policy = createNativeMediaFinalRenderPreparationHeartbeatPolicyV1({
      heartbeatIntervalMs: 10,
    });
    expect(() => createNativeMediaFinalRenderPreparationOwnerAdapterV1({
      artifactPreparer: { prepare: vi.fn() } as never,
      heartbeatPolicy: { ...policy, policySha256: sha('0') },
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_INVALID');
  });
});
