import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1,
} from './media-proxy-master-r2-multipart-coordinator-v1';
import {
  MEDIA_PROXY_MASTER_R2_MULTIPART_MONGO_STORE_VERSION_V1,
} from './media-proxy-master-r2-multipart-mongo-store-v1';
import {
  MEDIA_PROXY_MASTER_R2_MULTIPART_RECORD_VERSION_V1,
} from './media-proxy-master-r2-multipart-record-v1';
import {
  MEDIA_PROXY_MASTER_R2_PRIVATE_MULTIPART_TRANSPORT_VERSION_V1,
} from './media-proxy-master-r2-private-multipart-transport-v1';
import {
  assertMediaProxyMasterR2PrivatePublicationPolicyV1,
  createMediaProxyMasterR2PrivatePublicationPolicyV1,
  type MediaProxyMasterR2PrivatePublicationPolicyV1,
} from './media-proxy-master-r2-private-publication-policy-v1';
import type {
  MediaSourcePtsCadenceR2PrivateStorageScopeV1,
} from './media-source-pts-cadence-r2-private-sidecar-v1';
import {
  R2_MAX_OBJECT_BYTES,
  R2_MAX_PART_BYTES,
  R2_MAX_PARTS,
  R2_MIN_PART_BYTES,
  resolveMultipartPlan,
} from './r2-upload-limits';

export const MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_KIND_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_V2' as const;
export const MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2 =
  'editron-media-proxy-master-r2-private-publication-policy-v2' as const;

const SHA256 = /^[a-f0-9]{64}$/;

export type MediaProxyMasterR2PrivatePublicationPolicyV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_KIND_V2;
  policyVersion:
    typeof MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2;
  selectionBasis: 'VERIFIED_ACTUAL_ARTIFACT_BYTE_LENGTH';
  singlePut: Readonly<{
    eligibility: 'ACTUAL_BYTES_AT_OR_BELOW_SINGLE_REQUEST_MAXIMUM';
    policy: MediaProxyMasterR2PrivatePublicationPolicyV1;
  }>;
  multipart: Readonly<{
    eligibility: 'ACTUAL_BYTES_ABOVE_SINGLE_REQUEST_MAXIMUM';
    stateOwnerVersion:
      typeof MEDIA_PROXY_MASTER_R2_MULTIPART_MONGO_STORE_VERSION_V1;
    recordVersion: typeof MEDIA_PROXY_MASTER_R2_MULTIPART_RECORD_VERSION_V1;
    coordinatorVersion:
      typeof MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1;
    transportVersion:
      typeof MEDIA_PROXY_MASTER_R2_PRIVATE_MULTIPART_TRANSPORT_VERSION_V1;
    writeDisposition:
      'UNIQUE_SESSION_OBJECT_KEYS_NO_CROSS_SESSION_OVERWRITE';
    replayVerification: 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE';
    partPlan: 'DETERMINISTIC_UNIFORM_EXCEPT_FINAL';
    sourceRequirement:
      'EXACT_DURABLE_REOPENABLE_ARTIFACT_REQUIRED_UNTIL_PUBLISHED';
    minimumPartBytes: typeof R2_MIN_PART_BYTES;
    maximumPartBytes: typeof R2_MAX_PART_BYTES;
    maximumParts: typeof R2_MAX_PARTS;
    maximumObjectBytes: typeof R2_MAX_OBJECT_BYTES;
  }>;
  policySha256: string;
}>;

export type MediaProxyMasterR2ArtifactSourceDispositionV2 =
  | 'EPHEMERAL_LOCAL_FILE'
  | 'DURABLE_REOPENABLE_FILE';

export type MediaProxyMasterR2PublicationSelectionV2 = Readonly<
  | {
      disposition: 'ELIGIBLE';
      path: 'SINGLE_PUT';
      actualByteLength: number;
      policySha256: string;
    }
  | {
      disposition: 'ELIGIBLE';
      path: 'DURABLE_MULTIPART';
      actualByteLength: number;
      multipartPlan: Readonly<{ partSize: number; totalParts: number }>;
      policySha256: string;
    }
  | {
      disposition: 'BLOCKED';
      reason:
        | 'DURABLE_REOPENABLE_ARTIFACT_REQUIRED'
        | 'OBJECT_LIMIT_EXCEEDED';
      actualByteLength: number;
      policySha256: string;
    }
>;

export function createMediaProxyMasterR2PrivatePublicationPolicyV2(
  scope: MediaSourcePtsCadenceR2PrivateStorageScopeV1,
): MediaProxyMasterR2PrivatePublicationPolicyV2 {
  const singlePutPolicy = createMediaProxyMasterR2PrivatePublicationPolicyV1(
    scope,
  );
  const material = {
    schemaVersion: 2 as const,
    kind: MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_KIND_V2,
    policyVersion: MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2,
    selectionBasis: 'VERIFIED_ACTUAL_ARTIFACT_BYTE_LENGTH' as const,
    singlePut: {
      eligibility: 'ACTUAL_BYTES_AT_OR_BELOW_SINGLE_REQUEST_MAXIMUM' as const,
      policy: singlePutPolicy,
    },
    multipart: {
      eligibility: 'ACTUAL_BYTES_ABOVE_SINGLE_REQUEST_MAXIMUM' as const,
      stateOwnerVersion:
        MEDIA_PROXY_MASTER_R2_MULTIPART_MONGO_STORE_VERSION_V1,
      recordVersion: MEDIA_PROXY_MASTER_R2_MULTIPART_RECORD_VERSION_V1,
      coordinatorVersion: MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1,
      transportVersion:
        MEDIA_PROXY_MASTER_R2_PRIVATE_MULTIPART_TRANSPORT_VERSION_V1,
      writeDisposition:
        'UNIQUE_SESSION_OBJECT_KEYS_NO_CROSS_SESSION_OVERWRITE' as const,
      replayVerification: 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE' as const,
      partPlan: 'DETERMINISTIC_UNIFORM_EXCEPT_FINAL' as const,
      sourceRequirement:
        'EXACT_DURABLE_REOPENABLE_ARTIFACT_REQUIRED_UNTIL_PUBLISHED' as const,
      minimumPartBytes: R2_MIN_PART_BYTES,
      maximumPartBytes: R2_MAX_PART_BYTES,
      maximumParts: R2_MAX_PARTS,
      maximumObjectBytes: R2_MAX_OBJECT_BYTES,
    },
  } as const;
  return deepFreezeEditronJsonV1({
    ...material,
    policySha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaProxyMasterR2PrivatePublicationPolicyV2(
  value: unknown,
): MediaProxyMasterR2PrivatePublicationPolicyV2 {
  const policy = object(value, 'POLICY_INVALID');
  exactKeys(policy, [
    'kind', 'multipart', 'policySha256', 'policyVersion', 'schemaVersion',
    'selectionBasis', 'singlePut',
  ]);
  if (policy.schemaVersion !== 2
    || policy.kind !== MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_KIND_V2
    || policy.policyVersion
      !== MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2
    || policy.selectionBasis !== 'VERIFIED_ACTUAL_ARTIFACT_BYTE_LENGTH') {
    fail('IDENTITY_INVALID');
  }
  const singlePut = object(policy.singlePut, 'SINGLE_PUT_INVALID');
  exactKeys(singlePut, ['eligibility', 'policy']);
  if (singlePut.eligibility
    !== 'ACTUAL_BYTES_AT_OR_BELOW_SINGLE_REQUEST_MAXIMUM') {
    fail('SINGLE_PUT_IDENTITY_INVALID');
  }
  const singlePutPolicy = assertMediaProxyMasterR2PrivatePublicationPolicyV1(
    singlePut.policy,
  );
  const multipart = object(policy.multipart, 'MULTIPART_INVALID');
  exactKeys(multipart, [
    'coordinatorVersion', 'eligibility', 'maximumObjectBytes',
    'maximumPartBytes', 'maximumParts', 'minimumPartBytes', 'partPlan',
    'recordVersion', 'replayVerification', 'sourceRequirement',
    'stateOwnerVersion', 'transportVersion', 'writeDisposition',
  ]);
  if (multipart.eligibility !== 'ACTUAL_BYTES_ABOVE_SINGLE_REQUEST_MAXIMUM'
    || multipart.stateOwnerVersion
      !== MEDIA_PROXY_MASTER_R2_MULTIPART_MONGO_STORE_VERSION_V1
    || multipart.recordVersion !== MEDIA_PROXY_MASTER_R2_MULTIPART_RECORD_VERSION_V1
    || multipart.coordinatorVersion
      !== MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1
    || multipart.transportVersion
      !== MEDIA_PROXY_MASTER_R2_PRIVATE_MULTIPART_TRANSPORT_VERSION_V1
    || multipart.writeDisposition
      !== 'UNIQUE_SESSION_OBJECT_KEYS_NO_CROSS_SESSION_OVERWRITE'
    || multipart.replayVerification
      !== 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE'
    || multipart.partPlan !== 'DETERMINISTIC_UNIFORM_EXCEPT_FINAL'
    || multipart.sourceRequirement
      !== 'EXACT_DURABLE_REOPENABLE_ARTIFACT_REQUIRED_UNTIL_PUBLISHED'
    || multipart.minimumPartBytes !== R2_MIN_PART_BYTES
    || multipart.maximumPartBytes !== R2_MAX_PART_BYTES
    || multipart.maximumParts !== R2_MAX_PARTS
    || multipart.maximumObjectBytes !== R2_MAX_OBJECT_BYTES) {
    fail('MULTIPART_IDENTITY_INVALID');
  }
  const rebuilt = createMediaProxyMasterR2PrivatePublicationPolicyV2({
    bucketName: singlePutPolicy.bucketName,
    storagePolicyVersion: singlePutPolicy.storagePolicyVersion,
    browserRouteExposure: singlePutPolicy.browserRouteExposure,
  });
  if (sha256(policy.policySha256) !== rebuilt.policySha256) {
    fail('HASH_MISMATCH');
  }
  return rebuilt;
}

export function selectMediaProxyMasterR2PublicationPathV2(input: Readonly<{
  policy: MediaProxyMasterR2PrivatePublicationPolicyV2;
  actualByteLength: number;
  artifactSource: MediaProxyMasterR2ArtifactSourceDispositionV2;
}>): MediaProxyMasterR2PublicationSelectionV2 {
  const policy = assertMediaProxyMasterR2PrivatePublicationPolicyV2(
    input.policy,
  );
  const actualByteLength = positiveSafeInteger(input.actualByteLength);
  if (input.artifactSource !== 'EPHEMERAL_LOCAL_FILE'
    && input.artifactSource !== 'DURABLE_REOPENABLE_FILE') {
    fail('ARTIFACT_SOURCE_INVALID');
  }
  if (actualByteLength <= policy.singlePut.policy.maximumSingleRequestBytes) {
    return Object.freeze({
      disposition: 'ELIGIBLE' as const,
      path: 'SINGLE_PUT' as const,
      actualByteLength,
      policySha256: policy.policySha256,
    });
  }
  if (actualByteLength > policy.multipart.maximumObjectBytes) {
    return Object.freeze({
      disposition: 'BLOCKED' as const,
      reason: 'OBJECT_LIMIT_EXCEEDED' as const,
      actualByteLength,
      policySha256: policy.policySha256,
    });
  }
  if (input.artifactSource !== 'DURABLE_REOPENABLE_FILE') {
    return Object.freeze({
      disposition: 'BLOCKED' as const,
      reason: 'DURABLE_REOPENABLE_ARTIFACT_REQUIRED' as const,
      actualByteLength,
      policySha256: policy.policySha256,
    });
  }
  return Object.freeze({
    disposition: 'ELIGIBLE' as const,
    path: 'DURABLE_MULTIPART' as const,
    actualByteLength,
    multipartPlan: Object.freeze(resolveMultipartPlan(actualByteLength)),
    policySha256: policy.policySha256,
  });
}

function positiveSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    fail('ACTUAL_BYTE_LENGTH_INVALID');
  }
  return value as number;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(label);
  }
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
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail('SHA256_INVALID');
  }
  return value;
}

function fail(code: string): never {
  throw new MediaProxyMasterR2PrivatePublicationPolicyErrorV2(code);
}

export class MediaProxyMasterR2PrivatePublicationPolicyErrorV2 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_V2_${code}`);
    this.name = 'MediaProxyMasterR2PrivatePublicationPolicyErrorV2';
  }
}
