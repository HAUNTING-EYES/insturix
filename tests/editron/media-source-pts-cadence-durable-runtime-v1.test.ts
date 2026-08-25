import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import type { DurableWorkflowJobRecordV1 } from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 } from '@/lib/editron/services/durable-workflow-job-store-v1';
import { createOrGetMediaSourcePtsCadenceDurableJobV1 }
  from '@/lib/editron/services/media-source-pts-cadence-durable-job-binding-v1';
import { runMediaSourcePtsCadenceDurableRuntimeV1 }
  from '@/lib/editron/services/media-source-pts-cadence-durable-runtime-v1';
import { createMediaSourcePtsCadenceR2RuntimePortsV1 }
  from '@/lib/editron/services/media-source-pts-cadence-r2-runtime-v1';
import { finalizeMediaSourcePtsCadenceScanV1 }
  from '@/lib/editron/services/media-source-pts-cadence-scan-finalizer-v1';
import { MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1 }
  from '@/lib/editron/services/media-source-pts-cadence-scan-result-v1';
import {
  createMediaSourcePtsCadenceScanBatchSidecarV1,
  serializeMediaSourcePtsCadenceScanStagingBatchV1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-staging-v1';
import type { MediaSourcePtsCadenceScanSubmissionV1 }
  from '@/lib/editron/services/media-source-pts-cadence-scan-transport-v1';
import {
  MEDIA_SOURCE_PROBE_VERSION_V1,
  unverifiableMediaSourceProbeResultV1,
} from '@/lib/editron/services/media-source-probe-v1';
import type { MediaSourceQualificationRecordV1 }
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-26T08:00:00.000Z');
const ENVIRONMENT = {
  EDITRON_MEDIA_PTS_R2_ACCOUNT_ID: 'a'.repeat(32),
  EDITRON_MEDIA_PTS_R2_ACCESS_KEY_ID: 'private-access-key',
  EDITRON_MEDIA_PTS_R2_SECRET_ACCESS_KEY: 'private-secret-key',
  EDITRON_MEDIA_PTS_R2_BUCKET_NAME: 'editron-media-pts-private',
};

describe('media source PTS cadence durable runtime V1', () => {
  it('preflights every external owner before claiming a durable attempt', async () => {
    const privateFactory = vi.fn(() => privateRuntime());
    const assetFactory = vi.fn(async () => assetStore(sourceFixture()));
    expect(await runMediaSourcePtsCadenceDurableRuntimeV1(
      { jobId: 'job-not-claimed', workerId: 'worker-1' },
      {
        environment: ENVIRONMENT,
        transportConfigured: () => false,
        createPrivateRuntime: privateFactory,
        createAssetStorePorts: assetFactory,
      },
    )).toEqual({
      kind: 'runtime_unavailable',
      reason: 'SCAN_TRANSPORT_NOT_CONFIGURED',
    });
    expect(privateFactory).not.toHaveBeenCalled();
    expect(assetFactory).not.toHaveBeenCalled();

    expect(await runMediaSourcePtsCadenceDurableRuntimeV1(
      { jobId: 'job-not-claimed', workerId: 'worker-1' },
      {
        environment: ENVIRONMENT,
        transportConfigured: () => true,
        createPrivateRuntime: () => { throw new Error('missing private storage'); },
        createAssetStorePorts: assetFactory,
      },
    )).toEqual({
      kind: 'runtime_unavailable',
      reason: 'PRIVATE_STORAGE_NOT_CONFIGURED',
    });
    expect(assetFactory).not.toHaveBeenCalled();

    expect(await runMediaSourcePtsCadenceDurableRuntimeV1(
      { jobId: 'job-not-claimed', workerId: 'worker-1' },
      {
        environment: ENVIRONMENT,
        transportConfigured: () => true,
        createPrivateRuntime: privateFactory,
        createAssetStorePorts: async () => { throw new Error('mongo unavailable'); },
      },
    )).toEqual({
      kind: 'runtime_unavailable',
      reason: 'MEDIA_ASSET_OWNER_UNAVAILABLE',
    });
  });

  it('composes the complete owner chain and stores no signed source URL in durable state', async () => {
    const source = sourceFixture();
    const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
    const jobStore = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
    const created = await createOrGetMediaSourcePtsCadenceDurableJobV1({
      jobStore,
      request: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        orgId: null,
        assetId: 'asset-1',
        sourceVersion: source.sourceVersion,
        qualification: source.qualification,
        videoStreamIndex: 0,
      },
      now: START,
    });
    const store = assetStore(source);
    const privatePorts = privateRuntime();
    const submissions: MediaSourcePtsCadenceScanSubmissionV1[] = [];
    const resolveVerifiedSourceUrl = vi.fn(async () => ({
      disposition: 'AVAILABLE' as const,
      sourceUrl: 'https://private.example.test/source.mov?lease=one',
      storageVersion: source.sourceVersion.storageVersion,
    }));
    const finalizeScan: typeof finalizeMediaSourcePtsCadenceScanV1 = vi.fn(async (input) => {
      expect(input.stagingReader).toBe(privatePorts.stagingReader);
      expect(input.descriptorPort).toBe(privatePorts.descriptorPort);
      expect(input.artifactPort).toBe(privatePorts.artifactPort);
      expect(input.lifecycleManifestReader).toBe(privatePorts.lifecycleManifestReader);
      expect(input.stateOwner.load).toBe(store.load);
      return completedFinalizerResult();
    });

    const result = await runMediaSourcePtsCadenceDurableRuntimeV1({
      jobId: created.job.jobId,
      workerId: 'worker-1',
    }, {
      environment: ENVIRONMENT,
      jobStore,
      transportConfigured: () => true,
      createPrivateRuntime: () => privatePorts,
      createAssetStorePorts: async () => store,
      resolveVerifiedSourceUrl,
      submitScan: async (submission) => {
        submissions.push(submission);
        return {
          disposition: 'ACCEPTED',
          job: {
            submissionId: submission.submissionId,
            functionCallId: 'fc-12345678',
            mapBindingSha256: submission.request.mapBindingSha256,
          },
        };
      },
      pollScan: async () => ({
        disposition: 'TERMINAL',
        result: completeResult(submissions[0]!),
      }),
      finalizeScan,
      clock: () => START,
    });

    expect(result).toMatchObject({
      kind: 'completed',
      jobId: created.job.jobId,
      disposition: 'PASS',
    });
    expect(resolveVerifiedSourceUrl).toHaveBeenCalledTimes(2);
    expect(finalizeScan).toHaveBeenCalledTimes(1);
    const persisted = await jobStore.getAuthorized({
      jobId: created.job.jobId,
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
    expect(persisted).toMatchObject({
      status: 'completed',
      terminalReceipt: { disposition: 'PASS' },
    });
    expect(JSON.stringify(persisted)).not.toContain('https://private.example.test');
  });

  it('retries a temporarily unavailable verified source without submitting a scan', async () => {
    const fixture = await jobFixture();
    const submitScan = vi.fn();
    const result = await runMediaSourcePtsCadenceDurableRuntimeV1({
      jobId: fixture.created.job.jobId,
      workerId: 'worker-1',
    }, {
      environment: ENVIRONMENT,
      jobStore: fixture.jobStore,
      transportConfigured: () => true,
      createPrivateRuntime: () => privateRuntime(),
      createAssetStorePorts: async () => fixture.store,
      resolveVerifiedSourceUrl: async () => ({
        disposition: 'UNVERIFIABLE',
        result: unverifiableMediaSourceProbeResultV1(
          'MEDIA_SOURCE_SIGNED_URL_UNAVAILABLE',
        ),
      }),
      submitScan,
      pollScan: vi.fn(),
      finalizeScan: vi.fn(),
      clock: () => START,
    });
    expect(result).toMatchObject({
      kind: 'retry_wait',
      errorCode: 'MEDIA_SOURCE_PTS_WORKER_SOURCE_MEDIA_SOURCE_SIGNED_URL_UNAVAILABLE',
    });
    expect(submitScan).not.toHaveBeenCalled();
  });
});

async function jobFixture() {
  const source = sourceFixture();
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const jobStore = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
  const created = await createOrGetMediaSourcePtsCadenceDurableJobV1({
    jobStore,
    request: {
      tenantId: 'tenant-1', userId: 'user-1', orgId: null, assetId: 'asset-1',
      sourceVersion: source.sourceVersion, qualification: source.qualification,
      videoStreamIndex: 0,
    },
    now: START,
  });
  return { created, jobStore, store: assetStore(source) };
}

function assetStore(source: ReturnType<typeof sourceFixture>) {
  return {
    load: vi.fn(async () => ({
      sourceVersionV1: source.sourceVersion,
      sourceQualificationV1: source.qualification,
    })),
    replace: vi.fn(async () => true),
  };
}

function privateRuntime() {
  return createMediaSourcePtsCadenceR2RuntimePortsV1(ENVIRONMENT, {
    clientFactory: () => ({ send: vi.fn(async () => ({})) }),
  });
}

function completedFinalizerResult(): Awaited<ReturnType<typeof finalizeMediaSourcePtsCadenceScanV1>> {
  return {
    disposition: 'COMPLETED',
    state: {
      sourcePtsCadenceMapV2: {
        terminalReceipt: { terminalReceiptSha256: 'd'.repeat(64) },
      },
    },
  } as unknown as Awaited<ReturnType<typeof finalizeMediaSourcePtsCadenceScanV1>>;
}

function completeResult(submission: MediaSourcePtsCadenceScanSubmissionV1) {
  const request = submission.request;
  const serialization = serializeMediaSourcePtsCadenceScanStagingBatchV1({
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_V1',
    mapBindingSha256: request.mapBindingSha256,
    resourcePolicy: request.resourcePolicy,
    sourceTimebase: request.mapBinding.sourceTimebase,
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
    shardSequence: 0,
    firstFrameOrdinal: '0',
    previousBatchContentSha256: null,
    frames: [{ presentationTimestampTicks: '0', durationTicks: '3003' }],
  });
  return {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1,
    status: 'COMPLETE' as const,
    diagnostic: null,
    mapBindingSha256: request.mapBindingSha256,
    resourcePolicy: request.resourcePolicy,
    ffprobeVersion: request.mapBinding.mapper.ffprobeVersion,
    videoStreamIndex: request.mapBinding.videoStreamIndex,
    sourceTimebase: request.mapBinding.sourceTimebase,
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
    batches: [{
      shardSequence: 0,
      firstFrameOrdinal: '0',
      frameCount: '1',
      startPresentationTimestampTicks: '0',
      endExclusivePresentationTimestampTicks: '3003',
      previousBatchContentSha256: null,
      sidecar: createMediaSourcePtsCadenceScanBatchSidecarV1({ serialization }),
    }],
    totalFrameCount: '1',
    sourceStartPresentationTimestampTicks: '0',
    sourceEndExclusivePresentationTimestampTicks: '3003',
  };
}

function sourceFixture() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'uploads/source.mov' },
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1', mediaKind: 'video', byteLength: 1_000,
    contentSha256: 'a'.repeat(64), storageVersion,
  });
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PROBE_VERSION_V1,
    probeVersion: `${MEDIA_SOURCE_PROBE_VERSION_V1}; ffprobe version 8.1`,
    formatName: 'mov', durationMilliseconds: 10_000, startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0, codec: 'h264', codedWidth: 1920, codedHeight: 1080,
      pixelFormat: 'yuv420p', sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0', sourceDurationTicks: '900000',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' },
      frameCount: '300', colorSpace: 'bt709', colorTransfer: 'bt709',
      colorPrimaries: 'bt709', colorRange: 'tv', timecode: null, reelId: null,
    }],
    audioStreams: [],
  };
  const qualification: MediaSourceQualificationRecordV1 = {
    schemaVersion: 1, kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
    status: 'MEASURED_TECHNICAL', assetId: 'asset-1', locator: storageVersion.locator,
    sourceBindingSha256: hashEditronCanonicalJsonV1({
      schemaVersion: 1, kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
      assetId: 'asset-1', locator: storageVersion.locator,
    }),
    requestId: 'media-source-probe:test', attemptCount: 1,
    requestedAt: START.toISOString(), startedAt: START.toISOString(),
    completedAt: START.toISOString(), storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
    diagnostic: null,
  };
  return { sourceVersion, qualification };
}
