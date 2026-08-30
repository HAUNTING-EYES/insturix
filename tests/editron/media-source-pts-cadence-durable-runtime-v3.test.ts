import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import type { DurableWorkflowJobRecordV1 } from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 } from '@/lib/editron/services/durable-workflow-job-store-v1';
import {
  createOrGetMediaSourcePtsCadenceDurableEpochJobV3,
} from '@/lib/editron/services/media-source-pts-cadence-durable-job-binding-v3';
import {
  runMediaSourcePtsCadenceDurableEpochRuntimeV3,
} from '@/lib/editron/services/media-source-pts-cadence-durable-runtime-v3';
import {
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
  type MediaSourcePtsCadenceEpochScanSubmissionV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-scan-transport-v3';
import type { MediaSourcePtsCadenceMapAssetStorePortsV3 }
  from '@/lib/editron/services/media-source-pts-cadence-map-asset-owner-v3';
import {
  createMediaSourcePtsCadenceR2RuntimePortsV1,
} from '@/lib/editron/services/media-source-pts-cadence-r2-runtime-v1';
import {
  publishMediaSourcePtsCadenceScanV3,
  type MediaSourcePtsCadenceScanPublicationResultV3,
} from '@/lib/editron/services/media-source-pts-cadence-scan-publisher-v3';
import {
  MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-result-v1';
import {
  createMediaSourcePtsCadenceScanBatchSidecarV1,
  serializeMediaSourcePtsCadenceScanStagingBatchV1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-staging-v1';
import {
  MEDIA_SOURCE_PROBE_VERSION_V1,
  unverifiableMediaSourceProbeResultV1,
} from '@/lib/editron/services/media-source-probe-v1';
import type { MediaSourceQualificationRecordV1 }
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-30T10:00:00.000Z');
const ENVIRONMENT = {
  EDITRON_MEDIA_PTS_R2_ACCOUNT_ID: 'a'.repeat(32),
  EDITRON_MEDIA_PTS_R2_ACCESS_KEY_ID: 'test-private-access-key',
  EDITRON_MEDIA_PTS_R2_SECRET_ACCESS_KEY: 'test-private-secret-key',
  EDITRON_MEDIA_PTS_R2_BUCKET_NAME: 'editron-media-pts-private-test',
};

describe('media source PTS cadence durable epoch runtime V3', () => {
  it('preflights every external owner before claiming a durable attempt', async () => {
    const privateFactory = vi.fn(() => privateRuntime());
    const assetFactory = vi.fn(async () => assetStore(sourceFixture()));

    expect(await runMediaSourcePtsCadenceDurableEpochRuntimeV3(
      { jobId: 'job-not-claimed', workerId: 'worker-v3' },
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

    expect(await runMediaSourcePtsCadenceDurableEpochRuntimeV3(
      { jobId: 'job-not-claimed', workerId: 'worker-v3' },
      {
        environment: ENVIRONMENT,
        transportConfigured: () => true,
        createPrivateRuntime: () => {
          throw new Error('missing dedicated private storage');
        },
        createAssetStorePorts: assetFactory,
      },
    )).toEqual({
      kind: 'runtime_unavailable',
      reason: 'PRIVATE_STORAGE_NOT_CONFIGURED',
    });
    expect(assetFactory).not.toHaveBeenCalled();

    expect(await runMediaSourcePtsCadenceDurableEpochRuntimeV3(
      { jobId: 'job-not-claimed', workerId: 'worker-v3' },
      {
        environment: ENVIRONMENT,
        transportConfigured: () => true,
        createPrivateRuntime: privateFactory,
        createAssetStorePorts: async () => {
          throw new Error('media asset owner unavailable');
        },
      },
    )).toEqual({
      kind: 'runtime_unavailable',
      reason: 'MEDIA_ASSET_OWNER_UNAVAILABLE',
    });
  });

  it('composes the V3 owner chain and persists no signed source URL', async () => {
    const fixture = await jobFixture();
    const privatePorts = privateRuntime();
    const submissions: MediaSourcePtsCadenceEpochScanSubmissionV3[] = [];
    const resolveVerifiedSourceUrl = vi.fn(async () => ({
      disposition: 'AVAILABLE' as const,
      sourceUrl: 'https://private.example.test/source.mov?lease=v3-one',
      storageVersion: fixture.source.sourceVersion.storageVersion,
    }));
    const boundarySemanticVerifier = {
      verify: vi.fn(async () => ({
        disposition: 'UNVERIFIABLE' as const,
        reason: 'TEST_NO_EXTERNAL_BOUNDARY_EVIDENCE',
      })),
    };
    const publishScan: typeof publishMediaSourcePtsCadenceScanV3 = vi.fn(
      async (input) => {
        expect(input.stagingReader).toBe(privatePorts.stagingReader);
        expect(input.descriptorPort).toBe(privatePorts.descriptorPort);
        expect(input.artifactPort).toBe(privatePorts.artifactPort);
        expect(input.epochIndexWriter).toBe(privatePorts.epochIndexWriter);
        expect(input.epochArtifactReader).toBe(privatePorts.epochArtifactReader);
        expect(input.boundarySemanticVerifier).toBe(boundarySemanticVerifier);
        expect(input.stateOwner.load).toBe(fixture.store.load);
        expect(input.expectedCoverage).toMatchObject({
          sourceStartPresentationTimestampTicks: '0',
          sourceEndExclusivePresentationTimestampTicks: '900000',
        });
        return publisherResult('COMPLETED', 'd'.repeat(64));
      },
    );

    const result = await runMediaSourcePtsCadenceDurableEpochRuntimeV3({
      jobId: fixture.created.job.jobId,
      workerId: 'worker-v3',
    }, {
      environment: ENVIRONMENT,
      jobStore: fixture.jobStore,
      transportConfigured: () => true,
      createPrivateRuntime: () => privatePorts,
      createAssetStorePorts: async () => fixture.store,
      resolveVerifiedSourceUrl,
      submitScan: async (submission) => {
        submissions.push(submission);
        return acceptedJob(submission);
      },
      pollScan: async () => ({
        disposition: 'TERMINAL',
        result: completeResult(submissions[0]!),
      }),
      publishScan,
      boundarySemanticVerifier,
      clock: () => START,
    });

    expect(result).toMatchObject({
      kind: 'completed',
      jobId: fixture.created.job.jobId,
      disposition: 'PASS',
    });
    expect(resolveVerifiedSourceUrl).toHaveBeenCalledTimes(2);
    expect(publishScan).toHaveBeenCalledTimes(1);
    const persisted = await fixture.snapshot();
    expect(persisted).toMatchObject({
      status: 'completed',
      terminalReceipt: { disposition: 'PASS' },
    });
    expect(JSON.stringify(persisted))
      .not.toContain('https://private.example.test');
  });

  it('adapts a publisher terminal UNVERIFIABLE receipt', async () => {
    const fixture = await jobFixture();
    const submissions: MediaSourcePtsCadenceEpochScanSubmissionV3[] = [];
    const result = await runMediaSourcePtsCadenceDurableEpochRuntimeV3({
      jobId: fixture.created.job.jobId,
      workerId: 'worker-v3',
    }, runtimeDependencies(fixture, submissions, async () => ({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'EPOCH_BOUNDARY_EVIDENCE_UNAVAILABLE',
      state: publisherState('e'.repeat(64)),
    } as unknown as MediaSourcePtsCadenceScanPublicationResultV3)));

    expect(result).toMatchObject({
      kind: 'completed',
      disposition: 'UNVERIFIABLE',
    });
    expect(await fixture.snapshot()).toMatchObject({
      status: 'completed',
      terminalReceipt: {
        disposition: 'UNVERIFIABLE',
        proofReferences: [{ proofSha256: 'e'.repeat(64) }],
      },
    });
  });

  it('dead-letters a publisher success that lacks its media receipt', async () => {
    const fixture = await jobFixture();
    const submissions: MediaSourcePtsCadenceEpochScanSubmissionV3[] = [];
    const result = await runMediaSourcePtsCadenceDurableEpochRuntimeV3({
      jobId: fixture.created.job.jobId,
      workerId: 'worker-v3',
    }, runtimeDependencies(
      fixture,
      submissions,
      async () => publisherResult('COMPLETED', null),
    ));

    expect(result).toEqual({
      kind: 'dead_letter',
      jobId: fixture.created.job.jobId,
      errorCode:
        'MEDIA_SOURCE_PTS_EPOCH_WORKER_PUBLISHER_TERMINAL_RECEIPT_MISSING',
    });
  });

  it('retries a temporarily unavailable verified source before scan submission', async () => {
    const fixture = await jobFixture();
    const submitScan = vi.fn();
    const result = await runMediaSourcePtsCadenceDurableEpochRuntimeV3({
      jobId: fixture.created.job.jobId,
      workerId: 'worker-v3',
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
      publishScan: vi.fn(),
      clock: () => START,
    });

    expect(result).toMatchObject({
      kind: 'retry_wait',
      errorCode:
        'MEDIA_SOURCE_PTS_EPOCH_WORKER_SOURCE_MEDIA_SOURCE_SIGNED_URL_UNAVAILABLE',
    });
    expect(submitScan).not.toHaveBeenCalled();
  });
});

async function jobFixture() {
  const source = sourceFixture();
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const jobStore = new DurableWorkflowJobStoreV1(
    async () => collection.asCollection(),
  );
  const created = await createOrGetMediaSourcePtsCadenceDurableEpochJobV3({
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
  return {
    source,
    created,
    jobStore,
    store,
    snapshot: () => jobStore.getAuthorized({
      jobId: created.job.jobId,
      tenantId: 'tenant-1',
      userId: 'user-1',
    }),
  };
}

function runtimeDependencies(
  fixture: Awaited<ReturnType<typeof jobFixture>>,
  submissions: MediaSourcePtsCadenceEpochScanSubmissionV3[],
  publishScan: typeof publishMediaSourcePtsCadenceScanV3,
) {
  return {
    environment: ENVIRONMENT,
    jobStore: fixture.jobStore,
    transportConfigured: () => true,
    createPrivateRuntime: () => privateRuntime(),
    createAssetStorePorts: async () => fixture.store,
    resolveVerifiedSourceUrl: async () => ({
      disposition: 'AVAILABLE' as const,
      sourceUrl: 'https://private.example.test/source.mov?lease=runtime-helper',
      storageVersion: fixture.source.sourceVersion.storageVersion,
    }),
    submitScan: async (submission: MediaSourcePtsCadenceEpochScanSubmissionV3) => {
      submissions.push(submission);
      return acceptedJob(submission);
    },
    pollScan: async () => ({
      disposition: 'TERMINAL' as const,
      result: completeResult(submissions[0]!),
    }),
    publishScan,
    clock: () => START,
  };
}

function acceptedJob(submission: MediaSourcePtsCadenceEpochScanSubmissionV3) {
  return {
    disposition: 'ACCEPTED' as const,
    job: {
      submissionId: submission.submissionId,
      functionCallId: 'fc-epoch-runtime-12345678',
      mapBindingSha256: submission.request.mapBindingSha256,
      mapperVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
      commandPolicyVersion:
        MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
    },
  };
}

function assetStore(
  source: ReturnType<typeof sourceFixture>,
): MediaSourcePtsCadenceMapAssetStorePortsV3 {
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

function publisherResult(
  disposition: 'COMPLETED' | 'ALREADY_COMPLETE',
  terminalReceiptSha256: string | null,
): MediaSourcePtsCadenceScanPublicationResultV3 {
  return {
    disposition,
    state: publisherState(terminalReceiptSha256),
  } as unknown as MediaSourcePtsCadenceScanPublicationResultV3;
}

function publisherState(terminalReceiptSha256: string | null) {
  return {
    sourcePtsCadenceMapV3: {
      terminalReceipt: terminalReceiptSha256
        ? { terminalReceiptSha256 }
        : null,
    },
  };
}

function completeResult(
  submission: MediaSourcePtsCadenceEpochScanSubmissionV3,
) {
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
    frames: [
      { presentationTimestampTicks: '0', durationTicks: '450000' },
      { presentationTimestampTicks: '450000', durationTicks: '450000' },
    ],
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
      frameCount: '2',
      startPresentationTimestampTicks: '0',
      endExclusivePresentationTimestampTicks: '900000',
      previousBatchContentSha256: null,
      sidecar: createMediaSourcePtsCadenceScanBatchSidecarV1({ serialization }),
    }],
    totalFrameCount: '2',
    sourceStartPresentationTimestampTicks: '0',
    sourceEndExclusivePresentationTimestampTicks: '900000',
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
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: 1_000,
    contentSha256: 'a'.repeat(64),
    storageVersion,
  });
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PROBE_VERSION_V1,
    probeVersion: `${MEDIA_SOURCE_PROBE_VERSION_V1}; ffprobe version 8.1`,
    formatName: 'mov',
    durationMilliseconds: 10_000,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0',
      sourceDurationTicks: '900000',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' },
      frameCount: '300',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
    }],
    audioStreams: [],
  };
  const qualification: MediaSourceQualificationRecordV1 = {
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
    status: 'MEASURED_TECHNICAL',
    assetId: 'asset-1',
    locator: storageVersion.locator,
    sourceBindingSha256: hashEditronCanonicalJsonV1({
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
      assetId: 'asset-1',
      locator: storageVersion.locator,
    }),
    requestId: 'media-source-probe:test-v3-runtime',
    attemptCount: 1,
    requestedAt: START.toISOString(),
    startedAt: START.toISOString(),
    completedAt: START.toISOString(),
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
    diagnostic: null,
  };
  return { sourceVersion, qualification };
}
