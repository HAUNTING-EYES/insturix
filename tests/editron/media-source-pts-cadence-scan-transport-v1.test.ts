import { describe, expect, it, vi } from 'vitest';

import { createMediaSourcePtsCadenceScanR2ReaderV1 } from '@/lib/editron/services/media-source-pts-cadence-scan-r2-reader-v1';
import {
  createMediaSourcePtsCadenceScanRequestV1,
  isMediaSourcePtsCadenceScanTransportConfiguredV1,
  pollMediaSourcePtsCadenceScanV1,
  submitMediaSourcePtsCadenceScanV1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-transport-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-result-v1';
import {
  createMediaSourcePtsCadenceScanBatchSidecarV1,
  serializeMediaSourcePtsCadenceScanStagingBatchV1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-staging-v1';

const environment = {
  EDITRON_MEDIA_SOURCE_PTS_SCAN_SUBMIT_ENDPOINT: 'https://pts-submit.modal.run',
  EDITRON_MEDIA_SOURCE_PTS_SCAN_POLL_ENDPOINT: 'https://pts-poll.modal.run',
  EDITRON_MODAL_PROXY_AUTH_TOKEN_ID: 'proxy-id',
  EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET: 'proxy-secret',
};

describe('media source PTS scan transport V1', () => {
  it('binds the exact request and requires two trusted proxy-auth endpoints', () => {
    const request = requestFixture();
    expect(request.mapBindingSha256)
      .toBe('1f7c9f18a590f05683e9bad42069a45367f78fed1e5feafc630733e40a7acc92');
    expect(isMediaSourcePtsCadenceScanTransportConfiguredV1(environment)).toBe(true);
    expect(isMediaSourcePtsCadenceScanTransportConfiguredV1({
      ...environment,
      EDITRON_MEDIA_SOURCE_PTS_SCAN_POLL_ENDPOINT: 'https://attacker.example.test',
    })).toBe(false);
    expect(() => createMediaSourcePtsCadenceScanRequestV1({
      mapBinding: request.mapBinding,
      resourcePolicy: { ...request.resourcePolicy, policyVersion: 'other-policy' },
      sourceUrl: request.source_url,
    })).toThrow('SCAN_POLICY_BINDING_MISMATCH');
  });

  it('submits the secret URL but returns only the durable binding and job ID', async () => {
    const request = requestFixture();
    const fetchImpl = vi.fn(async () => jsonResponse({
      ok: true,
      mapBindingSha256: request.mapBindingSha256,
      functionCallId: 'fc-12345678',
    })) as unknown as typeof fetch;

    const result = await submitMediaSourcePtsCadenceScanV1(request, { environment, fetchImpl });

    expect(result).toEqual({
      disposition: 'ACCEPTED',
      job: { functionCallId: 'fc-12345678', mapBindingSha256: request.mapBindingSha256 },
    });
    expect(JSON.stringify(result)).not.toContain('presigned-secret');
    expect(fetchImpl).toHaveBeenCalledWith(
      environment.EDITRON_MEDIA_SOURCE_PTS_SCAN_SUBMIT_ENDPOINT,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Modal-Key': 'proxy-id', 'Modal-Secret': 'proxy-secret' }),
        body: JSON.stringify(request),
      }),
    );
  });

  it('polls pending and terminal results without accepting a forged binding', async () => {
    const request = requestFixture();
    const job = { functionCallId: 'fc-12345678', mapBindingSha256: request.mapBindingSha256 };
    const pending = vi.fn(async () => jsonResponse({
      ok: true, status: 'PENDING', mapBindingSha256: request.mapBindingSha256,
    }, 202)) as unknown as typeof fetch;
    await expect(pollMediaSourcePtsCadenceScanV1(job, { environment, fetchImpl: pending }))
      .resolves.toEqual({ disposition: 'PENDING', job });

    const terminal = vi.fn(async () => jsonResponse({
      ok: true,
      status: 'TERMINAL',
      mapBindingSha256: request.mapBindingSha256,
      result: scanResultFixture(request.mapBindingSha256),
    })) as unknown as typeof fetch;
    await expect(pollMediaSourcePtsCadenceScanV1(job, { environment, fetchImpl: terminal }))
      .resolves.toMatchObject({ disposition: 'TERMINAL', result: { status: 'COMPLETE' } });

    const forged = vi.fn(async () => jsonResponse({
      ok: true,
      status: 'PENDING',
      mapBindingSha256: 'f'.repeat(64),
    }, 202)) as unknown as typeof fetch;
    await expect(pollMediaSourcePtsCadenceScanV1(job, { environment, fetchImpl: forged }))
      .resolves.toEqual({ disposition: 'UNVERIFIABLE', diagnostic: 'SCAN_TRANSPORT_RESPONSE_INVALID' });
  });

  it('does not send credentials to an untrusted host and bounds response bytes', async () => {
    const request = requestFixture();
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(submitMediaSourcePtsCadenceScanV1(request, {
      environment: { ...environment, EDITRON_MEDIA_SOURCE_PTS_SCAN_SUBMIT_ENDPOINT: 'https://evil.test' },
      fetchImpl,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE', diagnostic: 'SCAN_TRANSPORT_NOT_CONFIGURED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    const oversized = vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'Content-Length': String(17 * 1024 * 1024) },
    })) as unknown as typeof fetch;
    await expect(pollMediaSourcePtsCadenceScanV1({
      functionCallId: 'fc-12345678', mapBindingSha256: request.mapBindingSha256,
    }, { environment, fetchImpl: oversized })).resolves.toEqual({
      disposition: 'UNVERIFIABLE', diagnostic: 'SCAN_TRANSPORT_RESPONSE_TOO_LARGE',
    });

    const malformed = vi.fn(async () => new Response('{broken', { status: 200 })) as unknown as typeof fetch;
    await expect(pollMediaSourcePtsCadenceScanV1({
      functionCallId: 'fc-12345678', mapBindingSha256: request.mapBindingSha256,
    }, { environment, fetchImpl: malformed })).resolves.toEqual({
      disposition: 'UNVERIFIABLE', diagnostic: 'SCAN_TRANSPORT_RESPONSE_INVALID',
    });
  });
});

describe('media source PTS scan private staging reader V1', () => {
  it('rereads exact canonical bytes and rejects tampering or a forged key', async () => {
    const serialization = stagingBatchFixture();
    const sidecar = createMediaSourcePtsCadenceScanBatchSidecarV1({ serialization });
    let stored = new TextEncoder().encode(serialization.canonicalJson);
    const client = {
      send: vi.fn(async () => ({ Body: asyncBytes(stored) })),
    };
    const reader = createMediaSourcePtsCadenceScanR2ReaderV1({
      privateStorage: {
        bucketName: 'editron-private-evidence',
        browserRouteExposure: 'NO_BROWSER_ROUTE',
        storagePolicyVersion: 'private-r2-v1',
      },
      client,
    });
    await expect(reader.read(sidecar)).resolves.toEqual(serialization.batch);

    stored = new TextEncoder().encode(serialization.canonicalJson.replace('3003', '3004'));
    await expect(reader.read(sidecar)).rejects.toThrow('MEDIA_SOURCE_PTS_SCAN_R2_CONTENT_MISMATCH');
    await expect(reader.read({ ...sidecar, objectKey: `${sidecar.objectKey}.forged` }))
      .rejects.toThrow('MEDIA_SOURCE_PTS_SCAN_R2_SIDECAR_INVALID');
  });
});

function requestFixture() {
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
        mapperVersion: 'continuous-ffprobe-v1',
        ffprobeVersion: 'ffprobe version 8.1',
        commandPolicyVersion: 'continuous-ffprobe-v1',
        timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
      },
    },
    resourcePolicy: {
      policyVersion: 'continuous-ffprobe-v1',
      maxCanonicalJsonBytes: 65_536,
      maxFrameRecords: 100,
    },
    sourceUrl: 'https://tenant.r2.cloudflarestorage.com/source.mov?signature=presigned-secret',
  });
}

function stagingBatchFixture() {
  return serializeMediaSourcePtsCadenceScanStagingBatchV1({
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_V1',
    mapBindingSha256: requestFixture().mapBindingSha256,
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
}

function scanResultFixture(binding: string) {
  const batch = stagingBatchFixture();
  return {
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1,
    status: 'COMPLETE',
    diagnostic: null,
    mapBindingSha256: binding,
    resourcePolicy: batch.batch.resourcePolicy,
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
      sidecar: createMediaSourcePtsCadenceScanBatchSidecarV1({ serialization: batch }),
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

async function* asyncBytes(value: Uint8Array) {
  yield value;
}
