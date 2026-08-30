import { createHash } from 'node:crypto';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import {
  canonicalizeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaProxyMasterCorrespondenceArtifactVerificationPolicyV1,
  verifyMediaProxyMasterCorrespondenceArtifactsV1,
  type MediaProxyMasterCorrespondenceArtifactReaderV1,
  type MediaProxyMasterCorrespondenceArtifactVerificationPolicyV1,
  type MediaProxyMasterCorrespondenceArtifactVerificationReceiptV1,
} from './media-proxy-master-correspondence-artifact-verifier-v1';
import {
  assertMediaProxyMasterCorrespondenceBasisV1,
  createMediaProxyMasterCorrespondenceBatchSidecarV1,
  MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_ABSOLUTE_MAX_BYTES_V1,
  type MediaProxyMasterCorrespondenceBasisV1,
  type MediaProxyMasterCorrespondenceBatchSerializationV1,
  type MediaProxyMasterCorrespondenceBatchSidecarV1,
} from './media-proxy-master-correspondence-batch-v1';
import {
  createMediaProxyMasterCorrespondenceIndexReferenceV1,
  createMediaProxyMasterCorrespondenceIndexV1,
  MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_ABSOLUTE_MAX_BYTES_V1,
  type MediaProxyMasterCorrespondenceIndexSerializationV1,
} from './media-proxy-master-correspondence-index-v1';
import type { MediaProxyMasterCorrespondenceIndexReferenceV1 } from './media-proxy-master-time-mapping-v1';
import type {
  MediaSourcePtsCadenceR2CommandClientV1,
  MediaSourcePtsCadenceR2PrivateStorageScopeV1,
} from './media-source-pts-cadence-r2-private-sidecar-v1';

const CORRESPONDENCE_OBJECT_KEY =
  /^private\/editron\/media-proxy-master-correspondence\/[a-f0-9]{64}\/(?:batches\/[0-9]{8}-[a-f0-9]{64}|indexes\/[a-f0-9]{64})\.json$/;
const MAX_OBJECT_BYTES = Math.max(
  MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_ABSOLUTE_MAX_BYTES_V1,
  MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_ABSOLUTE_MAX_BYTES_V1,
);

type StoredObjectReferenceV1 = Readonly<{
  objectKey: string;
  byteLength: number;
  contentSha256: string;
}>;

export type MediaProxyMasterCorrespondenceR2ArtifactSetInputV1 = Readonly<{
  basis: MediaProxyMasterCorrespondenceBasisV1;
  batches: readonly Readonly<{
    serialization: MediaProxyMasterCorrespondenceBatchSerializationV1;
    sidecar: MediaProxyMasterCorrespondenceBatchSidecarV1;
  }>[];
  indexSerialization: MediaProxyMasterCorrespondenceIndexSerializationV1;
  indexReference: MediaProxyMasterCorrespondenceIndexReferenceV1;
  verificationPolicy: MediaProxyMasterCorrespondenceArtifactVerificationPolicyV1;
}>;

export type MediaProxyMasterCorrespondenceR2PrivateArtifactStoreV1 =
  MediaProxyMasterCorrespondenceArtifactReaderV1 & Readonly<{
    writeAndVerifyArtifactSet(
      input: MediaProxyMasterCorrespondenceR2ArtifactSetInputV1,
    ): Promise<MediaProxyMasterCorrespondenceArtifactVerificationReceiptV1>;
  }>;

/**
 * Stores immutable correspondence batches before publishing their immutable
 * index. A pre-existing content-addressed key is accepted only after an exact
 * reread. Failed later writes may leave unreachable immutable batches; they
 * are never deleted here because another verified index may share them.
 */
export function createMediaProxyMasterCorrespondenceR2PrivateArtifactStoreV1(
  input: Readonly<{
    privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
    client: MediaSourcePtsCadenceR2CommandClientV1;
  }>,
): MediaProxyMasterCorrespondenceR2PrivateArtifactStoreV1 {
  const privateStorage = assertPrivateStorage(input.privateStorage);
  if (!input.client || typeof input.client.send !== 'function') {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_CLIENT_INVALID');
  }
  const storage = { client: input.client, bucketName: privateStorage.bucketName };
  const reader: MediaProxyMasterCorrespondenceArtifactReaderV1 = {
    read: (reference) => readExactObject({ ...storage, reference }),
  };

  return Object.freeze({
    read: reader.read,
    writeAndVerifyArtifactSet: async (artifactSet) => {
      const prepared = prepareArtifactSet(artifactSet);
      for (const batch of prepared.batches) {
        await writeAndRereadExactObject({
          ...storage,
          reference: batch.sidecar,
          canonicalJson: batch.serialization.canonicalJson,
          family: 'BATCH',
          basisSha256: prepared.basisSha256,
        });
      }
      await writeAndRereadExactObject({
        ...storage,
        reference: prepared.indexReference,
        canonicalJson: prepared.indexSerialization.canonicalJson,
        family: 'INDEX',
        basisSha256: prepared.basisSha256,
      });

      const verification = await verifyMediaProxyMasterCorrespondenceArtifactsV1({
        basis: prepared.basis,
        indexReference: prepared.indexReference,
        verificationPolicy: prepared.verificationPolicy,
        reader,
      });
      if (verification.disposition === 'UNVERIFIABLE') {
        throw new Error(
          `MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_ARTIFACT_UNVERIFIABLE:${verification.reason}`,
        );
      }
      return verification;
    },
  });
}

function prepareArtifactSet(
  input: MediaProxyMasterCorrespondenceR2ArtifactSetInputV1,
): Readonly<{
  basis: MediaProxyMasterCorrespondenceBasisV1;
  basisSha256: string;
  batches: MediaProxyMasterCorrespondenceR2ArtifactSetInputV1['batches'];
  indexSerialization: MediaProxyMasterCorrespondenceIndexSerializationV1;
  indexReference: MediaProxyMasterCorrespondenceIndexReferenceV1;
  verificationPolicy: MediaProxyMasterCorrespondenceArtifactVerificationPolicyV1;
}> {
  const basis = assertMediaProxyMasterCorrespondenceBasisV1(input.basis);
  if (!Array.isArray(input.batches) || input.batches.length === 0) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_BATCHES_INVALID');
  }
  const batches = input.batches.map((entry) => {
    const sidecar = createMediaProxyMasterCorrespondenceBatchSidecarV1({
      serialization: entry.serialization,
    });
    if (canonicalizeEditronJsonV1(sidecar)
      !== canonicalizeEditronJsonV1(entry.sidecar)) {
      throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_BATCH_SIDECAR_MISMATCH');
    }
    return { serialization: entry.serialization, sidecar };
  });
  const reconstructed = createMediaProxyMasterCorrespondenceIndexV1({
    basis,
    resourcePolicy: input.indexSerialization.index.resourcePolicy,
    batches,
  });
  if (reconstructed.canonicalJson !== input.indexSerialization.canonicalJson
    || reconstructed.byteLength !== input.indexSerialization.byteLength
    || reconstructed.contentSha256 !== input.indexSerialization.contentSha256) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_INDEX_SERIALIZATION_MISMATCH');
  }
  const indexReference = createMediaProxyMasterCorrespondenceIndexReferenceV1({
    serialization: reconstructed,
  });
  if (canonicalizeEditronJsonV1(indexReference)
    !== canonicalizeEditronJsonV1(input.indexReference)) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_INDEX_REFERENCE_MISMATCH');
  }
  return {
    basis,
    basisSha256: hashEditronCanonicalJsonV1(basis),
    batches,
    indexSerialization: reconstructed,
    indexReference,
    verificationPolicy:
      assertMediaProxyMasterCorrespondenceArtifactVerificationPolicyV1(
        input.verificationPolicy,
      ),
  };
}

async function writeAndRereadExactObject(input: Readonly<{
  client: MediaSourcePtsCadenceR2CommandClientV1;
  bucketName: string;
  reference: StoredObjectReferenceV1;
  canonicalJson: string;
  family: 'BATCH' | 'INDEX';
  basisSha256: string;
}>): Promise<void> {
  const reference = assertReference(input.reference);
  const bytes = Buffer.from(input.canonicalJson, 'utf8');
  if (bytes.byteLength !== reference.byteLength
    || digest(bytes) !== reference.contentSha256) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_SERIALIZATION_MISMATCH');
  }
  try {
    await input.client.send(new PutObjectCommand({
      Bucket: input.bucketName,
      Key: reference.objectKey,
      Body: bytes,
      ContentLength: bytes.byteLength,
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'no-store',
      IfNoneMatch: '*',
      Metadata: {
        'content-sha256': reference.contentSha256,
        'basis-sha256': input.basisSha256,
        'artifact-family': input.family.toLowerCase(),
      },
    }));
  } catch (error) {
    if (!isPreconditionFailed(error)) {
      throw new Error(`MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_${input.family}_WRITE_FAILED`);
    }
  }
  const stored = await readExactObject({
    client: input.client,
    bucketName: input.bucketName,
    reference,
  });
  if (stored.canonicalJson !== input.canonicalJson) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_CONTENT_MISMATCH');
  }
}

async function readExactObject(input: Readonly<{
  client: MediaSourcePtsCadenceR2CommandClientV1;
  bucketName: string;
  reference: StoredObjectReferenceV1;
}>): Promise<Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>> {
  const reference = assertReference(input.reference);
  let response: unknown;
  try {
    response = await input.client.send(new GetObjectCommand({
      Bucket: input.bucketName,
      Key: reference.objectKey,
    }));
  } catch {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_READ_FAILED');
  }
  const body = response && typeof response === 'object'
    ? (response as { Body?: unknown }).Body
    : undefined;
  let bytes: Uint8Array;
  try {
    bytes = await readExactlyBoundedBytes(body, reference.byteLength);
  } catch {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_CONTENT_MISMATCH');
  }
  const contentSha256 = digest(bytes);
  if (contentSha256 !== reference.contentSha256) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_CONTENT_MISMATCH');
  }
  return {
    canonicalJson: Buffer.from(bytes).toString('utf8'),
    byteLength: bytes.byteLength,
    contentSha256,
  };
}

async function readExactlyBoundedBytes(
  body: unknown,
  expectedByteLength: number,
): Promise<Uint8Array> {
  if (body instanceof Uint8Array) {
    if (body.byteLength !== expectedByteLength) {
      throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_BODY_SIZE_MISMATCH');
    }
    return body;
  }
  if (body && typeof body === 'object' && 'transformToByteArray' in body) {
    const transform = (body as { transformToByteArray?: unknown }).transformToByteArray;
    if (typeof transform === 'function') {
      return readExactlyBoundedBytes(await transform.call(body), expectedByteLength);
    }
  }
  if (!isAsyncIterable(body)) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_BODY_INVALID');
  }
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array)
      || byteLength + chunk.byteLength > expectedByteLength) {
      throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_BODY_SIZE_MISMATCH');
    }
    chunks.push(chunk);
    byteLength += chunk.byteLength;
  }
  if (byteLength !== expectedByteLength) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_BODY_SIZE_MISMATCH');
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function assertReference(value: unknown): StoredObjectReferenceV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_REFERENCE_INVALID');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.objectKey !== 'string'
    || !CORRESPONDENCE_OBJECT_KEY.test(record.objectKey)) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_OBJECT_KEY_INVALID');
  }
  if (!Number.isSafeInteger(record.byteLength)
    || Number(record.byteLength) < 1
    || Number(record.byteLength) > MAX_OBJECT_BYTES) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_BYTE_LENGTH_INVALID');
  }
  if (typeof record.contentSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(record.contentSha256)) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_CONTENT_HASH_INVALID');
  }
  return {
    objectKey: record.objectKey,
    byteLength: Number(record.byteLength),
    contentSha256: record.contentSha256,
  };
}

function assertPrivateStorage(
  value: unknown,
): MediaSourcePtsCadenceR2PrivateStorageScopeV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_STORAGE_INVALID');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.bucketName !== 'string'
    || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(record.bucketName)
    || record.bucketName === 'editron-cdn'
    || record.browserRouteExposure !== 'NO_BROWSER_ROUTE'
    || typeof record.storagePolicyVersion !== 'string'
    || record.storagePolicyVersion.trim() !== record.storagePolicyVersion
    || record.storagePolicyVersion.length === 0
    || record.storagePolicyVersion.length > 255) {
    throw new Error('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_STORAGE_INVALID');
  }
  return {
    bucketName: record.bucketName,
    browserRouteExposure: 'NO_BROWSER_ROUTE',
    storagePolicyVersion: record.storagePolicyVersion,
  };
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(value) && typeof value === 'object'
    && Symbol.asyncIterator in (value as object)
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

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
