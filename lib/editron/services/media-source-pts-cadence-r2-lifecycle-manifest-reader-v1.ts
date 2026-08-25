import { createHash } from 'node:crypto';

import { GetObjectCommand } from '@aws-sdk/client-s3';

import type {
  MediaSourcePtsCadenceR2CommandClientV1,
  MediaSourcePtsCadenceR2PrivateStorageScopeV1,
} from './media-source-pts-cadence-r2-private-sidecar-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_PRIVATE_SIDECAR_KIND_V1,
  type MediaSourcePtsCadencePrivateSidecarV1,
} from './media-source-pts-cadence-map-lifecycle-v1';
import type { MediaSourcePtsCadenceStoredObjectReaderV2 } from './media-source-pts-cadence-map-asset-state-v2';

const MAX_LIFECYCLE_MANIFEST_BYTES = 8 * 1024 * 1024;
const LIFECYCLE_MANIFEST_KEY =
  /^private\/editron\/media-source-pts-cadence\/v1\/[a-f0-9]{64}\/manifests\/[a-f0-9]{64}\.json$/;

/** Reads only V1 lifecycle manifests needed by the V2 terminal verifier. */
export function createMediaSourcePtsCadenceR2LifecycleManifestReaderV1(input: {
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
  client: MediaSourcePtsCadenceR2CommandClientV1;
}): MediaSourcePtsCadenceStoredObjectReaderV2 {
  const bucketName = assertPrivateStorage(input.privateStorage);
  if (!input.client || typeof input.client.send !== 'function') {
    throw new Error('MEDIA_SOURCE_PTS_LIFECYCLE_R2_CLIENT_INVALID');
  }
  return {
    read: async (sidecar) => {
      const expected = assertManifestSidecar(sidecar);
      let response: unknown;
      try {
        response = await input.client.send(new GetObjectCommand({
          Bucket: bucketName,
          Key: expected.objectKey,
        }));
      } catch {
        throw new Error('MEDIA_SOURCE_PTS_LIFECYCLE_R2_READ_FAILED');
      }
      const body = response && typeof response === 'object'
        ? (response as { Body?: unknown }).Body
        : undefined;
      const bytes = await readExactBytes(body, expected.byteLength);
      const contentSha256 = createHash('sha256').update(bytes).digest('hex');
      if (contentSha256 !== expected.contentSha256) {
        throw new Error('MEDIA_SOURCE_PTS_LIFECYCLE_R2_CONTENT_MISMATCH');
      }
      return {
        canonicalJson: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        byteLength: bytes.byteLength,
        contentSha256,
      };
    },
  };
}

function assertManifestSidecar(value: unknown): MediaSourcePtsCadencePrivateSidecarV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MEDIA_SOURCE_PTS_LIFECYCLE_R2_SIDECAR_INVALID');
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_SOURCE_PTS_CADENCE_PRIVATE_SIDECAR_KIND_V1
    || record.storage !== 'R2_PRIVATE'
    || typeof record.objectKey !== 'string' || !LIFECYCLE_MANIFEST_KEY.test(record.objectKey)
    || !Number.isSafeInteger(record.byteLength) || Number(record.byteLength) < 1
    || Number(record.byteLength) > MAX_LIFECYCLE_MANIFEST_BYTES
    || typeof record.contentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.contentSha256)) {
    throw new Error('MEDIA_SOURCE_PTS_LIFECYCLE_R2_SIDECAR_INVALID');
  }
  return record as MediaSourcePtsCadencePrivateSidecarV1;
}

function assertPrivateStorage(value: MediaSourcePtsCadenceR2PrivateStorageScopeV1): string {
  if (!value || value.browserRouteExposure !== 'NO_BROWSER_ROUTE'
    || typeof value.storagePolicyVersion !== 'string' || !value.storagePolicyVersion.trim()
    || typeof value.bucketName !== 'string'
    || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value.bucketName)
    || value.bucketName === 'editron-cdn') {
    throw new Error('MEDIA_SOURCE_PTS_LIFECYCLE_R2_PRIVATE_STORAGE_INVALID');
  }
  return value.bucketName;
}

async function readExactBytes(body: unknown, expectedLength: number): Promise<Uint8Array> {
  if (!body || typeof body !== 'object' || !(Symbol.asyncIterator in body)
    || typeof (body as AsyncIterable<unknown>)[Symbol.asyncIterator] !== 'function') {
    throw new Error('MEDIA_SOURCE_PTS_LIFECYCLE_R2_BODY_INVALID');
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body as AsyncIterable<unknown>) {
    if (!(chunk instanceof Uint8Array) || total + chunk.byteLength > expectedLength) {
      throw new Error('MEDIA_SOURCE_PTS_LIFECYCLE_R2_CONTENT_MISMATCH');
    }
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  if (total !== expectedLength) throw new Error('MEDIA_SOURCE_PTS_LIFECYCLE_R2_CONTENT_MISMATCH');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
