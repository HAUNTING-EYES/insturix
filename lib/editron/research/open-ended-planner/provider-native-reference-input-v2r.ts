import { createHash } from 'node:crypto';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const PROVIDER_NATIVE_REFERENCE_INPUT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_REFERENCE_INPUT_V2R_1' as const;
export const PROVIDER_NATIVE_REFERENCE_ARM_V2R =
  'ORDERED_TIMESTAMPED_IMAGES' as const;

const MAX_REFERENCE_FRAMES = 64;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const OPAQUE_ID_PATTERN = /^(?:ref|frame)_[A-Za-z0-9_-]{1,64}$/;
const TIMESTAMP_US_PATTERN = /^(?:0|[1-9][0-9]{0,17})$/;

export type ProviderNativeReferenceMimeTypeV2R =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp';

export interface ProviderNativeReferenceFrameV2R {
  frameId: string;
  timestampUs: string;
  mimeType: ProviderNativeReferenceMimeTypeV2R;
  bytesBase64: string;
  bytesSha256: string;
}

export interface ProviderNativeReferenceInputV2R {
  version: typeof PROVIDER_NATIVE_REFERENCE_INPUT_VERSION_V2R;
  arm: typeof PROVIDER_NATIVE_REFERENCE_ARM_V2R;
  referenceId: string;
  referenceAssetSha256: string;
  resolution: 'high';
  frames: readonly Readonly<ProviderNativeReferenceFrameV2R>[];
}

export interface ProviderNativeReferenceFrameDescriptorV2R {
  frameId: string;
  timestampUs: string;
  mimeType: ProviderNativeReferenceMimeTypeV2R;
  bytesSha256: string;
  byteLength: number;
}

export interface ProviderNativeReferenceManifestV2R {
  version: typeof PROVIDER_NATIVE_REFERENCE_INPUT_VERSION_V2R;
  arm: typeof PROVIDER_NATIVE_REFERENCE_ARM_V2R;
  referenceId: string;
  referenceAssetSha256: string;
  resolution: 'high';
  frameCount: number;
  frames: readonly Readonly<ProviderNativeReferenceFrameDescriptorV2R>[];
}

export interface BoundProviderNativeReferenceInputV2R {
  input: Readonly<ProviderNativeReferenceInputV2R>;
  manifest: Readonly<ProviderNativeReferenceManifestV2R>;
  manifestSha256: string;
}

export function bindProviderNativeReferenceInputV2R(
  value: unknown,
): Readonly<BoundProviderNativeReferenceInputV2R> {
  const input = requireRecord(value, 'REFERENCE_INPUT');
  requireExactKeys(input, [
    'version', 'arm', 'referenceId', 'referenceAssetSha256', 'resolution', 'frames',
  ], 'REFERENCE_INPUT');
  if (input.version !== PROVIDER_NATIVE_REFERENCE_INPUT_VERSION_V2R) {
    throw new Error('REFERENCE_INPUT_VERSION_INVALID');
  }
  if (input.arm !== PROVIDER_NATIVE_REFERENCE_ARM_V2R) {
    throw new Error('REFERENCE_INPUT_ARM_INVALID');
  }
  const referenceId = requireOpaqueId(input.referenceId, 'REFERENCE_ID');
  const referenceAssetSha256 = requireSha256(
    input.referenceAssetSha256,
    'REFERENCE_ASSET_SHA256',
  );
  if (input.resolution !== 'high') throw new Error('REFERENCE_RESOLUTION_INVALID');
  if (!Array.isArray(input.frames) || input.frames.length < 2) {
    throw new Error('REFERENCE_FRAMES_INSUFFICIENT');
  }
  if (input.frames.length > MAX_REFERENCE_FRAMES) {
    throw new Error('REFERENCE_FRAMES_LIMIT_EXCEEDED');
  }

  const frameIds = new Set<string>();
  const frames: ProviderNativeReferenceFrameV2R[] = [];
  const descriptors: ProviderNativeReferenceFrameDescriptorV2R[] = [];
  let previousTimestampUs: bigint | null = null;
  let totalBytes = 0;

  for (const [index, candidate] of input.frames.entries()) {
    const frame = requireRecord(candidate, `REFERENCE_FRAME_${index}`);
    requireExactKeys(frame, [
      'frameId', 'timestampUs', 'mimeType', 'bytesBase64', 'bytesSha256',
    ], `REFERENCE_FRAME_${index}`);
    const frameId = requireOpaqueId(frame.frameId, `REFERENCE_FRAME_ID_${index}`);
    if (frameIds.has(frameId)) throw new Error('REFERENCE_FRAME_ID_DUPLICATE');
    frameIds.add(frameId);
    const timestampUs = requireTimestampUs(frame.timestampUs, index);
    const numericTimestampUs = BigInt(timestampUs);
    if (previousTimestampUs !== null && numericTimestampUs <= previousTimestampUs) {
      throw new Error('REFERENCE_FRAME_TIMESTAMPS_NOT_STRICTLY_ASCENDING');
    }
    previousTimestampUs = numericTimestampUs;
    const mimeType = requireMimeType(frame.mimeType, index);
    const bytesBase64 = requireCanonicalBase64(frame.bytesBase64, index);
    const bytes = Buffer.from(bytesBase64, 'base64');
    if (bytes.length > MAX_FRAME_BYTES) throw new Error('REFERENCE_FRAME_BYTES_LIMIT_EXCEEDED');
    assertImageSignature(bytes, mimeType, index);
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('REFERENCE_TOTAL_BYTES_LIMIT_EXCEEDED');
    const bytesSha256 = requireSha256(frame.bytesSha256, `REFERENCE_FRAME_SHA256_${index}`);
    const computedSha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytesSha256 !== computedSha256) throw new Error('REFERENCE_FRAME_SHA256_MISMATCH');

    frames.push({ frameId, timestampUs, mimeType, bytesBase64, bytesSha256 });
    descriptors.push({ frameId, timestampUs, mimeType, bytesSha256, byteLength: bytes.length });
  }

  const normalizedInput: ProviderNativeReferenceInputV2R = {
    version: PROVIDER_NATIVE_REFERENCE_INPUT_VERSION_V2R,
    arm: PROVIDER_NATIVE_REFERENCE_ARM_V2R,
    referenceId,
    referenceAssetSha256,
    resolution: 'high',
    frames,
  };
  const manifest: ProviderNativeReferenceManifestV2R = {
    version: PROVIDER_NATIVE_REFERENCE_INPUT_VERSION_V2R,
    arm: PROVIDER_NATIVE_REFERENCE_ARM_V2R,
    referenceId,
    referenceAssetSha256,
    resolution: 'high',
    frameCount: descriptors.length,
    frames: descriptors,
  };
  return deepFreezeV1({
    input: normalizedInput,
    manifest,
    manifestSha256: hashCanonicalJsonV1(manifest),
  });
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

function requireOpaqueId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !OPAQUE_ID_PATTERN.test(value)) {
    throw new Error(`${label}_INVALID`);
  }
  return value;
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label}_INVALID`);
  }
  return value;
}

function requireTimestampUs(value: unknown, index: number): string {
  if (typeof value !== 'string' || !TIMESTAMP_US_PATTERN.test(value)) {
    throw new Error(`REFERENCE_FRAME_TIMESTAMP_${index}_INVALID`);
  }
  return value;
}

function requireMimeType(value: unknown, index: number): ProviderNativeReferenceMimeTypeV2R {
  if (value !== 'image/png' && value !== 'image/jpeg' && value !== 'image/webp') {
    throw new Error(`REFERENCE_FRAME_MIME_${index}_INVALID`);
  }
  return value;
}

function requireCanonicalBase64(value: unknown, index: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) {
    throw new Error(`REFERENCE_FRAME_BASE64_${index}_INVALID`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length === 0 || bytes.toString('base64') !== value) {
    throw new Error(`REFERENCE_FRAME_BASE64_${index}_INVALID`);
  }
  return value;
}

function assertImageSignature(
  bytes: Buffer,
  mimeType: ProviderNativeReferenceMimeTypeV2R,
  index: number,
): void {
  const isPng = bytes.length >= 8
    && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if ((mimeType === 'image/png' && !isPng)
    || (mimeType === 'image/jpeg' && !isJpeg)
    || (mimeType === 'image/webp' && !isWebp)) {
    throw new Error(`REFERENCE_FRAME_SIGNATURE_${index}_INVALID`);
  }
}
