import { describe, expect, it } from 'vitest';

import {
  assertMediaProxyMasterR2MultipartRecordV1,
  beginMediaProxyMasterR2MultipartCompletionV1,
  beginMediaProxyMasterR2MultipartSessionInitiationV1,
  bindMediaProxyMasterR2MultipartUploadIdV1,
  canReuseMediaProxyMasterR2MultipartPartV1,
  createMediaProxyMasterR2MultipartIntentRecordV1,
  expectedMediaProxyMasterR2MultipartPartRangeV1,
  publishMediaProxyMasterR2MultipartRecordV1,
  recordMediaProxyMasterR2MultipartCleanupFailureV1,
  recordMediaProxyMasterR2MultipartPartV1,
  requestMediaProxyMasterR2MultipartAbortV1,
  resolveMediaProxyMasterR2MultipartCleanupV1,
  takeOverMediaProxyMasterR2MultipartRecordV1,
  type MediaProxyMasterR2MultipartRecordV1,
} from '@/lib/editron/services/media-proxy-master-r2-multipart-record-v1';
import { R2_MIN_PART_BYTES } from '@/lib/editron/services/r2-upload-limits';

const hash = (label: string) => Buffer.from(label).toString('hex').padEnd(64, '0').slice(0, 64);
const CONTENT = hash('content');
const COMMAND = hash('command');
const PROBE = hash('probe');
const POLICY = hash('policy');
const LEASE_1 = hash('lease-1');
const LEASE_2 = hash('lease-2');
const PART_1 = hash('part-1');
const PART_2 = hash('part-2');

function intent(byteLength = R2_MIN_PART_BYTES + 7) {
  return createMediaProxyMasterR2MultipartIntentRecordV1({
    jobId: 'job-proxy-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    orgId: null,
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    bucketName: 'editron-private-media',
    storagePolicyVersion: 'private-r2-v1',
    publicationPolicySha256: POLICY,
    objectKey: `editron_proxy_v1_${COMMAND}_${CONTENT}.mp4`,
    contentSha256: CONTENT,
    byteLength,
    commandSha256: COMMAND,
    outputProbeSha256: PROBE,
    leaseOwnerId: 'worker-1',
    leaseTokenSha256: LEASE_1,
    leaseExpiresAt: '2026-08-30T00:10:00.000Z',
    now: '2026-08-30T00:00:00.000Z',
  });
}

function session(record = intent()) {
  const initiating = beginMediaProxyMasterR2MultipartSessionInitiationV1(record, {
    expectedSequence: record.sequence,
    leaseTokenSha256: LEASE_1,
    now: '2026-08-30T00:00:01.000Z',
  });
  return bindMediaProxyMasterR2MultipartUploadIdV1(initiating, {
    expectedSequence: initiating.sequence,
    leaseTokenSha256: LEASE_1,
    uploadId: 'r2-upload-1',
    now: '2026-08-30T00:00:01.001Z',
  });
}

function addPart(
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  partNumber: number,
  contentSha256: string,
  now: string,
) {
  const range = expectedMediaProxyMasterR2MultipartPartRangeV1(record, partNumber);
  return recordMediaProxyMasterR2MultipartPartV1(record, {
    expectedSequence: record.sequence,
    leaseTokenSha256: record.lease.tokenSha256,
    ...range,
    contentSha256,
    eTag: `etag-${partNumber}`,
    now,
  });
}

function completing() {
  let record = session();
  record = addPart(record, 2, PART_2, '2026-08-30T00:00:02.000Z');
  record = addPart(record, 1, PART_1, '2026-08-30T00:00:03.000Z');
  return beginMediaProxyMasterR2MultipartCompletionV1(record, {
    expectedSequence: record.sequence,
    leaseTokenSha256: LEASE_1,
    attemptId: 'completion-1',
    now: '2026-08-30T00:00:04.000Z',
  });
}

describe('media proxy/master durable R2 multipart record v1', () => {
  it('binds a deterministic immutable artifact and legal multipart plan', () => {
    const record = intent();

    expect(record.status).toBe('INITIATION_PENDING');
    expect(record.sequence).toBe(0);
    expect(record.artifact.multipartPlan).toEqual({
      partSize: R2_MIN_PART_BYTES,
      totalParts: 2,
    });
    expect(record.recordId).toMatch(/^mpmr2mpu_[a-f0-9]{64}$/);
    expect(assertMediaProxyMasterR2MultipartRecordV1(record)).toEqual(record);
    expect(Object.isFrozen(record)).toBe(true);
  });

  it('persists a unique session intent before binding an external upload id', () => {
    const record = intent();
    const initiating = beginMediaProxyMasterR2MultipartSessionInitiationV1(record, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      now: '2026-08-30T00:00:01.000Z',
    });

    expect(initiating.status).toBe('INITIATING');
    expect(initiating.sessions[0]).toMatchObject({
      generation: 1,
      uploadId: null,
    });
    expect(initiating.sessions[0]?.objectKey).toMatch(
      /^editron-proxy-multipart\/v1\/[a-f0-9]{64}\/session-1\.mp4$/,
    );

    const bound = bindMediaProxyMasterR2MultipartUploadIdV1(initiating, {
      expectedSequence: initiating.sequence,
      leaseTokenSha256: LEASE_1,
      uploadId: 'r2-upload-1',
      now: '2026-08-30T00:00:01.001Z',
    });
    expect(bound.status).toBe('UPLOADING');
    expect(bound.sessions[0]?.uploadId).toBe('r2-upload-1');
  });

  it('accepts out-of-order exact parts, sorts them, and becomes completion-ready', () => {
    let record = session();
    record = addPart(record, 2, PART_2, '2026-08-30T00:00:02.000Z');
    expect(record.status).toBe('UPLOADING');
    record = addPart(record, 1, PART_1, '2026-08-30T00:00:03.000Z');

    expect(record.status).toBe('COMPLETION_READY');
    expect(record.sessions[0]?.parts.map((part) => part.partNumber)).toEqual([1, 2]);
    expect(canReuseMediaProxyMasterR2MultipartPartV1(record, {
      partNumber: 1,
      byteLength: R2_MIN_PART_BYTES,
      contentSha256: PART_1,
    })).toBe(true);
    expect(canReuseMediaProxyMasterR2MultipartPartV1(record, {
      partNumber: 1,
      byteLength: R2_MIN_PART_BYTES,
      contentSha256: hash('substituted'),
    })).toBe(false);
  });

  it('requires exact range evidence and rejects conflicting part replay', () => {
    const record = session();
    const range = expectedMediaProxyMasterR2MultipartPartRangeV1(record, 1);
    expect(() => recordMediaProxyMasterR2MultipartPartV1(record, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      ...range,
      byteLength: range.byteLength - 1,
      contentSha256: PART_1,
      eTag: 'etag-1',
      now: '2026-08-30T00:00:02.000Z',
    })).toThrow('MEDIA_PROXY_MASTER_R2_MULTIPART_PART_RANGE_MISMATCH');

    const once = addPart(record, 1, PART_1, '2026-08-30T00:00:02.000Z');
    const replayed = recordMediaProxyMasterR2MultipartPartV1(once, {
      expectedSequence: once.sequence,
      leaseTokenSha256: LEASE_1,
      ...range,
      contentSha256: PART_1,
      eTag: 'etag-1',
      now: '2026-08-30T00:00:03.000Z',
    });
    expect(replayed).toEqual(once);
    expect(replayed.sequence).toBe(once.sequence);
    expect(() => recordMediaProxyMasterR2MultipartPartV1(once, {
      expectedSequence: once.sequence,
      leaseTokenSha256: LEASE_1,
      ...range,
      contentSha256: hash('different-part'),
      eTag: 'etag-1-replaced',
      now: '2026-08-30T00:00:03.000Z',
    })).toThrow('MEDIA_PROXY_MASTER_R2_MULTIPART_PART_EVIDENCE_CONFLICT');
  });

  it('fences stale writers and permits takeover only after lease expiry', () => {
    const record = session();
    expect(() => takeOverMediaProxyMasterR2MultipartRecordV1(record, {
      expectedSequence: record.sequence,
      leaseOwnerId: 'worker-2',
      leaseTokenSha256: LEASE_2,
      leaseExpiresAt: '2026-08-30T00:20:00.000Z',
      now: '2026-08-30T00:09:59.999Z',
    })).toThrow('MEDIA_PROXY_MASTER_R2_MULTIPART_LEASE_STILL_ACTIVE');

    const taken = takeOverMediaProxyMasterR2MultipartRecordV1(record, {
      expectedSequence: record.sequence,
      leaseOwnerId: 'worker-2',
      leaseTokenSha256: LEASE_2,
      leaseExpiresAt: '2026-08-30T00:20:00.000Z',
      now: '2026-08-30T00:10:00.000Z',
    });
    expect(taken.lease).toMatchObject({ ownerId: 'worker-2', fence: 2 });
    expect(() => addPart(taken, 1, PART_1, '2026-08-30T00:10:01.000Z'))
      .not.toThrow();
    expect(() => recordMediaProxyMasterR2MultipartPartV1(taken, {
      expectedSequence: taken.sequence,
      leaseTokenSha256: LEASE_1,
      ...expectedMediaProxyMasterR2MultipartPartRangeV1(taken, 1),
      contentSha256: PART_1,
      eTag: 'etag-1',
      now: '2026-08-30T00:10:01.000Z',
    })).toThrow('MEDIA_PROXY_MASTER_R2_MULTIPART_LEASE_TOKEN_MISMATCH');
  });

  it('publishes only after a durable completion attempt and exact full reread', () => {
    const record = completing();
    expect(record.status).toBe('COMPLETING');
    expect(() => publishMediaProxyMasterR2MultipartRecordV1(record, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      disposition: 'COMPLETED_UNIQUE_SESSION_OBJECT',
      completeETag: 'multipart-etag',
      getETag: 'multipart-etag',
      headETag: 'multipart-etag',
      fullGetByteLength: record.artifact.byteLength,
      fullGetContentSha256: hash('wrong'),
      now: '2026-08-30T00:00:05.000Z',
    })).toThrow('MEDIA_PROXY_MASTER_R2_MULTIPART_FULL_GET_MISMATCH');

    const published = publishMediaProxyMasterR2MultipartRecordV1(record, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      disposition: 'COMPLETED_UNIQUE_SESSION_OBJECT',
      completeETag: 'multipart-etag',
      getETag: 'multipart-etag',
      headETag: 'multipart-etag',
      fullGetByteLength: record.artifact.byteLength,
      fullGetContentSha256: CONTENT,
      now: '2026-08-30T00:00:05.000Z',
    });
    expect(published.status).toBe('PUBLISHED');
    expect(() => takeOverMediaProxyMasterR2MultipartRecordV1(published, {
      expectedSequence: published.sequence,
      leaseOwnerId: 'worker-2',
      leaseTokenSha256: LEASE_2,
      leaseExpiresAt: '2026-08-30T01:00:00.000Z',
      now: '2026-08-30T00:10:00.000Z',
    })).toThrow('MEDIA_PROXY_MASTER_R2_MULTIPART_PUBLISHED_RECORD_IMMUTABLE');
  });

  it('supports exact-object recovery after an unknown completion outcome', () => {
    const record = completing();
    const published = publishMediaProxyMasterR2MultipartRecordV1(record, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      disposition: 'RECOVERED_EXACT_EXISTING_OBJECT',
      completeETag: null,
      getETag: 'recovered-etag',
      headETag: 'recovered-etag',
      fullGetByteLength: record.artifact.byteLength,
      fullGetContentSha256: CONTENT,
      now: '2026-08-30T00:00:05.000Z',
    });

    expect(published.sessions[0]?.publication).toMatchObject({
      disposition: 'RECOVERED_EXACT_EXISTING_OBJECT',
      completeETag: null,
    });
  });

  it('retains abort history, cleanup failures, and a clean next session', () => {
    let record = session();
    record = requestMediaProxyMasterR2MultipartAbortV1(record, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      reason: 'UPLOAD_SESSION_EXPIRED',
      now: '2026-08-30T00:00:02.000Z',
    });
    record = recordMediaProxyMasterR2MultipartCleanupFailureV1(record, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      diagnostic: 'R2_SERVICE_UNAVAILABLE',
      now: '2026-08-30T00:00:03.000Z',
    });
    record = resolveMediaProxyMasterR2MultipartCleanupV1(record, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      disposition: 'ABORTED',
      now: '2026-08-30T00:00:04.000Z',
    });
    const initiating = beginMediaProxyMasterR2MultipartSessionInitiationV1(record, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      now: '2026-08-30T00:00:05.000Z',
    });
    record = bindMediaProxyMasterR2MultipartUploadIdV1(initiating, {
      expectedSequence: initiating.sequence,
      leaseTokenSha256: LEASE_1,
      uploadId: 'r2-upload-2',
      now: '2026-08-30T00:00:05.001Z',
    });

    expect(record.status).toBe('UPLOADING');
    expect(record.sessions).toHaveLength(2);
    expect(record.sessions[0]).toMatchObject({
      generation: 1,
      status: 'ABORTED',
      cleanup: { disposition: 'ABORTED', attemptCount: 2 },
    });
    expect(record.sessions[1]).toMatchObject({
      generation: 2,
      status: 'UPLOADING',
      parts: [],
    });
    expect(record.sessions[1]?.objectKey).not.toBe(record.sessions[0]?.objectKey);
  });

  it('rejects tampered durable records and stale sequence transitions', () => {
    const record = session();
    expect(() => assertMediaProxyMasterR2MultipartRecordV1({
      ...record,
      artifact: { ...record.artifact, byteLength: record.artifact.byteLength + 1 },
    })).toThrow();
    expect(() => recordMediaProxyMasterR2MultipartPartV1(record, {
      expectedSequence: record.sequence - 1,
      leaseTokenSha256: LEASE_1,
      ...expectedMediaProxyMasterR2MultipartPartRangeV1(record, 1),
      contentSha256: PART_1,
      eTag: 'etag-1',
      now: '2026-08-30T00:00:02.000Z',
    })).toThrow('MEDIA_PROXY_MASTER_R2_MULTIPART_SEQUENCE_MISMATCH');
  });
});
