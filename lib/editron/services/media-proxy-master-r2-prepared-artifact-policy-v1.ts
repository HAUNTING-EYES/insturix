import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaProxyMasterR2PrivatePublicationPolicyV2,
  type MediaProxyMasterR2PrivatePublicationPolicyV2,
} from './media-proxy-master-r2-private-publication-policy-v2';
import {
  R2_MAX_OBJECT_BYTES,
  R2_MAX_PART_BYTES,
  R2_MAX_PARTS,
  R2_MIN_PART_BYTES,
} from './r2-upload-limits';

export const MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_POLICY_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_POLICY_V1' as const;
export const MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_POLICY_VERSION_V1 =
  'editron-media-proxy-master-r2-prepared-artifact-policy-v1' as const;

const MEBIBYTE = 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * MEBIBYTE;
const SHA256 = /^[a-f0-9]{64}$/;

export type MediaProxyMasterR2PreparedArtifactPolicyV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_POLICY_KIND_V1;
  policyVersion:
    typeof MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_POLICY_VERSION_V1;
  publicationPolicy: MediaProxyMasterR2PrivatePublicationPolicyV2;
  storageNamespace: 'editron-proxy-prepared/v1';
  objectVisibility: 'PRIVATE';
  contentType: 'video/mp4';
  chunkWriteDisposition: 'CREATE_ONLY_IF_NONE_MATCH_STAR';
  chunkVerification: 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE';
  manifestWriteDisposition: 'CREATE_ONLY_IF_NONE_MATCH_STAR';
  manifestVerification:
    'CANONICAL_FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE';
  chunkPlan: Readonly<{
    targetChunkBytes: number;
    minimumChunkBytes: typeof R2_MIN_PART_BYTES;
    maximumChunkBytes: typeof R2_MAX_PART_BYTES;
    maximumChunks: typeof R2_MAX_PARTS;
    maximumObjectBytes: number;
    alignmentBytes: typeof MEBIBYTE;
    finalChunkMayBeSmaller: true;
  }>;
  maximumManifestBytes: number;
  reopenDisposition:
    'MANIFEST_VERIFIED_CHUNKS_REASSEMBLED_AND_FULL_SHA256_VERIFIED';
  releaseDisposition: 'DURABLE_REACHABILITY_GC_REQUIRED';
  policySha256: string;
}>;

export type MediaProxyMasterR2PreparedArtifactChunkPlanV1 = Readonly<{
  chunkSize: number;
  totalChunks: number;
}>;

export function createMediaProxyMasterR2PreparedArtifactPolicyV1(
  input: Readonly<{
    publicationPolicy: MediaProxyMasterR2PrivatePublicationPolicyV2;
    targetChunkBytes: number;
    maximumManifestBytes: number;
  }>,
): MediaProxyMasterR2PreparedArtifactPolicyV1 {
  const publicationPolicy =
    assertMediaProxyMasterR2PrivatePublicationPolicyV2(
      input.publicationPolicy,
    );
  const targetChunkBytes = alignedChunkBytes(input.targetChunkBytes);
  const maximumManifestBytes = safeInteger(
    input.maximumManifestBytes,
    1_024,
    MAX_MANIFEST_BYTES,
    'MANIFEST_BYTES_INVALID',
  );
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_POLICY_KIND_V1,
    policyVersion: MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_POLICY_VERSION_V1,
    publicationPolicy,
    storageNamespace: 'editron-proxy-prepared/v1' as const,
    objectVisibility: 'PRIVATE' as const,
    contentType: 'video/mp4' as const,
    chunkWriteDisposition: 'CREATE_ONLY_IF_NONE_MATCH_STAR' as const,
    chunkVerification: 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE' as const,
    manifestWriteDisposition: 'CREATE_ONLY_IF_NONE_MATCH_STAR' as const,
    manifestVerification:
      'CANONICAL_FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE' as const,
    chunkPlan: {
      targetChunkBytes,
      minimumChunkBytes: R2_MIN_PART_BYTES,
      maximumChunkBytes: R2_MAX_PART_BYTES,
      maximumChunks: R2_MAX_PARTS,
      maximumObjectBytes: R2_MAX_OBJECT_BYTES,
      alignmentBytes: MEBIBYTE,
      finalChunkMayBeSmaller: true as const,
    },
    maximumManifestBytes,
    reopenDisposition:
      'MANIFEST_VERIFIED_CHUNKS_REASSEMBLED_AND_FULL_SHA256_VERIFIED' as const,
    releaseDisposition: 'DURABLE_REACHABILITY_GC_REQUIRED' as const,
  } as const;
  return deepFreezeEditronJsonV1({
    ...material,
    policySha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaProxyMasterR2PreparedArtifactPolicyV1(
  value: unknown,
): MediaProxyMasterR2PreparedArtifactPolicyV1 {
  const policy = object(value, 'POLICY_INVALID');
  exactKeys(policy, [
    'chunkPlan', 'chunkVerification', 'chunkWriteDisposition', 'contentType',
    'kind', 'manifestVerification', 'manifestWriteDisposition',
    'maximumManifestBytes', 'objectVisibility', 'policySha256',
    'policyVersion', 'publicationPolicy', 'releaseDisposition',
    'reopenDisposition', 'schemaVersion', 'storageNamespace',
  ]);
  if (policy.schemaVersion !== 1
    || policy.kind !== MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_POLICY_KIND_V1
    || policy.policyVersion
      !== MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_POLICY_VERSION_V1
    || policy.storageNamespace !== 'editron-proxy-prepared/v1'
    || policy.objectVisibility !== 'PRIVATE'
    || policy.contentType !== 'video/mp4'
    || policy.chunkWriteDisposition !== 'CREATE_ONLY_IF_NONE_MATCH_STAR'
    || policy.chunkVerification !== 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE'
    || policy.manifestWriteDisposition !== 'CREATE_ONLY_IF_NONE_MATCH_STAR'
    || policy.manifestVerification
      !== 'CANONICAL_FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE'
    || policy.reopenDisposition
      !== 'MANIFEST_VERIFIED_CHUNKS_REASSEMBLED_AND_FULL_SHA256_VERIFIED'
    || policy.releaseDisposition !== 'DURABLE_REACHABILITY_GC_REQUIRED') {
    fail('IDENTITY_INVALID');
  }
  const plan = object(policy.chunkPlan, 'CHUNK_PLAN_INVALID');
  exactKeys(plan, [
    'alignmentBytes', 'finalChunkMayBeSmaller', 'maximumChunkBytes',
    'maximumChunks', 'maximumObjectBytes', 'minimumChunkBytes',
    'targetChunkBytes',
  ]);
  if (plan.minimumChunkBytes !== R2_MIN_PART_BYTES
    || plan.maximumChunkBytes !== R2_MAX_PART_BYTES
    || plan.maximumChunks !== R2_MAX_PARTS
    || plan.maximumObjectBytes !== R2_MAX_OBJECT_BYTES
    || plan.alignmentBytes !== MEBIBYTE
    || plan.finalChunkMayBeSmaller !== true) {
    fail('CHUNK_PLAN_IDENTITY_INVALID');
  }
  const rebuilt = createMediaProxyMasterR2PreparedArtifactPolicyV1({
    publicationPolicy: policy.publicationPolicy as never,
    targetChunkBytes: plan.targetChunkBytes as number,
    maximumManifestBytes: policy.maximumManifestBytes as number,
  });
  if (sha256(policy.policySha256) !== rebuilt.policySha256) {
    fail('HASH_MISMATCH');
  }
  return rebuilt;
}

export function resolveMediaProxyMasterR2PreparedArtifactChunkPlanV1(
  input: Readonly<{
    policy: MediaProxyMasterR2PreparedArtifactPolicyV1;
    artifactByteLength: number;
  }>,
): MediaProxyMasterR2PreparedArtifactChunkPlanV1 {
  const policy = assertMediaProxyMasterR2PreparedArtifactPolicyV1(
    input.policy,
  );
  const artifactByteLength = safeInteger(
    input.artifactByteLength,
    1,
    policy.chunkPlan.maximumObjectBytes,
    'ARTIFACT_BYTES_INVALID',
  );
  const minimumByCount = Math.ceil(
    artifactByteLength / policy.chunkPlan.maximumChunks,
  );
  const alignedMinimum = Math.ceil(
    minimumByCount / policy.chunkPlan.alignmentBytes,
  ) * policy.chunkPlan.alignmentBytes;
  const chunkSize = Math.max(
    policy.chunkPlan.targetChunkBytes,
    policy.chunkPlan.minimumChunkBytes,
    alignedMinimum,
  );
  if (chunkSize > policy.chunkPlan.maximumChunkBytes) {
    fail('CHUNK_SIZE_UNSUPPORTED');
  }
  const totalChunks = Math.ceil(artifactByteLength / chunkSize);
  if (totalChunks < 1 || totalChunks > policy.chunkPlan.maximumChunks) {
    fail('CHUNK_COUNT_UNSUPPORTED');
  }
  return Object.freeze({ chunkSize, totalChunks });
}

function alignedChunkBytes(value: unknown): number {
  const normalized = safeInteger(
    value,
    R2_MIN_PART_BYTES,
    R2_MAX_PART_BYTES,
    'TARGET_CHUNK_BYTES_INVALID',
  );
  if (normalized % MEBIBYTE !== 0) fail('TARGET_CHUNK_ALIGNMENT_INVALID');
  return normalized;
}

function safeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value)
    || (value as number) < minimum
    || (value as number) > maximum) {
    fail(code);
  }
  return value as number;
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) {
    fail('FIELDS_INVALID');
  }
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail('SHA256_INVALID');
  return value;
}

function fail(code: string): never {
  throw new MediaProxyMasterR2PreparedArtifactPolicyErrorV1(code);
}

export class MediaProxyMasterR2PreparedArtifactPolicyErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_POLICY_${code}`);
    this.name = 'MediaProxyMasterR2PreparedArtifactPolicyErrorV1';
  }
}
