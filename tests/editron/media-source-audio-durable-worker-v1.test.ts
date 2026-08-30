import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import type {
  DurableWorkflowJobRecordV1,
  DurableWorkflowJobSnapshotV1,
} from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import {
  assertMediaSourceAudioDurableJobInputV1,
  createOrGetMediaSourceAudioDurableJobV1,
} from '@/lib/editron/services/media-source-audio-durable-job-v1';
import {
  MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_KIND_V1,
  type MediaSourceAudioProductMaterializationInputV1,
} from '@/lib/editron/services/media-source-audio-product-materializer-v1';
import { createMediaSourceAudioProductMaterializationReceiptV2 }
  from '@/lib/editron/services/media-source-audio-product-receipt-v2';
import type { MediaSourceAudioSampleEpochResourcePolicyV1 }
  from '@/lib/editron/services/media-source-audio-sample-epoch-map-v1';
import { runMediaSourceAudioDurableWorkerV1 }
  from '@/lib/editron/services/media-source-audio-durable-worker-v1';
import {
  createMediaSourceQualificationV1,
  type MediaSourceQualificationRecordV1,
} from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const CREATED_AT = new Date('2026-08-30T15:00:00.000Z');
const WORK_STARTED_AT = new Date('2026-08-30T15:00:01.000Z');

describe('MediaSourceAudioDurableWorkerV1', () => {
  it('completes an exact source-bound job with terminal product evidence', async () => {
    const setup = await createSetup('complete');
    const materializeProduct = vi.fn(async (
      input: MediaSourceAudioProductMaterializationInputV1,
    ) => {
      expect(input).toMatchObject({
        assetId: 'asset-audio-worker',
        userId: 'user-audio-worker',
        publishedAt: CREATED_AT,
      });
      expect(input.expectedAudioStreamBindings.map(
        ({ audioStreamIndex }) => audioStreamIndex,
      )).toEqual([2, 7]);
      await input.beforeActiveStateMutation?.();
      return productReceipt(setup.job);
    });

    const result = await runWorker(setup, materializeProduct);

    expect(result).toMatchObject({
      kind: 'completed',
      jobId: setup.job.jobId,
      disposition: 'PASS',
      receiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(materializeProduct).toHaveBeenCalledTimes(1);
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'completed',
      attemptCount: 1,
      terminalReceipt: {
        disposition: 'PASS',
        proofReferences: [
          { proofId: `msaudio-product:${setup.job.jobId}`, disposition: 'PASS' },
          {
            proofId: `msaudio-availability:${setup.job.jobId}`,
            disposition: 'PASS',
          },
          { proofId: `msaudio-evidence:${setup.job.jobId}`, disposition: 'PASS' },
        ],
      },
    });
  });

  it('dead-letters a job when the current source no longer matches its binding', async () => {
    const setup = await createSetup('original');
    const materializeProduct = vi.fn();

    const result = await runWorker(
      setup,
      materializeProduct,
      sourceFixture('replacement'),
    );

    expect(result).toEqual({
      kind: 'dead_letter',
      jobId: setup.job.jobId,
      errorCode: 'MEDIA_SOURCE_AUDIO_WORKER_CURRENT_SOURCE_STALE',
    });
    expect(materializeProduct).not.toHaveBeenCalled();
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'dead_letter',
      error: {
        code: 'MEDIA_SOURCE_AUDIO_WORKER_CURRENT_SOURCE_STALE',
        retryable: false,
      },
    });
  });

  it('parks temporary runtime absence and resumes the same job after it is due', async () => {
    const setup = await createSetup('retry');
    const unavailable = vi.fn(async () => ({
      kind: 'runtime_unavailable' as const,
      reason: 'PRIVATE_STORAGE_NOT_CONFIGURED' as const,
    }));

    const first = await runWorker(setup, unavailable);

    expect(first).toEqual({
      kind: 'retry_wait',
      jobId: setup.job.jobId,
      errorCode:
        'MEDIA_SOURCE_AUDIO_WORKER_RUNTIME_PRIVATE_STORAGE_NOT_CONFIGURED',
    });
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'retry_wait',
      attemptCount: 1,
      retryCursor: {
        inputBindingSha256: setup.job.input.bindingSha256,
        resumeSequence: 0,
        ownerCursor: { runtimeReason: 'PRIVATE_STORAGE_NOT_CONFIGURED' },
      },
    });

    setup.advance(2_000);
    const recovered = vi.fn(async (
      input: MediaSourceAudioProductMaterializationInputV1,
    ) => {
      await input.beforeActiveStateMutation?.();
      return productReceipt(setup.job);
    });
    const second = await runWorker(setup, recovered, setup.fixture, 'worker-b');

    expect(second.kind).toBe('completed');
    expect(recovered).toHaveBeenCalledTimes(1);
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'completed', attemptCount: 2,
    });
  });

  it('aborts running materialization and cancels without product proof', async () => {
    const setup = await createSetup('cancel-running');
    let announceStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { announceStarted = resolve; });
    const materializeProduct = vi.fn(async (
      input: MediaSourceAudioProductMaterializationInputV1,
    ) => {
      const signal = input.abortSignal;
      if (!signal) throw new Error('TEST_ABORT_SIGNAL_MISSING');
      announceStarted?.();
      return new Promise<never>((_resolve, reject) => {
        const aborted = () => reject(new Error('TEST_PRODUCT_ABORTED'));
        signal.addEventListener('abort', aborted, { once: true });
        if (signal.aborted) aborted();
      });
    });
    const running = runWorker(setup, materializeProduct, setup.fixture, 'worker-a', 10);
    await started;
    setup.advance(100);
    await requestCancellation(setup, 'cancel while decoding');

    await expect(running).resolves.toEqual({
      kind: 'cancelled',
      jobId: setup.job.jobId,
      productReceiptSha256: null,
    });
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'cancelled',
      terminalReceipt: { disposition: 'CANCELLED', proofReferences: [] },
    });
  });

  it('records committed product proof when cancellation wins terminal settlement', async () => {
    const setup = await createSetup('cancel-after-proof');
    const receipt = productReceipt(setup.job);
    const materializeProduct = vi.fn(async (
      input: MediaSourceAudioProductMaterializationInputV1,
    ) => {
      await input.beforeActiveStateMutation?.();
      setup.advance(100);
      await requestCancellation(setup, 'cancel after evidence commit');
      return receipt;
    });

    const result = await runWorker(setup, materializeProduct);

    expect(result).toEqual({
      kind: 'cancelled',
      jobId: setup.job.jobId,
      productReceiptSha256: receipt.receiptSha256,
    });
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'cancelled',
      terminalReceipt: {
        disposition: 'CANCELLED',
        proofReferences: [
          {
            proofId: `msaudio-product:${setup.job.jobId}`,
            proofSha256: receipt.receiptSha256,
            disposition: 'PASS',
          },
          {
            proofId: `msaudio-availability:${setup.job.jobId}`,
            proofSha256: receipt.sourceAudioAvailabilityEvidenceSha256,
            disposition: 'PASS',
          },
          {
            proofId: `msaudio-evidence:${setup.job.jobId}`,
            proofSha256: receipt.sourceVersionEvidenceSha256,
            disposition: 'PASS',
          },
        ],
      },
    });
  });

  it('dead-letters a legacy V1 receipt after canonical-proof cutover', async () => {
    const setup = await createSetup('legacy-receipt');
    const materializeProduct = vi.fn(async () => (
      legacyProductReceipt(setup.job) as never
    ));

    const result = await runWorker(setup, materializeProduct);

    expect(result).toEqual({
      kind: 'dead_letter',
      jobId: setup.job.jobId,
      errorCode: 'MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_FIELDS_INVALID',
    });
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'dead_letter',
      error: {
        code: 'MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_FIELDS_INVALID',
        retryable: false,
      },
    });
  });

  it('dead-letters a valid receipt that belongs to another source version', async () => {
    const setup = await createSetup('wrong-scope');
    const wrongReceipt = productReceipt(setup.job, {
      sourceVersionSha256: 'f'.repeat(64),
    });
    const materializeProduct = vi.fn(async () => wrongReceipt);

    const result = await runWorker(setup, materializeProduct);

    expect(result).toEqual({
      kind: 'dead_letter',
      jobId: setup.job.jobId,
      errorCode: 'MEDIA_SOURCE_AUDIO_WORKER_PRODUCT_RECEIPT_CONTRACT_MISMATCH',
    });
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'dead_letter',
      error: {
        code: 'MEDIA_SOURCE_AUDIO_WORKER_PRODUCT_RECEIPT_CONTRACT_MISMATCH',
        retryable: false,
      },
    });
  });
});

async function createSetup(tag: string) {
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
  let currentTime = new Date(WORK_STARTED_AT);
  return {
    fixture,
    jobStore,
    job: created.job,
    clock: () => new Date(currentTime),
    advance(milliseconds: number) {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
  };
}

async function runWorker(
  setup: Awaited<ReturnType<typeof createSetup>>,
  materializeProduct: Parameters<
    typeof runMediaSourceAudioDurableWorkerV1
  >[0]['ports']['materializeProduct'],
  currentSource = setup.fixture,
  workerId = 'worker-a',
  heartbeatIntervalMs?: number,
) {
  return runMediaSourceAudioDurableWorkerV1({
    jobStore: setup.jobStore,
    jobId: setup.job.jobId,
    workerId,
    clock: setup.clock,
    retryDelayMs: 1_000,
    heartbeatIntervalMs,
    ports: {
      loadCurrentSource: vi.fn(async () => currentSource),
      materializeProduct,
    },
  });
}

function productReceipt(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  overrides: Readonly<{ sourceVersionSha256?: string }> = {},
) {
  const payload = assertMediaSourceAudioDurableJobInputV1(job.input.payload);
  const observedAudioStreamIndexes = payload.audioStreamBindings.map(
    ({ audioStreamIndex }) => audioStreamIndex,
  );
  return createMediaSourceAudioProductMaterializationReceiptV2({
    disposition: 'COMPLETED' as const,
    assetId: payload.assetId,
    userId: payload.userId,
    sourceVersionSha256:
      overrides.sourceVersionSha256
      ?? payload.audioStreamBindings[0]!.sourceVersionSha256,
    audioStreamBindingsSha256: payload.audioStreamBindingsSha256,
    observedAudioStreamIndexes,
    materializedAudioStreamIndexes: observedAudioStreamIndexes,
    audioArtifactStateSha256: '2'.repeat(64),
    sourceAudioAvailabilityEvidenceSha256: '4'.repeat(64),
    sourceVersionEvidenceSha256: '3'.repeat(64),
    completedAt: job.createdAt,
  });
}

function legacyProductReceipt(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
) {
  const payload = assertMediaSourceAudioDurableJobInputV1(job.input.payload);
  const observedAudioStreamIndexes = payload.audioStreamBindings.map(
    ({ audioStreamIndex }) => audioStreamIndex,
  );
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_KIND_V1,
    disposition: 'COMPLETED' as const,
    assetId: payload.assetId,
    userId: payload.userId,
    sourceVersionSha256:
      payload.audioStreamBindings[0]!.sourceVersionSha256,
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

async function currentJob(setup: Awaited<ReturnType<typeof createSetup>>) {
  return setup.jobStore.getAuthorized({
    jobId: setup.job.jobId,
    tenantId: setup.job.tenantId,
    userId: setup.job.userId,
  });
}

async function requestCancellation(
  setup: Awaited<ReturnType<typeof createSetup>>,
  reason: string,
) {
  return setup.jobStore.requestCancellation({
    jobId: setup.job.jobId,
    tenantId: setup.job.tenantId,
    userId: setup.job.userId,
    requestedBy: setup.job.userId,
    reason,
    now: setup.clock(),
  });
}

function requestFor(fixture: ReturnType<typeof sourceFixture>) {
  return {
    tenantId: 'tenant-audio-worker',
    userId: 'user-audio-worker',
    orgId: null,
    assetId: 'asset-audio-worker',
    sourceVersion: fixture.sourceVersion,
    qualification: fixture.qualification,
    resourcePolicy: resourcePolicy(),
  };
}

function sourceFixture(tag: string) {
  const locator = {
    provider: 'R2' as const,
    objectKey: `uploads/audio-worker-${tag}.mov`,
  };
  const storageVersion = createMediaSourceStorageVersionV1({
    locator,
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-audio-worker' },
    assetId: 'asset-audio-worker',
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
    audioStreams: [7, 2].map((streamIndex) => ({
      streamIndex,
      codec: 'pcm_s24le',
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: { numerator: '1', denominator: '48000' },
      sourceStartPts: '0',
      sourceDurationTicks: '480000',
    })),
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
  return { qualification, sourceVersion };
}

function resourcePolicy(): MediaSourceAudioSampleEpochResourcePolicyV1 {
  return {
    policyVersion: 'audio-durable-worker-test-v1',
    maxSourceBytes: 1_000,
    maxCanonicalJsonBytes: 100_000,
    maxDecodedFrameEntries: 10,
    maxEpochEntries: 10,
    maxDecodedSampleFrames: 1_000_000,
    maxDecodedPcmBytes: 8_000_000,
    timeoutMs: 1_000,
  };
}
