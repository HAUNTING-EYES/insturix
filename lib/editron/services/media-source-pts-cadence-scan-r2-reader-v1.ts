import { createHash } from 'node:crypto';

import { GetObjectCommand } from '@aws-sdk/client-s3';

import type {
  MediaSourcePtsCadenceR2CommandClientV1,
  MediaSourcePtsCadenceR2PrivateStorageScopeV1,
} from './media-source-pts-cadence-r2-private-sidecar-v1';
import {
  expectedMediaSourcePtsCadenceScanBatchObjectKeyV1,
  MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_ABSOLUTE_MAX_BYTES_V1,
  MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_SIDECAR_KIND_V1,
  parseMediaSourcePtsCadenceScanStagingBatchV1,
  type MediaSourcePtsCadenceScanBatchSidecarV1,
  type MediaSourcePtsCadenceScanStagingBatchV1,
} from './media-source-pts-cadence-scan-staging-v1';

export type MediaSourcePtsCadenceScanStagingReaderV1 = Readonly<{
  read(sidecar: MediaSourcePtsCadenceScanBatchSidecarV1): Promise<MediaSourcePtsCadenceScanStagingBatchV1>;
}>;

/** Reads only the private temporary scan namespace; it cannot read canonical V2 artifacts. */
export function createMediaSourcePtsCadenceScanR2ReaderV1(input: {
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
  client: MediaSourcePtsCadenceR2CommandClientV1;
}): MediaSourcePtsCadenceScanStagingReaderV1 {
  const bucketName = assertPrivateStorage(input.privateStorage);
  if (!input.client || typeof input.client.send !== 'function') {
    throw new Error('MEDIA_SOURCE_PTS_SCAN_R2_CLIENT_INVALID');
  }
  return {
    read: async (sidecar) => {
      const expected = assertSidecar(sidecar);
      let response: unknown;
      try {
        response = await input.client.send(new GetObjectCommand({
          Bucket: bucketName,
          Key: expected.objectKey,
        }));
      } catch {
        throw new Error('MEDIA_SOURCE_PTS_SCAN_R2_READ_FAILED');
      }
      const body = response && typeof response === 'object'
        ? (response as { Body?: unknown }).Body
        : undefined;
      const bytes = await readExactBytes(body, expected.byteLength);
      if (createHash('sha256').update(bytes).digest('hex') !== expected.contentSha256) {
        throw new Error('MEDIA_SOURCE_PTS_SCAN_R2_CONTENT_MISMATCH');
      }
      return parseMediaSourcePtsCadenceScanStagingBatchV1(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      );
    },
  };
}

function assertSidecar(value: MediaSourcePtsCadenceScanBatchSidecarV1) {
  const mapBindingSha256 = /^private\/editron\/media-source-pts-scan\/v1\/([a-f0-9]{64})\//
    .exec(value?.objectKey)?.[1];
  const sequence = /\/batches\/(0|[1-9]\d{0,15})\//.exec(value?.objectKey)?.[1];
  if (!mapBindingSha256 || sequence === undefined || !Number.isSafeInteger(Number(sequence))) {
    throw new Error('MEDIA_SOURCE_PTS_SCAN_R2_SIDECAR_INVALID');
  }
  const expectedKey = expectedMediaSourcePtsCadenceScanBatchObjectKeyV1(
    mapBindingSha256,
    Number(sequence),
    value.contentSha256,
  );
  if (value.schemaVersion !== 1
    || value.kind !== MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_SIDECAR_KIND_V1
    || value.storage !== 'R2_PRIVATE'
    || value.objectKey !== expectedKey
    || !Number.isSafeInteger(value.byteLength) || value.byteLength < 1
    || value.byteLength > MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_ABSOLUTE_MAX_BYTES_V1
    || !/^[a-f0-9]{64}$/.test(value.contentSha256)) {
    throw new Error('MEDIA_SOURCE_PTS_SCAN_R2_SIDECAR_INVALID');
  }
  return value;
}

function assertPrivateStorage(value: MediaSourcePtsCadenceR2PrivateStorageScopeV1): string {
  if (!value || value.browserRouteExposure !== 'NO_BROWSER_ROUTE'
    || typeof value.storagePolicyVersion !== 'string' || !value.storagePolicyVersion.trim()
    || typeof value.bucketName !== 'string'
    || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value.bucketName)
    || value.bucketName === 'editron-cdn') {
    throw new Error('MEDIA_SOURCE_PTS_SCAN_R2_PRIVATE_STORAGE_INVALID');
  }
  return value.bucketName;
}

async function readExactBytes(body: unknown, expectedLength: number): Promise<Uint8Array> {
  if (!body || typeof body !== 'object' || !(Symbol.asyncIterator in body)
    || typeof (body as AsyncIterable<unknown>)[Symbol.asyncIterator] !== 'function') {
    throw new Error('MEDIA_SOURCE_PTS_SCAN_R2_BODY_INVALID');
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body as AsyncIterable<unknown>) {
    if (!(chunk instanceof Uint8Array) || total + chunk.byteLength > expectedLength) {
      throw new Error('MEDIA_SOURCE_PTS_SCAN_R2_CONTENT_MISMATCH');
    }
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  if (total !== expectedLength) throw new Error('MEDIA_SOURCE_PTS_SCAN_R2_CONTENT_MISMATCH');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
