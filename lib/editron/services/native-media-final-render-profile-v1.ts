import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';

export const NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1 =
  'EDITRON_LOSSLESS_RGB_H264_PCM_S32LE_MATROSKA_V1' as const;

export type NativeMediaFinalRenderProfileReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_KIND_V1;
  profileVersion: typeof NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1;
  platform: string;
  ffmpegVersion: string;
  remotionVersion: string;
  compositorPackageVersion: string;
  container: 'matroska';
  videoEncoder: 'libx264rgb';
  videoCodec: 'h264';
  pixelFormat: 'gbrp';
  videoLosslessMode: 'CRF_0_INTRA_ONLY';
  audioCodec: 'pcm_s32le';
  sourceDecodedRgbSha256: string;
  artifactDecodedRgbSha256: string;
  sourceDecodedPcmSha256: string;
  artifactDecodedPcmSha256: string;
  sourceVideoFrameCount: string;
  remotionVideoFrameCount: string;
  sourceAudioSampleFrameCount: string;
  remotionOutputVideoCodec: 'h264';
  remotionOutputAudioCodec: 'aac';
  browserErrorCount: 0;
  receiptSha256: string;
}>;

type NativeMediaFinalRenderProfileReceiptMaterialV1 = Omit<
  NativeMediaFinalRenderProfileReceiptV1,
  'receiptSha256'
>;

const RECEIPT_FIELDS_V1 = Object.freeze([
  'artifactDecodedPcmSha256',
  'artifactDecodedRgbSha256',
  'audioCodec',
  'browserErrorCount',
  'compositorPackageVersion',
  'container',
  'ffmpegVersion',
  'kind',
  'pixelFormat',
  'platform',
  'profileVersion',
  'receiptSha256',
  'remotionOutputAudioCodec',
  'remotionOutputVideoCodec',
  'remotionVersion',
  'remotionVideoFrameCount',
  'schemaVersion',
  'sourceAudioSampleFrameCount',
  'sourceDecodedPcmSha256',
  'sourceDecodedRgbSha256',
  'sourceVideoFrameCount',
  'videoCodec',
  'videoEncoder',
  'videoLosslessMode',
] as const);

export function createNativeMediaFinalRenderProfileReceiptV1(
  input: NativeMediaFinalRenderProfileReceiptMaterialV1,
): NativeMediaFinalRenderProfileReceiptV1 {
  if (!input || input.schemaVersion !== 1
    || input.kind !== NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_KIND_V1
    || input.profileVersion !== NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1
    || input.container !== 'matroska'
    || input.videoEncoder !== 'libx264rgb'
    || input.videoCodec !== 'h264'
    || input.pixelFormat !== 'gbrp'
    || input.videoLosslessMode !== 'CRF_0_INTRA_ONLY'
    || input.audioCodec !== 'pcm_s32le'
    || input.remotionOutputVideoCodec !== 'h264'
    || input.remotionOutputAudioCodec !== 'aac'
    || input.browserErrorCount !== 0) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PROFILE_INVALID');
  }
  const material = Object.freeze({
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_KIND_V1,
    profileVersion: NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1,
    platform: text(input.platform),
    ffmpegVersion: text(input.ffmpegVersion),
    remotionVersion: version(input.remotionVersion),
    compositorPackageVersion: version(input.compositorPackageVersion),
    container: 'matroska' as const,
    videoEncoder: 'libx264rgb' as const,
    videoCodec: 'h264' as const,
    pixelFormat: 'gbrp' as const,
    videoLosslessMode: 'CRF_0_INTRA_ONLY' as const,
    audioCodec: 'pcm_s32le' as const,
    sourceDecodedRgbSha256: sha256(input.sourceDecodedRgbSha256),
    artifactDecodedRgbSha256: sha256(input.artifactDecodedRgbSha256),
    sourceDecodedPcmSha256: sha256(input.sourceDecodedPcmSha256),
    artifactDecodedPcmSha256: sha256(input.artifactDecodedPcmSha256),
    sourceVideoFrameCount: positiveIntegerText(input.sourceVideoFrameCount),
    remotionVideoFrameCount: positiveIntegerText(input.remotionVideoFrameCount),
    sourceAudioSampleFrameCount: positiveIntegerText(input.sourceAudioSampleFrameCount),
    remotionOutputVideoCodec: 'h264' as const,
    remotionOutputAudioCodec: 'aac' as const,
    browserErrorCount: 0 as const,
  });
  if (material.sourceDecodedRgbSha256 !== material.artifactDecodedRgbSha256) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PROFILE_RGB_NOT_LOSSLESS');
  }
  if (material.sourceDecodedPcmSha256 !== material.artifactDecodedPcmSha256) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PROFILE_PCM_NOT_LOSSLESS');
  }
  if (material.sourceVideoFrameCount !== material.remotionVideoFrameCount) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PROFILE_FRAME_COUNT_MISMATCH');
  }
  return Object.freeze({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertNativeMediaFinalRenderProfileReceiptV1(
  value: unknown,
): NativeMediaFinalRenderProfileReceiptV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_INVALID');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== RECEIPT_FIELDS_V1.length
    || keys.some((key, index) => key !== RECEIPT_FIELDS_V1[index])) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_FIELDS_INVALID');
  }
  const { receiptSha256, ...material } = record;
  const recreated = createNativeMediaFinalRenderProfileReceiptV1(
    material as NativeMediaFinalRenderProfileReceiptMaterialV1,
  );
  if (recreated.receiptSha256 !== receiptSha256) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_HASH_INVALID');
  }
  return recreated;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 512
    || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PROFILE_TEXT_INVALID');
  }
  return value.trim();
}

function version(value: unknown): string {
  const normalized = text(value);
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_INVALID');
  }
  return normalized;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PROFILE_HASH_INVALID');
  }
  return value;
}

function positiveIntegerText(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PROFILE_COUNT_INVALID');
  }
  return BigInt(value).toString();
}
