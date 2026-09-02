import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import path from 'node:path';

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import type { MediaProxyMasterTranscodePublisherPortV1 } from './media-proxy-master-trusted-transcode-executor-v1';
import type {
  MediaSourcePtsCadenceR2CommandClientV1,
  MediaSourcePtsCadenceR2PrivateStorageScopeV1,
} from './media-source-pts-cadence-r2-private-sidecar-v1';
import { createMediaSourceStorageVersionV1 } from './media-source-storage-version-v1';
import {
  createMediaSourceVersionV1,
  type MediaSourceOwnerV1,
} from './media-source-version-v1';

const MEBIBYTE = 1024 * 1024;
const GIBIBYTE = 1024 * MEBIBYTE;
const PRIVATE_CACHE_CONTROL = 'private, no-store, max-age=0';
const CONTENT_DISPOSITION = 'inline';
const ARTIFACT_PROFILE = 'EDITRON_MEDIA_PROXY_MASTER_MP4_V1';
const PROXY_OBJECT_KEY = /^editron_proxy_v1_([a-f0-9]{64})_([a-f0-9]{64})\.mp4$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/;

/** Cloudflare R2's documented maximum single-request upload size. */
export const MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1 =
  5 * GIBIBYTE - 5 * MEBIBYTE;
export const MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLISHER_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_R2_PRIVATE_SINGLE_PUT_V1' as const;

type PublishInputV1 = Parameters<MediaProxyMasterTranscodePublisherPortV1['publish']>[0];

type NormalizedPublishInputV1 = Readonly<{
  localPath: string;
  objectKey: string;
  contentType: 'video/mp4';
  contentSha256: string;
  byteLength: number;
  owner: MediaSourceOwnerV1;
  assetId: string;
  commandSha256: string;
  outputProbeSha256: string;
  abortSignal?: AbortSignal;
}>;

type StoredExpectationV1 = Omit<NormalizedPublishInputV1, 'localPath' | 'abortSignal'> & Readonly<{
  storagePolicyVersion: string;
}>;

type StoredResponseV1 = Readonly<{
  Body?: unknown;
  CacheControl?: unknown;
  ContentDisposition?: unknown;
  ContentLength?: unknown;
  ContentType?: unknown;
  ETag?: unknown;
  Metadata?: unknown;
}>;

/**
 * Create-only publisher for outputs within R2's single-PUT ceiling.
 * Larger proxy objects are rejected so the multipart owner can handle them;
 * this adapter never downgrades to an overwrite or an unverified upload.
 */
export function createMediaProxyMasterR2PrivateSinglePutPublisherV1(input: Readonly<{
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
  client: MediaSourcePtsCadenceR2CommandClientV1;
}>): MediaProxyMasterTranscodePublisherPortV1 {
  const storage = normalizeStorage(input.privateStorage, input.client);
  return Object.freeze({
    async publish(value: PublishInputV1) {
      const artifact = normalizePublishInput(value);
      throwIfAborted(artifact.abortSignal);
      await verifyLocalFile(artifact);
      const expected = Object.freeze({
        objectKey: artifact.objectKey,
        contentType: artifact.contentType,
        contentSha256: artifact.contentSha256,
        byteLength: artifact.byteLength,
        owner: artifact.owner,
        assetId: artifact.assetId,
        commandSha256: artifact.commandSha256,
        outputProbeSha256: artifact.outputProbeSha256,
        storagePolicyVersion: storage.storagePolicyVersion,
      });

      let createdETag: string | null = null;
      const body = createReadStream(artifact.localPath);
      const stopBody = () => body.destroy();
      artifact.abortSignal?.addEventListener('abort', stopBody, { once: true });
      try {
        const response = await sendR2Command(storage.client, new PutObjectCommand({
          Bucket: storage.bucketName,
          Key: artifact.objectKey,
          Body: body,
          ContentLength: artifact.byteLength,
          ContentType: artifact.contentType,
          CacheControl: PRIVATE_CACHE_CONTROL,
          ContentDisposition: CONTENT_DISPOSITION,
          IfNoneMatch: '*',
          Metadata: objectMetadata(expected),
        }), artifact.abortSignal);
        createdETag = responseETag(response, 'MEDIA_PROXY_MASTER_R2_PUT_ETAG_INVALID');
      } catch (error) {
        throwIfAborted(artifact.abortSignal);
        if (!isPreconditionFailed(error)) {
          throw new Error('MEDIA_PROXY_MASTER_R2_WRITE_FAILED');
        }
      } finally {
        artifact.abortSignal?.removeEventListener('abort', stopBody);
        body.destroy();
      }

      const observedETag = await readAndVerifyStoredObject({
        ...storage,
        expected,
        createdETag,
        abortSignal: artifact.abortSignal,
      });
      const storageVersion = createMediaSourceStorageVersionV1({
        locator: { provider: 'R2', objectKey: artifact.objectKey },
        byteLength: artifact.byteLength,
        providerVersion: { kind: 'R2_ETAG', value: observedETag },
      });
      return createMediaSourceVersionV1({
        owner: artifact.owner,
        assetId: artifact.assetId,
        mediaKind: 'video',
        byteLength: artifact.byteLength,
        contentSha256: artifact.contentSha256,
        storageVersion,
      });
    },
  });
}

async function verifyLocalFile(input: NormalizedPublishInputV1): Promise<void> {
  throwIfAborted(input.abortSignal);
  let metadata;
  try {
    metadata = await lstat(input.localPath);
  } catch {
    throw new Error('MEDIA_PROXY_MASTER_R2_LOCAL_FILE_INVALID');
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()
    || metadata.size !== input.byteLength) {
    throw new Error('MEDIA_PROXY_MASTER_R2_LOCAL_FILE_INVALID');
  }
  let observed;
  try {
    observed = await digestBody(
      createReadStream(input.localPath),
      input.byteLength,
      input.abortSignal,
    );
  } catch {
    throwIfAborted(input.abortSignal);
    throw new Error('MEDIA_PROXY_MASTER_R2_LOCAL_FILE_READ_FAILED');
  }
  if (observed.contentSha256 !== input.contentSha256) {
    throw new Error('MEDIA_PROXY_MASTER_R2_LOCAL_FILE_HASH_MISMATCH');
  }
}

async function readAndVerifyStoredObject(input: Readonly<{
  client: MediaSourcePtsCadenceR2CommandClientV1;
  bucketName: string;
  expected: StoredExpectationV1;
  createdETag: string | null;
  abortSignal?: AbortSignal;
}>): Promise<string> {
  throwIfAborted(input.abortSignal);
  let response: unknown;
  try {
    response = await sendR2Command(input.client, new GetObjectCommand({
      Bucket: input.bucketName,
      Key: input.expected.objectKey,
    }), input.abortSignal);
  } catch {
    throwIfAborted(input.abortSignal);
    throw new Error('MEDIA_PROXY_MASTER_R2_READ_FAILED');
  }
  const stored = storedResponse(response, 'MEDIA_PROXY_MASTER_R2_GET_RESPONSE_INVALID');
  assertStoredHeaders(stored, input.expected);
  const getETag = responseETag(stored, 'MEDIA_PROXY_MASTER_R2_GET_ETAG_INVALID');
  if (input.createdETag !== null && input.createdETag !== getETag) {
    throw new Error('MEDIA_PROXY_MASTER_R2_PROVIDER_VERSION_CHANGED');
  }
  let observed;
  try {
    observed = await digestBody(stored.Body, input.expected.byteLength, input.abortSignal);
  } catch {
    throwIfAborted(input.abortSignal);
    throw new Error('MEDIA_PROXY_MASTER_R2_STORED_BODY_INVALID');
  }
  if (observed.contentSha256 !== input.expected.contentSha256) {
    throw new Error('MEDIA_PROXY_MASTER_R2_STORED_CONTENT_MISMATCH');
  }

  throwIfAborted(input.abortSignal);
  let headResponse: unknown;
  try {
    headResponse = await sendR2Command(input.client, new HeadObjectCommand({
      Bucket: input.bucketName,
      Key: input.expected.objectKey,
    }), input.abortSignal);
  } catch {
    throwIfAborted(input.abortSignal);
    throw new Error('MEDIA_PROXY_MASTER_R2_HEAD_FAILED');
  }
  const head = storedResponse(headResponse, 'MEDIA_PROXY_MASTER_R2_HEAD_RESPONSE_INVALID');
  assertStoredHeaders(head, input.expected);
  const headETag = responseETag(head, 'MEDIA_PROXY_MASTER_R2_HEAD_ETAG_INVALID');
  if (headETag !== getETag) {
    throw new Error('MEDIA_PROXY_MASTER_R2_PROVIDER_VERSION_CHANGED');
  }
  return headETag;
}

function assertStoredHeaders(
  response: StoredResponseV1,
  expected: StoredExpectationV1,
): void {
  if (response.CacheControl !== PRIVATE_CACHE_CONTROL
    || response.ContentDisposition !== CONTENT_DISPOSITION
    || response.ContentLength !== expected.byteLength
    || response.ContentType !== expected.contentType
    || !sameMetadata(response.Metadata, objectMetadata(expected))) {
    throw new Error('MEDIA_PROXY_MASTER_R2_HEADERS_OR_METADATA_INVALID');
  }
}

async function digestBody(
  body: unknown,
  expectedByteLength: number,
  abortSignal?: AbortSignal,
): Promise<Readonly<{ byteLength: number; contentSha256: string }>> {
  throwIfAborted(abortSignal);
  const digest = createHash('sha256');
  let byteLength = 0;
  if (body instanceof Uint8Array) {
    byteLength = body.byteLength;
    if (byteLength > expectedByteLength) {
      throw new Error('MEDIA_PROXY_MASTER_R2_BODY_LENGTH_MISMATCH');
    }
    digest.update(body);
  } else {
    if (!isAsyncIterable(body)) throw new Error('MEDIA_PROXY_MASTER_R2_BODY_INVALID');
    for await (const chunk of body) {
      throwIfAborted(abortSignal);
      if (!(chunk instanceof Uint8Array)
        || byteLength + chunk.byteLength > expectedByteLength) {
        throw new Error('MEDIA_PROXY_MASTER_R2_BODY_LENGTH_MISMATCH');
      }
      byteLength += chunk.byteLength;
      digest.update(chunk);
    }
  }
  throwIfAborted(abortSignal);
  if (byteLength !== expectedByteLength) {
    throw new Error('MEDIA_PROXY_MASTER_R2_BODY_LENGTH_MISMATCH');
  }
  return Object.freeze({ byteLength, contentSha256: digest.digest('hex') });
}

function normalizePublishInput(value: PublishInputV1): NormalizedPublishInputV1 {
  const localPath = absolutePath(value?.localPath);
  const objectKey = boundedText(value?.objectKey, 1_024, 'MEDIA_PROXY_MASTER_R2_OBJECT_KEY_INVALID');
  const keyMatch = PROXY_OBJECT_KEY.exec(objectKey);
  const contentSha256 = sha256(value?.contentSha256, 'MEDIA_PROXY_MASTER_R2_CONTENT_HASH_INVALID');
  const byteLength = positiveSafeInteger(
    value?.byteLength,
    MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1,
    'MEDIA_PROXY_MASTER_R2_SINGLE_PUT_LIMIT_EXCEEDED',
  );
  if (!keyMatch || keyMatch[2] !== contentSha256) {
    throw new Error('MEDIA_PROXY_MASTER_R2_OBJECT_KEY_INVALID');
  }
  if (value?.contentType !== 'video/mp4') {
    throw new Error('MEDIA_PROXY_MASTER_R2_CONTENT_TYPE_INVALID');
  }
  return Object.freeze({
    localPath,
    objectKey,
    contentType: 'video/mp4' as const,
    contentSha256,
    byteLength,
    owner: owner(value?.owner),
    assetId: identifier(value?.assetId, 'MEDIA_PROXY_MASTER_R2_ASSET_ID_INVALID'),
    commandSha256: sha256(value?.commandSha256, 'MEDIA_PROXY_MASTER_R2_COMMAND_HASH_INVALID'),
    outputProbeSha256: sha256(
      value?.outputProbeSha256,
      'MEDIA_PROXY_MASTER_R2_OUTPUT_PROBE_HASH_INVALID',
    ),
    ...(value.abortSignal === undefined ? {} : { abortSignal: value.abortSignal }),
  });
}

function objectMetadata(value: StoredExpectationV1): Record<string, string> {
  const ownerId = value.owner.kind === 'USER' ? value.owner.userId : value.owner.orgId;
  return {
    artifactprofile: ARTIFACT_PROFILE,
    publisherversion: MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLISHER_VERSION_V1,
    storagepolicyversion: value.storagePolicyVersion,
    contentsha256: value.contentSha256,
    bytelength: String(value.byteLength),
    commandsha256: value.commandSha256,
    outputprobesha256: value.outputProbeSha256,
    ownerkind: value.owner.kind,
    ownerid: ownerId,
    assetid: value.assetId,
  };
}

function normalizeStorage(
  value: MediaSourcePtsCadenceR2PrivateStorageScopeV1,
  client: MediaSourcePtsCadenceR2CommandClientV1,
) {
  if (!value || value.browserRouteExposure !== 'NO_BROWSER_ROUTE'
    || value.bucketName === 'editron-cdn'
    || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value.bucketName)
    || typeof value.storagePolicyVersion !== 'string'
    || value.storagePolicyVersion.trim() !== value.storagePolicyVersion
    || value.storagePolicyVersion.length < 1 || value.storagePolicyVersion.length > 256
    || /[\u0000-\u001F\u007F]/.test(value.storagePolicyVersion)) {
    throw new Error('MEDIA_PROXY_MASTER_R2_PRIVATE_STORAGE_INVALID');
  }
  if (!client || typeof client.send !== 'function') {
    throw new Error('MEDIA_PROXY_MASTER_R2_CLIENT_INVALID');
  }
  return Object.freeze({
    bucketName: value.bucketName,
    storagePolicyVersion: value.storagePolicyVersion,
    client,
  });
}

function storedResponse(value: unknown, error: string): StoredResponseV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(error);
  return value as StoredResponseV1;
}

function responseETag(value: unknown, error: string): string {
  const response = storedResponse(value, error);
  if (typeof response.ETag !== 'string') throw new Error(error);
  const eTag = response.ETag.trim().replace(/^"|"$/g, '');
  if (eTag.length < 1 || eTag.length > 512 || /[\u0000-\u001F\u007F]/.test(eTag)) {
    throw new Error(error);
  }
  return eTag;
}

function sameMetadata(value: unknown, expected: Record<string, string>): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]
      && actual[key] === expected[key]);
}

async function sendR2Command(
  client: MediaSourcePtsCadenceR2CommandClientV1,
  command: unknown,
  abortSignal?: AbortSignal,
): Promise<unknown> {
  throwIfAborted(abortSignal);
  const abortableClient = client as unknown as Readonly<{
    send(
      value: unknown,
      options?: Readonly<{ abortSignal?: AbortSignal }>,
    ): Promise<unknown>;
  }>;
  return abortableClient.send(command, abortSignal ? { abortSignal } : undefined);
}

function isPreconditionFailed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === 'PreconditionFailed'
    || candidate.$metadata?.httpStatusCode === 412;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(value) && (typeof value === 'object' || typeof value === 'function')
    && Symbol.asyncIterator in (value as object)
    && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function';
}

function owner(value: unknown): MediaSourceOwnerV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MEDIA_PROXY_MASTER_R2_OWNER_INVALID');
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'USER' && Object.keys(candidate).length === 2) {
    return Object.freeze({
      kind: 'USER' as const,
      userId: identifier(candidate.userId, 'MEDIA_PROXY_MASTER_R2_OWNER_INVALID'),
    });
  }
  if (candidate.kind === 'ORG' && Object.keys(candidate).length === 2) {
    return Object.freeze({
      kind: 'ORG' as const,
      orgId: identifier(candidate.orgId, 'MEDIA_PROXY_MASTER_R2_OWNER_INVALID'),
    });
  }
  throw new Error('MEDIA_PROXY_MASTER_R2_OWNER_INVALID');
}

function absolutePath(value: unknown): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.length > 4_096
    || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error('MEDIA_PROXY_MASTER_R2_LOCAL_PATH_INVALID');
  }
  return value;
}

function boundedText(value: unknown, maximum: number, error: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1
    || value.length > maximum || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error(error);
  }
  return value;
}

function identifier(value: unknown, error: string): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new Error(error);
  return value;
}

function sha256(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(error);
  return value;
}

function positiveSafeInteger(value: unknown, maximum: number, error: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new Error(error);
  }
  return Number(value);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error('MEDIA_PROXY_MASTER_R2_PUBLISH_ABORTED');
}
