import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  R2_MAX_PARTS,
  resolveMultipartPlan,
} from './r2-upload-limits';
import type { MediaSourceOwnerV1 } from './media-source-version-v1';

export const MEDIA_PROXY_MASTER_R2_MULTIPART_RECORD_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_R2_MULTIPART_RECORD_V1' as const;
export const MEDIA_PROXY_MASTER_R2_MULTIPART_MAX_SESSIONS_V1 = 20;

const PROXY_OBJECT_KEY = /^editron_proxy_v1_([a-f0-9]{64})_([a-f0-9]{64})\.mp4$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/;
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_SESSIONS = MEDIA_PROXY_MASTER_R2_MULTIPART_MAX_SESSIONS_V1;

export type MediaProxyMasterR2MultipartStatusV1 =
  | 'INITIATION_PENDING'
  | 'INITIATING'
  | 'UPLOADING'
  | 'COMPLETION_READY'
  | 'COMPLETING'
  | 'ABORT_PENDING'
  | 'ABORTED'
  | 'PUBLISHED';

export type MediaProxyMasterR2MultipartAbortReasonV1 =
  | 'COMPLETION_CONFLICT'
  | 'LOCAL_REPLAY_MISMATCH'
  | 'PART_STATE_CONFLICT'
  | 'POLICY_RETIRED'
  | 'TERMINAL_JOB_FAILURE'
  | 'UPLOAD_SESSION_EXPIRED'
  | 'WORKER_CANCELLED';

export type MediaProxyMasterR2MultipartPartEvidenceV1 = Readonly<{
  partNumber: number;
  startByte: number;
  endExclusiveByte: number;
  byteLength: number;
  contentSha256: string;
  eTag: string;
  uploadedAt: string;
}>;

export type MediaProxyMasterR2MultipartCompletionAttemptV1 = Readonly<{
  attemptId: string;
  startedAt: string;
}>;

export type MediaProxyMasterR2MultipartPublicationReceiptV1 = Readonly<{
  disposition:
    | 'COMPLETED_UNIQUE_SESSION_OBJECT'
    | 'RECOVERED_EXACT_EXISTING_OBJECT';
  completeETag: string | null;
  getETag: string;
  headETag: string;
  fullGetByteLength: number;
  fullGetContentSha256: string;
  verifiedAt: string;
}>;

export type MediaProxyMasterR2MultipartCleanupV1 = Readonly<{
  disposition: 'NOT_REQUIRED' | 'REQUIRED' | 'ABORTED' | 'UPLOAD_NOT_FOUND';
  reason: MediaProxyMasterR2MultipartAbortReasonV1 | null;
  requestedAt: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastDiagnostic: string | null;
  resolvedAt: string | null;
}>;

export type MediaProxyMasterR2MultipartSessionV1 = Readonly<{
  generation: number;
  objectKey: string;
  uploadId: string | null;
  initiatedAt: string;
  status: Exclude<MediaProxyMasterR2MultipartStatusV1, 'INITIATION_PENDING'>;
  parts: readonly MediaProxyMasterR2MultipartPartEvidenceV1[];
  completionAttempt: MediaProxyMasterR2MultipartCompletionAttemptV1 | null;
  publication: MediaProxyMasterR2MultipartPublicationReceiptV1 | null;
  cleanup: MediaProxyMasterR2MultipartCleanupV1;
}>;

export type MediaProxyMasterR2MultipartArtifactV1 = Readonly<{
  jobId: string;
  tenantId: string;
  userId: string;
  orgId: string | null;
  owner: MediaSourceOwnerV1;
  assetId: string;
  bucketName: string;
  storagePolicyVersion: string;
  publicationPolicySha256: string;
  objectKey: string;
  contentType: 'video/mp4';
  cacheControl: 'private, no-store, max-age=0';
  contentDisposition: 'inline';
  writeDisposition: 'UNIQUE_SESSION_OBJECT_KEYS_NO_CROSS_SESSION_OVERWRITE';
  replayVerification: 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE';
  contentSha256: string;
  byteLength: number;
  commandSha256: string;
  outputProbeSha256: string;
  multipartPlan: Readonly<{ partSize: number; totalParts: number }>;
}>;

export type MediaProxyMasterR2MultipartLeaseV1 = Readonly<{
  ownerId: string;
  tokenSha256: string;
  fence: number;
  expiresAt: string;
}>;

export interface MediaProxyMasterR2MultipartRecordV1 {
  version: typeof MEDIA_PROXY_MASTER_R2_MULTIPART_RECORD_VERSION_V1;
  recordId: string;
  artifact: MediaProxyMasterR2MultipartArtifactV1;
  artifactBindingSha256: string;
  status: MediaProxyMasterR2MultipartStatusV1;
  sequence: number;
  lease: MediaProxyMasterR2MultipartLeaseV1;
  sessions: readonly MediaProxyMasterR2MultipartSessionV1[];
  createdAt: string;
  updatedAt: string;
  recordSha256: string;
}

type RecordMaterialV1 = Omit<MediaProxyMasterR2MultipartRecordV1, 'recordSha256'>;

export class MediaProxyMasterR2MultipartRecordErrorV1 extends Error {}

export function createMediaProxyMasterR2MultipartIntentRecordV1(input: Readonly<{
  jobId: string;
  tenantId: string;
  userId: string;
  orgId: string | null;
  owner: MediaSourceOwnerV1;
  assetId: string;
  bucketName: string;
  storagePolicyVersion: string;
  publicationPolicySha256: string;
  objectKey: string;
  contentSha256: string;
  byteLength: number;
  commandSha256: string;
  outputProbeSha256: string;
  leaseOwnerId: string;
  leaseTokenSha256: string;
  leaseExpiresAt: string;
  now: string;
}>): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  const now = instant(input.now, 'NOW');
  const byteLength = positiveSafeInteger(input.byteLength, Number.MAX_SAFE_INTEGER, 'BYTE_LENGTH');
  const plan = resolveMultipartPlan(byteLength);
  const artifact = normalizeArtifact({
    jobId: input.jobId,
    tenantId: input.tenantId,
    userId: input.userId,
    orgId: input.orgId,
    owner: input.owner,
    assetId: input.assetId,
    bucketName: input.bucketName,
    storagePolicyVersion: input.storagePolicyVersion,
    publicationPolicySha256: input.publicationPolicySha256,
    objectKey: input.objectKey,
    contentType: 'video/mp4',
    cacheControl: 'private, no-store, max-age=0',
    contentDisposition: 'inline',
    writeDisposition: 'UNIQUE_SESSION_OBJECT_KEYS_NO_CROSS_SESSION_OVERWRITE',
    replayVerification: 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE',
    contentSha256: input.contentSha256,
    byteLength,
    commandSha256: input.commandSha256,
    outputProbeSha256: input.outputProbeSha256,
    multipartPlan: plan,
  });
  const artifactBindingSha256 = hashEditronCanonicalJsonV1(artifact);
  const recordId = `mpmr2mpu_${hashEditronCanonicalJsonV1({
    artifactBindingSha256,
    jobId: artifact.jobId,
  })}`;
  const lease = normalizeLease({
    ownerId: input.leaseOwnerId,
    tokenSha256: input.leaseTokenSha256,
    fence: 1,
    expiresAt: input.leaseExpiresAt,
  });
  if (Date.parse(lease.expiresAt) <= Date.parse(now)) fail('LEASE_EXPIRED');
  return freezeRecord({
    version: MEDIA_PROXY_MASTER_R2_MULTIPART_RECORD_VERSION_V1,
    recordId,
    artifact,
    artifactBindingSha256,
    status: 'INITIATION_PENDING',
    sequence: 0,
    lease,
    sessions: [],
    createdAt: now,
    updatedAt: now,
  });
}

export function takeOverMediaProxyMasterR2MultipartRecordV1(
  value: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  input: Readonly<{
    expectedSequence: number;
    leaseOwnerId: string;
    leaseTokenSha256: string;
    leaseExpiresAt: string;
    now: string;
  }>,
): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  const record = assertMediaProxyMasterR2MultipartRecordV1(value);
  assertSequence(record, input.expectedSequence);
  if (record.status === 'PUBLISHED') fail('PUBLISHED_RECORD_IMMUTABLE');
  const now = atOrAfter(input.now, record.updatedAt, 'TAKEOVER_NOW');
  if (Date.parse(now) < Date.parse(record.lease.expiresAt)) fail('LEASE_STILL_ACTIVE');
  const lease = normalizeLease({
    ownerId: input.leaseOwnerId,
    tokenSha256: input.leaseTokenSha256,
    fence: record.lease.fence + 1,
    expiresAt: input.leaseExpiresAt,
  });
  if (lease.tokenSha256 === record.lease.tokenSha256) fail('LEASE_TOKEN_REUSED');
  if (Date.parse(lease.expiresAt) <= Date.parse(now)) fail('LEASE_EXPIRED');
  return nextRecord(record, { lease }, now);
}

export function beginMediaProxyMasterR2MultipartSessionInitiationV1(
  value: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  input: Readonly<{
    expectedSequence: number;
    leaseTokenSha256: string;
    now: string;
  }>,
): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  const record = activeRecord(value, input, input.now);
  if (record.status !== 'INITIATION_PENDING' && record.status !== 'ABORTED') {
    fail('SESSION_START_STATE_INVALID');
  }
  if (record.sessions.length >= MAX_SESSIONS) fail('SESSION_LIMIT_EXCEEDED');
  const now = atOrAfter(input.now, record.updatedAt, 'SESSION_START_NOW');
  const generation = record.sessions.length + 1;
  const session: MediaProxyMasterR2MultipartSessionV1 = {
    generation,
    objectKey: sessionObjectKey(record.artifactBindingSha256, generation),
    uploadId: null,
    initiatedAt: now,
    status: 'INITIATING',
    parts: [],
    completionAttempt: null,
    publication: null,
    cleanup: emptyCleanup(),
  };
  return nextRecord(record, {
    status: 'INITIATING',
    sessions: [...record.sessions, session],
  }, now);
}

export function bindMediaProxyMasterR2MultipartUploadIdV1(
  value: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  input: Readonly<{
    expectedSequence: number;
    leaseTokenSha256: string;
    uploadId: string;
    now: string;
  }>,
): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  const record = activeRecord(value, input, input.now);
  if (record.status !== 'INITIATING') fail('UPLOAD_ID_BIND_STATE_INVALID');
  const now = atOrAfter(input.now, record.updatedAt, 'UPLOAD_ID_BIND_NOW');
  const session = currentSession(record);
  return replaceCurrentSession(record, {
    ...session,
    uploadId: boundedText(input.uploadId, 1_024, 'UPLOAD_ID'),
    status: 'UPLOADING',
  }, 'UPLOADING', now);
}

export function expectedMediaProxyMasterR2MultipartPartRangeV1(
  value: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  partNumberInput: number,
): Readonly<{ partNumber: number; startByte: number; endExclusiveByte: number; byteLength: number }> {
  const record = assertMediaProxyMasterR2MultipartRecordV1(value);
  const partNumber = positiveSafeInteger(partNumberInput, record.artifact.multipartPlan.totalParts, 'PART_NUMBER');
  const startByte = (partNumber - 1) * record.artifact.multipartPlan.partSize;
  const endExclusiveByte = Math.min(
    record.artifact.byteLength,
    startByte + record.artifact.multipartPlan.partSize,
  );
  return Object.freeze({
    partNumber,
    startByte,
    endExclusiveByte,
    byteLength: endExclusiveByte - startByte,
  });
}

export function recordMediaProxyMasterR2MultipartPartV1(
  value: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  input: Readonly<{
    expectedSequence: number;
    leaseTokenSha256: string;
    partNumber: number;
    startByte: number;
    endExclusiveByte: number;
    byteLength: number;
    contentSha256: string;
    eTag: string;
    now: string;
  }>,
): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  const record = activeRecord(value, input, input.now);
  if (record.status !== 'UPLOADING') fail('PART_RECORD_STATE_INVALID');
  const now = atOrAfter(input.now, record.updatedAt, 'PART_NOW');
  const expected = expectedMediaProxyMasterR2MultipartPartRangeV1(record, input.partNumber);
  if (input.startByte !== expected.startByte
    || input.endExclusiveByte !== expected.endExclusiveByte
    || input.byteLength !== expected.byteLength) fail('PART_RANGE_MISMATCH');
  const part = normalizePart({
    ...expected,
    contentSha256: input.contentSha256,
    eTag: input.eTag,
    uploadedAt: now,
  });
  const session = currentSession(record);
  const existing = session.parts.find((candidate) => candidate.partNumber === part.partNumber);
  if (existing) {
    const { uploadedAt: _existingUploadedAt, ...existingEvidence } = existing;
    const { uploadedAt: _replayedAt, ...replayedEvidence } = part;
    if (canonicalizeEditronJsonV1(existingEvidence)
      === canonicalizeEditronJsonV1(replayedEvidence)) return record;
    fail('PART_EVIDENCE_CONFLICT');
  }
  const parts = [...session.parts, part]
    .sort((left, right) => left.partNumber - right.partNumber);
  const ready = parts.length === record.artifact.multipartPlan.totalParts
    && parts.every((candidate, index) => candidate.partNumber === index + 1);
  const status = ready ? 'COMPLETION_READY' as const : 'UPLOADING' as const;
  return replaceCurrentSession(record, {
    ...session,
    status,
    parts,
  }, status, now);
}

export function canReuseMediaProxyMasterR2MultipartPartV1(
  value: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  input: Readonly<{ partNumber: number; byteLength: number; contentSha256: string }>,
): boolean {
  const record = assertMediaProxyMasterR2MultipartRecordV1(value);
  if (record.sessions.length === 0) return false;
  const expected = expectedMediaProxyMasterR2MultipartPartRangeV1(record, input.partNumber);
  const part = currentSession(record).parts.find(
    (candidate) => candidate.partNumber === expected.partNumber,
  );
  return Boolean(part)
    && input.byteLength === expected.byteLength
    && input.byteLength === part?.byteLength
    && SHA256.test(input.contentSha256)
    && input.contentSha256 === part?.contentSha256;
}

export function beginMediaProxyMasterR2MultipartCompletionV1(
  value: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  input: Readonly<{
    expectedSequence: number;
    leaseTokenSha256: string;
    attemptId: string;
    now: string;
  }>,
): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  const record = activeRecord(value, input, input.now);
  if (record.status !== 'COMPLETION_READY') fail('COMPLETION_START_STATE_INVALID');
  const now = atOrAfter(input.now, record.updatedAt, 'COMPLETION_START_NOW');
  const session = currentSession(record);
  return replaceCurrentSession(record, {
    ...session,
    status: 'COMPLETING',
    completionAttempt: {
      attemptId: identifier(input.attemptId, 'COMPLETION_ATTEMPT_ID'),
      startedAt: now,
    },
  }, 'COMPLETING', now);
}

export function publishMediaProxyMasterR2MultipartRecordV1(
  value: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  input: Readonly<{
    expectedSequence: number;
    leaseTokenSha256: string;
    disposition: MediaProxyMasterR2MultipartPublicationReceiptV1['disposition'];
    completeETag: string | null;
    getETag: string;
    headETag: string;
    fullGetByteLength: number;
    fullGetContentSha256: string;
    now: string;
  }>,
): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  const record = activeRecord(value, input, input.now);
  if (record.status !== 'COMPLETING') fail('PUBLISH_STATE_INVALID');
  const now = atOrAfter(input.now, record.updatedAt, 'PUBLISH_NOW');
  const getETag = eTag(input.getETag, 'GET_ETAG');
  const headETag = eTag(input.headETag, 'HEAD_ETAG');
  if (getETag !== headETag) fail('PROVIDER_VERSION_CHANGED');
  let completeETag: string | null;
  if (input.disposition === 'COMPLETED_UNIQUE_SESSION_OBJECT') {
    completeETag = eTag(input.completeETag, 'COMPLETE_ETAG');
    if (completeETag !== getETag) fail('PROVIDER_VERSION_CHANGED');
  } else if (input.disposition === 'RECOVERED_EXACT_EXISTING_OBJECT') {
    if (input.completeETag !== null) fail('RECOVERED_COMPLETION_ETAG_INVALID');
    completeETag = null;
  } else {
    fail('PUBLICATION_DISPOSITION_INVALID');
  }
  if (input.fullGetByteLength !== record.artifact.byteLength
    || sha256(input.fullGetContentSha256, 'FULL_GET_CONTENT')
      !== record.artifact.contentSha256) fail('FULL_GET_MISMATCH');
  const session = currentSession(record);
  return replaceCurrentSession(record, {
    ...session,
    status: 'PUBLISHED',
    publication: {
      disposition: input.disposition,
      completeETag,
      getETag,
      headETag,
      fullGetByteLength: input.fullGetByteLength,
      fullGetContentSha256: input.fullGetContentSha256,
      verifiedAt: now,
    },
  }, 'PUBLISHED', now);
}

export function requestMediaProxyMasterR2MultipartAbortV1(
  value: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  input: Readonly<{
    expectedSequence: number;
    leaseTokenSha256: string;
    reason: MediaProxyMasterR2MultipartAbortReasonV1;
    now: string;
  }>,
): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  const record = activeRecord(value, input, input.now);
  if (!['INITIATING', 'UPLOADING', 'COMPLETION_READY', 'COMPLETING']
    .includes(record.status)) {
    fail('ABORT_REQUEST_STATE_INVALID');
  }
  const now = atOrAfter(input.now, record.updatedAt, 'ABORT_REQUEST_NOW');
  const session = currentSession(record);
  return replaceCurrentSession(record, {
    ...session,
    status: 'ABORT_PENDING',
    cleanup: {
      disposition: 'REQUIRED',
      reason: abortReason(input.reason),
      requestedAt: now,
      attemptCount: 0,
      lastAttemptAt: null,
      lastDiagnostic: null,
      resolvedAt: null,
    },
  }, 'ABORT_PENDING', now);
}

export function recordMediaProxyMasterR2MultipartCleanupFailureV1(
  value: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  input: Readonly<{
    expectedSequence: number;
    leaseTokenSha256: string;
    diagnostic: string;
    now: string;
  }>,
): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  const record = activeRecord(value, input, input.now);
  if (record.status !== 'ABORT_PENDING') fail('CLEANUP_FAILURE_STATE_INVALID');
  const now = atOrAfter(input.now, record.updatedAt, 'CLEANUP_FAILURE_NOW');
  const session = currentSession(record);
  return replaceCurrentSession(record, {
    ...session,
    cleanup: {
      ...session.cleanup,
      attemptCount: positiveSafeInteger(
        session.cleanup.attemptCount + 1,
        Number.MAX_SAFE_INTEGER,
        'CLEANUP_ATTEMPT_COUNT',
      ),
      lastAttemptAt: now,
      lastDiagnostic: boundedText(input.diagnostic, 512, 'CLEANUP_DIAGNOSTIC'),
    },
  }, 'ABORT_PENDING', now);
}

export function resolveMediaProxyMasterR2MultipartCleanupV1(
  value: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  input: Readonly<{
    expectedSequence: number;
    leaseTokenSha256: string;
    disposition: 'ABORTED' | 'UPLOAD_NOT_FOUND';
    now: string;
  }>,
): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  const record = activeRecord(value, input, input.now);
  if (record.status !== 'ABORT_PENDING') fail('CLEANUP_RESOLVE_STATE_INVALID');
  const now = atOrAfter(input.now, record.updatedAt, 'CLEANUP_RESOLVE_NOW');
  const session = currentSession(record);
  return replaceCurrentSession(record, {
    ...session,
    status: 'ABORTED',
    cleanup: {
      ...session.cleanup,
      disposition: input.disposition,
      attemptCount: session.cleanup.attemptCount + 1,
      lastAttemptAt: now,
      lastDiagnostic: null,
      resolvedAt: now,
    },
  }, 'ABORTED', now);
}

export function assertMediaProxyMasterR2MultipartRecordV1(
  value: unknown,
): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  const candidate = object(value, 'RECORD_INVALID');
  exactKeys(candidate, [
    'artifact', 'artifactBindingSha256', 'createdAt', 'lease', 'recordId',
    'recordSha256', 'sequence', 'sessions', 'status', 'updatedAt', 'version',
  ], 'RECORD_FIELDS_INVALID');
  const { recordSha256: _recordSha256, ...material } = candidate;
  const rebound = freezeRecord(material as unknown as RecordMaterialV1);
  if (canonicalizeEditronJsonV1(candidate) !== canonicalizeEditronJsonV1(rebound)) {
    fail('RECORD_INVALID');
  }
  return rebound;
}

function freezeRecord(value: RecordMaterialV1): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  const material = normalizeRecordMaterial(value);
  return deepFreezeEditronJsonV1({
    ...material,
    recordSha256: hashEditronCanonicalJsonV1(material),
  });
}

function normalizeRecordMaterial(value: unknown): RecordMaterialV1 {
  const record = object(value, 'RECORD_MATERIAL_INVALID');
  exactKeys(record, [
    'artifact', 'artifactBindingSha256', 'createdAt', 'lease', 'recordId',
    'sequence', 'sessions', 'status', 'updatedAt', 'version',
  ], 'RECORD_MATERIAL_FIELDS_INVALID');
  if (record.version !== MEDIA_PROXY_MASTER_R2_MULTIPART_RECORD_VERSION_V1) {
    fail('VERSION_INVALID');
  }
  const artifact = normalizeArtifact(record.artifact);
  const artifactBindingSha256 = sha256(record.artifactBindingSha256, 'ARTIFACT_BINDING');
  if (artifactBindingSha256 !== hashEditronCanonicalJsonV1(artifact)) {
    fail('ARTIFACT_BINDING_MISMATCH');
  }
  const expectedRecordId = `mpmr2mpu_${hashEditronCanonicalJsonV1({
    artifactBindingSha256,
    jobId: artifact.jobId,
  })}`;
  if (record.recordId !== expectedRecordId) fail('RECORD_ID_MISMATCH');
  const status = multipartStatus(record.status);
  const sequence = nonNegativeSafeInteger(record.sequence, 'SEQUENCE');
  const lease = normalizeLease(record.lease);
  const sessions = normalizeSessions(record.sessions, artifact);
  const createdAt = instant(record.createdAt, 'CREATED_AT');
  const updatedAt = atOrAfter(record.updatedAt, createdAt, 'UPDATED_AT');
  assertLifecycle(status, sessions);
  return {
    version: MEDIA_PROXY_MASTER_R2_MULTIPART_RECORD_VERSION_V1,
    recordId: expectedRecordId,
    artifact,
    artifactBindingSha256,
    status,
    sequence,
    lease,
    sessions,
    createdAt,
    updatedAt,
  };
}

function normalizeArtifact(value: unknown): MediaProxyMasterR2MultipartArtifactV1 {
  const artifact = object(value, 'ARTIFACT_INVALID');
  exactKeys(artifact, [
    'assetId', 'bucketName', 'byteLength', 'cacheControl', 'commandSha256',
    'contentDisposition', 'contentSha256', 'contentType', 'jobId',
    'multipartPlan', 'objectKey', 'orgId', 'outputProbeSha256', 'owner',
    'publicationPolicySha256', 'replayVerification', 'storagePolicyVersion',
    'tenantId', 'userId', 'writeDisposition',
  ], 'ARTIFACT_FIELDS_INVALID');
  const contentSha256 = sha256(artifact.contentSha256, 'CONTENT');
  const objectKey = boundedText(artifact.objectKey, 1_024, 'OBJECT_KEY');
  const keyMatch = PROXY_OBJECT_KEY.exec(objectKey);
  const byteLength = positiveSafeInteger(
    artifact.byteLength,
    Number.MAX_SAFE_INTEGER,
    'BYTE_LENGTH',
  );
  const expectedPlan = resolveMultipartPlan(byteLength);
  const plan = object(artifact.multipartPlan, 'MULTIPART_PLAN_INVALID');
  exactKeys(plan, ['partSize', 'totalParts'], 'MULTIPART_PLAN_FIELDS_INVALID');
  if (plan.partSize !== expectedPlan.partSize || plan.totalParts !== expectedPlan.totalParts
    || expectedPlan.totalParts > R2_MAX_PARTS) fail('MULTIPART_PLAN_MISMATCH');
  if (artifact.contentType !== 'video/mp4'
    || artifact.cacheControl !== 'private, no-store, max-age=0'
    || artifact.contentDisposition !== 'inline'
    || artifact.writeDisposition
      !== 'UNIQUE_SESSION_OBJECT_KEYS_NO_CROSS_SESSION_OVERWRITE'
    || artifact.replayVerification !== 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE') {
    fail('PUBLICATION_CONTRACT_INVALID');
  }
  const owner = normalizeOwner(artifact.owner);
  const userId = identifier(artifact.userId, 'USER_ID');
  const orgId = artifact.orgId === null ? null : identifier(artifact.orgId, 'ORG_ID');
  if ((owner.kind === 'USER' && (owner.userId !== userId || orgId !== null))
    || (owner.kind === 'ORG' && (!orgId || owner.orgId !== orgId))) {
    fail('OWNER_SCOPE_MISMATCH');
  }
  const commandSha256 = sha256(artifact.commandSha256, 'COMMAND');
  if (!keyMatch || keyMatch[1] !== commandSha256 || keyMatch[2] !== contentSha256) {
    fail('OBJECT_KEY_MISMATCH');
  }
  return Object.freeze({
    jobId: identifier(artifact.jobId, 'JOB_ID'),
    tenantId: identifier(artifact.tenantId, 'TENANT_ID'),
    userId,
    orgId,
    owner,
    assetId: identifier(artifact.assetId, 'ASSET_ID'),
    bucketName: bucket(artifact.bucketName),
    storagePolicyVersion: boundedText(
      artifact.storagePolicyVersion,
      256,
      'STORAGE_POLICY_VERSION',
    ),
    publicationPolicySha256: sha256(
      artifact.publicationPolicySha256,
      'PUBLICATION_POLICY',
    ),
    objectKey,
    contentType: 'video/mp4',
    cacheControl: 'private, no-store, max-age=0',
    contentDisposition: 'inline',
    writeDisposition: 'UNIQUE_SESSION_OBJECT_KEYS_NO_CROSS_SESSION_OVERWRITE',
    replayVerification: 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE',
    contentSha256,
    byteLength,
    commandSha256,
    outputProbeSha256: sha256(artifact.outputProbeSha256, 'OUTPUT_PROBE'),
    multipartPlan: Object.freeze(expectedPlan),
  });
}

function normalizeSessions(
  value: unknown,
  artifact: MediaProxyMasterR2MultipartArtifactV1,
): readonly MediaProxyMasterR2MultipartSessionV1[] {
  if (!Array.isArray(value) || value.length > MAX_SESSIONS) fail('SESSIONS_INVALID');
  return Object.freeze(value.map((candidate, index) => {
    const session = object(candidate, 'SESSION_INVALID');
    exactKeys(session, [
      'cleanup', 'completionAttempt', 'generation', 'initiatedAt', 'objectKey',
      'parts', 'publication', 'status', 'uploadId',
    ], 'SESSION_FIELDS_INVALID');
    if (session.generation !== index + 1) fail('SESSION_GENERATION_INVALID');
    const status = sessionStatus(session.status);
    const initiatedAt = instant(session.initiatedAt, 'SESSION_INITIATED_AT');
    const parts = normalizeParts(session.parts, artifact, initiatedAt);
    const completionAttempt = normalizeCompletionAttempt(
      session.completionAttempt,
      initiatedAt,
    );
    const publication = normalizePublication(session.publication, artifact);
    const cleanup = normalizeCleanup(session.cleanup, initiatedAt);
    const objectKey = boundedText(session.objectKey, 1_024, 'SESSION_OBJECT_KEY');
    if (objectKey !== sessionObjectKey(
      hashEditronCanonicalJsonV1(artifact),
      index + 1,
    )) fail('SESSION_OBJECT_KEY_MISMATCH');
    const uploadId = session.uploadId === null
      ? null : boundedText(session.uploadId, 1_024, 'UPLOAD_ID');
    assertSessionLifecycle(status, uploadId, parts,
      artifact.multipartPlan.totalParts, completionAttempt, publication, cleanup);
    return Object.freeze({
      generation: index + 1,
      objectKey,
      uploadId,
      initiatedAt,
      status,
      parts,
      completionAttempt,
      publication,
      cleanup,
    });
  }));
}

function normalizeParts(
  value: unknown,
  artifact: MediaProxyMasterR2MultipartArtifactV1,
  initiatedAt: string,
): readonly MediaProxyMasterR2MultipartPartEvidenceV1[] {
  if (!Array.isArray(value) || value.length > artifact.multipartPlan.totalParts) {
    fail('PARTS_INVALID');
  }
  let previous = 0;
  return Object.freeze(value.map((candidate) => {
    const part = normalizePart(candidate);
    if (part.partNumber <= previous) fail('PART_ORDER_INVALID');
    previous = part.partNumber;
    const startByte = (part.partNumber - 1) * artifact.multipartPlan.partSize;
    const endExclusiveByte = Math.min(
      artifact.byteLength,
      startByte + artifact.multipartPlan.partSize,
    );
    if (part.partNumber > artifact.multipartPlan.totalParts
      || part.startByte !== startByte || part.endExclusiveByte !== endExclusiveByte
      || part.byteLength !== endExclusiveByte - startByte
      || Date.parse(part.uploadedAt) < Date.parse(initiatedAt)) fail('PART_RANGE_MISMATCH');
    return part;
  }));
}

function normalizePart(value: unknown): MediaProxyMasterR2MultipartPartEvidenceV1 {
  const part = object(value, 'PART_INVALID');
  exactKeys(part, [
    'byteLength', 'contentSha256', 'endExclusiveByte', 'eTag', 'partNumber',
    'startByte', 'uploadedAt',
  ], 'PART_FIELDS_INVALID');
  const startByte = nonNegativeSafeInteger(part.startByte, 'PART_START');
  const endExclusiveByte = positiveSafeInteger(
    part.endExclusiveByte,
    Number.MAX_SAFE_INTEGER,
    'PART_END',
  );
  const byteLength = positiveSafeInteger(
    part.byteLength,
    Number.MAX_SAFE_INTEGER,
    'PART_BYTE_LENGTH',
  );
  if (endExclusiveByte - startByte !== byteLength) fail('PART_RANGE_MISMATCH');
  return Object.freeze({
    partNumber: positiveSafeInteger(part.partNumber, R2_MAX_PARTS, 'PART_NUMBER'),
    startByte,
    endExclusiveByte,
    byteLength,
    contentSha256: sha256(part.contentSha256, 'PART_CONTENT'),
    eTag: eTag(part.eTag, 'PART_ETAG'),
    uploadedAt: instant(part.uploadedAt, 'PART_UPLOADED_AT'),
  });
}

function normalizeCompletionAttempt(
  value: unknown,
  initiatedAt: string,
): MediaProxyMasterR2MultipartCompletionAttemptV1 | null {
  if (value === null) return null;
  const attempt = object(value, 'COMPLETION_ATTEMPT_INVALID');
  exactKeys(attempt, ['attemptId', 'startedAt'], 'COMPLETION_ATTEMPT_FIELDS_INVALID');
  return Object.freeze({
    attemptId: identifier(attempt.attemptId, 'COMPLETION_ATTEMPT_ID'),
    startedAt: atOrAfter(attempt.startedAt, initiatedAt, 'COMPLETION_STARTED_AT'),
  });
}

function normalizePublication(
  value: unknown,
  artifact: MediaProxyMasterR2MultipartArtifactV1,
): MediaProxyMasterR2MultipartPublicationReceiptV1 | null {
  if (value === null) return null;
  const receipt = object(value, 'PUBLICATION_INVALID');
  exactKeys(receipt, [
    'completeETag', 'disposition', 'fullGetByteLength',
    'fullGetContentSha256', 'getETag', 'headETag', 'verifiedAt',
  ], 'PUBLICATION_FIELDS_INVALID');
  const disposition = receipt.disposition;
  const getETag = eTag(receipt.getETag, 'GET_ETAG');
  const headETag = eTag(receipt.headETag, 'HEAD_ETAG');
  if (getETag !== headETag) fail('PROVIDER_VERSION_CHANGED');
  let completeETag: string | null;
  if (disposition === 'COMPLETED_UNIQUE_SESSION_OBJECT') {
    completeETag = eTag(receipt.completeETag, 'COMPLETE_ETAG');
    if (completeETag !== getETag) fail('PROVIDER_VERSION_CHANGED');
  } else if (disposition === 'RECOVERED_EXACT_EXISTING_OBJECT') {
    if (receipt.completeETag !== null) fail('RECOVERED_COMPLETION_ETAG_INVALID');
    completeETag = null;
  } else {
    fail('PUBLICATION_DISPOSITION_INVALID');
  }
  if (receipt.fullGetByteLength !== artifact.byteLength
    || sha256(receipt.fullGetContentSha256, 'FULL_GET_CONTENT')
      !== artifact.contentSha256) fail('FULL_GET_MISMATCH');
  return Object.freeze({
    disposition,
    completeETag,
    getETag,
    headETag,
    fullGetByteLength: artifact.byteLength,
    fullGetContentSha256: artifact.contentSha256,
    verifiedAt: instant(receipt.verifiedAt, 'PUBLICATION_VERIFIED_AT'),
  });
}

function normalizeCleanup(
  value: unknown,
  initiatedAt: string,
): MediaProxyMasterR2MultipartCleanupV1 {
  const cleanup = object(value, 'CLEANUP_INVALID');
  exactKeys(cleanup, [
    'attemptCount', 'disposition', 'lastAttemptAt', 'lastDiagnostic', 'reason',
    'requestedAt', 'resolvedAt',
  ], 'CLEANUP_FIELDS_INVALID');
  if (!['NOT_REQUIRED', 'REQUIRED', 'ABORTED', 'UPLOAD_NOT_FOUND']
    .includes(String(cleanup.disposition))) fail('CLEANUP_DISPOSITION_INVALID');
  const disposition = cleanup.disposition as MediaProxyMasterR2MultipartCleanupV1['disposition'];
  const reason = cleanup.reason === null ? null : abortReason(cleanup.reason);
  const requestedAt = cleanup.requestedAt === null
    ? null : atOrAfter(cleanup.requestedAt, initiatedAt, 'CLEANUP_REQUESTED_AT');
  const attemptCount = nonNegativeSafeInteger(cleanup.attemptCount, 'CLEANUP_ATTEMPT_COUNT');
  const lastAttemptAt = cleanup.lastAttemptAt === null
    ? null : atOrAfter(cleanup.lastAttemptAt, requestedAt ?? initiatedAt, 'CLEANUP_LAST_ATTEMPT_AT');
  const lastDiagnostic = cleanup.lastDiagnostic === null
    ? null : boundedText(cleanup.lastDiagnostic, 512, 'CLEANUP_DIAGNOSTIC');
  const resolvedAt = cleanup.resolvedAt === null
    ? null : atOrAfter(cleanup.resolvedAt, lastAttemptAt ?? requestedAt ?? initiatedAt, 'CLEANUP_RESOLVED_AT');
  if (disposition === 'NOT_REQUIRED' && (reason !== null || requestedAt !== null
    || attemptCount !== 0 || lastAttemptAt !== null || lastDiagnostic !== null
    || resolvedAt !== null)) fail('CLEANUP_LIFECYCLE_INVALID');
  if (disposition === 'REQUIRED' && (reason === null || requestedAt === null
    || resolvedAt !== null || (attemptCount === 0
      ? lastAttemptAt !== null || lastDiagnostic !== null
      : lastAttemptAt === null || lastDiagnostic === null))) {
    fail('CLEANUP_LIFECYCLE_INVALID');
  }
  if (['ABORTED', 'UPLOAD_NOT_FOUND'].includes(disposition)
    && (reason === null || requestedAt === null || attemptCount < 1
      || lastAttemptAt === null || lastDiagnostic !== null || resolvedAt === null)) {
    fail('CLEANUP_LIFECYCLE_INVALID');
  }
  return Object.freeze({
    disposition,
    reason,
    requestedAt,
    attemptCount,
    lastAttemptAt,
    lastDiagnostic,
    resolvedAt,
  });
}

function assertSessionLifecycle(
  status: MediaProxyMasterR2MultipartSessionV1['status'],
  uploadId: string | null,
  parts: readonly MediaProxyMasterR2MultipartPartEvidenceV1[],
  totalParts: number,
  completionAttempt: MediaProxyMasterR2MultipartCompletionAttemptV1 | null,
  publication: MediaProxyMasterR2MultipartPublicationReceiptV1 | null,
  cleanup: MediaProxyMasterR2MultipartCleanupV1,
): void {
  const allParts = parts.length === totalParts
    && parts.every((part, index) => part.partNumber === index + 1);
  if (status === 'INITIATING' && (uploadId !== null || parts.length !== 0
    || completionAttempt || publication || cleanup.disposition !== 'NOT_REQUIRED')) {
    fail('SESSION_LIFECYCLE_INVALID');
  }
  if (status === 'UPLOADING' && (!uploadId || allParts || completionAttempt || publication
    || cleanup.disposition !== 'NOT_REQUIRED')) fail('SESSION_LIFECYCLE_INVALID');
  if (status === 'COMPLETION_READY' && (!uploadId || !allParts || completionAttempt || publication
    || cleanup.disposition !== 'NOT_REQUIRED')) fail('SESSION_LIFECYCLE_INVALID');
  if (status === 'COMPLETING' && (!uploadId || !allParts || !completionAttempt || publication
    || cleanup.disposition !== 'NOT_REQUIRED')) fail('SESSION_LIFECYCLE_INVALID');
  if (status === 'PUBLISHED' && (!uploadId || !allParts || !completionAttempt || !publication
    || cleanup.disposition !== 'NOT_REQUIRED')) fail('SESSION_LIFECYCLE_INVALID');
  if (status === 'ABORT_PENDING' && (publication
    || cleanup.disposition !== 'REQUIRED' || cleanup.reason === null
    || cleanup.requestedAt === null || cleanup.resolvedAt !== null)) {
    fail('SESSION_LIFECYCLE_INVALID');
  }
  if (status === 'ABORTED' && (publication
    || !['ABORTED', 'UPLOAD_NOT_FOUND'].includes(cleanup.disposition)
    || cleanup.reason === null || cleanup.requestedAt === null
    || cleanup.attemptCount < 1 || cleanup.lastAttemptAt === null
    || cleanup.lastDiagnostic !== null || cleanup.resolvedAt === null)) {
    fail('SESSION_LIFECYCLE_INVALID');
  }
  if (status === 'ABORTED'
    && ((cleanup.disposition === 'ABORTED' && uploadId === null)
      || (cleanup.disposition === 'UPLOAD_NOT_FOUND' && parts.length > 0
        && uploadId === null))) fail('SESSION_LIFECYCLE_INVALID');
}

function assertLifecycle(
  status: MediaProxyMasterR2MultipartStatusV1,
  sessions: readonly MediaProxyMasterR2MultipartSessionV1[],
): void {
  if (status === 'INITIATION_PENDING') {
    if (sessions.length !== 0) fail('LIFECYCLE_INVALID');
    return;
  }
  if (sessions.length === 0) fail('LIFECYCLE_INVALID');
  sessions.slice(0, -1).forEach((session) => {
    if (session.status !== 'ABORTED') fail('SESSION_HISTORY_INVALID');
  });
  if (sessions[sessions.length - 1]?.status !== status) fail('LIFECYCLE_INVALID');
}

function activeRecord(
  value: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  input: Readonly<{ expectedSequence: number; leaseTokenSha256: string }>,
  nowInput: string,
): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  const record = assertMediaProxyMasterR2MultipartRecordV1(value);
  assertSequence(record, input.expectedSequence);
  const token = sha256(input.leaseTokenSha256, 'LEASE_TOKEN');
  if (record.lease.tokenSha256 !== token) fail('LEASE_TOKEN_MISMATCH');
  const now = atOrAfter(nowInput, record.updatedAt, 'NOW');
  if (Date.parse(now) >= Date.parse(record.lease.expiresAt)) fail('LEASE_EXPIRED');
  return record;
}

function nextRecord(
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  patch: Partial<Pick<RecordMaterialV1, 'lease' | 'sessions' | 'status'>>,
  now: string,
): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  return freezeRecord({
    version: record.version,
    recordId: record.recordId,
    artifact: record.artifact,
    artifactBindingSha256: record.artifactBindingSha256,
    status: patch.status ?? record.status,
    sequence: record.sequence + 1,
    lease: patch.lease ?? record.lease,
    sessions: patch.sessions ?? record.sessions,
    createdAt: record.createdAt,
    updatedAt: now,
  });
}

function replaceCurrentSession(
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  session: MediaProxyMasterR2MultipartSessionV1,
  status: MediaProxyMasterR2MultipartStatusV1,
  now: string,
): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  return nextRecord(record, {
    status,
    sessions: [...record.sessions.slice(0, -1), session],
  }, now);
}

function currentSession(
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>,
): MediaProxyMasterR2MultipartSessionV1 {
  const session = record.sessions[record.sessions.length - 1];
  if (!session) fail('ACTIVE_SESSION_MISSING');
  return session;
}

function emptyCleanup(): MediaProxyMasterR2MultipartCleanupV1 {
  return Object.freeze({
    disposition: 'NOT_REQUIRED',
    reason: null,
    requestedAt: null,
    attemptCount: 0,
    lastAttemptAt: null,
    lastDiagnostic: null,
    resolvedAt: null,
  });
}

function normalizeLease(value: unknown): MediaProxyMasterR2MultipartLeaseV1 {
  const lease = object(value, 'LEASE_INVALID');
  exactKeys(lease, ['expiresAt', 'fence', 'ownerId', 'tokenSha256'], 'LEASE_FIELDS_INVALID');
  return Object.freeze({
    ownerId: identifier(lease.ownerId, 'LEASE_OWNER_ID'),
    tokenSha256: sha256(lease.tokenSha256, 'LEASE_TOKEN'),
    fence: positiveSafeInteger(lease.fence, Number.MAX_SAFE_INTEGER, 'LEASE_FENCE'),
    expiresAt: instant(lease.expiresAt, 'LEASE_EXPIRES_AT'),
  });
}

function normalizeOwner(value: unknown): MediaSourceOwnerV1 {
  const owner = object(value, 'OWNER_INVALID');
  if (owner.kind === 'USER') {
    exactKeys(owner, ['kind', 'userId'], 'OWNER_FIELDS_INVALID');
    return Object.freeze({ kind: 'USER', userId: identifier(owner.userId, 'OWNER_USER_ID') });
  }
  if (owner.kind === 'ORG') {
    exactKeys(owner, ['kind', 'orgId'], 'OWNER_FIELDS_INVALID');
    return Object.freeze({ kind: 'ORG', orgId: identifier(owner.orgId, 'OWNER_ORG_ID') });
  }
  fail('OWNER_INVALID');
}

function multipartStatus(value: unknown): MediaProxyMasterR2MultipartStatusV1 {
  if (!['INITIATION_PENDING', 'INITIATING', 'UPLOADING', 'COMPLETION_READY', 'COMPLETING',
    'ABORT_PENDING', 'ABORTED', 'PUBLISHED'].includes(String(value))) {
    fail('STATUS_INVALID');
  }
  return value as MediaProxyMasterR2MultipartStatusV1;
}

function sessionStatus(value: unknown): MediaProxyMasterR2MultipartSessionV1['status'] {
  const status = multipartStatus(value);
  if (status === 'INITIATION_PENDING') fail('SESSION_STATUS_INVALID');
  return status;
}

function abortReason(value: unknown): MediaProxyMasterR2MultipartAbortReasonV1 {
  if (!['COMPLETION_CONFLICT', 'LOCAL_REPLAY_MISMATCH', 'PART_STATE_CONFLICT',
    'POLICY_RETIRED', 'TERMINAL_JOB_FAILURE', 'UPLOAD_SESSION_EXPIRED',
    'WORKER_CANCELLED'].includes(String(value))) fail('ABORT_REASON_INVALID');
  return value as MediaProxyMasterR2MultipartAbortReasonV1;
}

function assertSequence(
  record: Readonly<MediaProxyMasterR2MultipartRecordV1>,
  expected: unknown,
): void {
  if (nonNegativeSafeInteger(expected, 'EXPECTED_SEQUENCE') !== record.sequence) {
    fail('SEQUENCE_MISMATCH');
  }
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) fail(code);
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail(`${label}_INVALID`);
  return value;
}

function bucket(value: unknown): string {
  if (typeof value !== 'string' || value === 'editron-cdn' || !BUCKET.test(value)) {
    fail('PRIVATE_BUCKET_INVALID');
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label}_SHA256_INVALID`);
  return value;
}

function eTag(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  const normalized = value.trim().replace(/^"|"$/g, '');
  if (normalized.length < 1 || normalized.length > 512
    || /[\u0000-\u001F\u007F]/.test(normalized)) fail(`${label}_INVALID`);
  return normalized;
}

function sessionObjectKey(artifactBindingSha256: string, generation: number): string {
  return `editron-proxy-multipart/v1/${artifactBindingSha256}/session-${generation}.mp4`;
}

function boundedText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1
    || value.length > maximum || /[\u0000-\u001F\u007F]/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function instant(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function atOrAfter(value: unknown, minimum: string, label: string): string {
  const normalized = instant(value, label);
  if (Date.parse(normalized) < Date.parse(minimum)) fail(`${label}_BEFORE_MINIMUM`);
  return normalized;
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(`${label}_INVALID`);
  return Number(value);
}

function positiveSafeInteger(value: unknown, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    fail(`${label}_INVALID`);
  }
  return Number(value);
}

function fail(code: string): never {
  throw new MediaProxyMasterR2MultipartRecordErrorV1(
    `MEDIA_PROXY_MASTER_R2_MULTIPART_${code}`,
  );
}
