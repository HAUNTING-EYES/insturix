import { describe, expect, it, vi } from 'vitest';

import {
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
  createMediaSourcePtsCadenceEpochScanSubmissionV3,
  isMediaSourcePtsCadenceEpochScanTransportConfiguredV3,
  pollMediaSourcePtsCadenceEpochScanV3,
  submitMediaSourcePtsCadenceEpochScanV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-scan-transport-v3';
import {
  MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-result-v1';
import {
  createMediaSourcePtsCadenceScanBatchSidecarV1,
  serializeMediaSourcePtsCadenceScanStagingBatchV1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-staging-v1';
import {
  createMediaSourcePtsCadenceScanRequestV1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-transport-v1';

const environment = {
  EDITRON_MEDIA_SOURCE_PTS_EPOCH_SCAN_SUBMIT_ENDPOINT: 'https://pts-epoch-submit.modal.run',
  EDITRON_MEDIA_SOURCE_PTS_EPOCH_SCAN_POLL_ENDPOINT: 'https://pts-epoch-poll.modal.run',
  EDITRON_MODAL_PROXY_AUTH_TOKEN_ID: 'proxy-id',
  EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET: 'proxy-secret',
};

describe('media source PTS epoch scan transport V3', () => {
  it('requires distinct trusted endpoints and an exact V3 mapper binding', () => {
    const request = requestFixture();
    const submission = submissionFixture(request);
    expect(submission).toMatchObject({
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_PTS_EPOCH_SCAN_SUBMISSION_V3',
      request,
    });
    expect(isMediaSourcePtsCadenceEpochScanTransportConfiguredV3(environment)).toBe(true);
    expect(isMediaSourcePtsCadenceEpochScanTransportConfiguredV3({
      ...environment,
      EDITRON_MEDIA_SOURCE_PTS_EPOCH_SCAN_POLL_ENDPOINT: 'https://attacker.example.test',
    })).toBe(false);
    expect(() => submissionFixture(requestFixture('continuous-ffprobe-v1')))
      .toThrow('EPOCH_SCAN_REQUEST_MAPPER_IDENTITY_INVALID');
  });

  it('submits an identity-bound V3 job without returning the source URL', async () => {
    const request = requestFixture();
    const submission = submissionFixture(request);
    const fetchImpl = vi.fn(async () => jsonResponse({
      ok: true,
      submissionId: submission.submissionId,
      mapBindingSha256: request.mapBindingSha256,
      functionCallId: 'fc-epoch12345',
      mapperVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
      commandPolicyVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
    })) as unknown as typeof fetch;

    const result = await submitMediaSourcePtsCadenceEpochScanV3(
      submission,
      { environment, fetchImpl },
    );

    expect(result).toEqual({
      disposition: 'ACCEPTED',
      job: {
        submissionId: submission.submissionId,
        functionCallId: 'fc-epoch12345',
        mapBindingSha256: request.mapBindingSha256,
        mapperVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
        commandPolicyVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
      },
    });
    expect(JSON.stringify(result)).not.toContain('presigned-secret');
    expect(fetchImpl).toHaveBeenCalledWith(
      environment.EDITRON_MEDIA_SOURCE_PTS_EPOCH_SCAN_SUBMIT_ENDPOINT,
      expect.objectContaining({
        headers: expect.objectContaining({
          'Modal-Key': 'proxy-id',
          'Modal-Secret': 'proxy-secret',
        }),
        body: JSON.stringify(submission),
      }),
    );
  });

  it('polls identity-bound pending and terminal records and rejects forgery', async () => {
    const request = requestFixture();
    const job = {
      submissionId: 'epoch-submission-a',
      functionCallId: 'fc-epoch12345',
      mapBindingSha256: request.mapBindingSha256,
      mapperVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
      commandPolicyVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
    } as const;
    const pending = vi.fn(async () => jsonResponse({
      ok: true,
      status: 'PENDING',
      submissionId: job.submissionId,
      mapBindingSha256: job.mapBindingSha256,
      mapperVersion: job.mapperVersion,
      commandPolicyVersion: job.commandPolicyVersion,
    }, 202)) as unknown as typeof fetch;
    await expect(pollMediaSourcePtsCadenceEpochScanV3(job, { environment, fetchImpl: pending }))
      .resolves.toEqual({ disposition: 'PENDING', job });
    expect(pending).toHaveBeenCalledWith(
      environment.EDITRON_MEDIA_SOURCE_PTS_EPOCH_SCAN_POLL_ENDPOINT,
      expect.objectContaining({ body: JSON.stringify(job) }),
    );

    const terminal = vi.fn(async () => jsonResponse({
      ok: true,
      status: 'TERMINAL',
      submissionId: job.submissionId,
      mapBindingSha256: job.mapBindingSha256,
      mapperVersion: job.mapperVersion,
      commandPolicyVersion: job.commandPolicyVersion,
      result: scanResultFixture(job.mapBindingSha256),
    })) as unknown as typeof fetch;
    await expect(pollMediaSourcePtsCadenceEpochScanV3(job, { environment, fetchImpl: terminal }))
      .resolves.toMatchObject({ disposition: 'TERMINAL', result: { status: 'COMPLETE' } });

    const forged = vi.fn(async () => jsonResponse({
      ok: true,
      status: 'PENDING',
      submissionId: job.submissionId,
      mapBindingSha256: job.mapBindingSha256,
      mapperVersion: 'continuous-ffprobe-v1',
      commandPolicyVersion: job.commandPolicyVersion,
    }, 202)) as unknown as typeof fetch;
    await expect(pollMediaSourcePtsCadenceEpochScanV3(job, { environment, fetchImpl: forged }))
      .resolves.toEqual({
        disposition: 'UNVERIFIABLE',
        diagnostic: 'SCAN_TRANSPORT_RESPONSE_INVALID',
      });
  });

  it('does not send credentials to an untrusted host and bounds response bytes', async () => {
    const submission = submissionFixture();
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(submitMediaSourcePtsCadenceEpochScanV3(submission, {
      environment: {
        ...environment,
        EDITRON_MEDIA_SOURCE_PTS_EPOCH_SCAN_SUBMIT_ENDPOINT: 'https://evil.test',
      },
      fetchImpl,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'SCAN_TRANSPORT_NOT_CONFIGURED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    const request = submission.request;
    const oversized = vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'Content-Length': String(17 * 1024 * 1024) },
    })) as unknown as typeof fetch;
    await expect(pollMediaSourcePtsCadenceEpochScanV3({
      submissionId: submission.submissionId,
      functionCallId: 'fc-epoch12345',
      mapBindingSha256: request.mapBindingSha256,
      mapperVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
      commandPolicyVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
    }, { environment, fetchImpl: oversized })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'SCAN_TRANSPORT_RESPONSE_TOO_LARGE',
    });
  });
});

function requestFixture(
  mapperVersion: string = MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
) {
  return createMediaSourcePtsCadenceScanRequestV1({
    mapBinding: {
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MAP_V1',
      sourceVersionSha256: '1'.repeat(64),
      storageVersionSha256: '2'.repeat(64),
      sourceBindingSha256: '3'.repeat(64),
      technicalObservationSha256: '4'.repeat(64),
      videoStreamIndex: 0,
      sourceTimebase: { numerator: '1', denominator: '90000' },
      mapper: {
        mapperVersion,
        ffprobeVersion: 'ffprobe version 8.1',
        commandPolicyVersion: mapperVersion,
        timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
      },
    },
    resourcePolicy: {
      policyVersion: mapperVersion,
      maxCanonicalJsonBytes: 65_536,
      maxFrameRecords: 100,
    },
    sourceUrl: 'https://tenant.r2.cloudflarestorage.com/source.mov?signature=presigned-secret',
  });
}

function submissionFixture(request = requestFixture()) {
  return createMediaSourcePtsCadenceEpochScanSubmissionV3({
    submissionId: 'epoch-submission-a',
    request,
  });
}

function scanResultFixture(binding: string) {
  const serialization = serializeMediaSourcePtsCadenceScanStagingBatchV1({
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_V1',
    mapBindingSha256: binding,
    resourcePolicy: requestFixture().resourcePolicy,
    sourceTimebase: { numerator: '1', denominator: '90000' },
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
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1,
    status: 'COMPLETE',
    diagnostic: null,
    mapBindingSha256: binding,
    resourcePolicy: serialization.batch.resourcePolicy,
    ffprobeVersion: 'ffprobe version 8.1',
    videoStreamIndex: 0,
    sourceTimebase: { numerator: '1', denominator: '90000' },
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
    batches: [{
      shardSequence: 0,
      firstFrameOrdinal: '0',
      frameCount: '2',
      startPresentationTimestampTicks: '0',
      endExclusivePresentationTimestampTicks: '6006',
      previousBatchContentSha256: null,
      sidecar: createMediaSourcePtsCadenceScanBatchSidecarV1({ serialization }),
    }],
    totalFrameCount: '2',
    sourceStartPresentationTimestampTicks: '0',
    sourceEndExclusivePresentationTimestampTicks: '6006',
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
