import { createHash } from 'node:crypto';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createMediaProxyMasterR2MultipartCoordinatorV1,
  MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1,
  type MediaProxyMasterR2MultipartArtifactIntentV1,
} from '@/lib/editron/services/media-proxy-master-r2-multipart-coordinator-v1';
import type {
  MediaProxyMasterR2MultipartStoreV1,
} from '@/lib/editron/services/media-proxy-master-r2-multipart-mongo-store-v1';
import {
  beginMediaProxyMasterR2MultipartCompletionV1,
  beginMediaProxyMasterR2MultipartSessionInitiationV1,
  bindMediaProxyMasterR2MultipartUploadIdV1,
  createMediaProxyMasterR2MultipartIntentRecordV1,
  expectedMediaProxyMasterR2MultipartPartRangeV1,
  publishMediaProxyMasterR2MultipartRecordV1,
  recordMediaProxyMasterR2MultipartCleanupFailureV1,
  recordMediaProxyMasterR2MultipartPartV1,
  renewMediaProxyMasterR2MultipartLeaseV1,
  requestMediaProxyMasterR2MultipartAbortV1,
  resolveMediaProxyMasterR2MultipartCleanupV1,
  takeOverMediaProxyMasterR2MultipartRecordV1,
  type MediaProxyMasterR2MultipartRecordV1,
} from '@/lib/editron/services/media-proxy-master-r2-multipart-record-v1';
import {
  MediaProxyMasterR2PrivateMultipartTransportErrorV1,
  type MediaProxyMasterR2PrivateMultipartTransportV1,
} from '@/lib/editron/services/media-proxy-master-r2-private-multipart-transport-v1';
import { createMediaProxyMasterTranscodeHeartbeatPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-v1';

const BYTES = Buffer.from('durable-private-multipart-coordinator-proxy');
const CONTENT_SHA256 = digest('sha256', BYTES);
const COMMAND_SHA256 = sha256('command');
const OUTPUT_PROBE_SHA256 = sha256('output-probe');
const PUBLICATION_POLICY_SHA256 = sha256('publication-policy');
const LEASE_TOKEN_SHA256 = sha256('lease-token');
const FOREIGN_LEASE_TOKEN_SHA256 = sha256('foreign-lease-token');

describe('media proxy/master durable R2 multipart coordinator v1', () => {
  it('publishes through the durable state machine and issues the physical source version', async () => {
    const fixture = build();
    const result = await fixture.coordinator.publishOrResume(request());

    expect(result.version).toBe(
      MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1,
    );
    expect(result.record.status).toBe('PUBLISHED');
    expect(result.record.sessions).toHaveLength(1);
    expect(result.record.sessions[0]?.publication?.disposition)
      .toBe('COMPLETED_UNIQUE_SESSION_OBJECT');
    expect(result.sourceVersion.storageVersion.locator).toEqual({
      provider: 'R2',
      objectKey: result.record.sessions[0]?.objectKey,
    });
    expect(result.sourceVersion.contentSha256).toBe(CONTENT_SHA256);
    expect(fixture.storeState.renewalCount).toBeGreaterThan(0);
    expect(fixture.transportState.calls).toEqual(expect.arrayContaining([
      'inspect-local-artifact',
      'create-upload:upload-1',
      'upload-part:upload-1:1',
      'complete:upload-1',
      'verify:present',
    ]));
  });

  it('recovers exact completed bytes when the completion response is lost', async () => {
    const fixture = build();
    fixture.transportState.loseCompleteResponseOnce = true;

    const result = await fixture.coordinator.publishOrResume(request());

    expect(result.record.status).toBe('PUBLISHED');
    expect(result.record.sessions[0]?.publication).toMatchObject({
      disposition: 'RECOVERED_EXACT_EXISTING_OBJECT',
      completeETag: null,
    });
    expect(fixture.transportState.calls.filter((call) => call === 'complete:upload-1'))
      .toHaveLength(1);
  });

  it('renews the fenced lease while one provider part upload is still running', async () => {
    const fixture = build(5);
    fixture.transportState.uploadDelayMs = 30;

    await fixture.coordinator.publishOrResume(request());

    expect(fixture.transportState.renewalsDuringUpload).toBeGreaterThan(0);
  });

  it('cleans an unrecorded provider part before using a new unique session', async () => {
    const fixture = build();
    fixture.transportState.loseUploadResponseOnce = true;

    await expect(fixture.coordinator.publishOrResume(request()))
      .rejects.toMatchObject({ code: 'UPLOAD_PART_FAILED' });
    expect(fixture.storeState.record?.status).toBe('UPLOADING');
    expect(fixture.storeState.record?.sessions[0]?.parts).toHaveLength(0);

    const result = await fixture.coordinator.publishOrResume(request());

    expect(result.record.status).toBe('PUBLISHED');
    expect(result.record.sessions).toHaveLength(2);
    expect(result.record.sessions[0]).toMatchObject({
      status: 'ABORTED',
      cleanup: {
        disposition: 'ABORTED',
        reason: 'PART_STATE_CONFLICT',
      },
    });
    expect(result.record.sessions[1]?.status).toBe('PUBLISHED');
    expect(result.sourceVersion.storageVersion.locator.objectKey)
      .toContain('/session-2.mp4');
  });

  it('reverifies a published object without requiring the ephemeral local file', async () => {
    const fixture = build();
    const first = await fixture.coordinator.publishOrResume(request());
    const replay = await fixture.coordinator.publishOrResume({
      ...request(),
      localPath: null,
      leaseOwnerId: 'different-replay-worker',
      leaseTokenSha256: sha256('different-replay-token'),
    });

    expect(replay.record).toEqual(first.record);
    expect(replay.sourceVersion).toEqual(first.sourceVersion);
    expect(fixture.transportState.calls.at(-1)).toBe('verify:present');
  });

  it('durably cleans a local replay mismatch and does not burn every session', async () => {
    const fixture = build();
    fixture.transportState.localArtifactMismatch = true;

    await expect(fixture.coordinator.publishOrResume(request()))
      .rejects.toMatchObject({ code: 'LOCAL_ARTIFACT_REPLAY_BLOCKED' });
    expect(fixture.storeState.record).toMatchObject({
      status: 'ABORTED',
      sessions: [{
        status: 'ABORTED',
        cleanup: {
          disposition: 'UPLOAD_NOT_FOUND',
          reason: 'LOCAL_REPLAY_MISMATCH',
        },
      }],
    });
  });

  it('rejects an active foreign lease before any provider operation', async () => {
    const fixture = build();
    const now = fixture.clock().toISOString();
    await fixture.storeState.store.createOrGet({
      ...artifact(),
      leaseOwnerId: 'foreign-worker',
      leaseTokenSha256: FOREIGN_LEASE_TOKEN_SHA256,
      leaseExpiresAt: new Date(Date.parse(now) + 5 * 60 * 1_000).toISOString(),
      now,
    });

    await expect(fixture.coordinator.publishOrResume(request()))
      .rejects.toMatchObject({ code: 'LEASE_HELD_BY_ANOTHER_WORKER' });
    expect(fixture.transportState.calls).toEqual([]);
  });
});

function build(heartbeatIntervalMs = 1_000) {
  const storeState = memoryStore();
  const transportState = memoryTransport(() => storeState.renewalCount);
  const clock = advancingClock();
  const heartbeatPolicy = createMediaProxyMasterTranscodeHeartbeatPolicyV1({
    heartbeatIntervalMs,
  });
  const coordinator = createMediaProxyMasterR2MultipartCoordinatorV1({
    store: storeState.store,
    transport: transportState.transport,
    heartbeatPolicy,
    clock,
  });
  return { coordinator, storeState, transportState, clock };
}

function request() {
  return {
    artifact: artifact(),
    localPath: path.resolve('fixture-proxy.mp4'),
    leaseOwnerId: 'worker-1',
    leaseTokenSha256: LEASE_TOKEN_SHA256,
    completionAttemptId: 'completion-attempt-1',
  };
}

function artifact(): MediaProxyMasterR2MultipartArtifactIntentV1 {
  return {
    jobId: 'job-proxy-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    orgId: null,
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    bucketName: 'editron-media-proxy-private',
    storagePolicyVersion: 'private-proxy-media-v1',
    publicationPolicySha256: PUBLICATION_POLICY_SHA256,
    objectKey: `editron_proxy_v1_${COMMAND_SHA256}_${CONTENT_SHA256}.mp4`,
    contentSha256: CONTENT_SHA256,
    byteLength: BYTES.byteLength,
    commandSha256: COMMAND_SHA256,
    outputProbeSha256: OUTPUT_PROBE_SHA256,
  };
}

function memoryStore() {
  let record: Readonly<MediaProxyMasterR2MultipartRecordV1> | null = null;
  let renewalCount = 0;
  const mutate = (
    transition: (
      current: Readonly<MediaProxyMasterR2MultipartRecordV1>,
    ) => Readonly<MediaProxyMasterR2MultipartRecordV1>,
  ) => {
    if (!record) throw new Error('TEST_RECORD_MISSING');
    record = transition(record);
    return Promise.resolve(record);
  };
  const store: MediaProxyMasterR2MultipartStoreV1 = {
    async createOrGet(input) {
      const candidate = createMediaProxyMasterR2MultipartIntentRecordV1(input);
      if (!record) record = candidate;
      if (record.recordId !== candidate.recordId
        || record.artifactBindingSha256 !== candidate.artifactBindingSha256) {
        throw new Error('TEST_CREATE_CONFLICT');
      }
      return record;
    },
    async get(recordId) {
      return record?.recordId === recordId ? record : null;
    },
    async getBySessionObjectKey(objectKey) {
      return record?.sessions.some((session) => session.objectKey === objectKey)
        ? record : null;
    },
    takeOver: (_recordId, input) => mutate(
      (current) => takeOverMediaProxyMasterR2MultipartRecordV1(current, input),
    ),
    renewLease: (_recordId, input) => {
      renewalCount += 1;
      return mutate(
        (current) => renewMediaProxyMasterR2MultipartLeaseV1(current, input),
      );
    },
    beginSession: (_recordId, input) => mutate(
      (current) => beginMediaProxyMasterR2MultipartSessionInitiationV1(current, input),
    ),
    bindUploadId: (_recordId, input) => mutate(
      (current) => bindMediaProxyMasterR2MultipartUploadIdV1(current, input),
    ),
    recordPart: (_recordId, input) => mutate(
      (current) => recordMediaProxyMasterR2MultipartPartV1(current, input),
    ),
    beginCompletion: (_recordId, input) => mutate(
      (current) => beginMediaProxyMasterR2MultipartCompletionV1(current, input),
    ),
    publish: (_recordId, input) => mutate(
      (current) => publishMediaProxyMasterR2MultipartRecordV1(current, input),
    ),
    requestAbort: (_recordId, input) => mutate(
      (current) => requestMediaProxyMasterR2MultipartAbortV1(current, input),
    ),
    recordCleanupFailure: (_recordId, input) => mutate(
      (current) => recordMediaProxyMasterR2MultipartCleanupFailureV1(current, input),
    ),
    resolveCleanup: (_recordId, input) => mutate(
      (current) => resolveMediaProxyMasterR2MultipartCleanupV1(current, input),
    ),
  };
  return {
    store,
    get record() { return record; },
    get renewalCount() { return renewalCount; },
  };
}

type MemoryUpload = {
  uploadId: string;
  objectKey: string;
  initiatedAt: string;
  parts: Map<number, Readonly<{ byteLength: number; eTag: string }>>;
};

function memoryTransport(readRenewalCount: () => number) {
  const uploads = new Map<string, MemoryUpload>();
  const objects = new Map<string, Readonly<{ eTag: string }>>();
  const calls: string[] = [];
  let nextUpload = 1;
  const state = {
    calls,
    loseCompleteResponseOnce: false,
    loseUploadResponseOnce: false,
    localArtifactMismatch: false,
    uploadDelayMs: 0,
    renewalsDuringUpload: 0,
    transport: null as unknown as MediaProxyMasterR2PrivateMultipartTransportV1,
  };
  const transport: MediaProxyMasterR2PrivateMultipartTransportV1 = {
    async inspectLocalArtifact({ record }) {
      calls.push('inspect-local-artifact');
      if (state.localArtifactMismatch) {
        throw transportError('LOCAL_ARTIFACT_CONTENT_MISMATCH');
      }
      return {
        byteLength: record.artifact.byteLength,
        contentSha256: record.artifact.contentSha256,
      };
    },
    async discoverUploads({ record }) {
      calls.push('discover-uploads');
      const objectKey = session(record).objectKey;
      return [...uploads.values()]
        .filter((upload) => upload.objectKey === objectKey)
        .map((upload) => ({
          uploadId: upload.uploadId,
          initiatedAt: upload.initiatedAt,
        }));
    },
    async createUpload({ record }) {
      const uploadId = `upload-${nextUpload++}`;
      calls.push(`create-upload:${uploadId}`);
      uploads.set(uploadId, {
        uploadId,
        objectKey: session(record).objectKey,
        initiatedAt: '2026-08-30T00:00:00.000Z',
        parts: new Map(),
      });
      return uploadId;
    },
    async listParts({ record }) {
      calls.push('list-parts');
      const upload = uploadFor(record, uploads);
      return [...upload.parts.entries()]
        .sort(([left], [right]) => left - right)
        .map(([partNumber, part]) => ({ partNumber, ...part }));
    },
    async inspectLocalPart({ record, partNumber }) {
      calls.push(`inspect-local-part:${partNumber}`);
      const range = expectedMediaProxyMasterR2MultipartPartRangeV1(
        record,
        partNumber,
      );
      return {
        ...range,
        contentSha256: record.artifact.contentSha256,
        contentMd5Hex: digest('md5', BYTES),
        contentMd5Base64: createHash('md5').update(BYTES).digest('base64'),
      };
    },
    async uploadPart({ record, partNumber }) {
      const upload = uploadFor(record, uploads);
      calls.push(`upload-part:${upload.uploadId}:${partNumber}`);
      const renewalsBeforeUpload = readRenewalCount();
      if (state.uploadDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, state.uploadDelayMs));
      }
      state.renewalsDuringUpload = readRenewalCount() - renewalsBeforeUpload;
      const range = expectedMediaProxyMasterR2MultipartPartRangeV1(
        record,
        partNumber,
      );
      const eTag = digest('md5', BYTES);
      upload.parts.set(partNumber, { byteLength: range.byteLength, eTag });
      if (state.loseUploadResponseOnce) {
        state.loseUploadResponseOnce = false;
        throw transportError('UPLOAD_PART_FAILED');
      }
      return {
        ...range,
        contentSha256: record.artifact.contentSha256,
        contentMd5Hex: eTag,
        contentMd5Base64: createHash('md5').update(BYTES).digest('base64'),
        eTag,
      };
    },
    async complete({ record }) {
      const upload = uploadFor(record, uploads);
      calls.push(`complete:${upload.uploadId}`);
      const eTag = `complete-etag-${session(record).generation}`;
      objects.set(upload.objectKey, { eTag });
      uploads.delete(upload.uploadId);
      if (state.loseCompleteResponseOnce) {
        state.loseCompleteResponseOnce = false;
        throw transportError('COMPLETE_FAILED');
      }
      return eTag;
    },
    async verifyPublishedObject({ record }) {
      const object = objects.get(session(record).objectKey);
      calls.push(`verify:${object ? 'present' : 'missing'}`);
      return object ? {
        eTag: object.eTag,
        byteLength: record.artifact.byteLength,
        contentSha256: record.artifact.contentSha256,
      } : null;
    },
    async abort({ record, uploadId }) {
      calls.push(`abort:${uploadId}`);
      const upload = uploads.get(uploadId);
      if (!upload || upload.objectKey !== session(record).objectKey) {
        return 'UPLOAD_NOT_FOUND';
      }
      uploads.delete(uploadId);
      return 'ABORTED';
    },
  };
  state.transport = transport;
  return state;
}

function uploadFor(
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  uploads: ReadonlyMap<string, MemoryUpload>,
): MemoryUpload {
  const uploadId = session(record).uploadId;
  const upload = uploadId ? uploads.get(uploadId) : null;
  if (!upload) throw transportError('COMPLETE_UPLOAD_NOT_FOUND');
  return upload;
}

function session(record: Readonly<MediaProxyMasterR2MultipartRecordV1>) {
  const value = record.sessions.at(-1);
  if (!value) throw new Error('TEST_SESSION_MISSING');
  return value;
}

function transportError(code: string) {
  return new MediaProxyMasterR2PrivateMultipartTransportErrorV1(code);
}

function advancingClock() {
  let epoch = Date.parse('2026-08-30T00:00:00.000Z');
  return () => {
    epoch += 100;
    return new Date(epoch);
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function digest(algorithm: 'md5' | 'sha256', value: Uint8Array): string {
  return createHash(algorithm).update(value).digest('hex');
}
