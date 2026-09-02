import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  expectedMediaProxyMasterR2PreparedArtifactManifestObjectKeyV1,
  serializeMediaProxyMasterR2PreparedArtifactManifestV1,
  type MediaProxyMasterR2PreparedArtifactManifestSerializationV1,
} from './media-proxy-master-r2-prepared-artifact-manifest-v1';
import {
  assertMediaProxyMasterR2PreparedArtifactPolicyV1,
  type MediaProxyMasterR2PreparedArtifactPolicyV1,
} from './media-proxy-master-r2-prepared-artifact-policy-v1';

export const MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_OWNER_ID_V1 =
  'MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE' as const;
export const MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_V1' as const;
export const MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_REFERENCE_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_REFERENCE_V1' as const;

const HANDLE = /^mpmprepv1_[a-f0-9]{64}$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type MediaProxyMasterR2PreparedArtifactReferenceV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_REFERENCE_KIND_V1;
  storeOwnerId:
    typeof MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_OWNER_ID_V1;
  storeOwnerVersion:
    typeof MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_VERSION_V1;
  storePolicySha256: string;
  artifactHandle: string;
  jobId: string;
  assetId: string;
  commandSha256: string;
  outputProbeSha256: string;
  contentType: 'video/mp4';
  artifactByteLength: number;
  artifactContentSha256: string;
  manifestObjectKey: string;
  manifestByteLength: number;
  manifestContentSha256: string;
  manifestFullGetETag: string;
  manifestHeadETag: string;
  verificationDisposition:
    'CANONICAL_MANIFEST_FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE';
  reopenDisposition:
    'MANIFEST_VERIFIED_CHUNKS_REASSEMBLED_AND_FULL_SHA256_VERIFIED';
  releaseDisposition: 'DURABLE_REACHABILITY_GC_REQUIRED';
  stagedAt: string;
  retainUntil: string;
  referenceSha256: string;
}>;

export function createMediaProxyMasterR2PreparedArtifactReferenceV1(
  input: Readonly<{
    policy: MediaProxyMasterR2PreparedArtifactPolicyV1;
    serialization: MediaProxyMasterR2PreparedArtifactManifestSerializationV1;
    manifestFullGetETag: string;
    manifestHeadETag: string;
  }>,
): MediaProxyMasterR2PreparedArtifactReferenceV1 {
  const policy = assertMediaProxyMasterR2PreparedArtifactPolicyV1(
    input.policy,
  );
  const serialization = serializeMediaProxyMasterR2PreparedArtifactManifestV1({
    policy,
    manifest: input.serialization.manifest,
  });
  if (serialization.objectKey !== input.serialization.objectKey
    || serialization.canonicalJson !== input.serialization.canonicalJson
    || serialization.byteLength !== input.serialization.byteLength
    || serialization.contentSha256 !== input.serialization.contentSha256) {
    fail('SERIALIZATION_MISMATCH');
  }
  const manifestFullGetETag = eTag(
    input.manifestFullGetETag,
    'MANIFEST_GET_ETAG',
  );
  const manifestHeadETag = eTag(input.manifestHeadETag, 'MANIFEST_HEAD_ETAG');
  if (manifestFullGetETag !== manifestHeadETag) fail('MANIFEST_ETAG_CHANGED');
  const manifest = serialization.manifest;
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_REFERENCE_KIND_V1,
    storeOwnerId: MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_OWNER_ID_V1,
    storeOwnerVersion:
      MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_VERSION_V1,
    storePolicySha256: policy.policySha256,
    artifactHandle: manifest.artifactHandle,
    jobId: manifest.jobId,
    assetId: manifest.assetId,
    commandSha256: manifest.commandSha256,
    outputProbeSha256: manifest.outputProbeSha256,
    contentType: 'video/mp4' as const,
    artifactByteLength: manifest.artifactByteLength,
    artifactContentSha256: manifest.artifactContentSha256,
    manifestObjectKey: serialization.objectKey,
    manifestByteLength: serialization.byteLength,
    manifestContentSha256: serialization.contentSha256,
    manifestFullGetETag,
    manifestHeadETag,
    verificationDisposition:
      'CANONICAL_MANIFEST_FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE' as const,
    reopenDisposition: policy.reopenDisposition,
    releaseDisposition: policy.releaseDisposition,
    stagedAt: manifest.stagedAt,
    retainUntil: manifest.retainUntil,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    referenceSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaProxyMasterR2PreparedArtifactReferenceV1(
  value: unknown,
  policyValue: MediaProxyMasterR2PreparedArtifactPolicyV1,
): MediaProxyMasterR2PreparedArtifactReferenceV1 {
  const policy = assertMediaProxyMasterR2PreparedArtifactPolicyV1(policyValue);
  const record = object(value, 'REFERENCE_INVALID');
  exactKeys(record, [
    'artifactByteLength', 'artifactContentSha256', 'artifactHandle', 'assetId',
    'commandSha256', 'contentType', 'jobId', 'kind', 'manifestByteLength',
    'manifestContentSha256', 'manifestFullGetETag', 'manifestHeadETag',
    'manifestObjectKey', 'outputProbeSha256', 'referenceSha256',
    'releaseDisposition', 'reopenDisposition', 'retainUntil', 'schemaVersion',
    'stagedAt', 'storeOwnerId', 'storeOwnerVersion', 'storePolicySha256',
    'verificationDisposition',
  ]);
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_REFERENCE_KIND_V1
    || record.storeOwnerId
      !== MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_OWNER_ID_V1
    || record.storeOwnerVersion
      !== MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_VERSION_V1
    || record.storePolicySha256 !== policy.policySha256
    || record.contentType !== 'video/mp4'
    || record.verificationDisposition
      !== 'CANONICAL_MANIFEST_FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE'
    || record.reopenDisposition !== policy.reopenDisposition
    || record.releaseDisposition !== policy.releaseDisposition) {
    fail('REFERENCE_IDENTITY_INVALID');
  }
  const artifactHandle = handle(record.artifactHandle);
  const stagedAt = instant(record.stagedAt, 'STAGED_AT');
  const retainUntil = instant(record.retainUntil, 'RETAIN_UNTIL');
  if (Date.parse(retainUntil) <= Date.parse(stagedAt)) fail('RETENTION_INVALID');
  const manifestFullGetETag = eTag(
    record.manifestFullGetETag,
    'MANIFEST_GET_ETAG',
  );
  const manifestHeadETag = eTag(record.manifestHeadETag, 'MANIFEST_HEAD_ETAG');
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_REFERENCE_KIND_V1,
    storeOwnerId: MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_OWNER_ID_V1,
    storeOwnerVersion:
      MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_VERSION_V1,
    storePolicySha256: policy.policySha256,
    artifactHandle,
    jobId: identity(record.jobId, 'JOB_ID'),
    assetId: identity(record.assetId, 'ASSET_ID'),
    commandSha256: sha256(record.commandSha256, 'COMMAND'),
    outputProbeSha256: sha256(record.outputProbeSha256, 'OUTPUT_PROBE'),
    contentType: 'video/mp4' as const,
    artifactByteLength: positiveInteger(
      record.artifactByteLength,
      policy.chunkPlan.maximumObjectBytes,
      'ARTIFACT_BYTE_LENGTH',
    ),
    artifactContentSha256: sha256(
      record.artifactContentSha256,
      'ARTIFACT_CONTENT',
    ),
    manifestObjectKey: boundedText(record.manifestObjectKey, 1_024, 'MANIFEST_KEY'),
    manifestByteLength: positiveInteger(
      record.manifestByteLength,
      policy.maximumManifestBytes,
      'MANIFEST_BYTE_LENGTH',
    ),
    manifestContentSha256: sha256(
      record.manifestContentSha256,
      'MANIFEST_CONTENT',
    ),
    manifestFullGetETag,
    manifestHeadETag,
    verificationDisposition:
      'CANONICAL_MANIFEST_FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE' as const,
    reopenDisposition: policy.reopenDisposition,
    releaseDisposition: policy.releaseDisposition,
    stagedAt,
    retainUntil,
  };
  if (manifestFullGetETag !== manifestHeadETag
    || material.manifestObjectKey
      !== expectedMediaProxyMasterR2PreparedArtifactManifestObjectKeyV1(
        artifactHandle,
      )
    || sha256(record.referenceSha256, 'REFERENCE')
      !== hashEditronCanonicalJsonV1(material)) {
    fail('REFERENCE_BINDING_INVALID');
  }
  return deepFreezeEditronJsonV1({
    ...material,
    referenceSha256: record.referenceSha256 as string,
  });
}

export function assertMediaProxyMasterR2PreparedArtifactReferenceForManifestV1(
  input: Readonly<{
    reference: MediaProxyMasterR2PreparedArtifactReferenceV1;
    serialization: MediaProxyMasterR2PreparedArtifactManifestSerializationV1;
    policy: MediaProxyMasterR2PreparedArtifactPolicyV1;
  }>,
): MediaProxyMasterR2PreparedArtifactReferenceV1 {
  const reference = assertMediaProxyMasterR2PreparedArtifactReferenceV1(
    input.reference,
    input.policy,
  );
  const serialization = serializeMediaProxyMasterR2PreparedArtifactManifestV1({
    manifest: input.serialization.manifest,
    policy: input.policy,
  });
  if (reference.artifactHandle !== serialization.manifest.artifactHandle
    || reference.jobId !== serialization.manifest.jobId
    || reference.assetId !== serialization.manifest.assetId
    || reference.commandSha256 !== serialization.manifest.commandSha256
    || reference.outputProbeSha256 !== serialization.manifest.outputProbeSha256
    || reference.artifactByteLength
      !== serialization.manifest.artifactByteLength
    || reference.artifactContentSha256
      !== serialization.manifest.artifactContentSha256
    || reference.manifestObjectKey !== serialization.objectKey
    || reference.manifestByteLength !== serialization.byteLength
    || reference.manifestContentSha256 !== serialization.contentSha256
    || reference.stagedAt !== serialization.manifest.stagedAt
    || reference.retainUntil !== serialization.manifest.retainUntil) {
    fail('REFERENCE_MANIFEST_MISMATCH');
  }
  return reference;
}

function handle(value: unknown): string {
  if (typeof value !== 'string' || !HANDLE.test(value)) {
    fail('ARTIFACT_HANDLE_INVALID');
  }
  return value;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !IDENTITY.test(value)) fail(`${label}_INVALID`);
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

function boundedText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1
    || value.length > maximum || /[\u0000-\u001F\u007F]/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
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

function fail(code: string): never {
  throw new MediaProxyMasterR2PreparedArtifactReferenceErrorV1(code);
}

export class MediaProxyMasterR2PreparedArtifactReferenceErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_REFERENCE_${code}`);
    this.name = 'MediaProxyMasterR2PreparedArtifactReferenceErrorV1';
  }
}
