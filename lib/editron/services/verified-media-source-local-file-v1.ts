import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import type { MediaSourcePtsCadenceMapAssetStateInputV3 } from './media-source-pts-cadence-map-asset-owner-v3';
import type { MediaSourceQualificationRecordV1 } from './media-source-qualification-v1';
import { resolveVerifiedMediaSourceUrlV1 } from './media-source-qualification-runtime-v1';
import {
  inspectMediaSourceStorageVersionV1,
  sameMediaSourceStorageVersionV1,
  type MediaSourceStorageVersionV1,
} from './media-source-storage-version-v1';
import { assertMediaSourceVersionV1, type MediaSourceVersionV1 } from './media-source-version-v1';
import { resolveVerifiedVideoSourceEpochTimeBindingV3 } from './video-source-time-transform-v1';

const MAX_DOWNLOAD_TIMEOUT_MS_V1 = 60 * 60 * 1_000;

export type VerifiedMediaSourceLeaseV1 = Readonly<{
  sourceUrl: string;
  storageVersion: MediaSourceStorageVersionV1;
  revalidate(): Promise<boolean>;
}>;

export interface VerifiedMediaSourceLeasePortV1 {
  open(sourceVersion: Readonly<MediaSourceVersionV1>): Promise<VerifiedMediaSourceLeaseV1>;
}

export type VerifiedMediaSourceLeaseErrorCodesV1 = Readonly<{
  bindingStale: string;
  versionStale: string;
}>;

export type VerifiedMediaSourceFileErrorCodesV1 = Readonly<{
  sourceByteLimitExceeded: string;
  sourceUrlInvalid: string;
  sourceReadFailed: string;
  sourceByteLengthMismatch: string;
  sourceContentMismatch: string;
  outputWriteFailed: string;
}>;

export type VerifiedMediaSourceLocalFileEvidenceV1 = Readonly<{
  sourceVersionSha256: string;
  storageVersionSha256: string;
  byteLength: number;
  contentSha256: string;
}>;

export function createVerifiedAssetMediaSourceLeasePortV1(
  asset: MediaSourcePtsCadenceMapAssetStateInputV3,
  errorCodesInput: VerifiedMediaSourceLeaseErrorCodesV1,
): VerifiedMediaSourceLeasePortV1 {
  const errorCodes = normalizeLeaseErrorCodes(errorCodesInput);
  return {
    async open(expectedSourceVersion) {
      const sourceVersion = assertMediaSourceVersionV1(asset.sourceVersionV1);
      const binding = resolveVerifiedVideoSourceEpochTimeBindingV3(asset);
      if (!binding
        || sourceVersion.sourceVersionSha256 !== expectedSourceVersion.sourceVersionSha256
        || binding.sourceVersionSha256 !== sourceVersion.sourceVersionSha256
        || binding.storageVersionSha256 !== sourceVersion.storageVersion.storageVersionSha256) {
        throw new Error(errorCodes.bindingStale);
      }
      const qualification = asset.sourceQualificationV1 as MediaSourceQualificationRecordV1;
      const resolved = await resolveVerifiedMediaSourceUrlV1(qualification);
      if (resolved.disposition !== 'AVAILABLE'
        || !sameMediaSourceStorageVersionV1(
          resolved.storageVersion,
          sourceVersion.storageVersion,
        )) {
        throw new Error(errorCodes.versionStale);
      }
      return Object.freeze({
        sourceUrl: resolved.sourceUrl,
        storageVersion: resolved.storageVersion,
        async revalidate() {
          const observed = await inspectMediaSourceStorageVersionV1(
            sourceVersion.storageVersion.locator,
          );
          return observed.disposition === 'OBSERVED'
            && sameMediaSourceStorageVersionV1(
              observed.storageVersion,
              sourceVersion.storageVersion,
            );
        },
      });
    },
  };
}

export async function materializeVerifiedMediaSourceLocalFileV1(input: Readonly<{
  sourceUrl: string;
  outputPath: string;
  sourceVersion: Readonly<MediaSourceVersionV1>;
  maximumBytes: number;
  timeoutMs: number;
  errorCodes: VerifiedMediaSourceFileErrorCodesV1;
  abortSignal?: AbortSignal;
  fetcher?: typeof fetch;
}>): Promise<VerifiedMediaSourceLocalFileEvidenceV1> {
  const sourceVersion = assertMediaSourceVersionV1(input.sourceVersion);
  const errorCodes = normalizeFileErrorCodes(input.errorCodes);
  if (!Number.isSafeInteger(input.maximumBytes) || input.maximumBytes < 1
    || sourceVersion.byteLength > input.maximumBytes) {
    throw new Error(errorCodes.sourceByteLimitExceeded);
  }
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1
    || input.timeoutMs > MAX_DOWNLOAD_TIMEOUT_MS_V1) {
    throw new Error(errorCodes.sourceReadFailed);
  }
  if (typeof input.outputPath !== 'string' || !path.isAbsolute(input.outputPath)
    || input.outputPath.length > 4096 || /[\u0000-\u001F\u007F]/.test(input.outputPath)) {
    throw new Error(errorCodes.outputWriteFailed);
  }
  let url: URL;
  try {
    url = new URL(input.sourceUrl);
  } catch {
    throw new Error(errorCodes.sourceUrlInvalid);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(errorCodes.sourceUrlInvalid);
  }
  const signal = input.abortSignal
    ? AbortSignal.any([input.abortSignal, AbortSignal.timeout(input.timeoutMs)])
    : AbortSignal.timeout(input.timeoutMs);
  if (signal.aborted) throw new Error(errorCodes.sourceReadFailed);
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(url, {
      cache: 'no-store',
      headers: { 'accept-encoding': 'identity' },
      redirect: 'error',
      signal,
    });
  } catch {
    throw new Error(errorCodes.sourceReadFailed);
  }
  const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
  if (!response.ok || !response.body || (encoding && encoding !== 'identity')) {
    throw new Error(errorCodes.sourceReadFailed);
  }
  const digest = createHash('sha256');
  let byteLength = 0;
  const verifier = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      byteLength += chunk.byteLength;
      if (byteLength > sourceVersion.byteLength || byteLength > input.maximumBytes) {
        callback(new Error(errorCodes.sourceByteLengthMismatch));
        return;
      }
      digest.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
      verifier,
      createWriteStream(input.outputPath, { flags: 'wx' }),
      { signal },
    );
  } catch (error) {
    if (error instanceof Error && error.message === errorCodes.sourceByteLengthMismatch) {
      throw error;
    }
    if (signal.aborted) throw new Error(errorCodes.sourceReadFailed);
    throw new Error(errorCodes.outputWriteFailed);
  }
  const contentSha256 = digest.digest('hex');
  if (byteLength !== sourceVersion.byteLength) {
    throw new Error(errorCodes.sourceByteLengthMismatch);
  }
  if (contentSha256 !== sourceVersion.contentSha256) {
    throw new Error(errorCodes.sourceContentMismatch);
  }
  return Object.freeze({
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
    byteLength,
    contentSha256,
  });
}

function normalizeLeaseErrorCodes(
  value: VerifiedMediaSourceLeaseErrorCodesV1,
): VerifiedMediaSourceLeaseErrorCodesV1 {
  return Object.freeze({
    bindingStale: errorCode(value?.bindingStale),
    versionStale: errorCode(value?.versionStale),
  });
}

function normalizeFileErrorCodes(
  value: VerifiedMediaSourceFileErrorCodesV1,
): VerifiedMediaSourceFileErrorCodesV1 {
  return Object.freeze({
    sourceByteLimitExceeded: errorCode(value?.sourceByteLimitExceeded),
    sourceUrlInvalid: errorCode(value?.sourceUrlInvalid),
    sourceReadFailed: errorCode(value?.sourceReadFailed),
    sourceByteLengthMismatch: errorCode(value?.sourceByteLengthMismatch),
    sourceContentMismatch: errorCode(value?.sourceContentMismatch),
    outputWriteFailed: errorCode(value?.outputWriteFailed),
  });
}

function errorCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z0-9_]{1,200}$/.test(value)) {
    throw new Error('VERIFIED_MEDIA_SOURCE_ERROR_CODE_INVALID');
  }
  return value;
}
