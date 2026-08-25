import { createHash } from 'node:crypto';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

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
