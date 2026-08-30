import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { createOrGetMediaSourceAudioDurableJobV1 }
  from '@/lib/editron/services/media-source-audio-durable-job-v1';
import {
  MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_KIND_V1,
} from '@/lib/editron/services/media-source-audio-product-materializer-v1';
import { runMediaSourceAudioProductRuntimeV1 }
  from '@/lib/editron/services/media-source-audio-product-runtime-v1';
import {
  runMediaSourceAudioDurableRuntimeV1,
} from '@/lib/editron/services/media-source-audio-durable-runtime-v1';
import type { MediaSourceAudioSampleEpochResourcePolicyV1 }
  from '@/lib/editron/services/media-source-audio-sample-epoch-map-v1';
import type { MediaSourceAudioPrivateArtifactStreamWriterV1 }
  from '@/lib/editron/services/media-source-audio-private-artifact-port-v1';
import type { MediaSourceQualificationRecordV1 }
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceQualificationV1 }
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import type { MediaSourceVersionEvidenceStorePortsV1 }
  from '@/lib/editron/services/media-source-version-evidence-owner-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const CREATED_AT = new Date('2026-08-30T16:00:00.000Z');
const WORK_AT = new Date('2026-08-30T16:00:01.000Z');
const ENVIRONMENT = {
  EDITRON_MEDIA_PTS_R2_ACCOUNT_ID: 'a'.repeat(32),
  EDITRON_MEDIA_PTS_R2_ACCESS_KEY_ID: 'private-access',
  EDITRON_MEDIA_PTS_R2_SECRET_ACCESS_KEY: 'private-secret',
  EDITRON_MEDIA_PTS_R2_BUCKET_NAME: 'private-media',
};

describe('MediaSourceAudioDurableRuntimeV1', () => {
  it('preflights every external owner before claiming a durable attempt', async () => {
    const privateFactory = vi.fn(() => privateRuntime());
    const assetFactory = vi.fn(async () => assetStore(sourceFixture()));
    const evidenceFactory = vi.fn(() => evidenceStore());

    await expect(runMediaSourceAudioDurableRuntimeV1(
      { jobId: 'job-not-claimed', workerId: 'worker-audio' },
      {
        environment: ENVIRONMENT,
        createPrivateRuntime: () => {
          throw new Error('missing private storage');
        },
        createAssetStorePorts: assetFactory,
        createEvidenceStorePorts: evidenceFactory,
      },
    )).resolves.toEqual({
      kind: 'runtime_unavailable',
      reason: 'PRIVATE_STORAGE_NOT_CONFIGURED',
    });
    expect(assetFactory).not.toHaveBeenCalled();
    expect(evidenceFactory).not.toHaveBeenCalled();

    await expect(runMediaSourceAudioDurableRuntimeV1(
      { jobId: 'job-not-claimed', workerId: 'worker-audio' },
      {
        environment: ENVIRONMENT,
        createPrivateRuntime: privateFactory,
        createAssetStorePorts: async () => {
          throw new Error('asset owner unavailable');
        },
        createEvidenceStorePorts: evidenceFactory,
      },
    )).resolves.toEqual({
      kind: 'runtime_unavailable',
      reason: 'MEDIA_ASSET_OWNER_UNAVAILABLE',
    });
    expect(evidenceFactory).not.toHaveBeenCalled();

    await expect(runMediaSourceAudioDurableRuntimeV1(
      { jobId: 'job-not-claimed', workerId: 'worker-audio' },
      {
        environment: ENVIRONMENT,
        createPrivateRuntime: privateFactory,
        createAssetStorePorts: assetFactory,
        createEvidenceStorePorts: () => {
          throw new Error('evidence owner unavailable');
        },
      },
    )).resolves.toEqual({
      kind: 'runtime_unavailable',
      reason: 'SOURCE_VERSION_EVIDENCE_OWNER_UNAVAILABLE',
    });
  });

  it('reuses the preflighted owners through the exact product runtime', async () => {
    const setup = await createSetup('complete');
    const privatePorts = privateRuntime();
    const evidencePorts = evidenceStore();
    const runProductRuntime = vi.fn(async (
      input: Parameters<typeof runMediaSourceAudioProductRuntimeV1>[0],
      dependencies: Parameters<typeof runMediaSourceAudioProductRuntimeV1>[1],
    ) => {
      if (!dependencies) throw new Error('TEST_RUNTIME_DEPENDENCIES_MISSING');
      expect(await dependencies.createAssetStorePorts?.()).toBe(setup.assetPorts);
      expect(dependencies.createEvidenceStorePorts?.()).toBe(evidencePorts);
      expect(dependencies.createPrivateRuntime?.(ENVIRONMENT)).toBe(privatePorts);
      expect(input.expectedAudioStreamBindings.map(
        ({ audioStreamIndex }) => audioStreamIndex,
      )).toEqual([3]);
      await input.beforeActiveStateMutation?.();
      return productReceipt(setup.created.job);
    });

    const result = await runMediaSourceAudioDurableRuntimeV1({
      jobId: setup.created.job.jobId,
      workerId: 'worker-audio',
    }, {
      environment: ENVIRONMENT,
      jobStore: setup.jobStore,
      createPrivateRuntime: () => privatePorts,
      createAssetStorePorts: async () => setup.assetPorts,
      createEvidenceStorePorts: () => evidencePorts,
      runProductRuntime,
      clock: () => WORK_AT,
    });

    expect(result).toMatchObject({
      kind: 'completed', disposition: 'PASS',
    });
    expect(runProductRuntime).toHaveBeenCalledTimes(1);
    expect(setup.assetPorts.load).toHaveBeenCalledTimes(1);
    await expect(setup.snapshot()).resolves.toMatchObject({
      status: 'completed', terminalReceipt: { disposition: 'PASS' },
    });
  });

  it('retries a current-source store outage instead of misreporting staleness', async () => {
    const setup = await createSetup('load-outage', true);
    const runProductRuntime = vi.fn();

    const result = await runMediaSourceAudioDurableRuntimeV1({
      jobId: setup.created.job.jobId,
      workerId: 'worker-audio',
    }, {
      environment: ENVIRONMENT,
      jobStore: setup.jobStore,
      createPrivateRuntime: () => privateRuntime(),
      createAssetStorePorts: async () => setup.assetPorts,
      createEvidenceStorePorts: () => evidenceStore(),
      runProductRuntime,
      clock: () => WORK_AT,
      retryDelayMs: 1_000,
    });

    expect(result).toEqual({
      kind: 'retry_wait',
      jobId: setup.created.job.jobId,
      errorCode: 'MEDIA_SOURCE_AUDIO_WORKER_CURRENT_SOURCE_LOAD_FAILED',
    });
    expect(runProductRuntime).not.toHaveBeenCalled();
    await expect(setup.snapshot()).resolves.toMatchObject({
      status: 'retry_wait',
      error: {
        code: 'MEDIA_SOURCE_AUDIO_WORKER_CURRENT_SOURCE_LOAD_FAILED',
        retryable: true,
      },
    });
  });
});

async function createSetup(tag: string, loadFailure = false) {
  const fixture = sourceFixture(tag);
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const jobStore = new DurableWorkflowJobStoreV1(
    async () => collection.asCollection(),
  );
  const created = await createOrGetMediaSourceAudioDurableJobV1({
    jobStore,
    request: requestFor(fixture),
    now: CREATED_AT,
  });
  const assetPorts = assetStore(fixture, loadFailure);
  return {
    created,
    jobStore,
    assetPorts,
    snapshot: () => jobStore.getAuthorized({
      jobId: created.job.jobId,
      tenantId: created.job.tenantId,
      userId: created.job.userId,
    }),
  };
}

function assetStore(
  fixture: ReturnType<typeof sourceFixture>,
  loadFailure = false,
) {
  return {
    load: vi.fn(async () => {
      if (loadFailure) throw new Error('database timeout');
      return fixture.asset;
    }),
    replace: vi.fn(async () => false),
  };
}

function privateRuntime() {
  return {
    audioArtifact: {} as MediaSourceAudioPrivateArtifactStreamWriterV1,
  };
}

function evidenceStore(): MediaSourceVersionEvidenceStorePortsV1 {
  return {
    load: vi.fn(async () => null),
    compareAndSet: vi.fn(async () => false),
  };
}

function productReceipt(
  job: Awaited<ReturnType<typeof createSetup>>['created']['job'],
) {
  const payload = job.input.payload as unknown as {
    assetId: string;
    userId: string;
    audioStreamBindingsSha256: string;
    audioStreamBindings: readonly Readonly<{
      audioStreamIndex: number;
      sourceVersionSha256: string;
    }>[];
  };
  const observedAudioStreamIndexes = payload.audioStreamBindings.map(
    ({ audioStreamIndex }) => audioStreamIndex,
  );
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_KIND_V1,
    disposition: 'COMPLETED' as const,
    assetId: payload.assetId,
    userId: payload.userId,
    sourceVersionSha256: payload.audioStreamBindings[0]!.sourceVersionSha256,
    audioStreamBindingsSha256: payload.audioStreamBindingsSha256,
    observedAudioStreamIndexes,
    materializedAudioStreamIndexes: observedAudioStreamIndexes,
    audioArtifactStateSha256: '2'.repeat(64),
    sourceVersionEvidenceSha256: '3'.repeat(64),
    completedAt: job.createdAt,
  };
  return {
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  };
}

function requestFor(fixture: ReturnType<typeof sourceFixture>) {
  return {
    tenantId: 'tenant-audio-runtime',
    userId: 'user-audio-runtime',
    orgId: null,
    assetId: 'asset-audio-runtime',
    sourceVersion: fixture.sourceVersion,
    qualification: fixture.qualification,
    resourcePolicy: resourcePolicy(),
  };
}

function sourceFixture(tag = 'runtime') {
  const locator = {
    provider: 'R2' as const,
    objectKey: `uploads/audio-runtime-${tag}.mov`,
  };
  const storageVersion = createMediaSourceStorageVersionV1({
    locator,
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-audio-runtime' },
    assetId: 'asset-audio-runtime',
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256: hashEditronCanonicalJsonV1({ tag }),
    storageVersion,
  });
  const created = createMediaSourceQualificationV1({
    asset: {
      assetId: sourceVersion.assetId,
      source: 'user-upload',
      r2Key: locator.objectKey,
    },
    now: CREATED_AT,
  });
  if (created.disposition !== 'CREATED') throw new Error('TEST_FIXTURE_INVALID');
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'mov',
    durationMilliseconds: 10_000,
    startTimeMilliseconds: 0,
    videoStreams: [],
    audioStreams: [{
      streamIndex: 3,
      codec: 'pcm_s24le',
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: { numerator: '1', denominator: '48000' },
      sourceStartPts: '0',
      sourceDurationTicks: '480000',
    }],
  };
  const qualification: MediaSourceQualificationRecordV1 = {
    ...created.record,
    status: 'MEASURED_TECHNICAL',
    attemptCount: 1,
    startedAt: CREATED_AT.toISOString(),
    completedAt: CREATED_AT.toISOString(),
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
  };
  const asset = {
    assetId: sourceVersion.assetId,
    type: 'video' as const,
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: qualification,
  };
  return { asset, qualification, sourceVersion };
}

function resourcePolicy(): MediaSourceAudioSampleEpochResourcePolicyV1 {
  return {
    policyVersion: 'audio-durable-runtime-test-v1',
    maxSourceBytes: 1_000,
    maxCanonicalJsonBytes: 100_000,
    maxDecodedFrameEntries: 10,
    maxEpochEntries: 10,
    maxDecodedSampleFrames: 1_000_000,
    maxDecodedPcmBytes: 8_000_000,
    timeoutMs: 1_000,
  };
}
