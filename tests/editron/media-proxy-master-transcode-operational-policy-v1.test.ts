import { describe, expect, it } from 'vitest';

import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import {
  assertMediaProxyMasterTranscodeHeartbeatPolicyV1,
  assertMediaProxyMasterTranscodeRetryPolicyV1,
  createMediaProxyMasterTranscodeHeartbeatOwnerV1,
  createMediaProxyMasterTranscodeHeartbeatPolicyV1,
  createMediaProxyMasterTranscodeRetryOwnerV1,
  createMediaProxyMasterTranscodeRetryPolicyV1,
} from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-v1';
import {
  assertMediaProxyMasterTranscodeDurableJobV1,
  createMediaProxyMasterTranscodeDurableRuntimePolicyV1,
  createOrGetMediaProxyMasterTranscodeDurableJobV1,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v1';
import {
  createMediaProxyMasterTranscodeCommandV1,
  createMediaProxyMasterTranscodePolicyV1,
} from '@/lib/editron/services/media-proxy-master-trusted-transcode-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-30T23:00:00.000Z');
const TRANSIENT_DIAGNOSTIC =
  'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_UNAVAILABLE';

describe('MediaProxyMasterTranscodeOperationalPolicyV1', () => {
  it('hashes exact retry and heartbeat declarations into worker owners', () => {
    const policies = operationalPolicies();
    expect(assertMediaProxyMasterTranscodeRetryPolicyV1(policies.retry))
      .toStrictEqual(policies.retry);
    expect(assertMediaProxyMasterTranscodeHeartbeatPolicyV1(policies.heartbeat))
      .toStrictEqual(policies.heartbeat);
    expect(createMediaProxyMasterTranscodeRetryOwnerV1(policies.retry))
      .toMatchObject({
        ownerId: policies.retry.ownerId,
        ownerVersion: policies.retry.ownerVersion,
        policySha256: policies.retry.policySha256,
      });
    expect(createMediaProxyMasterTranscodeHeartbeatOwnerV1(policies.heartbeat))
      .toEqual({
        ownerId: policies.heartbeat.ownerId,
        ownerVersion: policies.heartbeat.ownerVersion,
        policySha256: policies.heartbeat.policySha256,
        heartbeatIntervalMs: 1_000,
      });
  });

  it('produces a stable bounded retry for explicit or allowlisted transients',
    async () => {
      const fixture = await claimedJob();
      const owner = createMediaProxyMasterTranscodeRetryOwnerV1(
        fixture.policies.retry,
      );
      const input = {
        job: fixture.job,
        diagnosticCode: TRANSIENT_DIAGNOSTIC,
        retryableHint: null,
        now: START,
      } as const;
      const first = await owner.decide(input);
      const replay = await owner.decide(input);
      expect(replay).toEqual(first);
      expect(first).toMatchObject({ disposition: 'RETRY_AT' });
      if (first.disposition !== 'RETRY_AT') throw new Error('TEST_RETRY_REQUIRED');
      const delay = first.retryAt.getTime() - START.getTime();
      expect(delay).toBeGreaterThanOrEqual(1_000);
      expect(delay).toBeLessThanOrEqual(10_000);

      await expect(owner.decide({
        ...input,
        diagnosticCode: 'TEMPORARY_ASSET_STORE_FAILURE',
        retryableHint: true,
      })).resolves.toMatchObject({ disposition: 'RETRY_AT' });
    });

  it('stops permanent and unlisted diagnostics without guessing', async () => {
    const fixture = await claimedJob();
    const owner = createMediaProxyMasterTranscodeRetryOwnerV1(
      fixture.policies.retry,
    );
    await expect(owner.decide({
      job: fixture.job,
      diagnosticCode: TRANSIENT_DIAGNOSTIC,
      retryableHint: false,
      now: START,
    })).resolves.toEqual({
      disposition: 'STOP_UNVERIFIABLE',
      reason: 'DECLARED_PERMANENT',
    });
    await expect(owner.decide({
      job: fixture.job,
      diagnosticCode: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_INVALID',
      retryableHint: null,
      now: START,
    })).resolves.toEqual({
      disposition: 'STOP_UNVERIFIABLE',
      reason: 'DIAGNOSTIC_NOT_RETRYABLE',
    });
  });

  it('stops at attempt or retention exhaustion', async () => {
    const fixture = await claimedJob();
    const owner = createMediaProxyMasterTranscodeRetryOwnerV1(
      fixture.policies.retry,
    );
    await expect(owner.decide({
      job: {
        ...fixture.job,
        attemptCount: fixture.job.maxAttempts,
        remainingAttempts: 0,
      },
      diagnosticCode: TRANSIENT_DIAGNOSTIC,
      retryableHint: true,
      now: START,
    })).resolves.toEqual({
      disposition: 'STOP_UNVERIFIABLE',
      reason: 'ATTEMPTS_EXHAUSTED',
    });
    await expect(owner.decide({
      job: fixture.job,
      diagnosticCode: TRANSIENT_DIAGNOSTIC,
      retryableHint: true,
      now: new Date(Date.parse(fixture.job.expiresAt) - 1),
    })).resolves.toEqual({
      disposition: 'STOP_UNVERIFIABLE',
      reason: 'RETENTION_EXHAUSTED',
    });
  });

  it('rejects policy, job, and lifecycle drift', async () => {
    const fixture = await claimedJob();
    const owner = createMediaProxyMasterTranscodeRetryOwnerV1(
      fixture.policies.retry,
    );
    expect(() => assertMediaProxyMasterTranscodeRetryPolicyV1({
      ...fixture.policies.retry,
      workerRetry: {
        ...fixture.policies.retry.workerRetry,
        baseDelayMs: 2_000,
      },
    })).toThrow('RETRY_POLICY_SHA256_MISMATCH');
    await expect(owner.decide({
      job: { ...fixture.job, status: 'queued' },
      diagnosticCode: TRANSIENT_DIAGNOSTIC,
      retryableHint: true,
      now: START,
    })).rejects.toThrow('RETRY_JOB_LIFECYCLE_BINDING_INVALID');

    const otherPolicy = createMediaProxyMasterTranscodeRetryPolicyV1({
      ...retryDeclaration(),
      workerRetry: {
        ...retryDeclaration().workerRetry,
        baseDelayMs: 2_000,
      },
    });
    const otherOwner = createMediaProxyMasterTranscodeRetryOwnerV1(otherPolicy);
    await expect(otherOwner.decide({
      job: fixture.job,
      diagnosticCode: TRANSIENT_DIAGNOSTIC,
      retryableHint: true,
      now: START,
    })).rejects.toThrow('RETRY_JOB_LIFECYCLE_BINDING_INVALID');
  });

  it('rejects duplicate diagnostics and lease-unsafe heartbeats', () => {
    expect(() => createMediaProxyMasterTranscodeRetryPolicyV1({
      ...retryDeclaration(),
      workerRetry: {
        ...retryDeclaration().workerRetry,
        retryableDiagnostics: [TRANSIENT_DIAGNOSTIC, TRANSIENT_DIAGNOSTIC],
      },
    })).toThrow('RETRY_DIAGNOSTICS_DUPLICATE');
    expect(() => createMediaProxyMasterTranscodeHeartbeatPolicyV1({
      heartbeatIntervalMs: 100_001,
    })).toThrow('HEARTBEAT_INTERVAL_MS_INVALID');
  });
});

async function claimedJob() {
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const store = new DurableWorkflowJobStoreV1(
    async () => collection.asCollection(),
  );
  const policies = operationalPolicies();
  const created = await createOrGetMediaProxyMasterTranscodeDurableJobV1({
    jobStore: store,
    request: jobRequest(policies),
    now: START,
  });
  const claim = await store.claim({
    jobId: created.job.jobId,
    workerId: 'operational-policy-test',
    now: START,
  });
  if (claim.kind !== 'claimed') throw new Error('TEST_CLAIM_REQUIRED');
  assertMediaProxyMasterTranscodeDurableJobV1(claim.job);
  return { job: claim.job, policies };
}

function operationalPolicies() {
  return {
    retry: createMediaProxyMasterTranscodeRetryPolicyV1(retryDeclaration()),
    heartbeat: createMediaProxyMasterTranscodeHeartbeatPolicyV1({
      heartbeatIntervalMs: 1_000,
    }),
  };
}

function retryDeclaration() {
  return {
    durableJob: { maxAttempts: 6, retentionMs: 7 * 24 * 60 * 60 * 1_000 },
    qstashDelivery: {
      retries: 2,
      retryDelayMs: 30_000,
      timeoutSeconds: 300,
    },
    workerRetry: {
      baseDelayMs: 1_000,
      maximumDelayMs: 10_000,
      backoffMultiplier: 2,
      deterministicJitterPermille: 200,
      retryableDiagnostics: [TRANSIENT_DIAGNOSTIC],
    },
  };
}

function jobRequest(policies: ReturnType<typeof operationalPolicies>) {
  const command = transcodeCommand();
  return {
    tenantId: 'tenant-operational-policy',
    userId: 'user-operational-policy',
    orgId: null,
    assetId: 'asset-operational-policy',
    command,
    publicationPolicy: createMediaProxyMasterR2PrivatePublicationPolicyV1({
      bucketName: 'editron-media-proxy-private',
      storagePolicyVersion: 'private-proxy-media-v1',
      browserRouteExposure: 'NO_BROWSER_ROUTE',
    }),
    runtimePolicy: createMediaProxyMasterTranscodeDurableRuntimePolicyV1({
      lifecycle: policies.retry.durableJob,
      executionBudgetPolicy: policyOwner('budget'),
      retryPolicy: {
        ownerId: policies.retry.ownerId,
        ownerVersion: policies.retry.ownerVersion,
        policySha256: policies.retry.policySha256,
      },
      heartbeatPolicy: {
        ownerId: policies.heartbeat.ownerId,
        ownerVersion: policies.heartbeat.ownerVersion,
        policySha256: policies.heartbeat.policySha256,
      },
      executionProfile: {
        workerImageDigest: hash('worker-image'),
        platform: 'linux-x64',
        ffmpegVersion: 'ffmpeg version 8.1',
        ffprobeVersion: 'ffprobe version 8.1',
        compatibilityReceiptSha256: hash('compatibility'),
      },
    }),
    budgetReservation: {
      reservationId: 'reservation-operational-policy',
      bindingSha256: hash('reservation-operational-policy'),
    },
  };
}

function transcodeCommand() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/master-policy.mp4' },
    byteLength: 100_000,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-master-policy' },
  });
  const master = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-operational-policy' },
    assetId: 'asset-operational-policy',
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256: hash('master-content'),
    storageVersion,
  });
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
    maxOutputBytes: 2_000_000,
    timeoutMs: 120_000,
  });
  return createMediaProxyMasterTranscodeCommandV1({
    transcodeJobId: 'transcode-operational-policy-1',
    policy,
    masterSourceVersion: master,
    masterTimeMap: {
      sourceVersionSha256: master.sourceVersionSha256,
      storageVersionSha256: master.storageVersion.storageVersionSha256,
      sourceBindingSha256: hash('source-binding'),
      technicalObservationSha256: hash('observation'),
      sourcePtsCadenceMapStateSha256V3: hash('state'),
      mapBindingSha256: hash('map-binding'),
      terminalReceiptSha256: hash('map-terminal'),
      verificationSha256: hash('map-verification'),
      epochIndexContentSha256: hash('epoch-index'),
      streamId: 'video-0',
      videoStreamIndex: 0,
      totalFrameCount: '300',
    },
    masterVideoStreamIndex: 0,
    masterAudioStreamIndexes: [],
  });
}

function policyOwner(tag: string) {
  return {
    ownerId: `${tag}-owner`,
    ownerVersion: `${tag}-v1`,
    policySha256: hash(`${tag}-policy`),
  };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
