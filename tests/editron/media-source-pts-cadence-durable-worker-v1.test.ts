import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobRecordV1,
} from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 } from '@/lib/editron/services/durable-workflow-job-store-v1';
import {
  createOrGetMediaSourcePtsCadenceDurableJobV1,
} from '@/lib/editron/services/media-source-pts-cadence-durable-job-binding-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_DURABLE_RESUME_VERSION_V1,
  runMediaSourcePtsCadenceDurableWorkerV1,
  type MediaSourcePtsCadenceDurableFinalizerResultV1,
  type MediaSourcePtsCadenceDurableWorkerPortsV1,
} from '@/lib/editron/services/media-source-pts-cadence-durable-worker-v1';
import { MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1 } from '@/lib/editron/services/media-source-pts-cadence-scan-result-v1';
import {
  createMediaSourcePtsCadenceScanBatchSidecarV1,
  serializeMediaSourcePtsCadenceScanStagingBatchV1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-staging-v1';
import type {
  MediaSourcePtsCadenceScanPollResultV1,
  MediaSourcePtsCadenceScanSubmissionV1,
  MediaSourcePtsCadenceScanSubmitResultV1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-transport-v1';
import { MEDIA_SOURCE_PROBE_VERSION_V1 } from '@/lib/editron/services/media-source-probe-v1';
import type { MediaSourceQualificationRecordV1 } from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-25T12:00:00.000Z');

describe('media source PTS cadence durable worker V1', () => {
  it('submits once, defers a healthy wait, resumes by opaque call id and finalizes once', async () => {
    const fixture = await workerFixture();
    fixture.control.pollPlan.push(
      (job) => ({ disposition: 'PENDING', job }),
      () => ({
        disposition: 'TERMINAL',
        result: completeResult(fixture.control.submissions.at(-1)!),
      }),
    );

    const first = await fixture.run();
    const waiting = await fixture.snapshot();
    expect(first).toEqual({
      kind: 'deferred',
      jobId: fixture.jobId,
      submissionId: fixture.operationId,
    });
    expect(waiting).toMatchObject({
      status: 'retry_wait',
      remainingAttempts: waiting?.maxAttempts,
      resumeState: {
        sequence: 2,
        payload: {
          version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_RESUME_VERSION_V1,
          stage: 'SUBMITTED',
          submissionId: fixture.operationId,
          functionCallId: 'fc-12345678',
        },
      },
    });
    expect(JSON.stringify(waiting?.resumeState)).not.toMatch(/https?:\/\//i);

    fixture.advance(1_001);
    const second = await fixture.run();
    const completed = await fixture.snapshot();
    expect(second).toMatchObject({
      kind: 'completed',
      jobId: fixture.jobId,
      disposition: 'PASS',
    });
    expect(completed).toMatchObject({
      status: 'completed',
      terminalReceipt: { disposition: 'PASS' },
    });
    expect(fixture.ports.submitScan).toHaveBeenCalledTimes(1);
    expect(fixture.ports.pollScan).toHaveBeenCalledTimes(2);
    expect(fixture.ports.resolveVerifiedSourceUrl).toHaveBeenCalledTimes(2);
    expect(fixture.ports.finalizeScan).toHaveBeenCalledTimes(1);
  });

  it('retries a lost submit response with the same stable submission identity', async () => {
    const fixture = await workerFixture();
    fixture.control.submitPlan.push(
      () => ({
        disposition: 'UNVERIFIABLE',
        diagnostic: 'SCAN_TRANSPORT_REQUEST_FAILED',
      }),
    );
    fixture.control.pollPlan.push(() => ({
      disposition: 'TERMINAL',
      result: completeResult(fixture.control.submissions.at(-1)!),
    }));

    expect(await fixture.run()).toMatchObject({
      kind: 'retry_wait',
      errorCode: 'MEDIA_SOURCE_PTS_WORKER_SCAN_TRANSPORT_REQUEST_FAILED',
    });
    const retry = await fixture.snapshot();
    expect(retry).toMatchObject({
      status: 'retry_wait',
      resumeState: { sequence: 1, payload: { stage: 'SUBMITTING' } },
    });

    fixture.advance(1_001);
    expect(await fixture.run()).toMatchObject({
      kind: 'completed',
      disposition: 'PASS',
    });
    expect(fixture.control.submissions).toHaveLength(2);
    expect(fixture.control.submissions.map(({ submissionId }) => submissionId))
      .toEqual([fixture.operationId, fixture.operationId]);
    expect(fixture.control.submissions[0]?.request.source_url)
      .not.toBe(fixture.control.submissions[1]?.request.source_url);
    expect(fixture.ports.finalizeScan).toHaveBeenCalledTimes(1);
  });

  it('dead-letters a job whose current source no longer matches its immutable binding', async () => {
    const fixture = await workerFixture();
    fixture.control.currentSource = sourceFixture('b');

    expect(await fixture.run()).toEqual({
      kind: 'dead_letter',
      jobId: fixture.jobId,
      errorCode: 'MEDIA_SOURCE_PTS_WORKER_CURRENT_SOURCE_STALE',
    });
    expect(fixture.ports.resolveVerifiedSourceUrl).not.toHaveBeenCalled();
    expect(fixture.ports.submitScan).not.toHaveBeenCalled();
    expect(fixture.ports.pollScan).not.toHaveBeenCalled();
    expect(fixture.ports.finalizeScan).not.toHaveBeenCalled();
  });

  it('rejects a canonically rehashed resume state with a forged call-id grammar', async () => {
    const fixture = await workerFixture();
    fixture.control.pollPlan.push((job) => ({ disposition: 'PENDING', job }));
    expect(await fixture.run()).toMatchObject({ kind: 'deferred' });

    const record = fixture.collection.snapshot().find(({ jobId }) => jobId === fixture.jobId)!;
    const forgedPayload = {
      ...record.resumeState!.payload,
      functionCallId: 'forged-call',
    };
    await fixture.collection.updateOne(
      { _id: fixture.jobId },
      {
        $set: {
          resumeState: {
            ...record.resumeState,
            payload: forgedPayload,
            stateSha256: hashDurableWorkflowJobJsonV1(forgedPayload),
          },
        },
      },
    );

    fixture.advance(1_001);
    expect(await fixture.run()).toEqual({
      kind: 'dead_letter',
      jobId: fixture.jobId,
      errorCode: 'MEDIA_SOURCE_PTS_WORKER_RESUME_INVALID',
    });
    expect(fixture.ports.pollScan).toHaveBeenCalledTimes(1);
    expect(fixture.ports.finalizeScan).not.toHaveBeenCalled();
  });

  it('terminalizes a valid scan-level UNVERIFIABLE result without invoking the asset finalizer', async () => {
    const fixture = await workerFixture();
    fixture.control.pollPlan.push(() => ({
      disposition: 'TERMINAL',
      result: unverifiableResult(fixture.control.submissions.at(-1)!),
    }));

    expect(await fixture.run()).toMatchObject({
      kind: 'completed',
      jobId: fixture.jobId,
      disposition: 'UNVERIFIABLE',
    });
    expect(await fixture.snapshot()).toMatchObject({
      status: 'completed',
      terminalReceipt: { disposition: 'UNVERIFIABLE' },
    });
    expect(fixture.ports.finalizeScan).not.toHaveBeenCalled();
  });

  it('rejects a terminal scan result copied from another map binding', async () => {
    const fixture = await workerFixture();
    fixture.control.pollPlan.push(() => ({
      disposition: 'TERMINAL',
      result: completeResult(fixture.control.submissions.at(-1)!, 'f'.repeat(64)),
    }));

    expect(await fixture.run()).toEqual({
      kind: 'dead_letter',
      jobId: fixture.jobId,
      errorCode: 'MEDIA_SOURCE_PTS_WORKER_RESULT_BINDING_MISMATCH',
    });
    expect(fixture.ports.finalizeScan).not.toHaveBeenCalled();
  });
});

async function workerFixture() {
  const initialSource = sourceFixture();
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const jobStore = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
  let nowMs = START.getTime();
  const control: {
    currentSource: ReturnType<typeof sourceFixture> | null;
    submissions: MediaSourcePtsCadenceScanSubmissionV1[];
    submitPlan: Array<(
      submission: MediaSourcePtsCadenceScanSubmissionV1,
    ) => MediaSourcePtsCadenceScanSubmitResultV1>;
    pollPlan: Array<(
      job: Parameters<MediaSourcePtsCadenceDurableWorkerPortsV1['pollScan']>[0],
    ) => MediaSourcePtsCadenceScanPollResultV1>;
    finalizerResult: MediaSourcePtsCadenceDurableFinalizerResultV1;
    sourceUrlSequence: number;
  } = {
    currentSource: initialSource,
    submissions: [],
    submitPlan: [],
    pollPlan: [],
    finalizerResult: {
      disposition: 'COMPLETED',
      terminalReceiptSha256: 'd'.repeat(64),
    },
    sourceUrlSequence: 0,
  };
  const ports: MediaSourcePtsCadenceDurableWorkerPortsV1 = {
    loadCurrentSource: vi.fn(async () => control.currentSource),
    resolveVerifiedSourceUrl: vi.fn(async () => {
      control.sourceUrlSequence += 1;
      return {
        disposition: 'AVAILABLE' as const,
        sourceUrl: `https://private.example.test/source.mov?lease=${control.sourceUrlSequence}`,
        storageVersionSha256: control.currentSource!.sourceVersion.storageVersion.storageVersionSha256,
      };
    }),
    submitScan: vi.fn(async (submission) => {
      control.submissions.push(submission);
      const planned = control.submitPlan.shift();
      return planned?.(submission) ?? {
        disposition: 'ACCEPTED' as const,
        job: {
          submissionId: submission.submissionId,
          functionCallId: 'fc-12345678',
          mapBindingSha256: submission.request.mapBindingSha256,
        },
      };
    }),
    pollScan: vi.fn(async (job) => {
      const planned = control.pollPlan.shift();
      if (!planned) throw new Error('TEST_POLL_RESULT_MISSING');
      return planned(job);
    }),
    finalizeScan: vi.fn(async () => control.finalizerResult),
  };
  const created = await createOrGetMediaSourcePtsCadenceDurableJobV1({
    jobStore,
    request: {
      tenantId: 'tenant-1',
      userId: 'user-1',
      orgId: null,
      assetId: 'asset-1',
      sourceVersion: initialSource.sourceVersion,
      qualification: initialSource.qualification,
      videoStreamIndex: 0,
    },
    now: START,
  });
  const run = () => runMediaSourcePtsCadenceDurableWorkerV1({
    jobStore,
    ports,
    jobId: created.job.jobId,
    workerId: 'worker-1',
    clock: () => new Date(nowMs),
    retryDelayMs: 1_000,
    pollDelayMs: 1_000,
  });
  const snapshot = () => jobStore.getAuthorized({
    jobId: created.job.jobId,
    tenantId: 'tenant-1',
    userId: 'user-1',
  });
  return {
    collection,
    control,
    ports,
    jobId: created.job.jobId,
    operationId: created.job.operationId,
    run,
    snapshot,
    advance: (milliseconds: number) => { nowMs += milliseconds; },
  };
}

function completeResult(
  submission: MediaSourcePtsCadenceScanSubmissionV1,
  mapBindingSha256 = submission.request.mapBindingSha256,
) {
  const request = submission.request;
  const batch = serializeMediaSourcePtsCadenceScanStagingBatchV1({
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_V1',
    mapBindingSha256,
    resourcePolicy: request.resourcePolicy,
    sourceTimebase: request.mapBinding.sourceTimebase,
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
    shardSequence: 0,
    firstFrameOrdinal: '0',
    previousBatchContentSha256: null,
    frames: [
      { presentationTimestampTicks: '0', durationTicks: '3003' },
      { presentationTimestampTicks: '3003', durationTicks: '3003' },
    ],
  });
  return {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1,
    status: 'COMPLETE' as const,
    diagnostic: null,
    mapBindingSha256,
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
      endExclusivePresentationTimestampTicks: '6006',
      previousBatchContentSha256: null,
      sidecar: createMediaSourcePtsCadenceScanBatchSidecarV1({ serialization: batch }),
    }],
    totalFrameCount: '2',
    sourceStartPresentationTimestampTicks: '0',
    sourceEndExclusivePresentationTimestampTicks: '6006',
  };
}

function unverifiableResult(submission: MediaSourcePtsCadenceScanSubmissionV1) {
  const request = submission.request;
  return {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1,
    status: 'UNVERIFIABLE' as const,
    diagnostic: 'SCAN_SOURCE_DISCONTINUITY_UNSUPPORTED',
    mapBindingSha256: request.mapBindingSha256,
    resourcePolicy: request.resourcePolicy,
    ffprobeVersion: request.mapBinding.mapper.ffprobeVersion,
    videoStreamIndex: request.mapBinding.videoStreamIndex,
    sourceTimebase: request.mapBinding.sourceTimebase,
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
    batches: [],
    totalFrameCount: '0',
    sourceStartPresentationTimestampTicks: null,
    sourceEndExclusivePresentationTimestampTicks: null,
  };
}

function sourceFixture(content = 'a') {
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
    contentSha256: content.repeat(64),
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
    requestId: 'media-source-probe:test',
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
