import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, open, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import {
  assertMediaProxyMasterR2PreparedArtifactManifestV1,
  createMediaProxyMasterR2PreparedArtifactManifestV1,
  expectedMediaProxyMasterR2PreparedArtifactChunkObjectKeyV1,
  expectedMediaProxyMasterR2PreparedArtifactHandleV1,
  expectedMediaProxyMasterR2PreparedArtifactManifestObjectKeyV1,
  parseMediaProxyMasterR2PreparedArtifactManifestV1,
  serializeMediaProxyMasterR2PreparedArtifactManifestV1,
  type MediaProxyMasterR2PreparedArtifactChunkEvidenceV1,
  type MediaProxyMasterR2PreparedArtifactIdentityInputV1,
  type MediaProxyMasterR2PreparedArtifactManifestSerializationV1,
  type MediaProxyMasterR2PreparedArtifactManifestV1,
} from './media-proxy-master-r2-prepared-artifact-manifest-v1';
import {
  assertMediaProxyMasterR2PreparedArtifactPolicyV1,
  resolveMediaProxyMasterR2PreparedArtifactChunkPlanV1,
  type MediaProxyMasterR2PreparedArtifactPolicyV1,
} from './media-proxy-master-r2-prepared-artifact-policy-v1';
import {
  assertMediaProxyMasterR2PreparedArtifactReferenceForManifestV1,
  assertMediaProxyMasterR2PreparedArtifactReferenceV1,
  createMediaProxyMasterR2PreparedArtifactReferenceV1,
  MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_VERSION_V1,
  type MediaProxyMasterR2PreparedArtifactReferenceV1,
} from './media-proxy-master-r2-prepared-artifact-reference-v1';
import type {
  MediaSourcePtsCadenceR2CommandClientV1,
  MediaSourcePtsCadenceR2PrivateStorageScopeV1,
} from './media-source-pts-cadence-r2-private-sidecar-v1';

const PRIVATE_CACHE_CONTROL = 'private, no-store, max-age=0';
const CONTENT_DISPOSITION = 'attachment';
const CHUNK_CONTENT_TYPE = 'application/octet-stream';
const MANIFEST_CONTENT_TYPE = 'application/json';
const CHUNK_PROFILE = 'EDITRON_MEDIA_PROXY_PREPARED_CHUNK_V1';
const MANIFEST_PROFILE = 'EDITRON_MEDIA_PROXY_PREPARED_MANIFEST_V1';

export type MediaProxyMasterR2PreparedArtifactStageInputV1 =
  MediaProxyMasterR2PreparedArtifactIdentityInputV1 & Readonly<{
    localPath: string;
    retainUntil: string;
    abortSignal?: AbortSignal;
  }>;

export type MediaProxyMasterR2PreparedArtifactRecoverInputV1 =
  MediaProxyMasterR2PreparedArtifactIdentityInputV1 & Readonly<{
    retainUntil: string;
    abortSignal?: AbortSignal;
  }>;

export type MediaProxyMasterR2PreparedArtifactReopenResultV1 = Readonly<{
  localPath: string;
  byteLength: number;
  contentSha256: string;
  artifactHandle: string;
}>;

export interface MediaProxyMasterR2PreparedArtifactStoreV1 {
  stage(
    input: MediaProxyMasterR2PreparedArtifactStageInputV1,
  ): Promise<MediaProxyMasterR2PreparedArtifactReferenceV1>;
  recover(
    input: MediaProxyMasterR2PreparedArtifactRecoverInputV1,
  ): Promise<MediaProxyMasterR2PreparedArtifactReferenceV1 | null>;
  reopen(input: Readonly<{
    policy: MediaProxyMasterR2PreparedArtifactPolicyV1;
    reference: MediaProxyMasterR2PreparedArtifactReferenceV1;
    outputPath: string;
    abortSignal?: AbortSignal;
  }>): Promise<MediaProxyMasterR2PreparedArtifactReopenResultV1>;
}

type StorageContextV1 = Readonly<{
  bucketName: string;
  storagePolicyVersion: string;
  client: MediaSourcePtsCadenceR2CommandClientV1;
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

type LoadedManifestV1 = Readonly<{
  serialization: MediaProxyMasterR2PreparedArtifactManifestSerializationV1;
  fullGetETag: string;
  headETag: string;
}>;

export function createMediaProxyMasterR2PreparedArtifactStoreV1(input: Readonly<{
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
  client: MediaSourcePtsCadenceR2CommandClientV1;
  now?: () => string;
}>): Readonly<MediaProxyMasterR2PreparedArtifactStoreV1> {
  const storage = normalizeStorage(input.privateStorage, input.client);
  const now = input.now ?? (() => new Date().toISOString());
  const store: MediaProxyMasterR2PreparedArtifactStoreV1 = {
    async recover(request) {
      return recoverPreparedArtifact({ storage, request });
    },

    async stage(request) {
      const policy = policyForStorage(request.policy, storage);
      const retainUntil = instant(request.retainUntil, 'RETAIN_UNTIL');
      const artifactHandle = expectedMediaProxyMasterR2PreparedArtifactHandleV1({
        ...identityInput(request),
        policy,
      });
      const recovered = await recoverPreparedArtifact({
        storage,
        request: { ...identityInput(request), policy, retainUntil,
          ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}) },
      });
      if (recovered) return recovered;

      const localPath = absolutePath(request.localPath, 'LOCAL_PATH');
      const localIdentity = Object.freeze({
        byteLength: request.artifactByteLength,
        contentSha256: request.artifactContentSha256,
      });
      await verifyLocalArtifact({
        localPath,
        expected: localIdentity,
        abortSignal: request.abortSignal,
      });
      const chunkPlan = resolveMediaProxyMasterR2PreparedArtifactChunkPlanV1({
        policy,
        artifactByteLength: request.artifactByteLength,
      });
      const chunks: MediaProxyMasterR2PreparedArtifactChunkEvidenceV1[] = [];
      for (let index = 0; index < chunkPlan.totalChunks; index += 1) {
        throwIfAborted(request.abortSignal);
        const sequence = index + 1;
        const startByte = index * chunkPlan.chunkSize;
        const endExclusiveByte = Math.min(
          startByte + chunkPlan.chunkSize,
          request.artifactByteLength,
        );
        const inspected = await inspectLocalRange({
          localPath,
          expectedFileBytes: request.artifactByteLength,
          startByte,
          endExclusiveByte,
          abortSignal: request.abortSignal,
        });
        const objectKey =
          expectedMediaProxyMasterR2PreparedArtifactChunkObjectKeyV1(
            artifactHandle,
            sequence,
            inspected.contentSha256,
          );
        const verified = await putAndVerifyChunk({
          storage,
          policy,
          localPath,
          artifactHandle,
          sequence,
          startByte,
          endExclusiveByte,
          artifactByteLength: request.artifactByteLength,
          byteLength: inspected.byteLength,
          contentSha256: inspected.contentSha256,
          objectKey,
          abortSignal: request.abortSignal,
        });
        chunks.push(Object.freeze({
          sequence,
          startByte,
          endExclusiveByte,
          byteLength: inspected.byteLength,
          contentSha256: inspected.contentSha256,
          objectKey,
          fullGetETag: verified.fullGetETag,
          headETag: verified.headETag,
          verifiedAt: instant(now(), 'NOW'),
        }));
      }
      await verifyLocalArtifact({
        localPath,
        expected: localIdentity,
        abortSignal: request.abortSignal,
      });
      const manifest = createMediaProxyMasterR2PreparedArtifactManifestV1({
        ...identityInput(request),
        policy,
        chunks,
        stagedAt: instant(now(), 'NOW'),
        retainUntil,
      });
      const intended = serializeMediaProxyMasterR2PreparedArtifactManifestV1({
        policy,
        manifest,
      });
      const loaded = await putAndLoadManifest({
        storage,
        policy,
        serialization: intended,
        abortSignal: request.abortSignal,
      });
      assertRecoveredIdentity({
        loaded,
        artifactHandle,
        retainUntil,
      });
      if (loaded.serialization.contentSha256 !== intended.contentSha256) {
        await verifyManifestChunks({ storage, policy, manifest:
          loaded.serialization.manifest, abortSignal: request.abortSignal });
      }
      return createMediaProxyMasterR2PreparedArtifactReferenceV1({
        policy,
        serialization: loaded.serialization,
        manifestFullGetETag: loaded.fullGetETag,
        manifestHeadETag: loaded.headETag,
      });
    },

    async reopen(request) {
      const policy = policyForStorage(request.policy, storage);
      const reference = assertMediaProxyMasterR2PreparedArtifactReferenceV1(
        request.reference,
        policy,
      );
      const outputPath = absolutePath(request.outputPath, 'OUTPUT_PATH');
      const loaded = await loadManifest({
        storage,
        policy,
        objectKey: reference.manifestObjectKey,
        abortSignal: request.abortSignal,
      });
      if (!loaded) fail('MANIFEST_MISSING');
      if (loaded.fullGetETag !== reference.manifestFullGetETag
        || loaded.headETag !== reference.manifestHeadETag
        || loaded.serialization.byteLength !== reference.manifestByteLength
        || loaded.serialization.contentSha256 !== reference.manifestContentSha256) {
        fail('REFERENCE_MANIFEST_VERSION_MISMATCH');
      }
      assertMediaProxyMasterR2PreparedArtifactReferenceForManifestV1({
        reference,
        serialization: loaded.serialization,
        policy,
      });
      return reopenManifest({
        storage,
        policy,
        manifest: loaded.serialization.manifest,
        outputPath,
        abortSignal: request.abortSignal,
      });
    },
  };
  return Object.freeze(store);
}

async function recoverPreparedArtifact(input: Readonly<{
  storage: StorageContextV1;
  request: MediaProxyMasterR2PreparedArtifactRecoverInputV1;
}>): Promise<MediaProxyMasterR2PreparedArtifactReferenceV1 | null> {
  const policy = policyForStorage(input.request.policy, input.storage);
  const retainUntil = instant(input.request.retainUntil, 'RETAIN_UNTIL');
  const artifactHandle = expectedMediaProxyMasterR2PreparedArtifactHandleV1({
    ...identityInput(input.request),
    policy,
  });
  const loaded = await loadManifest({
    storage: input.storage,
    policy,
    objectKey:
      expectedMediaProxyMasterR2PreparedArtifactManifestObjectKeyV1(
        artifactHandle,
      ),
    abortSignal: input.request.abortSignal,
  });
  if (!loaded) return null;
  assertRecoveredIdentity({ loaded, artifactHandle, retainUntil });
  await verifyManifestChunks({
    storage: input.storage,
    policy,
    manifest: loaded.serialization.manifest,
    abortSignal: input.request.abortSignal,
  });
  return createMediaProxyMasterR2PreparedArtifactReferenceV1({
    policy,
    serialization: loaded.serialization,
    manifestFullGetETag: loaded.fullGetETag,
    manifestHeadETag: loaded.headETag,
  });
}

function assertRecoveredIdentity(input: Readonly<{
  loaded: LoadedManifestV1;
  artifactHandle: string;
  retainUntil: string;
}>): void {
  if (input.loaded.serialization.manifest.artifactHandle
      !== input.artifactHandle
    || input.loaded.serialization.manifest.retainUntil !== input.retainUntil) {
    fail('MANIFEST_SCOPE_MISMATCH');
  }
}

async function putAndVerifyChunk(input: Readonly<{
  storage: StorageContextV1;
  policy: MediaProxyMasterR2PreparedArtifactPolicyV1;
  localPath: string;
  artifactHandle: string;
  sequence: number;
  startByte: number;
  endExclusiveByte: number;
  artifactByteLength: number;
  byteLength: number;
  contentSha256: string;
  objectKey: string;
  abortSignal?: AbortSignal;
}>): Promise<Readonly<{ fullGetETag: string; headETag: string }>> {
  const expected = chunkExpectation(input);
  const before = await pathFileIdentity(
    input.localPath,
    input.artifactByteLength,
  );
  const body = createReadStream(input.localPath, {
    start: input.startByte,
    end: input.endExclusiveByte - 1,
  });
  const stopBody = () => body.destroy();
  input.abortSignal?.addEventListener('abort', stopBody, { once: true });
  let createdETag: string | null = null;
  let writeFailed = false;
  try {
    const response = await send(input.storage.client, new PutObjectCommand({
      Bucket: input.storage.bucketName,
      Key: input.objectKey,
      Body: body,
      ContentLength: input.byteLength,
      ContentType: CHUNK_CONTENT_TYPE,
      CacheControl: PRIVATE_CACHE_CONTROL,
      ContentDisposition: CONTENT_DISPOSITION,
      IfNoneMatch: '*',
      Metadata: expected.metadata,
    }), input.abortSignal);
    createdETag = eTag(object(response, 'CHUNK_PUT_RESPONSE').ETag, 'CHUNK_PUT_ETAG');
  } catch {
    throwIfAborted(input.abortSignal);
    writeFailed = true;
  } finally {
    input.abortSignal?.removeEventListener('abort', stopBody);
    body.destroy();
  }
  const after = await pathFileIdentity(
    input.localPath,
    input.artifactByteLength,
  );
  if (!sameFileIdentity(before, after)) fail('LOCAL_FILE_CHANGED');
  const verified = await readVerifiedChunk({ ...input, expected });
  if (!verified) fail(writeFailed ? 'CHUNK_WRITE_FAILED' : 'CHUNK_MISSING');
  if (createdETag !== null && createdETag !== verified.fullGetETag) {
    fail('CHUNK_PROVIDER_VERSION_CHANGED');
  }
  return verified;
}

async function readVerifiedChunk(input: Readonly<{
  storage: StorageContextV1;
  policy: MediaProxyMasterR2PreparedArtifactPolicyV1;
  artifactHandle: string;
  sequence: number;
  byteLength: number;
  contentSha256: string;
  objectKey: string;
  expected?: ObjectExpectationV1;
  expectedFullGetETag?: string;
  expectedHeadETag?: string;
  abortSignal?: AbortSignal;
  onChunk?: (chunk: Uint8Array) => Promise<void>;
}>): Promise<Readonly<{ fullGetETag: string; headETag: string }> | null> {
  const expected = input.expected ?? chunkExpectation(input);
  const response = await getObjectOrNull({
    storage: input.storage,
    objectKey: input.objectKey,
    abortSignal: input.abortSignal,
  });
  if (!response) return null;
  assertObjectHeaders(response, expected);
  const fullGetETag = eTag(response.ETag, 'CHUNK_GET_ETAG');
  const observed = await digestBody({
    body: response.Body,
    expectedByteLength: input.byteLength,
    abortSignal: input.abortSignal,
    onChunk: input.onChunk,
  });
  if (observed.contentSha256 !== input.contentSha256) {
    fail('CHUNK_CONTENT_MISMATCH');
  }
  const head = await headObject({
    storage: input.storage,
    objectKey: input.objectKey,
    abortSignal: input.abortSignal,
  });
  assertObjectHeaders(head, expected);
  const headETag = eTag(head.ETag, 'CHUNK_HEAD_ETAG');
  if (fullGetETag !== headETag
    || (input.expectedFullGetETag !== undefined
      && input.expectedFullGetETag !== fullGetETag)
    || (input.expectedHeadETag !== undefined
      && input.expectedHeadETag !== headETag)) {
    fail('CHUNK_PROVIDER_VERSION_CHANGED');
  }
  return Object.freeze({ fullGetETag, headETag });
}

async function putAndLoadManifest(input: Readonly<{
  storage: StorageContextV1;
  policy: MediaProxyMasterR2PreparedArtifactPolicyV1;
  serialization: MediaProxyMasterR2PreparedArtifactManifestSerializationV1;
  abortSignal?: AbortSignal;
}>): Promise<LoadedManifestV1> {
  const expected = manifestExpectation(
    input.storage,
    input.policy,
    input.serialization,
  );
  let writeFailed = false;
  try {
    await send(input.storage.client, new PutObjectCommand({
      Bucket: input.storage.bucketName,
      Key: input.serialization.objectKey,
      Body: Buffer.from(input.serialization.canonicalJson, 'utf8'),
      ContentLength: input.serialization.byteLength,
      ContentType: MANIFEST_CONTENT_TYPE,
      CacheControl: PRIVATE_CACHE_CONTROL,
      ContentDisposition: CONTENT_DISPOSITION,
      IfNoneMatch: '*',
      Metadata: expected.metadata,
    }), input.abortSignal);
  } catch {
    throwIfAborted(input.abortSignal);
    writeFailed = true;
  }
  const loaded = await loadManifest({
    storage: input.storage,
    policy: input.policy,
    objectKey: input.serialization.objectKey,
    abortSignal: input.abortSignal,
  });
  if (!loaded) fail(writeFailed ? 'MANIFEST_WRITE_FAILED' : 'MANIFEST_MISSING');
  return loaded;
}

async function loadManifest(input: Readonly<{
  storage: StorageContextV1;
  policy: MediaProxyMasterR2PreparedArtifactPolicyV1;
  objectKey: string;
  abortSignal?: AbortSignal;
}>): Promise<LoadedManifestV1 | null> {
  const response = await getObjectOrNull(input);
  if (!response) return null;
  const claimedLength = positiveInteger(
    response.ContentLength,
    input.policy.maximumManifestBytes,
    'MANIFEST_CONTENT_LENGTH',
  );
  const collected = await collectBody({
    body: response.Body,
    expectedByteLength: claimedLength,
    abortSignal: input.abortSignal,
  });
  const canonicalJson = Buffer.from(collected.bytes).toString('utf8');
  const manifest = parseMediaProxyMasterR2PreparedArtifactManifestV1({
    canonicalJson,
    policy: input.policy,
  });
  const serialization = serializeMediaProxyMasterR2PreparedArtifactManifestV1({
    manifest,
    policy: input.policy,
  });
  if (serialization.objectKey !== input.objectKey) fail('MANIFEST_KEY_MISMATCH');
  const expected = manifestExpectation(input.storage, input.policy, serialization);
  assertObjectHeaders(response, expected);
  const fullGetETag = eTag(response.ETag, 'MANIFEST_GET_ETAG');
  const head = await headObject(input);
  assertObjectHeaders(head, expected);
  const headETag = eTag(head.ETag, 'MANIFEST_HEAD_ETAG');
  if (fullGetETag !== headETag) fail('MANIFEST_PROVIDER_VERSION_CHANGED');
  return Object.freeze({ serialization, fullGetETag, headETag });
}

async function verifyManifestChunks(input: Readonly<{
  storage: StorageContextV1;
  policy: MediaProxyMasterR2PreparedArtifactPolicyV1;
  manifest: MediaProxyMasterR2PreparedArtifactManifestV1;
  abortSignal?: AbortSignal;
}>): Promise<void> {
  const manifest = assertMediaProxyMasterR2PreparedArtifactManifestV1(
    input.manifest,
    input.policy,
  );
  for (const chunk of manifest.chunks) {
    const verified = await readVerifiedChunk({
      storage: input.storage,
      policy: input.policy,
      artifactHandle: manifest.artifactHandle,
      sequence: chunk.sequence,
      byteLength: chunk.byteLength,
      contentSha256: chunk.contentSha256,
      objectKey: chunk.objectKey,
      expectedFullGetETag: chunk.fullGetETag,
      expectedHeadETag: chunk.headETag,
      abortSignal: input.abortSignal,
    });
    if (!verified) fail('CHUNK_MISSING');
  }
}

async function reopenManifest(input: Readonly<{
  storage: StorageContextV1;
  policy: MediaProxyMasterR2PreparedArtifactPolicyV1;
  manifest: MediaProxyMasterR2PreparedArtifactManifestV1;
  outputPath: string;
  abortSignal?: AbortSignal;
}>): Promise<MediaProxyMasterR2PreparedArtifactReopenResultV1> {
  let output: Awaited<ReturnType<typeof open>>;
  try {
    output = await open(input.outputPath, 'wx');
  } catch {
    fail('OUTPUT_CREATE_FAILED');
  }
  let position = 0;
  const artifactDigest = createHash('sha256');
  let completed = false;
  try {
    for (const chunk of input.manifest.chunks) {
      const verified = await readVerifiedChunk({
        storage: input.storage,
        policy: input.policy,
        artifactHandle: input.manifest.artifactHandle,
        sequence: chunk.sequence,
        byteLength: chunk.byteLength,
        contentSha256: chunk.contentSha256,
        objectKey: chunk.objectKey,
        expectedFullGetETag: chunk.fullGetETag,
        expectedHeadETag: chunk.headETag,
        abortSignal: input.abortSignal,
        onChunk: async (bytes) => {
          await writeAll(output, bytes, position);
          position += bytes.byteLength;
          artifactDigest.update(bytes);
        },
      });
      if (!verified) fail('CHUNK_MISSING');
    }
    if (position !== input.manifest.artifactByteLength
      || artifactDigest.digest('hex')
        !== input.manifest.artifactContentSha256) {
      fail('REOPENED_ARTIFACT_MISMATCH');
    }
    await output.sync();
    await output.close();
    const reread = await inspectLocalRange({
      localPath: input.outputPath,
      expectedFileBytes: input.manifest.artifactByteLength,
      startByte: 0,
      endExclusiveByte: input.manifest.artifactByteLength,
      abortSignal: input.abortSignal,
    });
    if (reread.contentSha256 !== input.manifest.artifactContentSha256) {
      fail('REOPENED_FILE_CONTENT_MISMATCH');
    }
    completed = true;
    return Object.freeze({
      localPath: input.outputPath,
      byteLength: input.manifest.artifactByteLength,
      contentSha256: input.manifest.artifactContentSha256,
      artifactHandle: input.manifest.artifactHandle,
    });
  } catch (error) {
    try {
      await output.close();
    } catch {
      // The exact file created by this invocation is removed below.
    }
    throw normalizeError(error, 'REOPEN_FAILED');
  } finally {
    if (!completed) {
      try {
        await rm(input.outputPath, { force: true });
      } catch {
        throw new MediaProxyMasterR2PreparedArtifactStoreErrorV1(
          'OUTPUT_CLEANUP_FAILED',
        );
      }
    }
  }
}

type ObjectExpectationV1 = Readonly<{
  contentType: string;
  byteLength: number;
  metadata: Record<string, string>;
}>;

function chunkExpectation(input: Readonly<{
  storage: StorageContextV1;
  policy: MediaProxyMasterR2PreparedArtifactPolicyV1;
  artifactHandle: string;
  sequence: number;
  byteLength: number;
  contentSha256: string;
  objectKey: string;
}>): ObjectExpectationV1 {
  if (input.objectKey
    !== expectedMediaProxyMasterR2PreparedArtifactChunkObjectKeyV1(
      input.artifactHandle,
      input.sequence,
      input.contentSha256,
    )) {
    fail('CHUNK_KEY_MISMATCH');
  }
  return Object.freeze({
    contentType: CHUNK_CONTENT_TYPE,
    byteLength: input.byteLength,
    metadata: {
      artifactprofile: CHUNK_PROFILE,
      storeversion: MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_VERSION_V1,
      storagepolicyversion: input.storage.storagePolicyVersion,
      preparedpolicysha256: input.policy.policySha256,
      artifacthandle: input.artifactHandle,
      sequence: String(input.sequence),
      contentsha256: input.contentSha256,
      bytelength: String(input.byteLength),
    },
  });
}

function manifestExpectation(
  storage: StorageContextV1,
  policy: MediaProxyMasterR2PreparedArtifactPolicyV1,
  serialization: MediaProxyMasterR2PreparedArtifactManifestSerializationV1,
): ObjectExpectationV1 {
  return Object.freeze({
    contentType: MANIFEST_CONTENT_TYPE,
    byteLength: serialization.byteLength,
    metadata: {
      artifactprofile: MANIFEST_PROFILE,
      storeversion: MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_VERSION_V1,
      storagepolicyversion: storage.storagePolicyVersion,
      preparedpolicysha256: policy.policySha256,
      artifacthandle: serialization.manifest.artifactHandle,
      contentsha256: serialization.contentSha256,
      bytelength: String(serialization.byteLength),
    },
  });
}

function assertObjectHeaders(
  response: StoredResponseV1,
  expected: ObjectExpectationV1,
): void {
  if (response.CacheControl !== PRIVATE_CACHE_CONTROL
    || response.ContentDisposition !== CONTENT_DISPOSITION
    || response.ContentLength !== expected.byteLength
    || response.ContentType !== expected.contentType
    || !sameMetadata(response.Metadata, expected.metadata)) {
    fail('OBJECT_HEADERS_OR_METADATA_INVALID');
  }
}

async function getObjectOrNull(input: Readonly<{
  storage: StorageContextV1;
  objectKey: string;
  abortSignal?: AbortSignal;
}>): Promise<StoredResponseV1 | null> {
  try {
    const response = await send(input.storage.client, new GetObjectCommand({
      Bucket: input.storage.bucketName,
      Key: input.objectKey,
    }), input.abortSignal);
    return storedResponse(response, 'GET_RESPONSE');
  } catch (error) {
    throwIfAborted(input.abortSignal);
    if (isMissingObject(error)) return null;
    fail('GET_FAILED');
  }
}

async function headObject(input: Readonly<{
  storage: StorageContextV1;
  objectKey: string;
  abortSignal?: AbortSignal;
}>): Promise<StoredResponseV1> {
  try {
    const response = await send(input.storage.client, new HeadObjectCommand({
      Bucket: input.storage.bucketName,
      Key: input.objectKey,
    }), input.abortSignal);
    return storedResponse(response, 'HEAD_RESPONSE');
  } catch {
    throwIfAborted(input.abortSignal);
    fail('HEAD_FAILED');
  }
}

async function verifyLocalArtifact(input: Readonly<{
  localPath: string;
  expected: Readonly<{ byteLength: number; contentSha256: string }>;
  abortSignal?: AbortSignal;
}>): Promise<void> {
  const inspected = await inspectLocalRange({
    localPath: input.localPath,
    expectedFileBytes: input.expected.byteLength,
    startByte: 0,
    endExclusiveByte: input.expected.byteLength,
    abortSignal: input.abortSignal,
  });
  if (inspected.contentSha256 !== input.expected.contentSha256) {
    fail('LOCAL_ARTIFACT_CONTENT_MISMATCH');
  }
}

async function inspectLocalRange(input: Readonly<{
  localPath: string;
  expectedFileBytes: number;
  startByte: number;
  endExclusiveByte: number;
  abortSignal?: AbortSignal;
}>): Promise<Readonly<{ byteLength: number; contentSha256: string }>> {
  if (!Number.isSafeInteger(input.startByte) || input.startByte < 0
    || !Number.isSafeInteger(input.endExclusiveByte)
    || input.endExclusiveByte <= input.startByte
    || input.endExclusiveByte > input.expectedFileBytes) {
    fail('LOCAL_RANGE_INVALID');
  }
  const localPath = absolutePath(input.localPath, 'LOCAL_PATH');
  const before = await pathFileIdentity(
    localPath,
    input.expectedFileBytes,
  );
  const stream = createReadStream(localPath, {
    start: input.startByte,
    end: input.endExclusiveByte - 1,
  });
  let observed;
  try {
    observed = await digestBody({
      body: stream,
      expectedByteLength: input.endExclusiveByte - input.startByte,
      abortSignal: input.abortSignal,
    });
  } finally {
    stream.destroy();
  }
  const after = await pathFileIdentity(
    localPath,
    input.expectedFileBytes,
  );
  if (!sameFileIdentity(before, after)) fail('LOCAL_FILE_CHANGED');
  return observed;
}

async function digestBody(input: Readonly<{
  body: unknown;
  expectedByteLength: number;
  abortSignal?: AbortSignal;
  onChunk?: (chunk: Uint8Array) => Promise<void>;
}>): Promise<Readonly<{ byteLength: number; contentSha256: string }>> {
  throwIfAborted(input.abortSignal);
  const digest = createHash('sha256');
  let byteLength = 0;
  const consume = async (chunk: unknown) => {
    throwIfAborted(input.abortSignal);
    if (!(chunk instanceof Uint8Array)
      || byteLength + chunk.byteLength > input.expectedByteLength) {
      fail('BODY_LENGTH_MISMATCH');
    }
    byteLength += chunk.byteLength;
    digest.update(chunk);
    await input.onChunk?.(chunk);
  };
  if (input.body instanceof Uint8Array) {
    await consume(input.body);
  } else {
    if (!isAsyncIterable(input.body)) fail('BODY_INVALID');
    for await (const chunk of input.body) await consume(chunk);
  }
  if (byteLength !== input.expectedByteLength) fail('BODY_LENGTH_MISMATCH');
  return Object.freeze({
    byteLength,
    contentSha256: digest.digest('hex'),
  });
}

async function collectBody(input: Readonly<{
  body: unknown;
  expectedByteLength: number;
  abortSignal?: AbortSignal;
}>): Promise<Readonly<{ bytes: Uint8Array; contentSha256: string }>> {
  const chunks: Uint8Array[] = [];
  const observed = await digestBody({
    ...input,
    onChunk: async (chunk) => { chunks.push(Uint8Array.from(chunk)); },
  });
  return Object.freeze({
    bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)),
      observed.byteLength),
    contentSha256: observed.contentSha256,
  });
}

async function writeAll(
  output: Awaited<ReturnType<typeof open>>,
  bytes: Uint8Array,
  position: number,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const result = await output.write(
      bytes,
      offset,
      bytes.byteLength - offset,
      position + offset,
    );
    if (result.bytesWritten < 1) fail('OUTPUT_WRITE_FAILED');
    offset += result.bytesWritten;
  }
}

async function pathFileIdentity(
  localPath: string,
  expectedBytes: number,
) {
  let stat;
  try {
    stat = await lstat(localPath);
  } catch {
    fail('LOCAL_FILE_INVALID');
  }
  if (!stat!.isFile() || stat!.isSymbolicLink()
    || stat!.size !== expectedBytes) {
    fail('LOCAL_FILE_INVALID');
  }
  return Object.freeze({
    size: stat!.size,
    mtimeMs: stat!.mtimeMs,
    ctimeMs: stat!.ctimeMs,
  });
}

function sameFileIdentity(
  left: Readonly<{ size: number; mtimeMs: number; ctimeMs: number }>,
  right: Readonly<{ size: number; mtimeMs: number; ctimeMs: number }>,
): boolean {
  return left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function identityInput(
  value: MediaProxyMasterR2PreparedArtifactIdentityInputV1,
): Omit<MediaProxyMasterR2PreparedArtifactIdentityInputV1, 'policy'> {
  return {
    jobId: value.jobId,
    tenantId: value.tenantId,
    userId: value.userId,
    orgId: value.orgId,
    owner: value.owner,
    assetId: value.assetId,
    commandSha256: value.commandSha256,
    outputProbeSha256: value.outputProbeSha256,
    artifactByteLength: value.artifactByteLength,
    artifactContentSha256: value.artifactContentSha256,
  };
}

function policyForStorage(
  value: MediaProxyMasterR2PreparedArtifactPolicyV1,
  storage: StorageContextV1,
): MediaProxyMasterR2PreparedArtifactPolicyV1 {
  const policy = assertMediaProxyMasterR2PreparedArtifactPolicyV1(value);
  const bound = policy.publicationPolicy.singlePut.policy;
  if (bound.bucketName !== storage.bucketName
    || bound.storagePolicyVersion !== storage.storagePolicyVersion
    || bound.browserRouteExposure !== 'NO_BROWSER_ROUTE') {
    fail('POLICY_STORAGE_MISMATCH');
  }
  return policy;
}

function normalizeStorage(
  value: MediaSourcePtsCadenceR2PrivateStorageScopeV1,
  client: MediaSourcePtsCadenceR2CommandClientV1,
): StorageContextV1 {
  if (!value || value.browserRouteExposure !== 'NO_BROWSER_ROUTE'
    || value.bucketName === 'editron-cdn'
    || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value.bucketName)
    || typeof value.storagePolicyVersion !== 'string'
    || value.storagePolicyVersion.trim() !== value.storagePolicyVersion
    || value.storagePolicyVersion.length < 1
    || value.storagePolicyVersion.length > 256
    || /[\u0000-\u001F\u007F]/.test(value.storagePolicyVersion)) {
    fail('PRIVATE_STORAGE_INVALID');
  }
  if (!client || typeof client.send !== 'function') fail('CLIENT_INVALID');
  return Object.freeze({
    bucketName: value.bucketName,
    storagePolicyVersion: value.storagePolicyVersion,
    client,
  });
}

async function send(
  client: MediaSourcePtsCadenceR2CommandClientV1,
  command: unknown,
  abortSignal?: AbortSignal,
): Promise<unknown> {
  throwIfAborted(abortSignal);
  const abortable = client as unknown as Readonly<{
    send(
      commandInput: unknown,
      options?: Readonly<{ abortSignal?: AbortSignal }>,
    ): Promise<unknown>;
  }>;
  return abortable.send(command, abortSignal ? { abortSignal } : undefined);
}

function storedResponse(value: unknown, label: string): StoredResponseV1 {
  return object(value, label) as StoredResponseV1;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label}_INVALID`);
  }
  return value as Record<string, unknown>;
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

function eTag(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  const normalized = value.trim().replace(/^\"|\"$/g, '');
  if (normalized.length < 1 || normalized.length > 512
    || /[\u0000-\u001F\u007F]/.test(normalized)) {
    fail(`${label}_INVALID`);
  }
  return normalized;
}

function absolutePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value)
    || value.length > 4_096 || /[\u0000-\u001F\u007F]/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function positiveInteger(value: unknown, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1
    || Number(value) > maximum) {
    fail(`${label}_INVALID`);
  }
  return Number(value);
}

function instant(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(value) && (typeof value === 'object' || typeof value === 'function')
    && Symbol.asyncIterator in (value as object)
    && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator]
      === 'function';
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    name?: unknown;
    Code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return candidate.name === 'NoSuchKey' || candidate.name === 'NotFound'
    || candidate.Code === 'NoSuchKey' || candidate.Code === 'NotFound'
    || candidate.$metadata?.httpStatusCode === 404;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) fail('ABORTED');
}

function normalizeError(error: unknown, fallback: string): Error {
  return error instanceof MediaProxyMasterR2PreparedArtifactStoreErrorV1
    ? error
    : new MediaProxyMasterR2PreparedArtifactStoreErrorV1(fallback);
}

function fail(code: string): never {
  throw new MediaProxyMasterR2PreparedArtifactStoreErrorV1(code);
}

export class MediaProxyMasterR2PreparedArtifactStoreErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_${code}`);
    this.name = 'MediaProxyMasterR2PreparedArtifactStoreErrorV1';
  }
}
