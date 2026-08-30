import { describe, expect, it } from 'vitest';

import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v1';
import {
  assertMediaProxyMasterTranscodeDurableJobInputV1,
  assertMediaProxyMasterTranscodeDurableJobV1,
  assertMediaProxyMasterTranscodeDurableRuntimePolicyV1,
  buildMediaProxyMasterTranscodeDurableJobContractV1,
  createMediaProxyMasterTranscodeDurableRuntimePolicyV1,
  createOrGetMediaProxyMasterTranscodeDurableJobV1,
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v1';
import {
  createMediaProxyMasterTranscodeCommandV1,
  createMediaProxyMasterTranscodePolicyV1,
} from '@/lib/editron/services/media-proxy-master-trusted-transcode-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const NOW = new Date('2026-08-30T18:00:00.000Z');

describe('MediaProxyMasterTranscodeDurableJobV1', () => {
  it('creates and replays one fully bound source-level durable job', async () => {
    const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
    const jobStore = new DurableWorkflowJobStoreV1(
      async () => collection.asCollection(),
    );
    const request = jobRequest();
    const first = await createOrGetMediaProxyMasterTranscodeDurableJobV1({
      jobStore, request, now: NOW,
    });
    const replay = await createOrGetMediaProxyMasterTranscodeDurableJobV1({
      jobStore, request, now: new Date(NOW.getTime() + 1_000),
    });

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.job.jobId).toBe(first.job.jobId);
    expect(first.job).toMatchObject({
      operationOwner: MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
      operationKind: MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
      projectId: null,
      maxAttempts: 6,
      input: { schemaId: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1 },
    });
    expect(Date.parse(first.job.expiresAt) - NOW.getTime())
      .toBe(7 * 24 * 60 * 60 * 1_000);
    expect(assertMediaProxyMasterTranscodeDurableJobV1(first.job))
      .toEqual(first.job.input.payload);
    expect(first.job.dependencies.map(({ dependencyId }) => dependencyId))
      .toEqual([
        'budget-reservation', 'command', 'epoch-index-content',
        'execution-budget-policy', 'heartbeat-policy', 'master-source-version',
        'master-storage-version', 'publication-policy', 'retry-policy',
        'runtime-policy', 'source-binding', 'technical-observation',
        'time-map-binding', 'time-map-state', 'time-map-terminal',
        'time-map-verification', 'toolchain-compatibility', 'transcode-policy',
        'worker-image',
      ]);
  });

  it('changes operation identity for source, runtime, publication, and budget changes', () => {
    const base = buildMediaProxyMasterTranscodeDurableJobContractV1(jobRequest());
    const otherSource = buildMediaProxyMasterTranscodeDurableJobContractV1(
      jobRequest({ commandTag: 'other-source' }),
    );
    const otherRuntime = buildMediaProxyMasterTranscodeDurableJobContractV1({
      ...jobRequest(),
      runtimePolicy: runtimePolicy({ workerImageDigest: hash('other-image') }),
    });
    const otherPublication = buildMediaProxyMasterTranscodeDurableJobContractV1({
      ...jobRequest(),
      publicationPolicy: createMediaProxyMasterR2PrivatePublicationPolicyV1({
        ...storageScope(), bucketName: 'editron-media-proxy-private-two',
      }),
    });
    const otherBudget = buildMediaProxyMasterTranscodeDurableJobContractV1({
      ...jobRequest(),
      budgetReservation: {
        reservationId: 'reservation-b',
        bindingSha256: hash('reservation-b'),
      },
    });

    for (const candidate of [otherSource, otherRuntime, otherPublication, otherBudget]) {
      expect(candidate.operationIdentity).not.toBe(base.operationIdentity);
    }
  });

  it('rejects copied ownership, command hashes, runtime tampering, and oversized output', () => {
    const request = jobRequest();
    const contract = buildMediaProxyMasterTranscodeDurableJobContractV1(request);
    expect(assertMediaProxyMasterTranscodeDurableJobInputV1(contract.payload))
      .toEqual(contract.payload);
    expect(assertMediaProxyMasterTranscodeDurableRuntimePolicyV1(request.runtimePolicy))
      .toEqual(request.runtimePolicy);

    expect(() => buildMediaProxyMasterTranscodeDurableJobContractV1({
      ...request, userId: 'copied-user',
    })).toThrow('MEDIA_PROXY_MASTER_DURABLE_JOB_OWNER_SCOPE_MISMATCH');
    expect(() => assertMediaProxyMasterTranscodeDurableJobInputV1({
      ...contract.payload, commandSha256: hash('copied-command'),
    })).toThrow('MEDIA_PROXY_MASTER_DURABLE_JOB_COMMAND_HASH_MISMATCH');
    expect(() => assertMediaProxyMasterTranscodeDurableRuntimePolicyV1({
      ...request.runtimePolicy,
      executionProfile: {
        ...request.runtimePolicy.executionProfile,
        ffmpegVersion: 'ffmpeg version forged',
      },
    })).toThrow('MEDIA_PROXY_MASTER_DURABLE_RUNTIME_POLICY_HASH_MISMATCH');

    const largeCommand = command('large-output', 6 * 1_024 * 1_024 * 1_024);
    expect(() => buildMediaProxyMasterTranscodeDurableJobContractV1({
      ...request, command: largeCommand,
    })).toThrow('MEDIA_PROXY_MASTER_DURABLE_JOB_PUBLICATION_CAPABILITY_MISMATCH');
  });

  it('rejects a durable snapshot with deleted evidence or lifecycle substitution', async () => {
    const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
    const jobStore = new DurableWorkflowJobStoreV1(
      async () => collection.asCollection(),
    );
    const { job } = await createOrGetMediaProxyMasterTranscodeDurableJobV1({
      jobStore, request: jobRequest(), now: NOW,
    });

    expect(() => assertMediaProxyMasterTranscodeDurableJobV1({
      ...job, dependencies: job.dependencies.slice(1),
    })).toThrow('MEDIA_PROXY_MASTER_DURABLE_JOB_BINDING_MISMATCH');
    expect(() => assertMediaProxyMasterTranscodeDurableJobV1({
      ...job, maxAttempts: job.maxAttempts + 1,
    })).toThrow('MEDIA_PROXY_MASTER_DURABLE_JOB_BINDING_MISMATCH');
    expect(() => assertMediaProxyMasterTranscodeDurableJobV1({
      ...job,
      expiresAt: new Date(Date.parse(job.expiresAt) + 1).toISOString(),
    })).toThrow('MEDIA_PROXY_MASTER_DURABLE_JOB_BINDING_MISMATCH');
  });
});

function jobRequest(options: Readonly<{ commandTag?: string }> = {}) {
  return {
    tenantId: 'tenant-a',
    userId: 'user-a',
    orgId: null,
    assetId: 'asset-a',
    command: command(options.commandTag ?? 'primary'),
    publicationPolicy: createMediaProxyMasterR2PrivatePublicationPolicyV1(
      storageScope(),
    ),
    runtimePolicy: runtimePolicy(),
    budgetReservation: {
      reservationId: 'reservation-a',
      bindingSha256: hash('reservation-a'),
    },
  };
}

function runtimePolicy(
  overrides: Readonly<{ workerImageDigest?: string }> = {},
) {
  return createMediaProxyMasterTranscodeDurableRuntimePolicyV1({
    lifecycle: { maxAttempts: 6, retentionMs: 7 * 24 * 60 * 60 * 1_000 },
    executionBudgetPolicy: policyOwner('execution-budget'),
    retryPolicy: policyOwner('retry'),
    heartbeatPolicy: policyOwner('heartbeat'),
    executionProfile: {
      workerImageDigest: overrides.workerImageDigest ?? hash('worker-image'),
      platform: 'linux-x64',
      ffmpegVersion: 'ffmpeg version 8.1',
      ffprobeVersion: 'ffprobe version 8.1',
      compatibilityReceiptSha256: hash('toolchain-compatibility'),
    },
  });
}

function policyOwner(tag: string) {
  return {
    ownerId: `editron-${tag}-owner`,
    ownerVersion: `editron-${tag}-v1`,
    policySha256: hash(`${tag}-policy`),
  };
}

function command(tag: string, maxOutputBytes = 2_000_000) {
  const master = masterSource(tag);
  const timeMap = {
    sourceVersionSha256: master.sourceVersionSha256,
    storageVersionSha256: master.storageVersion.storageVersionSha256,
    sourceBindingSha256: hash(`source-binding-${tag}`),
    technicalObservationSha256: hash(`observation-${tag}`),
    sourcePtsCadenceMapStateSha256V3: hash(`state-${tag}`),
    mapBindingSha256: hash(`map-${tag}`),
    terminalReceiptSha256: hash(`terminal-${tag}`),
    verificationSha256: hash(`verification-${tag}`),
    epochIndexContentSha256: hash(`epoch-${tag}`),
    streamId: 'video-0',
    videoStreamIndex: 0,
    totalFrameCount: '300',
  };
  const policy = createMediaProxyMasterTranscodePolicyV1({
    presentationPolicy: 'PRESERVE_ALL_DECODED_FRAMES_AND_TIMESTAMPS_V1',
    timestampOriginPolicy: 'SHIFT_SHARED_SOURCE_ORIGIN_TO_ZERO_V1',
    container: 'mp4',
    videoCodec: 'libx264',
    pixelFormat: 'yuv420p',
    scalingPolicy: 'FIT_WITHIN_NO_UPSCALE_EVEN_DIMENSIONS_V1',
    maximumWidth: 1_920,
    maximumHeight: 1_080,
    videoCrf: 23,
    videoPreset: 'fast',
    keyframeIntervalSeconds: 2,
    audioPolicy: 'PRESERVE_SELECTED_STREAM_COUNT_LAYOUT_AND_TIMESTAMPS_V1',
    audioCodec: 'aac',
    audioBitrateBitsPerSecond: 192_000,
    maxSourceBytes: 5_000_000,
    maxOutputBytes,
    timeoutMs: 120_000,
  });
  return createMediaProxyMasterTranscodeCommandV1({
    transcodeJobId: `transcode-${tag}`,
    policy,
    masterSourceVersion: master,
    masterTimeMap: timeMap,
    masterVideoStreamIndex: 0,
    masterAudioStreamIndexes: [1],
  });
}

function masterSource(tag: string) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `media/${tag}.mp4` },
    byteLength: 100_000,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-a' },
    assetId: 'asset-a',
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256: hash(`content-${tag}`),
    storageVersion,
  });
}

function storageScope() {
  return {
    bucketName: 'editron-media-proxy-private',
    storagePolicyVersion: 'private-proxy-media-v1',
    browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
  };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
