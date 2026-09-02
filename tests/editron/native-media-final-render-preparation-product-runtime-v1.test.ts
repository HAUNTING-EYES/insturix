import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
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
import { NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-ffmpeg-encoder-v1';
import { NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-materializer-v1';
import { createNativeMediaFinalRenderPreparationExecutionManifestV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-execution-manifest-v1';
import { createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-delivery-retry-policy-v1';
import { createOrGetNativeMediaFinalRenderPreparationJobV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-job-v1';
import { createNativeMediaFinalRenderPreparationHeartbeatPolicyV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-owner-adapter-v1';
import {
  NATIVE_MEDIA_FINAL_RENDER_FFMPEG_PATH_ENV_V1,
  NATIVE_MEDIA_FINAL_RENDER_FFPROBE_PATH_ENV_V1,
  NATIVE_MEDIA_FINAL_RENDER_WORKER_IMAGE_DIGEST_ENV_V1,
  runNativeMediaFinalRenderPreparationProductRuntimeV1,
  type NativeMediaFinalRenderPreparationProductRuntimeDependenciesV1,
} from '@/lib/editron/services/native-media-final-render-preparation-product-runtime-v1';
import { createNativeMediaFinalRenderProfileReceiptV1 }
  from '@/lib/editron/services/native-media-final-render-profile-v1';
import { NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-r2-private-artifact-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const HASH = (character: string) => character.repeat(64);
const NOW = new Date('2026-08-30T00:10:00.000Z');

describe('native final-render preparation product runtime v1', () => {
  it('returns not-found without resolving deployment owners or claiming', async () => {
    const fixture = await buildFixture();
    fixture.jobStore.getForWorkerExecution.mockResolvedValueOnce(null);

    await expect(run(fixture)).resolves.toEqual({ kind: 'skipped', reason: 'not_found' });
    expect(fixture.manifestStore.resolve).not.toHaveBeenCalled();
    expect(fixture.qualifyRuntime).not.toHaveBeenCalled();
    expect(fixture.jobStore.claim).not.toHaveBeenCalled();
  });

  it('qualifies every concrete owner before invoking the lifecycle claim', async () => {
    const fixture = await buildFixture();

    await expect(run(fixture)).resolves.toEqual({ kind: 'skipped', reason: 'lease_held' });
    expect(fixture.jobStore.getForWorkerExecution).toHaveBeenCalledWith({
      jobId: fixture.job.jobId,
      operationOwner: 'NATIVE_MEDIA_FINAL_RENDER',
      operationKind: 'native_media_final_render_prepare_source',
      inputSchemaId: fixture.job.input.schemaId,
    });
    expect(fixture.qualifyRuntime).toHaveBeenCalledWith(expect.objectContaining({
      ffmpegPath: fixture.environment[NATIVE_MEDIA_FINAL_RENDER_FFMPEG_PATH_ENV_V1],
      ffprobePath: fixture.environment[NATIVE_MEDIA_FINAL_RENDER_FFPROBE_PATH_ENV_V1],
    }));
    for (const owner of [
      fixture.manifestStore.resolve,
      fixture.qualifyRuntime,
      fixture.createPrivateRuntime,
      fixture.ledgerOwner.resolve,
      fixture.projectPorts.getProjectRevision,
      fixture.createAssetReader,
    ]) {
      expect(owner.mock.invocationCallOrder[0]).toBeLessThan(
        fixture.jobStore.claim.mock.invocationCallOrder[0]!,
      );
    }
  });

  it('blocks image, path, toolchain, storage, Finance and revision drift before claim',
    async () => {
    const image = await buildFixture();
    image.environment[NATIVE_MEDIA_FINAL_RENDER_WORKER_IMAGE_DIGEST_ENV_V1] =
      `sha256:${HASH('f')}`;
    await expect(run(image)).rejects.toThrow('PRODUCT_WORKER_IMAGE_MISMATCH');
    expect(image.qualifyRuntime).not.toHaveBeenCalled();
    expect(image.jobStore.claim).not.toHaveBeenCalled();

    const executable = await buildFixture();
    executable.environment[NATIVE_MEDIA_FINAL_RENDER_FFMPEG_PATH_ENV_V1] = 'ffmpeg';
    await expect(run(executable)).rejects.toThrow('PRODUCT_FFMPEG_PATH_INVALID');
    expect(executable.qualifyRuntime).not.toHaveBeenCalled();
    expect(executable.jobStore.claim).not.toHaveBeenCalled();

    const toolchain = await buildFixture();
    toolchain.qualifyRuntime.mockRejectedValueOnce(new Error('toolchain drift'));
    await expect(run(toolchain)).rejects.toThrow('toolchain drift');
    expect(toolchain.ledgerOwner.resolve).not.toHaveBeenCalled();
    expect(toolchain.jobStore.claim).not.toHaveBeenCalled();

    const storage = await buildFixture();
    storage.createPrivateRuntime.mockImplementationOnce(() => {
      throw new Error('private storage unavailable');
    });
    await expect(run(storage)).rejects.toThrow('private storage unavailable');
    expect(storage.ledgerOwner.resolve).not.toHaveBeenCalled();
    expect(storage.jobStore.claim).not.toHaveBeenCalled();

    const finance = await buildFixture();
    finance.ledgerOwner.resolve.mockRejectedValueOnce(new Error('finance unavailable'));
    await expect(run(finance)).rejects.toThrow('finance unavailable');
    expect(finance.projectPorts.getProjectRevision).not.toHaveBeenCalled();
    expect(finance.jobStore.claim).not.toHaveBeenCalled();

    const revision = await buildFixture();
    revision.projectPorts.getProjectRevision.mockResolvedValueOnce({
      ...revision.revision,
      value: revision.revision.value + 1,
    });
    await expect(run(revision)).rejects.toThrow('PRODUCT_PROJECT_REVISION_MISMATCH');
    expect(revision.createAssetReader).not.toHaveBeenCalled();
    expect(revision.jobStore.claim).not.toHaveBeenCalled();
  });

  it('settles terminal replay without requiring current render infrastructure', async () => {
    const fixture = await buildFixture();
    const terminalJob = {
      ...fixture.job,
      status: 'cancelled' as const,
      terminalReceipt: {
        disposition: 'CANCELLED' as const,
        receiptId: 'cancel_exact_render_1',
        receiptSha256: HASH('f'),
        proofReferences: [],
        completedAt: NOW.toISOString(),
      },
    };
    fixture.jobStore.getForWorkerExecution.mockResolvedValueOnce(terminalJob);
    fixture.jobStore.claim.mockResolvedValueOnce({
      kind: 'skipped',
      reason: 'terminal',
      job: terminalJob,
    } as never);
    await expect(run(fixture, {
      ...fixture.dependencies,
      environment: {},
    })).resolves.toEqual({ kind: 'skipped', reason: 'terminal' });
    expect(fixture.qualifyRuntime).not.toHaveBeenCalled();
    expect(fixture.createPrivateRuntime).not.toHaveBeenCalled();
    expect(fixture.projectPorts.getProjectRevision).not.toHaveBeenCalled();
    expect(fixture.createAssetReader).not.toHaveBeenCalled();
    expect(fixture.ledgerOwner.settle).toHaveBeenCalledTimes(1);
  });
});

async function run(
  fixture: Awaited<ReturnType<typeof buildFixture>>,
  dependencies = fixture.dependencies,
) {
  return runNativeMediaFinalRenderPreparationProductRuntimeV1({
    jobId: fixture.job.jobId,
    workerId: 'worker_exact_render_1',
  }, dependencies);
}

async function buildFixture() {
  const policy = createNativeMediaFinalRenderExecutionBudgetPolicyV1({
    ownerVersion: 'finance-render-v1',
    effectiveAt: '2026-08-30T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
    encodedFrameAttempt: { nanoUsdNumerator: '3', unitsDenominator: '2' },
    artifactByteWritten: { nanoUsdNumerator: '1', unitsDenominator: '1000' },
    artifactByteVerified: { nanoUsdNumerator: '1', unitsDenominator: '1000' },
  });
  const retry = createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1({
    durableJob: { maxAttempts: 3, retentionMs: 86_400_000 },
    qstashDelivery: { retries: 2, retryDelayMs: 5_000, timeoutSeconds: 900 },
    workerRetry: { delayMs: 30_000 },
  });
  const manifest = createNativeMediaFinalRenderPreparationExecutionManifestV1({
    executionBudget: {
      ownerId: policy.ownerId,
      ownerVersion: policy.ownerVersion,
      policySha256: policy.policySha256,
    },
    materializerPolicy: materializerPolicy(),
    encoderPolicy: encoderPolicy(),
    privateArtifactPolicy: privateArtifactPolicy(),
    retryPolicy: retry,
    heartbeatPolicy: createNativeMediaFinalRenderPreparationHeartbeatPolicyV1({
      heartbeatIntervalMs: 30_000,
    }),
    workerImageDigest: `sha256:${HASH('a')}`,
    compatibilityReceipt: profile(),
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
    maximumUsage: { encodedFrameAttempts: '300', artifactBytesWritten: '1000000',
      artifactBytesVerified: '1000000' },
    approvedBy: 'finance-admin', approvedAt: '2026-08-30T00:01:00.000Z',
    expiresAt: '2026-08-30T01:00:00.000Z',
  });
  const reservation = createNativeMediaFinalRenderExecutionBudgetReservationV1({
    policy, authorization, reservationId: 'nmfr_budget_1', reservedAt: NOW.toISOString(),
  });
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const store = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
  const created = await createOrGetNativeMediaFinalRenderPreparationJobV1({
    jobStore: store,
    request: {
      tenantId: 'tenant_1', userId: 'user_1', orgId: null,
      projectId: 'project_1', sequenceId: 'main', projectRevision: revision,
      admissionReceiptSha256: HASH('7'),
      budgetReservation: nativeMediaFinalRenderExecutionBudgetReservationRefV1(reservation),
      exactSourceRequest,
      policyBindings: manifest.jobBindings,
      executionProfile: {
        workerImageDigest: manifest.executionProfile.workerImageDigest,
        compatibilityProfileVersion: manifest.executionProfile.compatibilityReceipt.profileVersion,
        compatibilityReceiptSha256: manifest.executionProfile.compatibilityReceipt.receiptSha256,
      },
    },
    deliveryRetryPolicy: retry,
    now: NOW,
  });
  const job = created.job;
  const jobStore = workerStore(job);
  const record = createNativeMediaFinalRenderExecutionBudgetReservedRecordV1(
    policy, authorization, reservation,
  );
  const ledgerOwner = {
    reserve: vi.fn(async () => reservation),
    resolve: vi.fn(async () => ({ policy, record })),
    settle: vi.fn(async () => ({} as never)),
  } satisfies NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1;
  const manifestStore = { resolve: vi.fn(async () => manifest) };
  const qualifyRuntime = vi.fn(async () => undefined);
  const createPrivateRuntime = vi.fn(() => ({
    epochArtifactReader: { read: vi.fn() },
    audioArtifact: { readPcmSampleRange: vi.fn() },
    finalRenderArtifact: { stager: { stage: vi.fn() } },
  } as never));
  const createAssetReader = vi.fn(async () => ({ load: vi.fn() }));
  const projectPorts = {
    getProjectRevision: vi.fn(async () => revision),
    loadProjectForMutation: vi.fn(),
  };
  const environment = {
    [NATIVE_MEDIA_FINAL_RENDER_WORKER_IMAGE_DIGEST_ENV_V1]:
      manifest.executionProfile.workerImageDigest,
    [NATIVE_MEDIA_FINAL_RENDER_FFMPEG_PATH_ENV_V1]: path.resolve('ffmpeg-exact'),
    [NATIVE_MEDIA_FINAL_RENDER_FFPROBE_PATH_ENV_V1]: path.resolve('ffprobe-exact'),
  };
  const dependencies: NativeMediaFinalRenderPreparationProductRuntimeDependenciesV1 = {
    environment,
    jobStore: jobStore as never,
    manifestStore,
    ledgerOwner,
    createPrivateRuntime,
    createAssetReader,
    projectPorts,
    qualifyRuntime,
    clock: () => NOW,
  };
  return { job, jobStore, manifestStore, ledgerOwner, qualifyRuntime,
    createPrivateRuntime, createAssetReader, projectPorts, environment,
    revision, dependencies };
}

function workerStore(job: Awaited<ReturnType<typeof createOrGetNativeMediaFinalRenderPreparationJobV1>>['job']) {
  const unavailable = vi.fn(async () => { throw new Error('unexpected worker store call'); });
  return {
    getForWorkerExecution: vi.fn(async (): Promise<typeof job | null> => job),
    claim: vi.fn(async () => ({ kind: 'skipped' as const, reason: 'lease_held' })),
    heartbeat: unavailable,
    saveResumeState: unavailable,
    complete: unavailable,
    retryOrDeadLetter: unavailable,
    markCancelled: unavailable,
    getAuthorized: unavailable,
  };
}

function materializerPolicy() {
  return {
    policyVersion: NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
    maxTimelineFrames: 300, maxArtifactBytes: '1000000000',
    epochWindow: { policyVersion: 'EDITRON_NATIVE_FINAL_RENDER_EPOCH_WINDOW_V1',
      maxFrameRecords: 10_000, maxBatchReads: 1_000, maxTotalReadBytes: 500_000_000 },
    conform: { policyVersion: 'EDITRON_NATIVE_FINAL_RENDER_CONFORM_V1',
      maxSourceFrames: 10_000, maxFrameQueries: 300 },
  } as const;
}

function encoderPolicy() {
  return { policyVersion: NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
    maxSourceBytes: 2_000_000_000, maxTimelineFrames: 300, maxFrameBytes: 100_000_000,
    maxDecodedSequenceBytes: 2_000_000_000, maxPcmBytes: 500_000_000,
    maxArtifactBytes: 4_000_000_000, maxDimension: 8_192, timeoutMs: 900_000 } as const;
}

function privateArtifactPolicy() {
  return { policyVersion: NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
    maxArtifactBytes: 4_000_000_000, defaultLeaseTtlMs: 60_000,
    maximumLeaseTtlMs: 86_400_000 } as const;
}

function profile() {
  return createNativeMediaFinalRenderProfileReceiptV1({
    schemaVersion: 1, kind: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_V1',
    profileVersion: 'EDITRON_LOSSLESS_RGB_H264_PCM_S32LE_MATROSKA_V1',
    platform: `${process.platform}-${process.arch}`, ffmpegVersion: 'ffmpeg version 7.1.0',
    remotionVersion: '4.0.0', compositorPackageVersion: '4.0.0',
    container: 'matroska', videoEncoder: 'libx264rgb', videoCodec: 'h264',
    pixelFormat: 'gbrp', videoLosslessMode: 'CRF_0_INTRA_ONLY', audioCodec: 'pcm_s32le',
    sourceDecodedRgbSha256: HASH('1'), artifactDecodedRgbSha256: HASH('1'),
    sourceDecodedPcmSha256: HASH('2'), artifactDecodedPcmSha256: HASH('2'),
    sourceVideoFrameCount: '2', remotionVideoFrameCount: '2',
    sourceAudioSampleFrameCount: '3200', remotionOutputVideoCodec: 'h264',
    remotionOutputAudioCodec: 'aac', browserErrorCount: 0,
  });
}
