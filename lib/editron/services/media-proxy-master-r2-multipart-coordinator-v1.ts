import {
  assertMediaProxyMasterR2MultipartRecordV1,
  canReuseMediaProxyMasterR2MultipartPartV1,
  MEDIA_PROXY_MASTER_R2_MULTIPART_MAX_SESSIONS_V1,
  type MediaProxyMasterR2MultipartAbortReasonV1,
  type MediaProxyMasterR2MultipartRecordV1,
} from './media-proxy-master-r2-multipart-record-v1';
import type {
  MediaProxyMasterR2MultipartStoreV1,
} from './media-proxy-master-r2-multipart-mongo-store-v1';
import {
  MediaProxyMasterR2PrivateMultipartTransportErrorV1,
  type MediaProxyMasterR2PrivateMultipartTransportV1,
} from './media-proxy-master-r2-private-multipart-transport-v1';
import {
  assertMediaProxyMasterTranscodeHeartbeatPolicyV1,
  type MediaProxyMasterTranscodeHeartbeatPolicyV1,
} from './media-proxy-master-transcode-operational-policy-v1';
import { createMediaSourceStorageVersionV1 } from './media-source-storage-version-v1';
import {
  createMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

export const MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_V1' as const;

type CreateInputV1 = Parameters<
  MediaProxyMasterR2MultipartStoreV1['createOrGet']
>[0];

export type MediaProxyMasterR2MultipartArtifactIntentV1 = Omit<
  CreateInputV1,
  'leaseOwnerId' | 'leaseTokenSha256' | 'leaseExpiresAt' | 'now'
>;

export type MediaProxyMasterR2MultipartCoordinatorResultV1 = Readonly<{
  version: typeof MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1;
  disposition: 'PUBLISHED';
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>;
  sourceVersion: Readonly<MediaSourceVersionV1>;
}>;

export interface MediaProxyMasterR2MultipartCoordinatorV1 {
  publishOrResume(input: Readonly<{
    artifact: MediaProxyMasterR2MultipartArtifactIntentV1;
    localPath: string | null;
    leaseOwnerId: string;
    leaseTokenSha256: string;
    completionAttemptId: string;
    abortSignal?: AbortSignal;
  }>): Promise<MediaProxyMasterR2MultipartCoordinatorResultV1>;
}

const ACTIVE_SESSION_STATUSES = new Set([
  'INITIATING',
  'UPLOADING',
  'COMPLETION_READY',
  'COMPLETING',
]);
const RESTARTABLE_ABORT_REASONS = new Set<MediaProxyMasterR2MultipartAbortReasonV1>([
  'COMPLETION_CONFLICT',
  'LOCAL_REPLAY_MISMATCH',
  'PART_STATE_CONFLICT',
  'UPLOAD_SESSION_EXPIRED',
]);
const LOCAL_REPLAY_CODES = new Set([
  'BODY_INVALID',
  'BODY_LENGTH_MISMATCH',
  'LOCAL_ARTIFACT_CONTENT_MISMATCH',
  'LOCAL_FILE_CHANGED',
  'LOCAL_FILE_INVALID',
  'LOCAL_RANGE_INVALID',
]);
const COMPLETION_CONFLICT_CODES = new Set([
  'BODY_LENGTH_MISMATCH',
  'PROVIDER_VERSION_CHANGED',
  'STORED_CONTENT_MISMATCH',
  'STORED_HEADERS_OR_METADATA_INVALID',
]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export function createMediaProxyMasterR2MultipartCoordinatorV1(input: Readonly<{
  store: MediaProxyMasterR2MultipartStoreV1;
  transport: MediaProxyMasterR2PrivateMultipartTransportV1;
  heartbeatPolicy: MediaProxyMasterTranscodeHeartbeatPolicyV1;
  clock?: () => Date;
}>): Readonly<MediaProxyMasterR2MultipartCoordinatorV1> {
  assertPorts(input.store, input.transport);
  const heartbeatPolicy = assertMediaProxyMasterTranscodeHeartbeatPolicyV1(
    input.heartbeatPolicy,
  );
  const clock = input.clock ?? (() => new Date());
  if (typeof clock !== 'function') fail('CLOCK_INVALID');

  const coordinator: MediaProxyMasterR2MultipartCoordinatorV1 = {
    publishOrResume: async (request) => {
      const completionAttemptId = identifier(
        request.completionAttemptId,
        'COMPLETION_ATTEMPT_ID',
      );
      const leaseTokenSha256 = sha256(request.leaseTokenSha256, 'LEASE_TOKEN');
      const leaseOwnerId = identifier(request.leaseOwnerId, 'LEASE_OWNER_ID');
      const startedAt = currentInstant(clock);
      let record = await input.store.createOrGet({
        ...copyArtifactIntent(request.artifact),
        leaseOwnerId,
        leaseTokenSha256,
        leaseExpiresAt: plusMilliseconds(
          startedAt,
          heartbeatPolicy.durableLeaseMs,
        ),
        now: startedAt,
      });
      record = await acquireRecord({
        store: input.store,
        record,
        leaseOwnerId,
        leaseTokenSha256,
        heartbeatPolicy,
        clock,
      });
      const scope = Object.freeze({
        recordId: record.recordId,
        artifactBindingSha256: record.artifactBindingSha256,
        leaseTokenSha256,
      });
      let localArtifactVerified = false;
      let localReplayAbortedThisInvocation = false;
      const maximumStatePasses =
        MEDIA_PROXY_MASTER_R2_MULTIPART_MAX_SESSIONS_V1 * 8 + 8;

      try {
        for (let pass = 0; pass < maximumStatePasses; pass += 1) {
          record = await readScopedRecord(input.store, scope);

          if (record.status === 'PUBLISHED') {
            const observed = await input.transport.verifyPublishedObject({
              record,
              ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
            });
            const publication = currentSession(record).publication;
            if (!observed || !publication
              || observed.eTag !== publication.headETag
              || observed.byteLength !== publication.fullGetByteLength
              || observed.contentSha256 !== publication.fullGetContentSha256) {
              fail('PUBLISHED_OBJECT_REVERIFICATION_FAILED');
            }
            return publicationResult(record);
          }

          if (record.status === 'INITIATION_PENDING' || record.status === 'ABORTED') {
            if (record.status === 'ABORTED') {
              const reason = currentSession(record).cleanup.reason;
              if (!reason || !RESTARTABLE_ABORT_REASONS.has(reason)) {
                fail('ABORTED_SESSION_NOT_RESTARTABLE');
              }
              if (reason === 'LOCAL_REPLAY_MISMATCH'
                && localReplayAbortedThisInvocation) {
                fail('LOCAL_ARTIFACT_REPLAY_BLOCKED');
              }
            }
            requireLocalPath(request.localPath);
            record = await input.store.beginSession(record.recordId, {
              expectedSequence: record.sequence,
              leaseTokenSha256,
              now: currentInstant(clock),
            });
            continue;
          }

          if (record.status === 'INITIATING') {
            const local = await verifyLocalArtifact({
              store: input.store,
              transport: input.transport,
              heartbeatPolicy,
              clock,
              scope,
              record,
              localPath: request.localPath,
              localArtifactVerified,
              abortSignal: request.abortSignal,
            });
            record = local.record;
            localArtifactVerified = local.verified;
            if (record.status === 'ABORT_PENDING') {
              localReplayAbortedThisInvocation = true;
              continue;
            }
            const discovered = await runExternalWithLeaseHeartbeat({
              store: input.store,
              heartbeatPolicy,
              clock,
              scope,
              record,
              abortSignal: request.abortSignal,
              action: (current, abortSignal) => input.transport.discoverUploads({
                record: current,
                abortSignal,
              }),
            });
            record = discovered.record;
            if (discovered.value.length > 1) {
              record = await requestAbort({
                store: input.store,
                clock,
                scope,
                reason: 'PART_STATE_CONFLICT',
              });
              continue;
            }
            let uploadId = discovered.value[0]?.uploadId ?? null;
            if (uploadId === null) {
              const created = await runExternalWithLeaseHeartbeat({
                store: input.store,
                heartbeatPolicy,
                clock,
                scope,
                record,
                abortSignal: request.abortSignal,
                action: (current, abortSignal) => input.transport.createUpload({
                  record: current,
                  abortSignal,
                }),
              });
              record = created.record;
              uploadId = created.value;
            }
            record = await input.store.bindUploadId(record.recordId, {
              expectedSequence: record.sequence,
              leaseTokenSha256,
              uploadId,
              now: currentInstant(clock),
            });
            continue;
          }

          if (record.status === 'UPLOADING' || record.status === 'COMPLETION_READY') {
            const wasUploading = record.status === 'UPLOADING';
            const local = await verifyLocalArtifact({
              store: input.store,
              transport: input.transport,
              heartbeatPolicy,
              clock,
              scope,
              record,
              localPath: request.localPath,
              localArtifactVerified,
              abortSignal: request.abortSignal,
            });
            record = local.record;
            localArtifactVerified = local.verified;
            if (record.status === 'ABORT_PENDING') {
              localReplayAbortedThisInvocation = true;
              continue;
            }
            const reconciled = await reconcileRecordedParts({
              store: input.store,
              transport: input.transport,
              heartbeatPolicy,
              clock,
              scope,
              record,
              localPath: requireLocalPath(request.localPath),
              abortSignal: request.abortSignal,
            });
            record = reconciled.record;
            if (!reconciled.exact) continue;
            if (wasUploading) {
              if (record.status !== 'UPLOADING') fail('UPLOAD_STATE_CHANGED');
              record = await uploadMissingParts({
                store: input.store,
                transport: input.transport,
                heartbeatPolicy,
                clock,
                scope,
                record,
                localPath: requireLocalPath(request.localPath),
                abortSignal: request.abortSignal,
              });
              if (record.status !== 'COMPLETION_READY') {
                fail('PART_UPLOAD_DID_NOT_REACH_COMPLETION_READY');
              }
              continue;
            }
            if (record.status !== 'COMPLETION_READY') {
              fail('COMPLETION_READY_STATE_CHANGED');
            }
            record = await input.store.beginCompletion(record.recordId, {
              expectedSequence: record.sequence,
              leaseTokenSha256,
              attemptId: completionAttemptId,
              now: currentInstant(clock),
            });
            continue;
          }

          if (record.status === 'COMPLETING') {
            const completed = await completeOrRecover({
              store: input.store,
              transport: input.transport,
              heartbeatPolicy,
              clock,
              scope,
              record,
              abortSignal: request.abortSignal,
            });
            if (completed.status === 'ABORT_PENDING') continue;
            return publicationResult(completed);
          }

          if (record.status === 'ABORT_PENDING') {
            record = await cleanAbortedSession({
              store: input.store,
              transport: input.transport,
              heartbeatPolicy,
              clock,
              scope,
              record,
              abortSignal: request.abortSignal,
            });
            continue;
          }

          fail('STATE_UNSUPPORTED');
        }
        fail('STATE_PASS_LIMIT_EXCEEDED');
      } catch (error) {
        if (!request.abortSignal?.aborted) throw error;
        await persistWorkerCancellation({
          store: input.store,
          clock,
          scope,
        });
        fail('ABORTED');
      }
    },
  };
  return Object.freeze(coordinator);
}

async function acquireRecord(input: Readonly<{
  store: MediaProxyMasterR2MultipartStoreV1;
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>;
  leaseOwnerId: string;
  leaseTokenSha256: string;
  heartbeatPolicy: MediaProxyMasterTranscodeHeartbeatPolicyV1;
  clock: () => Date;
}>): Promise<Readonly<MediaProxyMasterR2MultipartRecordV1>> {
  const record = assertMediaProxyMasterR2MultipartRecordV1(input.record);
  if (record.status === 'PUBLISHED') return record;
  const now = currentInstant(input.clock);
  if (record.lease.tokenSha256 === input.leaseTokenSha256) {
    if (Date.parse(now) >= Date.parse(record.lease.expiresAt)) {
      fail('EXPIRED_LEASE_REQUIRES_NEW_TOKEN');
    }
    return record;
  }
  if (Date.parse(now) < Date.parse(record.lease.expiresAt)) {
    fail('LEASE_HELD_BY_ANOTHER_WORKER');
  }
  return input.store.takeOver(record.recordId, {
    expectedSequence: record.sequence,
    leaseOwnerId: input.leaseOwnerId,
    leaseTokenSha256: input.leaseTokenSha256,
    leaseExpiresAt: plusMilliseconds(now, input.heartbeatPolicy.durableLeaseMs),
    now,
  });
}

async function verifyLocalArtifact(input: Readonly<{
  store: MediaProxyMasterR2MultipartStoreV1;
  transport: MediaProxyMasterR2PrivateMultipartTransportV1;
  heartbeatPolicy: MediaProxyMasterTranscodeHeartbeatPolicyV1;
  clock: () => Date;
  scope: CoordinatorScopeV1;
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>;
  localPath: string | null;
  localArtifactVerified: boolean;
  abortSignal?: AbortSignal;
}>): Promise<Readonly<{
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>;
  verified: boolean;
}>> {
  if (input.localArtifactVerified) {
    return Object.freeze({ record: input.record, verified: true });
  }
  try {
    const inspected = await runExternalWithLeaseHeartbeat({
      store: input.store,
      heartbeatPolicy: input.heartbeatPolicy,
      clock: input.clock,
      scope: input.scope,
      record: input.record,
      abortSignal: input.abortSignal,
      action: (current, abortSignal) => input.transport.inspectLocalArtifact({
        record: current,
        localPath: requireLocalPath(input.localPath),
        abortSignal,
      }),
    });
    return Object.freeze({ record: inspected.record, verified: true });
  } catch (error) {
    const code = transportErrorCode(error);
    if (!code || !LOCAL_REPLAY_CODES.has(code)) throw error;
    const record = await requestAbort({
      store: input.store,
      clock: input.clock,
      scope: input.scope,
      reason: 'LOCAL_REPLAY_MISMATCH',
    });
    return Object.freeze({ record, verified: false });
  }
}

async function reconcileRecordedParts(input: Readonly<{
  store: MediaProxyMasterR2MultipartStoreV1;
  transport: MediaProxyMasterR2PrivateMultipartTransportV1;
  heartbeatPolicy: MediaProxyMasterTranscodeHeartbeatPolicyV1;
  clock: () => Date;
  scope: CoordinatorScopeV1;
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>;
  localPath: string;
  abortSignal?: AbortSignal;
}>): Promise<Readonly<{
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>;
  exact: boolean;
}>> {
  const listed = await runExternalWithLeaseHeartbeat({
    store: input.store,
    heartbeatPolicy: input.heartbeatPolicy,
    clock: input.clock,
    scope: input.scope,
    record: input.record,
    abortSignal: input.abortSignal,
    action: (current, abortSignal) => input.transport.listParts({
      record: current,
      abortSignal,
    }),
  });
  let record = listed.record;
  const recordedParts = currentSession(record).parts;
  const providerByNumber = new Map(
    listed.value.map((part) => [part.partNumber, part]),
  );
  if (providerByNumber.size !== recordedParts.length
    || recordedParts.some((part) => {
      const provider = providerByNumber.get(part.partNumber);
      return !provider || provider.byteLength !== part.byteLength
        || provider.eTag !== part.eTag;
    })) {
    record = await requestAbort({
      store: input.store,
      clock: input.clock,
      scope: input.scope,
      reason: 'PART_STATE_CONFLICT',
    });
    return Object.freeze({ record, exact: false });
  }

  for (const part of recordedParts) {
    const inspected = await runExternalWithLeaseHeartbeat({
      store: input.store,
      heartbeatPolicy: input.heartbeatPolicy,
      clock: input.clock,
      scope: input.scope,
      record,
      abortSignal: input.abortSignal,
      action: (current, abortSignal) => input.transport.inspectLocalPart({
        record: current,
        localPath: input.localPath,
        partNumber: part.partNumber,
        abortSignal,
      }),
    });
    record = inspected.record;
    const provider = providerByNumber.get(part.partNumber);
    if (!provider || provider.eTag !== inspected.value.contentMd5Hex
      || !canReuseMediaProxyMasterR2MultipartPartV1(record, {
        partNumber: part.partNumber,
        byteLength: inspected.value.byteLength,
        contentSha256: inspected.value.contentSha256,
      })) {
      record = await requestAbort({
        store: input.store,
        clock: input.clock,
        scope: input.scope,
        reason: 'PART_STATE_CONFLICT',
      });
      return Object.freeze({ record, exact: false });
    }
  }
  return Object.freeze({ record, exact: true });
}

async function uploadMissingParts(input: Readonly<{
  store: MediaProxyMasterR2MultipartStoreV1;
  transport: MediaProxyMasterR2PrivateMultipartTransportV1;
  heartbeatPolicy: MediaProxyMasterTranscodeHeartbeatPolicyV1;
  clock: () => Date;
  scope: CoordinatorScopeV1;
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>;
  localPath: string;
  abortSignal?: AbortSignal;
}>): Promise<Readonly<MediaProxyMasterR2MultipartRecordV1>> {
  let record = input.record;
  const totalParts = record.artifact.multipartPlan.totalParts;
  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    if (currentSession(record).parts.some((part) => part.partNumber === partNumber)) {
      continue;
    }
    if (record.status !== 'UPLOADING') fail('UPLOAD_STATE_CHANGED');
    const uploaded = await runExternalWithLeaseHeartbeat({
      store: input.store,
      heartbeatPolicy: input.heartbeatPolicy,
      clock: input.clock,
      scope: input.scope,
      record,
      abortSignal: input.abortSignal,
      action: (current, abortSignal) => input.transport.uploadPart({
        record: current,
        localPath: input.localPath,
        partNumber,
        abortSignal,
      }),
    });
    record = uploaded.record;
    record = await input.store.recordPart(record.recordId, {
      expectedSequence: record.sequence,
      leaseTokenSha256: input.scope.leaseTokenSha256,
      partNumber: uploaded.value.partNumber,
      startByte: uploaded.value.startByte,
      endExclusiveByte: uploaded.value.endExclusiveByte,
      byteLength: uploaded.value.byteLength,
      contentSha256: uploaded.value.contentSha256,
      eTag: uploaded.value.eTag,
      now: currentInstant(input.clock),
    });
  }
  return record;
}

async function completeOrRecover(input: Readonly<{
  store: MediaProxyMasterR2MultipartStoreV1;
  transport: MediaProxyMasterR2PrivateMultipartTransportV1;
  heartbeatPolicy: MediaProxyMasterTranscodeHeartbeatPolicyV1;
  clock: () => Date;
  scope: CoordinatorScopeV1;
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>;
  abortSignal?: AbortSignal;
}>): Promise<Readonly<MediaProxyMasterR2MultipartRecordV1>> {
  let record = input.record;
  let firstObservation;
  try {
    const verified = await runExternalWithLeaseHeartbeat({
      ...input,
      action: (current, abortSignal) => input.transport.verifyPublishedObject({
        record: current,
        abortSignal,
      }),
    });
    record = verified.record;
    firstObservation = verified.value;
  } catch (error) {
    if (!COMPLETION_CONFLICT_CODES.has(transportErrorCode(error) ?? '')) throw error;
    return requestAbort({
      store: input.store,
      clock: input.clock,
      scope: input.scope,
      reason: 'COMPLETION_CONFLICT',
    });
  }
  if (firstObservation) {
    return publishVerifiedRecord({
      store: input.store,
      clock: input.clock,
      scope: input.scope,
      record,
      disposition: 'RECOVERED_EXACT_EXISTING_OBJECT',
      completeETag: null,
      observation: firstObservation,
    });
  }

  let completeETag: string;
  try {
    const completed = await runExternalWithLeaseHeartbeat({
      ...input,
      record,
      action: (current, abortSignal) => input.transport.complete({
        record: current,
        abortSignal,
      }),
    });
    record = completed.record;
    completeETag = completed.value;
  } catch (completionError) {
    let recovered;
    try {
      recovered = await runExternalWithLeaseHeartbeat({
        ...input,
        record: await readScopedRecord(input.store, input.scope),
        action: (current, abortSignal) => input.transport.verifyPublishedObject({
          record: current,
          abortSignal,
        }),
      });
    } catch (verificationError) {
      if (COMPLETION_CONFLICT_CODES.has(
        transportErrorCode(verificationError) ?? '',
      )) {
        return requestAbort({
          store: input.store,
          clock: input.clock,
          scope: input.scope,
          reason: 'COMPLETION_CONFLICT',
        });
      }
      throw verificationError;
    }
    record = recovered.record;
    if (recovered.value) {
      return publishVerifiedRecord({
        store: input.store,
        clock: input.clock,
        scope: input.scope,
        record,
        disposition: 'RECOVERED_EXACT_EXISTING_OBJECT',
        completeETag: null,
        observation: recovered.value,
      });
    }
    if (transportErrorCode(completionError) === 'COMPLETE_UPLOAD_NOT_FOUND') {
      return requestAbort({
        store: input.store,
        clock: input.clock,
        scope: input.scope,
        reason: 'COMPLETION_CONFLICT',
      });
    }
    throw completionError;
  }

  let verified;
  try {
    verified = await runExternalWithLeaseHeartbeat({
      ...input,
      record,
      action: (current, abortSignal) => input.transport.verifyPublishedObject({
        record: current,
        abortSignal,
      }),
    });
  } catch (error) {
    if (!COMPLETION_CONFLICT_CODES.has(transportErrorCode(error) ?? '')) throw error;
    return requestAbort({
      store: input.store,
      clock: input.clock,
      scope: input.scope,
      reason: 'COMPLETION_CONFLICT',
    });
  }
  record = verified.record;
  if (!verified.value || verified.value.eTag !== completeETag) {
    return requestAbort({
      store: input.store,
      clock: input.clock,
      scope: input.scope,
      reason: 'COMPLETION_CONFLICT',
    });
  }
  return publishVerifiedRecord({
    store: input.store,
    clock: input.clock,
    scope: input.scope,
    record,
    disposition: 'COMPLETED_UNIQUE_SESSION_OBJECT',
    completeETag,
    observation: verified.value,
  });
}

async function publishVerifiedRecord(input: Readonly<{
  store: MediaProxyMasterR2MultipartStoreV1;
  clock: () => Date;
  scope: CoordinatorScopeV1;
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>;
  disposition: 'COMPLETED_UNIQUE_SESSION_OBJECT' | 'RECOVERED_EXACT_EXISTING_OBJECT';
  completeETag: string | null;
  observation: Readonly<{
    eTag: string;
    byteLength: number;
    contentSha256: string;
  }>;
}>): Promise<Readonly<MediaProxyMasterR2MultipartRecordV1>> {
  if (input.observation.byteLength !== input.record.artifact.byteLength
    || input.observation.contentSha256 !== input.record.artifact.contentSha256) {
    fail('VERIFIED_OBJECT_SUBSTITUTION');
  }
  return input.store.publish(input.record.recordId, {
    expectedSequence: input.record.sequence,
    leaseTokenSha256: input.scope.leaseTokenSha256,
    disposition: input.disposition,
    completeETag: input.completeETag,
    getETag: input.observation.eTag,
    headETag: input.observation.eTag,
    fullGetByteLength: input.observation.byteLength,
    fullGetContentSha256: input.observation.contentSha256,
    now: currentInstant(input.clock),
  });
}

async function cleanAbortedSession(input: Readonly<{
  store: MediaProxyMasterR2MultipartStoreV1;
  transport: MediaProxyMasterR2PrivateMultipartTransportV1;
  heartbeatPolicy: MediaProxyMasterTranscodeHeartbeatPolicyV1;
  clock: () => Date;
  scope: CoordinatorScopeV1;
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>;
  abortSignal?: AbortSignal;
}>): Promise<Readonly<MediaProxyMasterR2MultipartRecordV1>> {
  let record = input.record;
  let discovered;
  try {
    discovered = await runExternalWithLeaseHeartbeat({
      ...input,
      action: (current, abortSignal) => input.transport.discoverUploads({
        record: current,
        abortSignal,
      }),
    });
  } catch (error) {
    await persistCleanupFailure(input, 'DISCOVERY_FAILED');
    throw error;
  }
  record = discovered.record;
  const session = currentSession(record);
  const uploadIds = [...new Set([
    ...discovered.value.map((upload) => upload.uploadId),
    ...(session.uploadId ? [session.uploadId] : []),
  ])].sort();
  let abortedAny = false;
  for (const uploadId of uploadIds) {
    try {
      const aborted = await runExternalWithLeaseHeartbeat({
        ...input,
        record,
        action: (current, abortSignal) => input.transport.abort({
          record: current,
          uploadId,
          abortSignal,
        }),
      });
      record = aborted.record;
      abortedAny ||= aborted.value === 'ABORTED';
    } catch (error) {
      await persistCleanupFailure({ ...input, record }, 'ABORT_FAILED');
      throw error;
    }
  }
  let remaining;
  try {
    remaining = await runExternalWithLeaseHeartbeat({
      ...input,
      record,
      action: (current, abortSignal) => input.transport.discoverUploads({
        record: current,
        abortSignal,
      }),
    });
  } catch (error) {
    await persistCleanupFailure({ ...input, record }, 'REDISCOVERY_FAILED');
    throw error;
  }
  record = remaining.record;
  if (remaining.value.length !== 0) {
    await persistCleanupFailure({ ...input, record }, 'UPLOADS_REMAIN_AFTER_ABORT');
    fail('CLEANUP_RETRY_REQUIRED');
  }
  return input.store.resolveCleanup(record.recordId, {
    expectedSequence: record.sequence,
    leaseTokenSha256: input.scope.leaseTokenSha256,
    disposition: abortedAny ? 'ABORTED' : 'UPLOAD_NOT_FOUND',
    now: currentInstant(input.clock),
  });
}

async function persistCleanupFailure(
  input: Readonly<{
    store: MediaProxyMasterR2MultipartStoreV1;
    clock: () => Date;
    scope: CoordinatorScopeV1;
    record: Readonly<MediaProxyMasterR2MultipartRecordV1>;
  }>,
  diagnostic: string,
): Promise<void> {
  const record = await readScopedRecord(input.store, input.scope);
  if (record.status !== 'ABORT_PENDING') fail('CLEANUP_STATE_CHANGED');
  await input.store.recordCleanupFailure(record.recordId, {
    expectedSequence: record.sequence,
    leaseTokenSha256: input.scope.leaseTokenSha256,
    diagnostic,
    now: currentInstant(input.clock),
  });
}

async function requestAbort(input: Readonly<{
  store: MediaProxyMasterR2MultipartStoreV1;
  clock: () => Date;
  scope: CoordinatorScopeV1;
  reason: MediaProxyMasterR2MultipartAbortReasonV1;
}>): Promise<Readonly<MediaProxyMasterR2MultipartRecordV1>> {
  const record = await readScopedRecord(input.store, input.scope);
  if (record.status === 'ABORT_PENDING' || record.status === 'ABORTED') {
    return record;
  }
  if (!ACTIVE_SESSION_STATUSES.has(record.status)) fail('ABORT_STATE_CHANGED');
  return input.store.requestAbort(record.recordId, {
    expectedSequence: record.sequence,
    leaseTokenSha256: input.scope.leaseTokenSha256,
    reason: input.reason,
    now: currentInstant(input.clock),
  });
}

async function persistWorkerCancellation(input: Readonly<{
  store: MediaProxyMasterR2MultipartStoreV1;
  clock: () => Date;
  scope: CoordinatorScopeV1;
}>): Promise<void> {
  const record = await readScopedRecord(input.store, input.scope);
  if (record.status === 'PUBLISHED' || record.status === 'ABORT_PENDING'
    || record.status === 'ABORTED' || record.status === 'INITIATION_PENDING') {
    return;
  }
  if (!ACTIVE_SESSION_STATUSES.has(record.status)) fail('CANCELLATION_STATE_INVALID');
  await input.store.requestAbort(record.recordId, {
    expectedSequence: record.sequence,
    leaseTokenSha256: input.scope.leaseTokenSha256,
    reason: 'WORKER_CANCELLED',
    now: currentInstant(input.clock),
  });
}

type CoordinatorScopeV1 = Readonly<{
  recordId: string;
  artifactBindingSha256: string;
  leaseTokenSha256: string;
}>;

async function runExternalWithLeaseHeartbeat<T>(input: Readonly<{
  store: MediaProxyMasterR2MultipartStoreV1;
  heartbeatPolicy: MediaProxyMasterTranscodeHeartbeatPolicyV1;
  clock: () => Date;
  scope: CoordinatorScopeV1;
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>;
  abortSignal?: AbortSignal;
  action(
    record: Readonly<MediaProxyMasterR2MultipartRecordV1>,
    abortSignal: AbortSignal,
  ): Promise<T>;
}>): Promise<Readonly<{
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>;
  value: T;
}>> {
  let latest = await renewLease(input);
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  input.abortSignal?.addEventListener('abort', forwardAbort, { once: true });
  if (input.abortSignal?.aborted) controller.abort();
  let heartbeatFailure: unknown = null;
  let heartbeatInFlight: Promise<void> | null = null;
  const tick = () => {
    if (heartbeatFailure || heartbeatInFlight) return;
    heartbeatInFlight = renewLease(input)
      .then((record) => { latest = record; })
      .catch((error) => {
        heartbeatFailure = error;
        controller.abort();
      })
      .finally(() => { heartbeatInFlight = null; });
  };
  const timer = setInterval(tick, input.heartbeatPolicy.heartbeatIntervalMs);
  timer.unref?.();
  try {
    let value: T;
    try {
      value = await input.action(latest, controller.signal);
    } catch (error) {
      if (heartbeatInFlight) await heartbeatInFlight;
      if (heartbeatFailure) throw heartbeatFailure;
      throw error;
    }
    if (heartbeatInFlight) await heartbeatInFlight;
    if (heartbeatFailure) throw heartbeatFailure;
    latest = await renewLease(input);
    return Object.freeze({ record: latest, value });
  } finally {
    clearInterval(timer);
    input.abortSignal?.removeEventListener('abort', forwardAbort);
    controller.abort();
  }
}

async function renewLease(input: Readonly<{
  store: MediaProxyMasterR2MultipartStoreV1;
  heartbeatPolicy: MediaProxyMasterTranscodeHeartbeatPolicyV1;
  clock: () => Date;
  scope: CoordinatorScopeV1;
}>): Promise<Readonly<MediaProxyMasterR2MultipartRecordV1>> {
  const record = await readScopedRecord(input.store, input.scope);
  if (record.status === 'PUBLISHED') return record;
  const now = currentInstant(input.clock);
  if (Date.parse(now) >= Date.parse(record.lease.expiresAt)) {
    fail('LEASE_LOST');
  }
  const leaseExpiresAt = plusMilliseconds(
    now,
    input.heartbeatPolicy.durableLeaseMs,
  );
  if (Date.parse(leaseExpiresAt) <= Date.parse(record.lease.expiresAt)) {
    return record;
  }
  return input.store.renewLease(record.recordId, {
    expectedSequence: record.sequence,
    leaseTokenSha256: input.scope.leaseTokenSha256,
    leaseExpiresAt,
    now,
  });
}

async function readScopedRecord(
  store: MediaProxyMasterR2MultipartStoreV1,
  scope: CoordinatorScopeV1,
): Promise<Readonly<MediaProxyMasterR2MultipartRecordV1>> {
  const value = await store.get(scope.recordId);
  if (!value) fail('RECORD_MISSING');
  const record = assertMediaProxyMasterR2MultipartRecordV1(value);
  if (record.recordId !== scope.recordId
    || record.artifactBindingSha256 !== scope.artifactBindingSha256) {
    fail('RECORD_SCOPE_CHANGED');
  }
  if (record.status !== 'PUBLISHED'
    && record.lease.tokenSha256 !== scope.leaseTokenSha256) {
    fail('LEASE_LOST');
  }
  return record;
}

function publicationResult(
  recordValue: Readonly<MediaProxyMasterR2MultipartRecordV1>,
): MediaProxyMasterR2MultipartCoordinatorResultV1 {
  const record = assertMediaProxyMasterR2MultipartRecordV1(recordValue);
  if (record.status !== 'PUBLISHED') fail('PUBLICATION_RECORD_NOT_TERMINAL');
  const session = currentSession(record);
  if (!session.publication) fail('PUBLICATION_RECEIPT_MISSING');
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: session.objectKey },
    byteLength: record.artifact.byteLength,
    providerVersion: {
      kind: 'R2_ETAG',
      value: session.publication.headETag,
    },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: record.artifact.owner,
    assetId: record.artifact.assetId,
    mediaKind: 'video',
    byteLength: record.artifact.byteLength,
    contentSha256: record.artifact.contentSha256,
    storageVersion,
  });
  return Object.freeze({
    version: MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1,
    disposition: 'PUBLISHED',
    record,
    sourceVersion,
  });
}

function copyArtifactIntent(
  value: MediaProxyMasterR2MultipartArtifactIntentV1,
): MediaProxyMasterR2MultipartArtifactIntentV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('ARTIFACT_INTENT_INVALID');
  }
  return {
    jobId: value.jobId,
    tenantId: value.tenantId,
    userId: value.userId,
    orgId: value.orgId,
    owner: value.owner,
    assetId: value.assetId,
    bucketName: value.bucketName,
    storagePolicyVersion: value.storagePolicyVersion,
    publicationPolicySha256: value.publicationPolicySha256,
    objectKey: value.objectKey,
    contentSha256: value.contentSha256,
    byteLength: value.byteLength,
    commandSha256: value.commandSha256,
    outputProbeSha256: value.outputProbeSha256,
  };
}

function currentSession(
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>,
) {
  const session = record.sessions.at(-1);
  if (!session) fail('SESSION_MISSING');
  return session;
}

function requireLocalPath(value: string | null): string {
  if (typeof value !== 'string' || value.length < 1) fail('LOCAL_PATH_REQUIRED');
  return value;
}

function transportErrorCode(error: unknown): string | null {
  return error instanceof MediaProxyMasterR2PrivateMultipartTransportErrorV1
    ? error.code : null;
}

function currentInstant(clock: () => Date): string {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail('CLOCK_VALUE_INVALID');
  }
  return value.toISOString();
}

function plusMilliseconds(instant: string, milliseconds: number): string {
  const epoch = Date.parse(instant);
  const result = epoch + milliseconds;
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1
    || !Number.isFinite(result)) fail('LEASE_POLICY_INVALID');
  return new Date(result).toISOString();
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label}_INVALID`);
  return value;
}

function assertPorts(
  store: MediaProxyMasterR2MultipartStoreV1,
  transport: MediaProxyMasterR2PrivateMultipartTransportV1,
): void {
  const storeMethods = [
    'beginCompletion', 'beginSession', 'bindUploadId', 'createOrGet', 'get',
    'publish', 'recordCleanupFailure', 'recordPart', 'renewLease',
    'requestAbort', 'resolveCleanup', 'takeOver',
  ] as const;
  const transportMethods = [
    'abort', 'complete', 'createUpload', 'discoverUploads',
    'inspectLocalArtifact', 'inspectLocalPart', 'listParts', 'uploadPart',
    'verifyPublishedObject',
  ] as const;
  if (!store || storeMethods.some((method) => typeof store[method] !== 'function')
    || !transport
    || transportMethods.some((method) => typeof transport[method] !== 'function')) {
    fail('PORT_INVALID');
  }
}

function fail(code: string): never {
  throw new MediaProxyMasterR2MultipartCoordinatorErrorV1(code);
}

export class MediaProxyMasterR2MultipartCoordinatorErrorV1 extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_${code}`);
    this.name = 'MediaProxyMasterR2MultipartCoordinatorErrorV1';
    this.code = code;
  }
}
