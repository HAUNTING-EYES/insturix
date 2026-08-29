import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import path from 'node:path';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import type { NativeMediaFinalRenderArtifactStagerPortV1 } from './native-media-final-render-ffmpeg-encoder-v1';
import type { NativeMediaFinalRenderPublisherPortV1 } from './native-media-final-render-materializer-v1';
import {
  createNativeMediaFinalRenderArtifactV1,
  createNativeMediaFinalRenderSourceLeaseV1,
  type NativeMediaFinalRenderArtifactV1,
} from './native-media-final-render-source-preparation-v1';
import type {
  MediaSourcePtsCadenceR2CommandClientV1,
  MediaSourcePtsCadenceR2PrivateStorageScopeV1,
} from './media-source-pts-cadence-r2-private-sidecar-v1';

const MEBIBYTE = 1024 * 1024;
const R2_MAX_SINGLE_UPLOAD_BYTES = 5 * 1024 * MEBIBYTE - 5 * MEBIBYTE;
const R2_MAX_PRESIGNED_EXPIRY_MS = 7 * 24 * 60 * 60 * 1_000;
const PRIVATE_CACHE_CONTROL = 'private, no-store, max-age=0';
const ARTIFACT_PROFILE = 'EDITRON_EXACT_TIMESTAMP_AV_MEZZANINE_V1';
const PUBLISH_HANDLE = /^nmfrpubv1_([a-f0-9]{64})$/;
const LEASE_IDENTIFIER = /^[a-f0-9]{32}$/;

export const NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_V1' as const;

export type NativeMediaFinalRenderR2PrivateArtifactPolicyV1 = Readonly<{
  policyVersion: typeof NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1;
  maxArtifactBytes: number;
  defaultLeaseTtlMs: number;
  maximumLeaseTtlMs: number;
}>;

const NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_DEFAULT_POLICY_V1:
NativeMediaFinalRenderR2PrivateArtifactPolicyV1 = Object.freeze({
  policyVersion: NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
  maxArtifactBytes: R2_MAX_SINGLE_UPLOAD_BYTES,
  defaultLeaseTtlMs: 60 * 60 * 1_000,
  maximumLeaseTtlMs: R2_MAX_PRESIGNED_EXPIRY_MS,
});

export type NativeMediaFinalRenderR2PresignGetObjectV1 = (
  input: Readonly<{
    bucketName: string;
    objectKey: string;
    expiresInSeconds: number;
  }>,
) => Promise<string>;

type NativeMediaFinalRenderR2PrivateArtifactPortsV1 = Readonly<{
  stager: NativeMediaFinalRenderArtifactStagerPortV1;
  publisher: NativeMediaFinalRenderPublisherPortV1;
}>;

/**
 * Stores exact render intermediates in the existing server-only media bucket.
 * The object is content-addressed and create-only; publication grants only one
 * expiring GetObject lease and never introduces a browser-facing bucket route.
 */
export function createNativeMediaFinalRenderR2PrivateArtifactPortsV1(input: Readonly<{
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
  endpoint: string;
  client: MediaSourcePtsCadenceR2CommandClientV1;
  presignGetObject: NativeMediaFinalRenderR2PresignGetObjectV1;
  policy?: NativeMediaFinalRenderR2PrivateArtifactPolicyV1;
  now?: () => number;
  randomIdentifier?: () => string;
}>): NativeMediaFinalRenderR2PrivateArtifactPortsV1 {
  const storage = normalizeStorage(input.privateStorage, input.endpoint, input.client);
  const policy = normalizePolicy(
    input.policy ?? NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_DEFAULT_POLICY_V1,
  );
  if (typeof input.presignGetObject !== 'function') {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_PRESIGNER_INVALID');
  }
  const now = input.now ?? Date.now;
  const randomIdentifier = input.randomIdentifier ?? defaultRandomIdentifier;

  const stager: NativeMediaFinalRenderArtifactStagerPortV1 = {
    async stage(stageInput) {
      const artifact = normalizeStageInput(stageInput, policy);
      await verifyLocalArtifact(artifact);
      const key = objectKey(artifact.artifactContentSha256);
      try {
        await storage.client.send(new PutObjectCommand({
          Bucket: storage.bucketName,
          Key: key,
          Body: createReadStream(artifact.localPath),
          ContentLength: artifact.artifactByteLength,
          ContentType: artifact.contentType,
          CacheControl: PRIVATE_CACHE_CONTROL,
          ContentDisposition: 'inline',
          IfNoneMatch: '*',
          Metadata: objectMetadata(artifact),
        }));
      } catch (error) {
        if (!isPreconditionFailed(error)) {
          throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_WRITE_FAILED');
        }
      }
      await verifyStoredArtifact({ ...storage, key, expected: artifact });
      return Object.freeze({
        publishHandle: `nmfrpubv1_${artifact.artifactContentSha256}`,
        artifactHandle: `nmfrv1_${artifact.artifactContentSha256}`,
        artifactContentSha256: artifact.artifactContentSha256,
        artifactByteLength: String(artifact.artifactByteLength),
      });
    },
  };

  const publisher: NativeMediaFinalRenderPublisherPortV1 = {
    async publish(publishInput) {
      try {
        const artifact = revalidateArtifact(publishInput?.artifact);
        const contentSha256 = publishHandleHash(publishInput?.publishHandle);
        if (contentSha256 !== artifact.artifactContentSha256
          || artifact.artifactHandle !== `nmfrv1_${contentSha256}`) {
          throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_PUBLISH_SCOPE_MISMATCH');
        }
        const expected = normalizeStoredArtifactExpectation(artifact, policy);
        const key = objectKey(contentSha256);
        await verifyStoredArtifact({ ...storage, key, expected });

        const issuedAtEpochMs = epochMs(now());
        const expiresInSeconds = leaseExpirySeconds({
          issuedAtEpochMs,
          minimumExpiresAtEpochMs: epochMs(publishInput.minimumExpiresAtEpochMs),
          policy,
        });
        let sourceUrl: string;
        try {
          sourceUrl = await input.presignGetObject({
            bucketName: storage.bucketName,
            objectKey: key,
            expiresInSeconds,
          });
        } catch {
          throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_SIGNING_FAILED');
        }
        sourceUrl = assertPresignedSourceUrl({
          value: sourceUrl,
          endpoint: storage.endpoint,
          bucketName: storage.bucketName,
          objectKey: key,
          expiresInSeconds,
        });
        const identifier = randomIdentifier();
        if (typeof identifier !== 'string' || !LEASE_IDENTIFIER.test(identifier)) {
          throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_LEASE_ID_INVALID');
        }
        const lease = createNativeMediaFinalRenderSourceLeaseV1({
          leaseId: `nmfrleasev1_${identifier}`,
          artifact,
          sourceUrl,
          issuedAtEpochMs,
          expiresAtEpochMs: issuedAtEpochMs + expiresInSeconds * 1_000,
        });
        return Object.freeze({ disposition: 'SOURCE_PUBLISHED' as const, lease });
      } catch (error) {
        return Object.freeze({
          disposition: 'UNVERIFIABLE' as const,
          diagnostic: diagnostic(error) ?? 'NATIVE_MEDIA_FINAL_RENDER_R2_PUBLISH_FAILED',
        });
      }
    },
  };

  return Object.freeze({ stager, publisher });
}

type StoredArtifactExpectationV1 = Readonly<{
  contentType: 'video/x-matroska';
  artifactContentSha256: string;
  artifactByteLength: number;
  transformSha256: string;
  profileReceiptSha256: string;
}>;

async function verifyLocalArtifact(
  artifact: StoredArtifactExpectationV1 & Readonly<{ localPath: string }>,
): Promise<void> {
  let metadata: Awaited<ReturnType<typeof lstat>>;
  try {
    metadata = await lstat(artifact.localPath);
  } catch {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_LOCAL_ARTIFACT_INVALID');
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()
    || metadata.size !== artifact.artifactByteLength) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_LOCAL_ARTIFACT_INVALID');
  }
  let observed: Readonly<{ byteLength: number; contentSha256: string }>;
  try {
    observed = await digestByteStream(
      createReadStream(artifact.localPath),
      artifact.artifactByteLength,
    );
  } catch {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_LOCAL_ARTIFACT_READ_FAILED');
  }
  if (observed.contentSha256 !== artifact.artifactContentSha256) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_LOCAL_ARTIFACT_HASH_MISMATCH');
  }
}

async function verifyStoredArtifact(input: Readonly<{
  client: MediaSourcePtsCadenceR2CommandClientV1;
  bucketName: string;
  key: string;
  expected: StoredArtifactExpectationV1;
}>): Promise<void> {
  let response: unknown;
  try {
    response = await input.client.send(new GetObjectCommand({
      Bucket: input.bucketName,
      Key: input.key,
    }));
  } catch {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_READ_FAILED');
  }
  if (!response || typeof response !== 'object') {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_RESPONSE_INVALID');
  }
  const candidate = response as {
    Body?: unknown;
    CacheControl?: unknown;
    ContentLength?: unknown;
    ContentType?: unknown;
    Metadata?: unknown;
  };
  const metadata = candidate.Metadata && typeof candidate.Metadata === 'object'
    ? candidate.Metadata as Record<string, unknown>
    : null;
  if (candidate.CacheControl !== PRIVATE_CACHE_CONTROL
    || candidate.ContentLength !== input.expected.artifactByteLength
    || candidate.ContentType !== input.expected.contentType
    || metadata?.artifactprofile !== ARTIFACT_PROFILE
    || metadata?.contentsha256 !== input.expected.artifactContentSha256
    || metadata?.bytelength !== String(input.expected.artifactByteLength)
    || metadata?.transformsha256 !== input.expected.transformSha256
    || metadata?.profilereceiptsha256 !== input.expected.profileReceiptSha256) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_HEADERS_OR_METADATA_INVALID');
  }
  let observed: Awaited<ReturnType<typeof digestByteStream>>;
  try {
    observed = await digestByteStream(candidate.Body, input.expected.artifactByteLength);
  } catch {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_CONTENT_LENGTH_MISMATCH');
  }
  if (observed.contentSha256 !== input.expected.artifactContentSha256) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_CONTENT_HASH_MISMATCH');
  }
}

async function digestByteStream(
  body: unknown,
  expectedByteLength: number,
): Promise<Readonly<{ byteLength: number; contentSha256: string }>> {
  const digest = createHash('sha256');
  let byteLength = 0;
  if (body instanceof Uint8Array) {
    byteLength = body.byteLength;
    if (byteLength > expectedByteLength) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_CONTENT_LENGTH_MISMATCH');
    }
    digest.update(body);
  } else {
    if (!isAsyncIterable(body)) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_BODY_INVALID');
    }
    for await (const chunk of body) {
      if (!(chunk instanceof Uint8Array)
        || byteLength + chunk.byteLength > expectedByteLength) {
        throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_CONTENT_LENGTH_MISMATCH');
      }
      byteLength += chunk.byteLength;
      digest.update(chunk);
    }
  }
  if (byteLength !== expectedByteLength) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_CONTENT_LENGTH_MISMATCH');
  }
  return Object.freeze({ byteLength, contentSha256: digest.digest('hex') });
}

function normalizeStageInput(
  value: Parameters<NativeMediaFinalRenderArtifactStagerPortV1['stage']>[0],
  policy: NativeMediaFinalRenderR2PrivateArtifactPolicyV1,
): StoredArtifactExpectationV1 & Readonly<{ localPath: string }> {
  if (!value || value.contentType !== 'video/x-matroska'
    || typeof value.localPath !== 'string' || !path.isAbsolute(value.localPath)
    || !value.localPath.trim() || value.localPath.length > 4_096
    || /[\u0000-\u001F\u007F]/.test(value.localPath)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_STAGE_INPUT_INVALID');
  }
  const artifactByteLength = positiveIntegerTextToNumber(
    value.artifactByteLength,
    'NATIVE_MEDIA_FINAL_RENDER_R2_ARTIFACT_SIZE_INVALID',
  );
  if (artifactByteLength > policy.maxArtifactBytes) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_SINGLE_UPLOAD_LIMIT_EXCEEDED');
  }
  return Object.freeze({
    localPath: value.localPath,
    contentType: value.contentType,
    artifactContentSha256: sha256(value.artifactContentSha256),
    artifactByteLength,
    transformSha256: sha256(value.transformSha256),
    profileReceiptSha256: sha256(value.profileReceiptSha256),
  });
}

function normalizeStoredArtifactExpectation(
  artifact: NativeMediaFinalRenderArtifactV1,
  policy: NativeMediaFinalRenderR2PrivateArtifactPolicyV1,
): StoredArtifactExpectationV1 {
  const artifactByteLength = positiveIntegerTextToNumber(
    artifact.artifactByteLength,
    'NATIVE_MEDIA_FINAL_RENDER_R2_ARTIFACT_SIZE_INVALID',
  );
  if (artifactByteLength > policy.maxArtifactBytes) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_SINGLE_UPLOAD_LIMIT_EXCEEDED');
  }
  return Object.freeze({
    contentType: 'video/x-matroska',
    artifactContentSha256: artifact.artifactContentSha256,
    artifactByteLength,
    transformSha256: artifact.transformSha256,
    profileReceiptSha256: artifact.remotionCompatibilityReceiptSha256,
  });
}

function revalidateArtifact(value: NativeMediaFinalRenderArtifactV1): NativeMediaFinalRenderArtifactV1 {
  if (!value || typeof value !== 'object') {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_ARTIFACT_INVALID');
  }
  const { artifactBindingSha256, ...material } = value;
  let recreated: NativeMediaFinalRenderArtifactV1;
  try {
    recreated = createNativeMediaFinalRenderArtifactV1(material);
  } catch {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_ARTIFACT_INVALID');
  }
  if (recreated.artifactBindingSha256 !== artifactBindingSha256) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_ARTIFACT_INVALID');
  }
  return recreated;
}

function objectMetadata(value: StoredArtifactExpectationV1): Record<string, string> {
  return {
    artifactprofile: ARTIFACT_PROFILE,
    contentsha256: value.artifactContentSha256,
    bytelength: String(value.artifactByteLength),
    transformsha256: value.transformSha256,
    profilereceiptsha256: value.profileReceiptSha256,
  };
}

function objectKey(contentSha256: string): string {
  const digest = sha256(contentSha256);
  return `private/editron/native-media-final-render/v1/${digest.slice(0, 2)}/${digest}.mkv`;
}

function publishHandleHash(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_PUBLISH_HANDLE_INVALID');
  }
  const match = PUBLISH_HANDLE.exec(value);
  if (!match) throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_PUBLISH_HANDLE_INVALID');
  return match[1]!;
}

function leaseExpirySeconds(input: Readonly<{
  issuedAtEpochMs: number;
  minimumExpiresAtEpochMs: number;
  policy: NativeMediaFinalRenderR2PrivateArtifactPolicyV1;
}>): number {
  const minimumRemainingMs = Math.max(
    0,
    input.minimumExpiresAtEpochMs - input.issuedAtEpochMs,
  );
  const requestedMs = Math.max(input.policy.defaultLeaseTtlMs, minimumRemainingMs);
  const expiresInSeconds = Math.ceil(requestedMs / 1_000);
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1
    || expiresInSeconds * 1_000 > input.policy.maximumLeaseTtlMs) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_LEASE_LIMIT_EXCEEDED');
  }
  return expiresInSeconds;
}

function assertPresignedSourceUrl(input: Readonly<{
  value: unknown;
  endpoint: URL;
  bucketName: string;
  objectKey: string;
  expiresInSeconds: number;
}>): string {
  if (typeof input.value !== 'string' || input.value.length > 512) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_SIGNED_URL_INVALID');
  }
  let url: URL;
  try {
    url = new URL(input.value);
  } catch {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_SIGNED_URL_INVALID');
  }
  const virtualHost = `${input.bucketName}.${input.endpoint.hostname}`;
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_SIGNED_URL_INVALID');
  }
  const pathStyle = url.hostname === input.endpoint.hostname
    && pathname === `/${input.bucketName}/${input.objectKey}`;
  const virtualHosted = url.hostname === virtualHost
    && pathname === `/${input.objectKey}`;
  if (url.protocol !== 'https:' || url.username || url.password || url.hash
    || url.port || (!pathStyle && !virtualHosted)
    || url.searchParams.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256'
    || !/^\d{8}T\d{6}Z$/.test(url.searchParams.get('X-Amz-Date') ?? '')
    || url.searchParams.get('X-Amz-Expires') !== String(input.expiresInSeconds)
    || !(url.searchParams.get('X-Amz-Credential') ?? '').includes('/')
    || !/^[a-f0-9]{64}$/i.test(url.searchParams.get('X-Amz-Signature') ?? '')) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_SIGNED_URL_INVALID');
  }
  return url.toString();
}

function normalizeStorage(
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1,
  endpointValue: unknown,
  client: MediaSourcePtsCadenceR2CommandClientV1,
) {
  if (!privateStorage || privateStorage.browserRouteExposure !== 'NO_BROWSER_ROUTE'
    || privateStorage.bucketName === 'editron-cdn'
    || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(privateStorage.bucketName)
    || typeof privateStorage.storagePolicyVersion !== 'string'
    || !privateStorage.storagePolicyVersion.trim()) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_STORAGE_INVALID');
  }
  if (!client || typeof client.send !== 'function') {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_CLIENT_INVALID');
  }
  let endpoint: URL;
  try {
    endpoint = new URL(String(endpointValue));
  } catch {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_ENDPOINT_INVALID');
  }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password
    || endpoint.port || endpoint.pathname !== '/' || endpoint.search || endpoint.hash
    || !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/i.test(endpoint.hostname)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_ENDPOINT_INVALID');
  }
  return Object.freeze({
    bucketName: privateStorage.bucketName,
    endpoint,
    client,
  });
}

function normalizePolicy(
  value: NativeMediaFinalRenderR2PrivateArtifactPolicyV1,
): NativeMediaFinalRenderR2PrivateArtifactPolicyV1 {
  if (!value
    || value.policyVersion !== NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1
    || !positiveSafeInteger(value.maxArtifactBytes)
    || value.maxArtifactBytes > R2_MAX_SINGLE_UPLOAD_BYTES
    || !wholeSecondMs(value.defaultLeaseTtlMs)
    || !wholeSecondMs(value.maximumLeaseTtlMs)
    || value.defaultLeaseTtlMs > value.maximumLeaseTtlMs
    || value.maximumLeaseTtlMs > R2_MAX_PRESIGNED_EXPIRY_MS) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_POLICY_INVALID');
  }
  return Object.freeze({ ...value });
}

function positiveIntegerTextToNumber(value: unknown, code: string): number {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value)) {
    throw new Error(code);
  }
  const integer = BigInt(value);
  if (integer > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(code);
  return Number(integer);
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_SHA256_INVALID');
  }
  return value;
}

function epochMs(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_R2_LEASE_TIME_INVALID');
  }
  return Number(value);
}

function wholeSecondMs(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 1_000 && Number(value) % 1_000 === 0;
}

function positiveSafeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(value) && (typeof value === 'object' || typeof value === 'function')
    && Symbol.asyncIterator in (value as object)
    && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function';
}

function isPreconditionFailed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === 'PreconditionFailed'
    || candidate.$metadata?.httpStatusCode === 412;
}

function defaultRandomIdentifier(): string {
  return randomBytes(16).toString('hex');
}

function diagnostic(error: unknown): string | null {
  return error instanceof Error && /^[A-Z0-9_]{1,200}$/.test(error.message)
    ? error.message
    : null;
}
