import { createHash, randomBytes } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import type { ProjectRevisionV1 } from './project-service';
import type { NativeMediaTimestampPreviewSurfaceStorePortV1 } from './native-media-timestamp-ffmpeg-preview-decoder-v1';
import type {
  MediaSourcePtsCadenceR2CommandClientV1,
  MediaSourcePtsCadenceR2PrivateStorageScopeV1,
} from './media-source-pts-cadence-r2-private-sidecar-v1';

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_SURFACE_POLICY_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_SURFACE_R2_V1' as const;

const HANDLE_PATTERN = /^nmpv1_([a-f0-9]{64})$/;
const OBJECT_KEY_PREFIX = 'private/editron/native-media-preview/v1/';
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ABSOLUTE_MAX_PNG_BYTES = 256 * 1024 * 1024;
const ABSOLUTE_MAX_LEASE_TTL_MS = 24 * 60 * 60 * 1_000;
const PUT_ATTEMPTS = 3;

export type NativeMediaTimestampPreviewSurfaceLeaseScopeV1 = Readonly<{
  userId: string;
  projectId: string;
  sequenceId: string;
  overlayId: string;
  projectRevision: ProjectRevisionV1;
}>;

export type NativeMediaTimestampPreviewSurfacePolicyV1 = Readonly<{
  policyVersion: typeof NATIVE_MEDIA_TIMESTAMP_PREVIEW_SURFACE_POLICY_VERSION_V1;
  leaseTtlMs: number;
  maxPngBytes: number;
}>;

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_SURFACE_DEFAULT_POLICY_V1:
NativeMediaTimestampPreviewSurfacePolicyV1 = Object.freeze({
  policyVersion: NATIVE_MEDIA_TIMESTAMP_PREVIEW_SURFACE_POLICY_VERSION_V1,
  leaseTtlMs: 60 * 60 * 1_000,
  maxPngBytes: 64 * 1024 * 1024,
});

export type NativeMediaTimestampPreviewSurfaceBindingV1 = Readonly<{
  schemaVersion: 1;
  storage: 'R2_PRIVATE';
  pictureHandle: string;
  userId: string;
  projectId: string;
  projectRevision: ProjectRevisionV1;
  sequenceIdSha256: string;
  overlayIdSha256: string;
  decoderRequestSha256: string;
  decoderPictureRequestSha256: string;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  decodedPictureContentSha256: string;
  pngContentSha256: string;
  pngByteLength: number;
  width: number;
  height: number;
  expiresAtEpochMs: number;
}>;

export type NativeMediaTimestampPreviewSurfaceReadResultV1 = Readonly<
  | {
      disposition: 'AVAILABLE';
      binding: NativeMediaTimestampPreviewSurfaceBindingV1;
      pngBytes: Uint8Array;
    }
  | {
      disposition: 'EXPIRED';
      binding: NativeMediaTimestampPreviewSurfaceBindingV1;
    }
  | {
      disposition: 'NOT_FOUND';
      pictureHandle: string;
    }
>;

export interface NativeMediaTimestampPreviewSurfaceReaderPortV1 {
  readPicture(pictureHandle: string): Promise<NativeMediaTimestampPreviewSurfaceReadResultV1>;
}

type SurfaceDependenciesV1 = Readonly<{
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
  client: MediaSourcePtsCadenceR2CommandClientV1;
  policy: NativeMediaTimestampPreviewSurfacePolicyV1;
  now?: () => number;
}>;

/**
 * Creates one lease-bound decoder store. The returned handle is deliberately
 * not a storage URL: only the authenticated preview route may dereference it.
 */
export function createNativeMediaTimestampR2PreviewSurfaceStoreV1(
  input: SurfaceDependenciesV1 & Readonly<{
    leaseScope: NativeMediaTimestampPreviewSurfaceLeaseScopeV1;
    randomIdentifier?: () => string;
  }>,
): NativeMediaTimestampPreviewSurfaceStorePortV1 {
  const storage = normalizeStorage(input.privateStorage, input.client);
  const policy = normalizePolicy(input.policy);
  const leaseScope = normalizeLeaseScope(input.leaseScope);
  const now = input.now ?? Date.now;
  const randomIdentifier = input.randomIdentifier ?? (() => randomBytes(32).toString('hex'));

  return {
    async putPicture(picture) {
      const writtenAt = validEpochMs(now(), 'NATIVE_MEDIA_PREVIEW_SURFACE_CLOCK_INVALID');
      const expiresAtEpochMs = writtenAt + policy.leaseTtlMs;
      if (!Number.isSafeInteger(expiresAtEpochMs)) {
        throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_EXPIRY_INVALID');
      }
      const pngBytes = exactBytes(
        picture.pngBytes,
        policy.maxPngBytes,
        'NATIVE_MEDIA_PREVIEW_SURFACE_PNG_INVALID',
      );
      assertPng(pngBytes);
      const rgbaBytes = exactBytes(
        picture.rgbaBytes,
        ABSOLUTE_MAX_PNG_BYTES * 4,
        'NATIVE_MEDIA_PREVIEW_SURFACE_RGBA_INVALID',
      );
      const decodedPictureContentSha256 = sha256(
        picture.decodedPictureContentSha256,
        'NATIVE_MEDIA_PREVIEW_SURFACE_DECODED_HASH_INVALID',
      );
      if (digest(rgbaBytes) !== decodedPictureContentSha256) {
        throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_DECODED_CONTENT_MISMATCH');
      }
      const bindingMaterial = {
        schemaVersion: 1 as const,
        storage: 'R2_PRIVATE' as const,
        userId: leaseScope.userId,
        projectId: leaseScope.projectId,
        projectRevision: leaseScope.projectRevision,
        sequenceIdSha256: digestText(leaseScope.sequenceId),
        overlayIdSha256: digestText(leaseScope.overlayId),
        decoderRequestSha256: sha256(
          picture.decoderRequestSha256,
          'NATIVE_MEDIA_PREVIEW_SURFACE_DECODER_REQUEST_INVALID',
        ),
        decoderPictureRequestSha256: sha256(
          picture.pictureRequest.decoderPictureRequestSha256,
          'NATIVE_MEDIA_PREVIEW_SURFACE_PICTURE_REQUEST_INVALID',
        ),
        sourceVersionSha256: sha256(
          picture.sourceVersionSha256,
          'NATIVE_MEDIA_PREVIEW_SURFACE_SOURCE_VERSION_INVALID',
        ),
        storageVersionSha256: sha256(
          picture.storageVersionSha256,
          'NATIVE_MEDIA_PREVIEW_SURFACE_STORAGE_VERSION_INVALID',
        ),
        decodedPictureContentSha256,
        pngContentSha256: digest(pngBytes),
        pngByteLength: pngBytes.byteLength,
        width: positiveSafeInteger(picture.width, 'NATIVE_MEDIA_PREVIEW_SURFACE_WIDTH_INVALID'),
        height: positiveSafeInteger(picture.height, 'NATIVE_MEDIA_PREVIEW_SURFACE_HEIGHT_INVALID'),
        expiresAtEpochMs,
      };

      for (let attempt = 0; attempt < PUT_ATTEMPTS; attempt += 1) {
        const identifier = normalizeRandomIdentifier(randomIdentifier());
        const pictureHandle = `nmpv1_${identifier}`;
        const key = objectKey(pictureHandle);
        const binding = Object.freeze({ ...bindingMaterial, pictureHandle });
        try {
          await storage.client.send(new PutObjectCommand({
            Bucket: storage.bucketName,
            Key: key,
            Body: pngBytes,
            ContentLength: pngBytes.byteLength,
            ContentType: 'image/png',
            CacheControl: 'private, no-store, max-age=0',
            Expires: new Date(expiresAtEpochMs),
            IfNoneMatch: '*',
            Metadata: serializeBinding(binding),
          }));
        } catch (error) {
          if (isPreconditionFailed(error)) continue;
          throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_WRITE_FAILED');
        }
        try {
          const verified = await readStoredPicture({
            ...storage,
            pictureHandle,
            policy,
            now,
          });
          if (verified.disposition !== 'AVAILABLE'
            || !sameBinding(verified.binding, binding)
            || digest(verified.pngBytes) !== binding.pngContentSha256) {
            throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_WRITE_VERIFICATION_FAILED');
          }
          return { pictureHandle };
        } catch {
          await deleteObjectBestEffort(storage, pictureHandle);
          throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_WRITE_VERIFICATION_FAILED');
        }
      }
      throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_HANDLE_COLLISION');
    },
    async deletePicture(pictureHandle) {
      const normalized = normalizeHandle(pictureHandle);
      try {
        await storage.client.send(new DeleteObjectCommand({
          Bucket: storage.bucketName,
          Key: objectKey(normalized),
        }));
      } catch {
        throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_DELETE_FAILED');
      }
    },
  };
}

/** Server-only reader used by the authenticated preview route. */
export function createNativeMediaTimestampR2PreviewSurfaceReaderV1(
  input: SurfaceDependenciesV1,
): NativeMediaTimestampPreviewSurfaceReaderPortV1 {
  const storage = normalizeStorage(input.privateStorage, input.client);
  const policy = normalizePolicy(input.policy);
  const now = input.now ?? Date.now;
  return {
    async readPicture(pictureHandle) {
      return readStoredPicture({
        ...storage,
        pictureHandle: normalizeHandle(pictureHandle),
        policy,
        now,
      });
    },
  };
}

async function readStoredPicture(input: Readonly<{
  client: MediaSourcePtsCadenceR2CommandClientV1;
  bucketName: string;
  pictureHandle: string;
  policy: NativeMediaTimestampPreviewSurfacePolicyV1;
  now: () => number;
}>): Promise<NativeMediaTimestampPreviewSurfaceReadResultV1> {
  let response: unknown;
  try {
    response = await input.client.send(new GetObjectCommand({
      Bucket: input.bucketName,
      Key: objectKey(input.pictureHandle),
    }));
  } catch (error) {
    if (isNotFound(error)) {
      return { disposition: 'NOT_FOUND', pictureHandle: input.pictureHandle };
    }
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_READ_FAILED');
  }
  if (!response || typeof response !== 'object') {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_RESPONSE_INVALID');
  }
  const candidate = response as {
    Body?: unknown;
    CacheControl?: unknown;
    ContentLength?: unknown;
    ContentType?: unknown;
    Metadata?: unknown;
  };
  if (candidate.ContentType !== 'image/png'
    || candidate.CacheControl !== 'private, no-store, max-age=0') {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_HEADERS_INVALID');
  }
  const binding = parseBinding(candidate.Metadata, input.pictureHandle, input.policy);
  if (candidate.ContentLength !== binding.pngByteLength) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_BYTE_LENGTH_MISMATCH');
  }
  const observedNow = validEpochMs(input.now(), 'NATIVE_MEDIA_PREVIEW_SURFACE_CLOCK_INVALID');
  if (observedNow >= binding.expiresAtEpochMs) {
    await deleteObjectBestEffort(input, input.pictureHandle);
    return { disposition: 'EXPIRED', binding };
  }
  const pngBytes = await readExactlyBoundedBytes(
    candidate.Body,
    binding.pngByteLength,
    input.policy.maxPngBytes,
  );
  assertPng(pngBytes);
  if (digest(pngBytes) !== binding.pngContentSha256) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_CONTENT_MISMATCH');
  }
  return { disposition: 'AVAILABLE', binding, pngBytes };
}

function serializeBinding(binding: NativeMediaTimestampPreviewSurfaceBindingV1): Record<string, string> {
  return {
    binding: hashEditronCanonicalJsonV1(binding),
    schema: '1',
    policy: NATIVE_MEDIA_TIMESTAMP_PREVIEW_SURFACE_POLICY_VERSION_V1,
    handle: binding.pictureHandle,
    user: encodeText(binding.userId),
    project: encodeText(binding.projectId),
    revision: String(binding.projectRevision.value),
    updated: encodeText(binding.projectRevision.compatibilityUpdatedAt),
    sequence: binding.sequenceIdSha256,
    overlay: binding.overlayIdSha256,
    decoder: binding.decoderRequestSha256,
    picture: binding.decoderPictureRequestSha256,
    source: binding.sourceVersionSha256,
    storage: binding.storageVersionSha256,
    decoded: binding.decodedPictureContentSha256,
    png: binding.pngContentSha256,
    bytes: String(binding.pngByteLength),
    width: String(binding.width),
    height: String(binding.height),
    expires: String(binding.expiresAtEpochMs),
  };
}

function parseBinding(
  value: unknown,
  pictureHandle: string,
  policy: NativeMediaTimestampPreviewSurfacePolicyV1,
): NativeMediaTimestampPreviewSurfaceBindingV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_METADATA_INVALID');
  }
  const metadata = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key.toLowerCase(), entry]),
  );
  const expectedKeys = [
    'binding', 'bytes', 'decoded', 'decoder', 'expires', 'handle', 'height', 'overlay',
    'picture', 'png', 'policy', 'project', 'revision', 'schema', 'sequence',
    'source', 'storage', 'updated', 'user', 'width',
  ];
  const actualKeys = Object.keys(metadata).sort();
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_METADATA_FIELDS_INVALID');
  }
  if (metadata.schema !== '1'
    || metadata.policy !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_SURFACE_POLICY_VERSION_V1
    || metadata.handle !== pictureHandle) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_METADATA_SCOPE_INVALID');
  }
  const binding = Object.freeze({
    schemaVersion: 1 as const,
    storage: 'R2_PRIVATE' as const,
    pictureHandle,
    userId: decodeText(metadata.user, 'NATIVE_MEDIA_PREVIEW_SURFACE_USER_INVALID'),
    projectId: decodeText(metadata.project, 'NATIVE_MEDIA_PREVIEW_SURFACE_PROJECT_INVALID'),
    projectRevision: Object.freeze({
      schemaVersion: 1 as const,
      value: nonNegativeSafeInteger(metadata.revision, 'NATIVE_MEDIA_PREVIEW_SURFACE_REVISION_INVALID'),
      compatibilityUpdatedAt: decodeText(
        metadata.updated,
        'NATIVE_MEDIA_PREVIEW_SURFACE_REVISION_INVALID',
      ),
    }),
    sequenceIdSha256: sha256(metadata.sequence, 'NATIVE_MEDIA_PREVIEW_SURFACE_SEQUENCE_INVALID'),
    overlayIdSha256: sha256(metadata.overlay, 'NATIVE_MEDIA_PREVIEW_SURFACE_OVERLAY_INVALID'),
    decoderRequestSha256: sha256(metadata.decoder, 'NATIVE_MEDIA_PREVIEW_SURFACE_DECODER_REQUEST_INVALID'),
    decoderPictureRequestSha256: sha256(metadata.picture, 'NATIVE_MEDIA_PREVIEW_SURFACE_PICTURE_REQUEST_INVALID'),
    sourceVersionSha256: sha256(metadata.source, 'NATIVE_MEDIA_PREVIEW_SURFACE_SOURCE_VERSION_INVALID'),
    storageVersionSha256: sha256(metadata.storage, 'NATIVE_MEDIA_PREVIEW_SURFACE_STORAGE_VERSION_INVALID'),
    decodedPictureContentSha256: sha256(metadata.decoded, 'NATIVE_MEDIA_PREVIEW_SURFACE_DECODED_HASH_INVALID'),
    pngContentSha256: sha256(metadata.png, 'NATIVE_MEDIA_PREVIEW_SURFACE_PNG_HASH_INVALID'),
    pngByteLength: positiveIntegerTextInRange(
      metadata.bytes,
      policy.maxPngBytes,
      'NATIVE_MEDIA_PREVIEW_SURFACE_PNG_BYTES_INVALID',
    ),
    width: positiveIntegerTextInRange(metadata.width, 32_768, 'NATIVE_MEDIA_PREVIEW_SURFACE_WIDTH_INVALID'),
    height: positiveIntegerTextInRange(metadata.height, 32_768, 'NATIVE_MEDIA_PREVIEW_SURFACE_HEIGHT_INVALID'),
    expiresAtEpochMs: nonNegativeSafeInteger(metadata.expires, 'NATIVE_MEDIA_PREVIEW_SURFACE_EXPIRY_INVALID'),
  });
  if (metadata.binding !== hashEditronCanonicalJsonV1(binding)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_BINDING_MISMATCH');
  }
  return binding;
}

async function readExactlyBoundedBytes(
  body: unknown,
  expectedByteLength: number,
  maximumByteLength: number,
): Promise<Uint8Array> {
  if (expectedByteLength < 1 || expectedByteLength > maximumByteLength) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_PNG_BYTES_INVALID');
  }
  if (body instanceof Uint8Array) {
    if (body.byteLength !== expectedByteLength) {
      throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_BYTE_LENGTH_MISMATCH');
    }
    return body;
  }
  if (body && typeof body === 'object' && 'transformToByteArray' in body) {
    const transform = (body as { transformToByteArray?: unknown }).transformToByteArray;
    if (typeof transform === 'function') {
      return readExactlyBoundedBytes(
        await transform.call(body),
        expectedByteLength,
        maximumByteLength,
      );
    }
  }
  if (!body || typeof body !== 'object' || !(Symbol.asyncIterator in body)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_BODY_INVALID');
  }
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for await (const chunk of body as AsyncIterable<unknown>) {
    if (!(chunk instanceof Uint8Array)
      || byteLength + chunk.byteLength > expectedByteLength) {
      throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_BYTE_LENGTH_MISMATCH');
    }
    chunks.push(chunk);
    byteLength += chunk.byteLength;
  }
  if (byteLength !== expectedByteLength) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_BYTE_LENGTH_MISMATCH');
  }
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function normalizeStorage(
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1,
  client: MediaSourcePtsCadenceR2CommandClientV1,
): Readonly<{ bucketName: string; client: MediaSourcePtsCadenceR2CommandClientV1 }> {
  if (!privateStorage || privateStorage.browserRouteExposure !== 'NO_BROWSER_ROUTE'
    || privateStorage.bucketName === 'editron-cdn'
    || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(privateStorage.bucketName)
    || !privateStorage.storagePolicyVersion) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_PRIVATE_STORAGE_INVALID');
  }
  if (!client || typeof client.send !== 'function') {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_CLIENT_INVALID');
  }
  return { bucketName: privateStorage.bucketName, client };
}

function normalizePolicy(
  value: NativeMediaTimestampPreviewSurfacePolicyV1,
): NativeMediaTimestampPreviewSurfacePolicyV1 {
  if (!value || value.policyVersion !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_SURFACE_POLICY_VERSION_V1
    || !Number.isSafeInteger(value.leaseTtlMs) || value.leaseTtlMs < 1_000
    || value.leaseTtlMs > ABSOLUTE_MAX_LEASE_TTL_MS
    || !Number.isSafeInteger(value.maxPngBytes) || value.maxPngBytes < PNG_SIGNATURE.length
    || value.maxPngBytes > ABSOLUTE_MAX_PNG_BYTES) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_POLICY_INVALID');
  }
  return Object.freeze({ ...value });
}

function normalizeLeaseScope(
  value: NativeMediaTimestampPreviewSurfaceLeaseScopeV1,
): NativeMediaTimestampPreviewSurfaceLeaseScopeV1 {
  if (!value || !value.projectRevision || value.projectRevision.schemaVersion !== 1
    || !Number.isSafeInteger(value.projectRevision.value) || value.projectRevision.value < 0) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_LEASE_SCOPE_INVALID');
  }
  return Object.freeze({
    userId: identifier(value.userId, 'NATIVE_MEDIA_PREVIEW_SURFACE_USER_INVALID'),
    projectId: identifier(value.projectId, 'NATIVE_MEDIA_PREVIEW_SURFACE_PROJECT_INVALID'),
    sequenceId: identifier(value.sequenceId, 'NATIVE_MEDIA_PREVIEW_SURFACE_SEQUENCE_INVALID'),
    overlayId: identifier(value.overlayId, 'NATIVE_MEDIA_PREVIEW_SURFACE_OVERLAY_INVALID'),
    projectRevision: Object.freeze({
      schemaVersion: 1 as const,
      value: value.projectRevision.value,
      compatibilityUpdatedAt: boundedText(
        value.projectRevision.compatibilityUpdatedAt,
        240,
        'NATIVE_MEDIA_PREVIEW_SURFACE_REVISION_INVALID',
      ),
    }),
  });
}

function normalizeHandle(value: unknown): string {
  if (typeof value !== 'string' || !HANDLE_PATTERN.test(value)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_HANDLE_INVALID');
  }
  return value;
}

function objectKey(pictureHandle: string): string {
  const match = HANDLE_PATTERN.exec(normalizeHandle(pictureHandle));
  return `${OBJECT_KEY_PREFIX}${match![1]}.png`;
}

function normalizeRandomIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_RANDOM_IDENTIFIER_INVALID');
  }
  return value;
}

function exactBytes(value: unknown, maximum: number, code: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength < 1 || value.byteLength > maximum) {
    throw new Error(code);
  }
  return value;
}

function assertPng(value: Uint8Array): void {
  if (value.byteLength < PNG_SIGNATURE.length
    || PNG_SIGNATURE.some((byte, index) => value[index] !== byte)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SURFACE_PNG_INVALID');
  }
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function digestText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function identifier(value: unknown, code: string): string {
  return boundedText(value, 256, code);
}

function boundedText(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function encodeText(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,1024}$/.test(value)) throw new Error(code);
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    if (encodeText(decoded) !== value) throw new Error(code);
    return boundedText(decoded, 256, code);
  } catch {
    throw new Error(code);
  }
}

function positiveSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(code);
  return Number(value);
}

function validEpochMs(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,15})$/.test(value)) throw new Error(code);
  return validEpochMs(Number(value), code);
}

function positiveIntegerTextInRange(value: unknown, maximum: number, code: string): number {
  const parsed = nonNegativeSafeInteger(value, code);
  if (parsed < 1 || parsed > maximum) throw new Error(code);
  return parsed;
}

function sameBinding(
  left: NativeMediaTimestampPreviewSurfaceBindingV1,
  right: NativeMediaTimestampPreviewSurfaceBindingV1,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.storage === right.storage
    && left.pictureHandle === right.pictureHandle
    && left.userId === right.userId
    && left.projectId === right.projectId
    && left.projectRevision.schemaVersion === right.projectRevision.schemaVersion
    && left.projectRevision.value === right.projectRevision.value
    && left.projectRevision.compatibilityUpdatedAt
      === right.projectRevision.compatibilityUpdatedAt
    && left.sequenceIdSha256 === right.sequenceIdSha256
    && left.overlayIdSha256 === right.overlayIdSha256
    && left.decoderRequestSha256 === right.decoderRequestSha256
    && left.decoderPictureRequestSha256 === right.decoderPictureRequestSha256
    && left.sourceVersionSha256 === right.sourceVersionSha256
    && left.storageVersionSha256 === right.storageVersionSha256
    && left.decodedPictureContentSha256 === right.decodedPictureContentSha256
    && left.pngContentSha256 === right.pngContentSha256
    && left.pngByteLength === right.pngByteLength
    && left.width === right.width
    && left.height === right.height
    && left.expiresAtEpochMs === right.expiresAtEpochMs;
}

async function deleteObjectBestEffort(
  input: Readonly<{ client: MediaSourcePtsCadenceR2CommandClientV1; bucketName: string }>,
  pictureHandle: string,
): Promise<void> {
  try {
    await input.client.send(new DeleteObjectCommand({
      Bucket: input.bucketName,
      Key: objectKey(pictureHandle),
    }));
  } catch {
    // The authenticated read remains fail-closed even if provider cleanup is delayed.
  }
}

function isPreconditionFailed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === 'PreconditionFailed' || candidate.$metadata?.httpStatusCode === 412;
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === 'NoSuchKey'
    || candidate.name === 'NotFound'
    || candidate.$metadata?.httpStatusCode === 404;
}
