import { createHash } from 'node:crypto';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { ProviderNativeReferenceInputV2R } from './provider-native-reference-input-v2r';

export const PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_V2R_1' as const;
export const PROVIDER_NATIVE_VIDEO_REFERENCE_ARM_V2R = 'NATIVE_VIDEO' as const;

const MAX_INLINE_VIDEO_BYTES = 100_000_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const OPAQUE_ID_PATTERN = /^ref_[A-Za-z0-9_-]{1,64}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]{0,17}$/;

export interface ProviderNativeVideoReferenceInputV2R {
  version: typeof PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_VERSION_V2R;
  arm: typeof PROVIDER_NATIVE_VIDEO_REFERENCE_ARM_V2R;
  referenceId: string;
  referenceAssetSha256: string;
  mimeType: 'video/mp4';
  bytesBase64: string;
  bytesSha256: string;
  byteLength: number;
  durationUs: string;
  sourceRate: Readonly<{ numerator: string; denominator: string }>;
  resolution: 'high';
}

export interface ProviderNativeVideoReferenceManifestV2R {
  version: typeof PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_VERSION_V2R;
  arm: typeof PROVIDER_NATIVE_VIDEO_REFERENCE_ARM_V2R;
  referenceId: string;
  referenceAssetSha256: string;
  mimeType: 'video/mp4';
  bytesSha256: string;
  byteLength: number;
  durationUs: string;
  sourceRate: Readonly<{ numerator: string; denominator: string }>;
  resolution: 'high';
  embeddedStreams: 'PRESERVED_IN_SOURCE_BYTES';
}

export interface BoundProviderNativeVideoReferenceInputV2R {
  input: Readonly<ProviderNativeVideoReferenceInputV2R>;
  manifest: Readonly<ProviderNativeVideoReferenceManifestV2R>;
  manifestSha256: string;
}

export type ProviderNativeReferenceMediaInputV2R =
  | ProviderNativeReferenceInputV2R
  | ProviderNativeVideoReferenceInputV2R;

export function bindProviderNativeVideoReferenceInputV2R(
  value: unknown,
): Readonly<BoundProviderNativeVideoReferenceInputV2R> {
  const input = requireRecord(value, 'VIDEO_REFERENCE_INPUT');
  requireExactKeys(input, [
    'version', 'arm', 'referenceId', 'referenceAssetSha256', 'mimeType',
    'bytesBase64', 'bytesSha256', 'byteLength', 'durationUs', 'sourceRate',
    'resolution',
  ], 'VIDEO_REFERENCE_INPUT');
  if (input.version !== PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_VERSION_V2R) {
    throw new Error('VIDEO_REFERENCE_INPUT_VERSION_INVALID');
  }
  if (input.arm !== PROVIDER_NATIVE_VIDEO_REFERENCE_ARM_V2R) {
    throw new Error('VIDEO_REFERENCE_INPUT_ARM_INVALID');
  }
  const referenceId = requireOpaqueId(input.referenceId);
  const referenceAssetSha256 = requireSha256(
    input.referenceAssetSha256,
    'VIDEO_REFERENCE_ASSET_SHA256',
  );
  if (input.mimeType !== 'video/mp4') throw new Error('VIDEO_REFERENCE_MIME_INVALID');
  if (input.resolution !== 'high') throw new Error('VIDEO_REFERENCE_RESOLUTION_INVALID');
  const bytesBase64 = requireCanonicalBase64(input.bytesBase64);
  const bytes = Buffer.from(bytesBase64, 'base64');
  if (!bytes.length || bytes.length >= MAX_INLINE_VIDEO_BYTES) {
    throw new Error('VIDEO_REFERENCE_INLINE_BYTES_LIMIT_EXCEEDED');
  }
  assertMp4Signature(bytes);
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength !== bytes.length) {
    throw new Error('VIDEO_REFERENCE_BYTE_LENGTH_MISMATCH');
  }
  const bytesSha256 = requireSha256(input.bytesSha256, 'VIDEO_REFERENCE_BYTES_SHA256');
  const computedSha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytesSha256 !== computedSha256) throw new Error('VIDEO_REFERENCE_BYTES_SHA256_MISMATCH');
  if (referenceAssetSha256 !== bytesSha256) {
    throw new Error('VIDEO_REFERENCE_ASSET_BYTES_IDENTITY_MISMATCH');
  }
  const durationUs = requirePositiveInteger(input.durationUs, 'VIDEO_REFERENCE_DURATION_US');
  const sourceRate = requireRationalRate(input.sourceRate);

  const normalized: ProviderNativeVideoReferenceInputV2R = {
    version: PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_VERSION_V2R,
    arm: PROVIDER_NATIVE_VIDEO_REFERENCE_ARM_V2R,
    referenceId,
    referenceAssetSha256,
    mimeType: 'video/mp4',
    bytesBase64,
    bytesSha256,
    byteLength: bytes.length,
    durationUs,
    sourceRate,
    resolution: 'high',
  };
  const manifest: ProviderNativeVideoReferenceManifestV2R = {
    version: normalized.version,
    arm: normalized.arm,
    referenceId,
    referenceAssetSha256,
    mimeType: normalized.mimeType,
    bytesSha256,
    byteLength: bytes.length,
    durationUs,
    sourceRate,
    resolution: normalized.resolution,
    embeddedStreams: 'PRESERVED_IN_SOURCE_BYTES',
  };
  return deepFreezeV1({
    input: normalized,
    manifest,
    manifestSha256: hashCanonicalJsonV1(manifest),
  });
}

export function isProviderNativeVideoReferenceInputV2R(
  value: ProviderNativeReferenceMediaInputV2R,
): value is ProviderNativeVideoReferenceInputV2R {
  return value.arm === PROVIDER_NATIVE_VIDEO_REFERENCE_ARM_V2R;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}_NOT_OBJECT`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new Error(`${label}_FIELDS_INVALID`);
  }
}

function requireOpaqueId(value: unknown): string {
  if (typeof value !== 'string' || !OPAQUE_ID_PATTERN.test(value)) {
    throw new Error('VIDEO_REFERENCE_ID_INVALID');
  }
  return value;
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label}_INVALID`);
  }
  return value;
}

function requireCanonicalBase64(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length % 4 !== 0) {
    throw new Error('VIDEO_REFERENCE_BASE64_INVALID');
  }
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.toString('base64') !== value) {
    throw new Error('VIDEO_REFERENCE_BASE64_INVALID');
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string): string {
  if (typeof value !== 'string' || !POSITIVE_INTEGER_PATTERN.test(value)) {
    throw new Error(`${label}_INVALID`);
  }
  return value;
}

function requireRationalRate(value: unknown): Readonly<{ numerator: string; denominator: string }> {
  const rate = requireRecord(value, 'VIDEO_REFERENCE_SOURCE_RATE');
  requireExactKeys(rate, ['numerator', 'denominator'], 'VIDEO_REFERENCE_SOURCE_RATE');
  const numerator = requirePositiveInteger(rate.numerator, 'VIDEO_REFERENCE_RATE_NUMERATOR');
  const denominator = requirePositiveInteger(rate.denominator, 'VIDEO_REFERENCE_RATE_DENOMINATOR');
  if (greatestCommonDivisor(BigInt(numerator), BigInt(denominator)) !== BigInt(1)) {
    throw new Error('VIDEO_REFERENCE_SOURCE_RATE_NOT_REDUCED');
  }
  return { numerator, denominator };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a;
}

function assertMp4Signature(bytes: Buffer): void {
  if (bytes.length < 12 || bytes.subarray(4, 8).toString('ascii') !== 'ftyp') {
    throw new Error('VIDEO_REFERENCE_MP4_SIGNATURE_INVALID');
  }
}
