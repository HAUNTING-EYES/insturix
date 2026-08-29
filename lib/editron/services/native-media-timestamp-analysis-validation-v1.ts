import { createHash } from 'node:crypto';

import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  NATIVE_MEDIA_TIMESTAMP_CONSUMPTION_RECEIPT_KIND_V1,
  NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1,
  type NativeMediaTimestampConsumptionReceiptV1,
} from './native-media-timestamp-consumer-v1';
import type { NativeMediaTimestampPreviewSurfaceReadResultV1 } from './native-media-timestamp-r2-preview-surface-v1';
import type { ProjectRevisionV1 } from './project-service';

export function assertNativeMediaTimestampConsumptionReceiptForAnalysisV1(
  value: NativeMediaTimestampConsumptionReceiptV1,
): NativeMediaTimestampConsumptionReceiptV1 {
  if (!value || value.schemaVersion !== 1
    || value.kind !== NATIVE_MEDIA_TIMESTAMP_CONSUMPTION_RECEIPT_KIND_V1
    || value.consumerVersion !== NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1
    || !Array.isArray(value.decodedPictures) || value.decodedPictures.length < 1
    || !Array.isArray(value.timelinePictures) || value.timelinePictures.length < 1) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_INVALID');
  }
  const { receiptSha256, ...material } = value;
  if (!/^[a-f0-9]{64}$/.test(receiptSha256)
    || receiptSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_HASH_MISMATCH');
  }
  for (let index = 1; index < value.timelinePictures.length; index += 1) {
    if (BigInt(value.timelinePictures[index - 1]!.timelineFrame)
      >= BigInt(value.timelinePictures[index]!.timelineFrame)) {
      throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_ORDER_INVALID');
    }
  }
  return value;
}

export function assertNativeMediaTimestampAnalysisSurfaceScopeV1(input: Readonly<{
  surface: Extract<NativeMediaTimestampPreviewSurfaceReadResultV1, { disposition: 'AVAILABLE' }>;
  userId: string;
  receipt: NativeMediaTimestampConsumptionReceiptV1;
  decoded: NativeMediaTimestampConsumptionReceiptV1['decodedPictures'][number];
}>): void {
  const { binding, pngBytes } = input.surface;
  if (binding.userId !== input.userId || binding.projectId !== input.receipt.projectId
    || !analysisSameRevision(binding.projectRevision, input.receipt.projectRevision)
    || binding.sequenceIdSha256 !== analysisDigestText(input.receipt.sequenceId)
    || binding.overlayIdSha256 !== analysisDigestText(input.receipt.overlayId)
    || binding.decoderRequestSha256 !== input.receipt.decoderRequestSha256
    || binding.decoderPictureRequestSha256 !== input.decoded.decoderPictureRequestSha256
    || binding.sourceVersionSha256 !== input.receipt.sourceVersionSha256
    || binding.storageVersionSha256 !== input.receipt.storageVersionSha256
    || binding.decodedPictureContentSha256 !== input.decoded.decodedPictureContentSha256
    || binding.pictureHandle !== input.decoded.pictureHandle
    || binding.width !== input.decoded.displayWidth
    || binding.height !== input.decoded.displayHeight
    || binding.pngByteLength !== pngBytes.byteLength
    || binding.pngContentSha256 !== analysisDigest(pngBytes)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_SURFACE_SCOPE_MISMATCH');
  }
}

export function analysisProjectRevision(value: ProjectRevisionV1): ProjectRevisionV1 {
  if (!value || value.schemaVersion !== 1 || !Number.isSafeInteger(value.value) || value.value < 0) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REVISION_INVALID');
  }
  return {
    schemaVersion: 1,
    value: value.value,
    compatibilityUpdatedAt: analysisText(
      value.compatibilityUpdatedAt,
      240,
      'NATIVE_MEDIA_TIMESTAMP_ANALYSIS_REVISION_INVALID',
    ),
  };
}

export function analysisSameRevision(left: ProjectRevisionV1, right: ProjectRevisionV1): boolean {
  return left.schemaVersion === right.schemaVersion && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

export function analysisDigest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function analysisDigestText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function analysisPositiveInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(code);
  return Number(value);
}

export function analysisIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,127})$/.test(value)) throw new Error(code);
  return BigInt(value).toString();
}

export function analysisNonNegativeIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,127})$/.test(value)) throw new Error(code);
  return BigInt(value).toString();
}

export function analysisSha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

export function analysisText(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

export function analysisObjectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

export function analysisExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(code);
  }
}

export function freezeNativeMediaTimestampAnalysisV1<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
