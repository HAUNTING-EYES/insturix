import { createHash } from 'node:crypto';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import {
  MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_ABSOLUTE_MAX_BYTES_V2,
  type MediaSourcePtsCadenceFrameBatchSerializationV2,
} from './media-source-pts-cadence-frame-batch-v2';
import {
  createMediaSourcePtsCadenceFrameBatchSidecarV2,
  MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ABSOLUTE_MAX_BYTES_V2,
  type MediaSourcePtsCadenceFrameBatchSidecarV2,
  type MediaSourcePtsCadenceManifestIndexSerializationV2,
} from './media-source-pts-cadence-manifest-index-v2';
import {
  createMediaSourcePtsCadenceManifestIndexSidecarV2,
  type MediaSourcePtsCadenceManifestIndexSidecarV2,
} from './media-source-pts-cadence-map-asset-state-v2';
import {
  type MediaSourcePtsCadenceMapCheckpointV1,
  type MediaSourcePtsCadencePrivateSidecarPortV1,
  type MediaSourcePtsCadencePrivateSidecarV1,
} from './media-source-pts-cadence-map-lifecycle-v1';
import {
  serializeMediaSourcePtsCadenceManifestSidecarV1,
  serializeMediaSourcePtsCadenceShardSidecarV1,
} from './media-source-pts-cadence-private-sidecar-codec-v1';
import type { MediaSourcePtsCadenceShardV1 } from './media-source-pts-cadence-shard-v1';

export type MediaSourcePtsCadenceR2CommandClientV1 = {
  send(command: unknown): Promise<unknown>;
};

/**
 * A deployment-owned declaration, not a browser-access control mechanism.
 * The caller must bind this bucket to no browser-facing R2 worker route.
 */
export type MediaSourcePtsCadenceR2PrivateStorageScopeV1 = Readonly<{
  bucketName: string;
  browserRouteExposure: 'NO_BROWSER_ROUTE';
  storagePolicyVersion: string;
}>;

type MediaSourcePtsCadencePrivateStoredObjectV2 = Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

type MediaSourcePtsCadencePrivateObjectReferenceV2 = Readonly<{
  storage: 'R2_PRIVATE' | 'GCS_PRIVATE';
  objectKey: string;
  byteLength: number;
  contentSha256: string;
}>;

export type MediaSourcePtsCadenceR2PrivateArtifactPortV2 = Readonly<{
  writeImmutableFrameBatch(input: Readonly<{
    serialization: MediaSourcePtsCadenceFrameBatchSerializationV2;
    expected: MediaSourcePtsCadenceFrameBatchSidecarV2;
  }>): Promise<Readonly<MediaSourcePtsCadenceFrameBatchSidecarV2>>;
  writeImmutableManifestIndex(input: Readonly<{
    serialization: MediaSourcePtsCadenceManifestIndexSerializationV2;
    expected: MediaSourcePtsCadenceManifestIndexSidecarV2;
  }>): Promise<Readonly<MediaSourcePtsCadenceManifestIndexSidecarV2>>;
  read(sidecar: MediaSourcePtsCadencePrivateObjectReferenceV2): Promise<MediaSourcePtsCadencePrivateStoredObjectV2>;
}>;

/**
 * Creates a server-only sidecar port for an explicitly isolated R2 bucket.
 * A `private/` object-key prefix is not access control: the deployment owner
 * must bind the declared bucket to no browser-facing R2 worker route. This
 * adapter never reads browser URLs or writes project state.
 */
export function createMediaSourcePtsCadenceR2PrivateSidecarPortV1(input: {
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
  client: MediaSourcePtsCadenceR2CommandClientV1;
}): MediaSourcePtsCadencePrivateSidecarPortV1 {
  const privateStorage = assertPrivateStorageScopeV1(input.privateStorage);
  const bucketName = privateStorage.bucketName;
  const client = input.client;
  if (!client || typeof client.send !== 'function') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_CLIENT_INVALID');
  }

  return {
    writeImmutableShard: async ({ mapBindingSha256, shard, expected }) => {
      const serialization = serializeMediaSourcePtsCadenceShardSidecarV1({
        storage: 'R2_PRIVATE',
        mapBindingSha256,
        shard,
      });
      return writeAndVerifyExactV1({ client, bucketName, expected, serialization });
    },
    writeImmutableManifest: async ({ mapBindingSha256, checkpoint, expected }) => {
      const serialization = serializeMediaSourcePtsCadenceManifestSidecarV1({
        storage: 'R2_PRIVATE',
        mapBindingSha256,
        checkpoint,
      });
      return writeAndVerifyExactV1({ client, bucketName, expected, serialization });
    },
  };
}

/**
 * Writes and rereads the recoverable V2 frame payloads and manifest indexes.
 * It is a storage adapter only: it does not scan media, advance MEDIA_ASSETS,
 * issue cadence conclusions, or expose browser-addressable object URLs.
 */
export function createMediaSourcePtsCadenceR2PrivateArtifactPortV2(input: {
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
  client: MediaSourcePtsCadenceR2CommandClientV1;
}): MediaSourcePtsCadenceR2PrivateArtifactPortV2 {
  const privateStorage = assertPrivateStorageScopeV1(input.privateStorage);
  const client = input.client;
  if (!client || typeof client.send !== 'function') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_CLIENT_INVALID');
  }
  const storage = { client, bucketName: privateStorage.bucketName };

  return {
    writeImmutableFrameBatch: async ({ serialization, expected }) => {
      const actual = createMediaSourcePtsCadenceFrameBatchSidecarV2({
        storage: 'R2_PRIVATE',
        serialization,
      });
      if (!sameFrameBatchSidecarV2(actual, expected)) {
        throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V2_FRAME_BATCH_EXPECTED_MISMATCH');
      }
      await writeAndVerifyExactObjectV2({
        ...storage,
        sidecar: actual,
        canonicalJson: serialization.canonicalJson,
      });
      return actual;
    },
    writeImmutableManifestIndex: async ({ serialization, expected }) => {
      const actual = createMediaSourcePtsCadenceManifestIndexSidecarV2({
        storage: 'R2_PRIVATE',
        manifestIndex: serialization,
      });
      if (!sameManifestIndexSidecarV2(actual, expected)) {
        throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V2_MANIFEST_INDEX_EXPECTED_MISMATCH');
      }
      await writeAndVerifyExactObjectV2({
        ...storage,
        sidecar: actual,
        canonicalJson: serialization.canonicalJson,
      });
      return actual;
    },
    read: (sidecar) => readExactStoredObjectV2({ ...storage, sidecar }),
  };
}

async function writeAndVerifyExactObjectV2(input: {
  client: MediaSourcePtsCadenceR2CommandClientV1;
  bucketName: string;
  sidecar: MediaSourcePtsCadencePrivateObjectReferenceV2;
  canonicalJson: string;
}): Promise<void> {
  assertPrivateObjectReferenceV2(input.sidecar);
  if (Buffer.byteLength(input.canonicalJson, 'utf8') !== input.sidecar.byteLength
    || createHash('sha256').update(input.canonicalJson, 'utf8').digest('hex') !== input.sidecar.contentSha256) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V2_SERIALIZATION_MISMATCH');
  }
  try {
    await input.client.send(new PutObjectCommand({
      Bucket: input.bucketName,
      Key: input.sidecar.objectKey,
      Body: input.canonicalJson,
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'no-store',
      IfNoneMatch: '*',
    }));
  } catch (error) {
    if (!isPreconditionFailed(error)) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V2_WRITE_FAILED');
    }
  }
  const stored = await readExactStoredObjectV2(input);
  if (stored.canonicalJson !== input.canonicalJson) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V2_CONTENT_MISMATCH');
  }
}

async function readExactStoredObjectV2(input: {
  client: MediaSourcePtsCadenceR2CommandClientV1;
  bucketName: string;
  sidecar: MediaSourcePtsCadencePrivateObjectReferenceV2;
}): Promise<MediaSourcePtsCadencePrivateStoredObjectV2> {
  const sidecar = assertPrivateObjectReferenceV2(input.sidecar);
  let response: unknown;
  try {
    response = await input.client.send(new GetObjectCommand({
      Bucket: input.bucketName,
      Key: sidecar.objectKey,
    }));
  } catch {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V2_READ_FAILED');
  }
  const body = response && typeof response === 'object'
    ? (response as { Body?: unknown }).Body
    : undefined;
  const bytes = await readExactlyBoundedBytesV1(body, sidecar.byteLength);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  if (contentSha256 !== sidecar.contentSha256) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V2_CONTENT_MISMATCH');
  }
  return {
    canonicalJson: Buffer.from(bytes).toString('utf8'),
    byteLength: bytes.byteLength,
    contentSha256,
  };
}

async function writeAndVerifyExactV1(input: {
  client: MediaSourcePtsCadenceR2CommandClientV1;
  bucketName: string;
  expected: Readonly<MediaSourcePtsCadencePrivateSidecarV1>;
  serialization: Readonly<{
    sidecar: Readonly<MediaSourcePtsCadencePrivateSidecarV1>;
    canonicalJson: string;
  }>;
}): Promise<Readonly<MediaSourcePtsCadencePrivateSidecarV1>> {
  if (!sameSidecar(input.expected, input.serialization.sidecar)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_SIDECAR_EXPECTED_MISMATCH');
  }
  try {
    await input.client.send(new PutObjectCommand({
      Bucket: input.bucketName,
      Key: input.expected.objectKey,
      Body: input.serialization.canonicalJson,
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'no-store',
      IfNoneMatch: '*',
    }));
  } catch (error) {
    if (!isPreconditionFailed(error)) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_SIDECAR_WRITE_FAILED');
    }
  }
  await verifyExactStoredBytesV1(input);
  return input.serialization.sidecar;
}

async function verifyExactStoredBytesV1(input: {
  client: MediaSourcePtsCadenceR2CommandClientV1;
  bucketName: string;
  expected: Readonly<MediaSourcePtsCadencePrivateSidecarV1>;
  serialization: Readonly<{
    sidecar: Readonly<MediaSourcePtsCadencePrivateSidecarV1>;
    canonicalJson: string;
  }>;
}): Promise<void> {
  let response: unknown;
  try {
    response = await input.client.send(new GetObjectCommand({
      Bucket: input.bucketName,
      Key: input.expected.objectKey,
    }));
  } catch {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_SIDECAR_READ_FAILED');
  }
  const body = response && typeof response === 'object'
    ? (response as { Body?: unknown }).Body
    : undefined;
  const bytes = await readExactlyBoundedBytesV1(body, input.expected.byteLength);
  const actualSha256 = createHash('sha256').update(bytes).digest('hex');
  if (
    bytes.byteLength !== input.expected.byteLength
    || actualSha256 !== input.expected.contentSha256
    || Buffer.from(bytes).toString('utf8') !== input.serialization.canonicalJson
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_SIDECAR_CONTENT_MISMATCH');
  }
}

async function readExactlyBoundedBytesV1(
  body: unknown,
  expectedByteLength: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(expectedByteLength) || expectedByteLength < 1) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_SIDECAR_SIZE_INVALID');
  }
  if (body instanceof Uint8Array) {
    if (body.byteLength !== expectedByteLength) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_SIDECAR_CONTENT_MISMATCH');
    }
    return body;
  }
  if (body && typeof body === 'object' && 'transformToByteArray' in body) {
    const transformToByteArray = (body as { transformToByteArray?: unknown }).transformToByteArray;
    if (typeof transformToByteArray === 'function') {
      const bytes = await transformToByteArray.call(body);
      return readExactlyBoundedBytesV1(bytes, expectedByteLength);
    }
  }
  if (!isAsyncIterable(body)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_SIDECAR_BODY_INVALID');
  }
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array) || byteLength + chunk.byteLength > expectedByteLength) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_SIDECAR_CONTENT_MISMATCH');
    }
    chunks.push(chunk);
    byteLength += chunk.byteLength;
  }
  if (byteLength !== expectedByteLength) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_SIDECAR_CONTENT_MISMATCH');
  }
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  if (!value || typeof value !== 'object') return false;
  return Symbol.asyncIterator in value
    && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function';
}

function isPreconditionFailed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return candidate.name === 'PreconditionFailed'
    || candidate.$metadata?.httpStatusCode === 412;
}

function sameSidecar(
  left: Readonly<MediaSourcePtsCadencePrivateSidecarV1>,
  right: Readonly<MediaSourcePtsCadencePrivateSidecarV1>,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.kind === right.kind
    && left.storage === right.storage
    && left.objectKey === right.objectKey
    && left.byteLength === right.byteLength
    && left.contentSha256 === right.contentSha256;
}

function sameFrameBatchSidecarV2(
  left: Readonly<MediaSourcePtsCadenceFrameBatchSidecarV2>,
  right: Readonly<MediaSourcePtsCadenceFrameBatchSidecarV2>,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.kind === right.kind
    && left.storage === right.storage
    && left.objectKey === right.objectKey
    && left.byteLength === right.byteLength
    && left.contentSha256 === right.contentSha256;
}

function sameManifestIndexSidecarV2(
  left: Readonly<MediaSourcePtsCadenceManifestIndexSidecarV2>,
  right: Readonly<MediaSourcePtsCadenceManifestIndexSidecarV2>,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.kind === right.kind
    && left.storage === right.storage
    && left.objectKey === right.objectKey
    && left.byteLength === right.byteLength
    && left.contentSha256 === right.contentSha256
    && left.mapBindingSha256 === right.mapBindingSha256
    && left.batchCount === right.batchCount
    && left.nextFrameOrdinal === right.nextFrameOrdinal
    && left.nextPresentationTimestampTicks === right.nextPresentationTimestampTicks;
}

function assertPrivateObjectReferenceV2(
  value: unknown,
): MediaSourcePtsCadencePrivateObjectReferenceV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V2_REFERENCE_INVALID');
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.storage !== 'R2_PRIVATE') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V2_STORAGE_MISMATCH');
  }
  if (typeof candidate.objectKey !== 'string'
    || !candidate.objectKey.startsWith('private/editron/media-source-pts-cadence/v2/')
    || /[\u0000-\u001F\u007F]/.test(candidate.objectKey)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V2_OBJECT_KEY_INVALID');
  }
  const maximumByteLength = Math.max(
    MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_ABSOLUTE_MAX_BYTES_V2,
    MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ABSOLUTE_MAX_BYTES_V2,
  );
  if (!Number.isSafeInteger(candidate.byteLength)
    || Number(candidate.byteLength) < 1
    || Number(candidate.byteLength) > maximumByteLength) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V2_BYTE_LENGTH_INVALID');
  }
  if (typeof candidate.contentSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(candidate.contentSha256)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V2_CONTENT_HASH_INVALID');
  }
  return {
    storage: 'R2_PRIVATE',
    objectKey: candidate.objectKey,
    byteLength: Number(candidate.byteLength),
    contentSha256: candidate.contentSha256,
  };
}

function nonEmptyText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 255) {
    throw new Error(code);
  }
  return value.trim();
}

function assertPrivateStorageScopeV1(
  value: unknown,
): MediaSourcePtsCadenceR2PrivateStorageScopeV1 {
  if (!value || typeof value !== 'object') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_PRIVATE_STORAGE_SCOPE_INVALID');
  }
  const candidate = value as {
    bucketName?: unknown;
    browserRouteExposure?: unknown;
    storagePolicyVersion?: unknown;
  };
  const bucketName = nonEmptyText(
    candidate.bucketName,
    'MEDIA_SOURCE_PTS_CADENCE_R2_PRIVATE_STORAGE_BUCKET_INVALID',
  );
  if (bucketName === 'editron-cdn') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_PRIVATE_STORAGE_PUBLIC_BUCKET_FORBIDDEN');
  }
  if (candidate.browserRouteExposure !== 'NO_BROWSER_ROUTE') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_PRIVATE_STORAGE_ROUTE_POLICY_INVALID');
  }
  return {
    bucketName,
    browserRouteExposure: 'NO_BROWSER_ROUTE',
    storagePolicyVersion: nonEmptyText(
      candidate.storagePolicyVersion,
      'MEDIA_SOURCE_PTS_CADENCE_R2_PRIVATE_STORAGE_POLICY_VERSION_INVALID',
    ),
  };
}
