import { createHash } from 'node:crypto';

import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaProxyMasterR2PreparedArtifactPolicyV1,
  resolveMediaProxyMasterR2PreparedArtifactChunkPlanV1,
  type MediaProxyMasterR2PreparedArtifactPolicyV1,
} from './media-proxy-master-r2-prepared-artifact-policy-v1';
import type { MediaSourceOwnerV1 } from './media-source-version-v1';

export const MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_MANIFEST_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_MANIFEST_V1' as const;

const ARTIFACT_HANDLE = /^mpmprepv1_[a-f0-9]{64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;

export type MediaProxyMasterR2PreparedArtifactChunkEvidenceV1 = Readonly<{
  sequence: number;
  startByte: number;
  endExclusiveByte: number;
  byteLength: number;
  contentSha256: string;
  objectKey: string;
  fullGetETag: string;
  headETag: string;
  verifiedAt: string;
}>;

export type MediaProxyMasterR2PreparedArtifactManifestV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_MANIFEST_KIND_V1;
  artifactHandle: string;
  policySha256: string;
  jobId: string;
  tenantId: string;
  userId: string;
  orgId: string | null;
  owner: MediaSourceOwnerV1;
  assetId: string;
  commandSha256: string;
  outputProbeSha256: string;
  contentType: 'video/mp4';
  artifactByteLength: number;
  artifactContentSha256: string;
  chunkPlan: Readonly<{ chunkSize: number; totalChunks: number }>;
  chunks: readonly MediaProxyMasterR2PreparedArtifactChunkEvidenceV1[];
  verificationDisposition:
    'EVERY_CHUNK_FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE';
  stagedAt: string;
  retainUntil: string;
  manifestSha256: string;
}>;

export type MediaProxyMasterR2PreparedArtifactManifestSerializationV1 =
  Readonly<{
    manifest: MediaProxyMasterR2PreparedArtifactManifestV1;
    objectKey: string;
    canonicalJson: string;
    byteLength: number;
    contentSha256: string;
  }>;

export type MediaProxyMasterR2PreparedArtifactIdentityInputV1 = Readonly<{
  policy: MediaProxyMasterR2PreparedArtifactPolicyV1;
  jobId: string;
  tenantId: string;
  userId: string;
  orgId: string | null;
  owner: MediaSourceOwnerV1;
  assetId: string;
  commandSha256: string;
  outputProbeSha256: string;
  artifactByteLength: number;
  artifactContentSha256: string;
}>;

type ManifestInputV1 = MediaProxyMasterR2PreparedArtifactIdentityInputV1 & Readonly<{
  chunks: readonly MediaProxyMasterR2PreparedArtifactChunkEvidenceV1[];
  stagedAt: string;
  retainUntil: string;
}>;

export function createMediaProxyMasterR2PreparedArtifactManifestV1(
  input: ManifestInputV1,
): MediaProxyMasterR2PreparedArtifactManifestV1 {
  const policy = assertMediaProxyMasterR2PreparedArtifactPolicyV1(
    input.policy,
  );
  const scope = normalizeScope(input);
  const artifactByteLength = positiveInteger(
    input.artifactByteLength,
    policy.chunkPlan.maximumObjectBytes,
    'ARTIFACT_BYTE_LENGTH',
  );
  const artifactContentSha256 = sha256(
    input.artifactContentSha256,
    'ARTIFACT_CONTENT',
  );
  const commandSha256 = sha256(input.commandSha256, 'COMMAND');
  const outputProbeSha256 = sha256(input.outputProbeSha256, 'OUTPUT_PROBE');
  const chunkPlan = resolveMediaProxyMasterR2PreparedArtifactChunkPlanV1({
    policy,
    artifactByteLength,
  });
  const artifactHandle = expectedArtifactHandle({
    policySha256: policy.policySha256,
    ...scope,
    commandSha256,
    outputProbeSha256,
    artifactByteLength,
    artifactContentSha256,
  });
  const chunks = normalizeChunks({
    chunks: input.chunks,
    artifactHandle,
    artifactByteLength,
    chunkPlan,
  });
  const stagedAt = instant(input.stagedAt, 'STAGED_AT');
  const retainUntil = instant(input.retainUntil, 'RETAIN_UNTIL');
  if (Date.parse(retainUntil) <= Date.parse(stagedAt)
    || chunks.some((chunk) => Date.parse(chunk.verifiedAt) > Date.parse(stagedAt))) {
    fail('RETENTION_OR_VERIFICATION_TIME_INVALID');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_MANIFEST_KIND_V1,
    artifactHandle,
    policySha256: policy.policySha256,
    ...scope,
    commandSha256,
    outputProbeSha256,
    contentType: 'video/mp4' as const,
    artifactByteLength,
    artifactContentSha256,
    chunkPlan,
    chunks,
    verificationDisposition:
      'EVERY_CHUNK_FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE' as const,
    stagedAt,
    retainUntil,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    manifestSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function expectedMediaProxyMasterR2PreparedArtifactHandleV1(
  input: MediaProxyMasterR2PreparedArtifactIdentityInputV1,
): string {
  const policy = assertMediaProxyMasterR2PreparedArtifactPolicyV1(input.policy);
  const scope = normalizeScope(input);
  return expectedArtifactHandle({
    policySha256: policy.policySha256,
    ...scope,
    commandSha256: sha256(input.commandSha256, 'COMMAND'),
    outputProbeSha256: sha256(input.outputProbeSha256, 'OUTPUT_PROBE'),
    artifactByteLength: positiveInteger(
      input.artifactByteLength,
      policy.chunkPlan.maximumObjectBytes,
      'ARTIFACT_BYTE_LENGTH',
    ),
    artifactContentSha256: sha256(
      input.artifactContentSha256,
      'ARTIFACT_CONTENT',
    ),
  });
}

export function assertMediaProxyMasterR2PreparedArtifactManifestV1(
  value: unknown,
  policyValue: MediaProxyMasterR2PreparedArtifactPolicyV1,
): MediaProxyMasterR2PreparedArtifactManifestV1 {
  const record = object(value, 'MANIFEST_INVALID');
  exactKeys(record, [
    'artifactByteLength', 'artifactContentSha256', 'artifactHandle', 'assetId',
    'chunkPlan', 'chunks', 'commandSha256', 'contentType', 'jobId', 'kind',
    'manifestSha256', 'orgId', 'outputProbeSha256', 'owner', 'policySha256',
    'retainUntil', 'schemaVersion', 'stagedAt', 'tenantId', 'userId',
    'verificationDisposition',
  ]);
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_MANIFEST_KIND_V1
    || record.contentType !== 'video/mp4'
    || record.verificationDisposition
      !== 'EVERY_CHUNK_FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE') {
    fail('MANIFEST_IDENTITY_INVALID');
  }
  const rebuilt = createMediaProxyMasterR2PreparedArtifactManifestV1({
    policy: policyValue,
    jobId: record.jobId as string,
    tenantId: record.tenantId as string,
    userId: record.userId as string,
    orgId: record.orgId as string | null,
    owner: record.owner as MediaSourceOwnerV1,
    assetId: record.assetId as string,
    commandSha256: record.commandSha256 as string,
    outputProbeSha256: record.outputProbeSha256 as string,
    artifactByteLength: record.artifactByteLength as number,
    artifactContentSha256: record.artifactContentSha256 as string,
    chunks: array(record.chunks, 'CHUNKS_INVALID') as never,
    stagedAt: record.stagedAt as string,
    retainUntil: record.retainUntil as string,
  });
  const claimedPlan = object(record.chunkPlan, 'CHUNK_PLAN_INVALID');
  exactKeys(claimedPlan, ['chunkSize', 'totalChunks']);
  if (record.artifactHandle !== rebuilt.artifactHandle
    || record.policySha256 !== rebuilt.policySha256
    || claimedPlan.chunkSize !== rebuilt.chunkPlan.chunkSize
    || claimedPlan.totalChunks !== rebuilt.chunkPlan.totalChunks
    || sha256(record.manifestSha256, 'MANIFEST') !== rebuilt.manifestSha256) {
    fail('MANIFEST_BINDING_INVALID');
  }
  return rebuilt;
}

export function serializeMediaProxyMasterR2PreparedArtifactManifestV1(
  input: Readonly<{
    manifest: MediaProxyMasterR2PreparedArtifactManifestV1;
    policy: MediaProxyMasterR2PreparedArtifactPolicyV1;
  }>,
): MediaProxyMasterR2PreparedArtifactManifestSerializationV1 {
  const policy = assertMediaProxyMasterR2PreparedArtifactPolicyV1(
    input.policy,
  );
  const manifest = assertMediaProxyMasterR2PreparedArtifactManifestV1(
    input.manifest,
    policy,
  );
  const canonicalJson = canonicalizeEditronJsonV1(manifest);
  const byteLength = Buffer.byteLength(canonicalJson, 'utf8');
  if (byteLength > policy.maximumManifestBytes) fail('MANIFEST_BYTE_LIMIT');
  return deepFreezeEditronJsonV1({
    manifest,
    objectKey: expectedMediaProxyMasterR2PreparedArtifactManifestObjectKeyV1(
      manifest.artifactHandle,
    ),
    canonicalJson,
    byteLength,
    contentSha256: createHash('sha256').update(canonicalJson).digest('hex'),
  });
}

export function parseMediaProxyMasterR2PreparedArtifactManifestV1(
  input: Readonly<{
    canonicalJson: string;
    policy: MediaProxyMasterR2PreparedArtifactPolicyV1;
  }>,
): MediaProxyMasterR2PreparedArtifactManifestV1 {
  const policy = assertMediaProxyMasterR2PreparedArtifactPolicyV1(
    input.policy,
  );
  if (typeof input.canonicalJson !== 'string'
    || Buffer.byteLength(input.canonicalJson, 'utf8')
      > policy.maximumManifestBytes) {
    fail('MANIFEST_BYTE_LIMIT');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.canonicalJson);
  } catch {
    fail('MANIFEST_JSON_INVALID');
  }
  const manifest = assertMediaProxyMasterR2PreparedArtifactManifestV1(
    parsed,
    policy,
  );
  if (canonicalizeEditronJsonV1(manifest) !== input.canonicalJson) {
    fail('MANIFEST_JSON_NON_CANONICAL');
  }
  return manifest;
}

export function expectedMediaProxyMasterR2PreparedArtifactChunkObjectKeyV1(
  artifactHandleValue: string,
  sequenceValue: number,
  contentSha256Value: string,
): string {
  const artifactHandle = handle(artifactHandleValue);
  const sequence = positiveInteger(sequenceValue, 10_000, 'CHUNK_SEQUENCE');
  const contentSha256 = sha256(contentSha256Value, 'CHUNK_CONTENT');
  return `editron-proxy-prepared/v1/${artifactHandle}/chunks/${String(
    sequence,
  ).padStart(5, '0')}-${contentSha256}.bin`;
}

export function expectedMediaProxyMasterR2PreparedArtifactManifestObjectKeyV1(
  artifactHandleValue: string,
): string {
  return `editron-proxy-prepared/v1/${handle(
    artifactHandleValue,
  )}/manifest.json`;
}

function expectedArtifactHandle(input: Readonly<{
  policySha256: string;
  jobId: string;
  tenantId: string;
  userId: string;
  orgId: string | null;
  owner: MediaSourceOwnerV1;
  assetId: string;
  commandSha256: string;
  outputProbeSha256: string;
  artifactByteLength: number;
  artifactContentSha256: string;
}>): string {
  return `mpmprepv1_${hashEditronCanonicalJsonV1(input)}`;
}

function normalizeScope(input: Pick<ManifestInputV1,
  'jobId' | 'tenantId' | 'userId' | 'orgId' | 'owner' | 'assetId'>) {
  const userId = identity(input.userId, 'USER_ID');
  const orgId = input.orgId === null ? null : identity(input.orgId, 'ORG_ID');
  const owner = normalizeOwner(input.owner);
  if ((owner.kind === 'USER' && (owner.userId !== userId || orgId !== null))
    || (owner.kind === 'ORG' && (orgId === null || owner.orgId !== orgId))) {
    fail('OWNER_SCOPE_MISMATCH');
  }
  return Object.freeze({
    jobId: identity(input.jobId, 'JOB_ID'),
    tenantId: identity(input.tenantId, 'TENANT_ID'),
    userId,
    orgId,
    owner,
    assetId: identity(input.assetId, 'ASSET_ID'),
  });
}

function normalizeOwner(value: unknown): MediaSourceOwnerV1 {
  const record = object(value, 'OWNER_INVALID');
  if (record.kind === 'USER') {
    exactKeys(record, ['kind', 'userId']);
    return Object.freeze({ kind: 'USER', userId: identity(record.userId, 'OWNER_USER') });
  }
  if (record.kind === 'ORG') {
    exactKeys(record, ['kind', 'orgId']);
    return Object.freeze({ kind: 'ORG', orgId: identity(record.orgId, 'OWNER_ORG') });
  }
  fail('OWNER_INVALID');
}

function normalizeChunks(input: Readonly<{
  chunks: readonly MediaProxyMasterR2PreparedArtifactChunkEvidenceV1[];
  artifactHandle: string;
  artifactByteLength: number;
  chunkPlan: Readonly<{ chunkSize: number; totalChunks: number }>;
}>): readonly MediaProxyMasterR2PreparedArtifactChunkEvidenceV1[] {
  const chunks = array(input.chunks, 'CHUNKS_INVALID');
  if (chunks.length !== input.chunkPlan.totalChunks) {
    fail('CHUNK_COUNT_MISMATCH');
  }
  return Object.freeze(chunks.map((value, index) => {
    const chunk = object(value, 'CHUNK_INVALID');
    exactKeys(chunk, [
      'byteLength', 'contentSha256', 'endExclusiveByte', 'fullGetETag',
      'headETag', 'objectKey', 'sequence', 'startByte', 'verifiedAt',
    ]);
    const sequence = positiveInteger(chunk.sequence, 10_000, 'CHUNK_SEQUENCE');
    const expectedSequence = index + 1;
    const startByte = index * input.chunkPlan.chunkSize;
    const endExclusiveByte = Math.min(
      startByte + input.chunkPlan.chunkSize,
      input.artifactByteLength,
    );
    const byteLength = endExclusiveByte - startByte;
    const contentSha256 = sha256(chunk.contentSha256, 'CHUNK_CONTENT');
    const fullGetETag = eTag(chunk.fullGetETag, 'CHUNK_GET_ETAG');
    const headETag = eTag(chunk.headETag, 'CHUNK_HEAD_ETAG');
    if (sequence !== expectedSequence
      || chunk.startByte !== startByte
      || chunk.endExclusiveByte !== endExclusiveByte
      || chunk.byteLength !== byteLength
      || byteLength < 1
      || fullGetETag !== headETag
      || chunk.objectKey
        !== expectedMediaProxyMasterR2PreparedArtifactChunkObjectKeyV1(
          input.artifactHandle,
          sequence,
          contentSha256,
        )) {
      fail('CHUNK_SCOPE_MISMATCH');
    }
    return Object.freeze({
      sequence,
      startByte,
      endExclusiveByte,
      byteLength,
      contentSha256,
      objectKey: chunk.objectKey as string,
      fullGetETag,
      headETag,
      verifiedAt: instant(chunk.verifiedAt, 'CHUNK_VERIFIED_AT'),
    });
  }));
}

function handle(value: unknown): string {
  if (typeof value !== 'string' || !ARTIFACT_HANDLE.test(value)) {
    fail('ARTIFACT_HANDLE_INVALID');
  }
  return value;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !IDENTITY.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(`${label}_SHA256_INVALID`);
  }
  return value;
}

function positiveInteger(value: unknown, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1
    || (value as number) > maximum) {
    fail(`${label}_INVALID`);
  }
  return value as number;
}

function instant(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function eTag(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  const normalized = value.trim().replace(/^"|"$/g, '');
  if (normalized.length < 1 || normalized.length > 512
    || /[\u0000-\u001F\u007F]/.test(normalized)) {
    fail(`${label}_INVALID`);
  }
  return normalized;
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function array(value: unknown, code: string): unknown[] {
  if (!Array.isArray(value)) fail(code);
  return value;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) {
    fail('FIELDS_INVALID');
  }
}

function fail(code: string): never {
  throw new MediaProxyMasterR2PreparedArtifactManifestErrorV1(code);
}

export class MediaProxyMasterR2PreparedArtifactManifestErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_MANIFEST_${code}`);
    this.name = 'MediaProxyMasterR2PreparedArtifactManifestErrorV1';
  }
}
