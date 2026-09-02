import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  createMediaProxyMasterR2PrivateSinglePutPublisherV1,
  MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1,
  MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLISHER_VERSION_V1,
} from './media-proxy-master-r2-private-publisher-v1';
import type { MediaProxyMasterTranscodePublisherPortV1 }
  from './media-proxy-master-trusted-transcode-executor-v1';
import type {
  MediaSourcePtsCadenceR2CommandClientV1,
  MediaSourcePtsCadenceR2PrivateStorageScopeV1,
} from './media-source-pts-cadence-r2-private-sidecar-v1';

export const MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_V1' as const;
export const MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V1 =
  'editron-media-proxy-master-r2-private-publication-policy-v1' as const;

const PRIVATE_CACHE_CONTROL = 'private, no-store, max-age=0' as const;
const CONTENT_DISPOSITION = 'inline' as const;
const ARTIFACT_PROFILE = 'EDITRON_MEDIA_PROXY_MASTER_MP4_V1' as const;
const PRIVATE_BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type MediaProxyMasterR2PrivatePublicationPolicyV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_KIND_V1;
  policyVersion:
    typeof MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V1;
  publisherVersion: typeof MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLISHER_VERSION_V1;
  bucketName: string;
  storagePolicyVersion: string;
  browserRouteExposure: 'NO_BROWSER_ROUTE';
  objectVisibility: 'PRIVATE';
  artifactProfile: typeof ARTIFACT_PROFILE;
  contentType: 'video/mp4';
  cacheControl: typeof PRIVATE_CACHE_CONTROL;
  contentDisposition: typeof CONTENT_DISPOSITION;
  writeDisposition: 'CREATE_ONLY_IF_NONE_MATCH_STAR';
  replayVerification: 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE';
  maximumSingleRequestBytes:
    typeof MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1;
  largeObjectDisposition: 'REQUIRES_DURABLE_MULTIPART_OWNER';
  policySha256: string;
}>;

export type MediaProxyMasterR2PrivateBoundSinglePutPublisherV1 = Readonly<{
  publicationPolicy: MediaProxyMasterR2PrivatePublicationPolicyV1;
  publisher: MediaProxyMasterTranscodePublisherPortV1;
}>;

export function createMediaProxyMasterR2PrivatePublicationPolicyV1(
  value: MediaSourcePtsCadenceR2PrivateStorageScopeV1,
): MediaProxyMasterR2PrivatePublicationPolicyV1 {
  const scope = normalizePrivateStorageScope(value);
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_KIND_V1,
    policyVersion: MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V1,
    publisherVersion: MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLISHER_VERSION_V1,
    bucketName: scope.bucketName,
    storagePolicyVersion: scope.storagePolicyVersion,
    browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
    objectVisibility: 'PRIVATE' as const,
    artifactProfile: ARTIFACT_PROFILE,
    contentType: 'video/mp4' as const,
    cacheControl: PRIVATE_CACHE_CONTROL,
    contentDisposition: CONTENT_DISPOSITION,
    writeDisposition: 'CREATE_ONLY_IF_NONE_MATCH_STAR' as const,
    replayVerification: 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE' as const,
    maximumSingleRequestBytes: MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1,
    largeObjectDisposition: 'REQUIRES_DURABLE_MULTIPART_OWNER' as const,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    policySha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaProxyMasterR2PrivatePublicationPolicyV1(
  value: unknown,
): MediaProxyMasterR2PrivatePublicationPolicyV1 {
  const record = object(
    value,
    'MEDIA_PROXY_MASTER_R2_PUBLICATION_POLICY_INVALID',
  );
  exactKeys(record, [
    'artifactProfile', 'browserRouteExposure', 'bucketName', 'cacheControl',
    'contentDisposition', 'contentType', 'kind', 'largeObjectDisposition',
    'maximumSingleRequestBytes', 'objectVisibility', 'policySha256',
    'policyVersion', 'publisherVersion', 'replayVerification', 'schemaVersion',
    'storagePolicyVersion', 'writeDisposition',
  ]);
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_KIND_V1
    || record.policyVersion
      !== MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V1
    || record.publisherVersion !== MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLISHER_VERSION_V1
    || record.browserRouteExposure !== 'NO_BROWSER_ROUTE'
    || record.objectVisibility !== 'PRIVATE'
    || record.artifactProfile !== ARTIFACT_PROFILE
    || record.contentType !== 'video/mp4'
    || record.cacheControl !== PRIVATE_CACHE_CONTROL
    || record.contentDisposition !== CONTENT_DISPOSITION
    || record.writeDisposition !== 'CREATE_ONLY_IF_NONE_MATCH_STAR'
    || record.replayVerification !== 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE'
    || record.maximumSingleRequestBytes
      !== MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1
    || record.largeObjectDisposition !== 'REQUIRES_DURABLE_MULTIPART_OWNER') {
    fail('MEDIA_PROXY_MASTER_R2_PUBLICATION_POLICY_IDENTITY_INVALID');
  }
  const rebuilt = createMediaProxyMasterR2PrivatePublicationPolicyV1({
    bucketName: record.bucketName as string,
    storagePolicyVersion: record.storagePolicyVersion as string,
    browserRouteExposure: 'NO_BROWSER_ROUTE',
  });
  if (sha256(record.policySha256) !== rebuilt.policySha256) {
    fail('MEDIA_PROXY_MASTER_R2_PUBLICATION_POLICY_HASH_MISMATCH');
  }
  return rebuilt;
}

export function createMediaProxyMasterR2PrivateBoundSinglePutPublisherV1(
  input: Readonly<{
    privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
    client: MediaSourcePtsCadenceR2CommandClientV1;
  }>,
): MediaProxyMasterR2PrivateBoundSinglePutPublisherV1 {
  const publicationPolicy = createMediaProxyMasterR2PrivatePublicationPolicyV1(
    input.privateStorage,
  );
  const publisher = createMediaProxyMasterR2PrivateSinglePutPublisherV1(input);
  return Object.freeze({ publicationPolicy, publisher });
}

function normalizePrivateStorageScope(
  value: MediaSourcePtsCadenceR2PrivateStorageScopeV1,
): MediaSourcePtsCadenceR2PrivateStorageScopeV1 {
  if (!value || value.browserRouteExposure !== 'NO_BROWSER_ROUTE'
    || value.bucketName === 'editron-cdn'
    || !PRIVATE_BUCKET.test(value.bucketName)
    || typeof value.storagePolicyVersion !== 'string'
    || value.storagePolicyVersion.trim() !== value.storagePolicyVersion
    || value.storagePolicyVersion.length < 1
    || value.storagePolicyVersion.length > 256
    || /[\u0000-\u001F\u007F]/.test(value.storagePolicyVersion)) {
    fail('MEDIA_PROXY_MASTER_R2_PUBLICATION_POLICY_PRIVATE_STORAGE_INVALID');
  }
  return Object.freeze({
    bucketName: value.bucketName,
    storagePolicyVersion: value.storagePolicyVersion,
    browserRouteExposure: 'NO_BROWSER_ROUTE',
  });
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) {
    fail('MEDIA_PROXY_MASTER_R2_PUBLICATION_POLICY_FIELDS_INVALID');
  }
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail('MEDIA_PROXY_MASTER_R2_PUBLICATION_POLICY_SHA256_INVALID');
  }
  return value;
}

function fail(code: string): never {
  throw new Error(code);
}
