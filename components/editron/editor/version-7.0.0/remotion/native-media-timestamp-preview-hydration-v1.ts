import type { NativeMediaTimestampConsumptionReceiptV1 } from '@/lib/editron/services/native-media-timestamp-consumer-v1';

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_HYDRATION_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_HYDRATION_V1' as const;

const HANDLE_PATTERN = /^nmpv1_[a-f0-9]{64}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_HYDRATED_FRAMES = 100_000;

export type NativeMediaTimestampPreviewHydrationFrameV1 = Readonly<{
  localFrame: number;
  projectFrame: number;
  pictureHandle: string;
  decoderPictureRequestSha256: string;
  decodedPictureContentSha256: string;
}>;

export type NativeMediaTimestampPreviewHydrationV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_PREVIEW_HYDRATION_KIND_V1;
  receiptSha256: string;
  projectId: string;
  sequenceId: string;
  overlayId: string;
  projectRevision: Readonly<{
    schemaVersion: 1;
    value: number;
    compatibilityUpdatedAt: string;
  }>;
  overlayFromFrame: number;
  overlayDurationInFrames: number;
  audioOwnership: Readonly<{
    disposition: 'EXACT_SAMPLE_MAPPING_BOUND' | 'NO_AUDIO_MAPPING_REQUESTED';
    audioMappingSha256: string | null;
    decoderMaySupplyOrReplaceAudio: false;
  }>;
  frames: readonly NativeMediaTimestampPreviewHydrationFrameV1[];
}>;

export type NativeMediaTimestampPreviewHydrationIndexV1 = Readonly<{
  frameFor(
    overlayId: string | number,
    localFrame: number,
  ): NativeMediaTimestampPreviewHydrationFrameV1 | null;
  hasOverlay(overlayId: string | number): boolean;
}>;

/**
 * Converts the consumer's project-absolute frame map to the local frame domain
 * used by a video layer inside its Remotion Sequence.
 */
export function createNativeMediaTimestampPreviewHydrationV1(input: Readonly<{
  receipt: NativeMediaTimestampConsumptionReceiptV1;
  overlayFromFrame: number;
  overlayDurationInFrames: number;
}>): NativeMediaTimestampPreviewHydrationV1 {
  const receipt = input.receipt;
  if (!receipt || receipt.schemaVersion !== 1
    || receipt.kind !== 'EDITRON_NATIVE_MEDIA_TIMESTAMP_CONSUMPTION_RECEIPT_V1'
    || receipt.audioOwnership.kind !== 'SEPARATE_NATIVE_SAMPLE_DOMAIN_V1'
    || receipt.audioOwnership.decoderMaySupplyOrReplaceAudio !== false) {
    throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_RECEIPT_INVALID');
  }
  const overlayFromFrame = nonNegativeSafeInteger(
    input.overlayFromFrame,
    'NATIVE_MEDIA_PREVIEW_HYDRATION_OVERLAY_START_INVALID',
  );
  const overlayDurationInFrames = positiveSafeIntegerInRange(
    input.overlayDurationInFrames,
    MAX_HYDRATED_FRAMES,
    'NATIVE_MEDIA_PREVIEW_HYDRATION_DURATION_INVALID',
  );
  const pictures = new Map(
    receipt.decodedPictures.map((picture) => [
      picture.decoderPictureRequestSha256,
      {
        pictureHandle: picture.pictureHandle,
        decodedPictureContentSha256: picture.decodedPictureContentSha256,
      },
    ]),
  );
  if (pictures.size !== receipt.decodedPictures.length) {
    throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_PICTURE_DUPLICATE');
  }
  const frames = receipt.timelinePictures.map((picture) => {
    const projectFrame = integerTextToSafeNumber(
      picture.timelineFrame,
      'NATIVE_MEDIA_PREVIEW_HYDRATION_PROJECT_FRAME_INVALID',
    );
    const localFrame = projectFrame - overlayFromFrame;
    const decoded = pictures.get(picture.decoderPictureRequestSha256);
    if (!decoded
      || decoded.pictureHandle !== picture.pictureHandle
      || decoded.decodedPictureContentSha256 !== picture.decodedPictureContentSha256) {
      throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_PICTURE_SCOPE_MISMATCH');
    }
    return {
      localFrame,
      projectFrame,
      pictureHandle: picture.pictureHandle,
      decoderPictureRequestSha256: picture.decoderPictureRequestSha256,
      decodedPictureContentSha256: picture.decodedPictureContentSha256,
    };
  });
  return assertNativeMediaTimestampPreviewHydrationV1({
    schemaVersion: 1,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_HYDRATION_KIND_V1,
    receiptSha256: receipt.receiptSha256,
    projectId: receipt.projectId,
    sequenceId: receipt.sequenceId,
    overlayId: receipt.overlayId,
    projectRevision: receipt.projectRevision,
    overlayFromFrame,
    overlayDurationInFrames,
    audioOwnership: {
      disposition: receipt.audioOwnership.disposition,
      audioMappingSha256: receipt.audioOwnership.audioMappingSha256,
      decoderMaySupplyOrReplaceAudio: false,
    },
    frames,
  });
}

export function assertNativeMediaTimestampPreviewHydrationV1(
  value: unknown,
): NativeMediaTimestampPreviewHydrationV1 {
  const record = objectRecord(value, 'NATIVE_MEDIA_PREVIEW_HYDRATION_INVALID');
  exactKeys(record, [
    'audioOwnership', 'frames', 'kind', 'overlayDurationInFrames', 'overlayFromFrame',
    'overlayId', 'projectId', 'projectRevision', 'receiptSha256', 'schemaVersion',
    'sequenceId',
  ], 'NATIVE_MEDIA_PREVIEW_HYDRATION_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_HYDRATION_KIND_V1
    || !Array.isArray(record.frames)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_SCOPE_INVALID');
  }
  const overlayFromFrame = nonNegativeSafeInteger(
    record.overlayFromFrame,
    'NATIVE_MEDIA_PREVIEW_HYDRATION_OVERLAY_START_INVALID',
  );
  const overlayDurationInFrames = positiveSafeIntegerInRange(
    record.overlayDurationInFrames,
    MAX_HYDRATED_FRAMES,
    'NATIVE_MEDIA_PREVIEW_HYDRATION_DURATION_INVALID',
  );
  if (record.frames.length !== overlayDurationInFrames) {
    throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_COVERAGE_INVALID');
  }
  const normalizedFrames = record.frames.map((frame) => normalizeFrame(frame));
  const byLocalFrame = new Map<number, NativeMediaTimestampPreviewHydrationFrameV1>();
  for (const frame of normalizedFrames) {
    if (frame.localFrame < 0 || frame.localFrame >= overlayDurationInFrames
      || frame.projectFrame !== overlayFromFrame + frame.localFrame
      || byLocalFrame.has(frame.localFrame)) {
      throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_COVERAGE_INVALID');
    }
    byLocalFrame.set(frame.localFrame, frame);
  }
  const frames = Array.from({ length: overlayDurationInFrames }, (_, localFrame) => {
    const frame = byLocalFrame.get(localFrame);
    if (!frame) throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_COVERAGE_INVALID');
    return frame;
  });
  const projectRevision = normalizeRevision(record.projectRevision);
  const audioOwnership = normalizeAudioOwnership(record.audioOwnership);
  return deepFreeze({
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_HYDRATION_KIND_V1,
    receiptSha256: sha256(record.receiptSha256, 'NATIVE_MEDIA_PREVIEW_HYDRATION_RECEIPT_HASH_INVALID'),
    projectId: identifier(record.projectId, 'NATIVE_MEDIA_PREVIEW_HYDRATION_PROJECT_INVALID'),
    sequenceId: identifier(record.sequenceId, 'NATIVE_MEDIA_PREVIEW_HYDRATION_SEQUENCE_INVALID'),
    overlayId: identifier(record.overlayId, 'NATIVE_MEDIA_PREVIEW_HYDRATION_OVERLAY_INVALID'),
    projectRevision,
    overlayFromFrame,
    overlayDurationInFrames,
    audioOwnership,
    frames,
  });
}

export function createNativeMediaTimestampPreviewHydrationIndexV1(
  values: readonly NativeMediaTimestampPreviewHydrationV1[] = [],
): NativeMediaTimestampPreviewHydrationIndexV1 {
  if (!Array.isArray(values) || values.length > 10_000) {
    throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_SET_INVALID');
  }
  const byOverlay = new Map<string, ReadonlyMap<number, NativeMediaTimestampPreviewHydrationFrameV1>>();
  for (const value of values) {
    const hydration = assertNativeMediaTimestampPreviewHydrationV1(value);
    if (byOverlay.has(hydration.overlayId)) {
      throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_OVERLAY_DUPLICATE');
    }
    byOverlay.set(
      hydration.overlayId,
      new Map(hydration.frames.map((frame) => [frame.localFrame, frame])),
    );
  }
  return Object.freeze({
    frameFor(overlayId, localFrame) {
      const normalizedOverlayId = identifier(
        String(overlayId),
        'NATIVE_MEDIA_PREVIEW_HYDRATION_OVERLAY_INVALID',
      );
      if (!Number.isSafeInteger(localFrame) || localFrame < 0) return null;
      return byOverlay.get(normalizedOverlayId)?.get(localFrame) ?? null;
    },
    hasOverlay(overlayId) {
      return byOverlay.has(identifier(
        String(overlayId),
        'NATIVE_MEDIA_PREVIEW_HYDRATION_OVERLAY_INVALID',
      ));
    },
  });
}

export function nativeMediaTimestampPreviewRoutePathV1(pictureHandle: string): string {
  return `/api/services/editron/media/timestamp-preview/${validHandle(pictureHandle)}`;
}

function normalizeFrame(value: unknown): NativeMediaTimestampPreviewHydrationFrameV1 {
  const record = objectRecord(value, 'NATIVE_MEDIA_PREVIEW_HYDRATION_FRAME_INVALID');
  exactKeys(record, [
    'decodedPictureContentSha256', 'decoderPictureRequestSha256', 'localFrame',
    'pictureHandle', 'projectFrame',
  ], 'NATIVE_MEDIA_PREVIEW_HYDRATION_FRAME_FIELDS_INVALID');
  return Object.freeze({
    localFrame: nonNegativeSafeInteger(
      record.localFrame,
      'NATIVE_MEDIA_PREVIEW_HYDRATION_LOCAL_FRAME_INVALID',
    ),
    projectFrame: nonNegativeSafeInteger(
      record.projectFrame,
      'NATIVE_MEDIA_PREVIEW_HYDRATION_PROJECT_FRAME_INVALID',
    ),
    pictureHandle: validHandle(record.pictureHandle),
    decoderPictureRequestSha256: sha256(
      record.decoderPictureRequestSha256,
      'NATIVE_MEDIA_PREVIEW_HYDRATION_PICTURE_REQUEST_INVALID',
    ),
    decodedPictureContentSha256: sha256(
      record.decodedPictureContentSha256,
      'NATIVE_MEDIA_PREVIEW_HYDRATION_PICTURE_CONTENT_INVALID',
    ),
  });
}

function normalizeRevision(value: unknown): NativeMediaTimestampPreviewHydrationV1['projectRevision'] {
  const record = objectRecord(value, 'NATIVE_MEDIA_PREVIEW_HYDRATION_REVISION_INVALID');
  exactKeys(record, [
    'compatibilityUpdatedAt', 'schemaVersion', 'value',
  ], 'NATIVE_MEDIA_PREVIEW_HYDRATION_REVISION_FIELDS_INVALID');
  if (record.schemaVersion !== 1) {
    throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_REVISION_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    value: nonNegativeSafeInteger(
      record.value,
      'NATIVE_MEDIA_PREVIEW_HYDRATION_REVISION_INVALID',
    ),
    compatibilityUpdatedAt: boundedText(
      record.compatibilityUpdatedAt,
      240,
      'NATIVE_MEDIA_PREVIEW_HYDRATION_REVISION_INVALID',
    ),
  });
}

function normalizeAudioOwnership(value: unknown): NativeMediaTimestampPreviewHydrationV1['audioOwnership'] {
  const record = objectRecord(value, 'NATIVE_MEDIA_PREVIEW_HYDRATION_AUDIO_INVALID');
  exactKeys(record, [
    'audioMappingSha256', 'decoderMaySupplyOrReplaceAudio', 'disposition',
  ], 'NATIVE_MEDIA_PREVIEW_HYDRATION_AUDIO_FIELDS_INVALID');
  if ((record.disposition !== 'EXACT_SAMPLE_MAPPING_BOUND'
      && record.disposition !== 'NO_AUDIO_MAPPING_REQUESTED')
    || record.decoderMaySupplyOrReplaceAudio !== false) {
    throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_AUDIO_INVALID');
  }
  const audioMappingSha256 = record.audioMappingSha256 === null
    ? null
    : sha256(
        record.audioMappingSha256,
        'NATIVE_MEDIA_PREVIEW_HYDRATION_AUDIO_HASH_INVALID',
      );
  if ((record.disposition === 'EXACT_SAMPLE_MAPPING_BOUND') !== (audioMappingSha256 !== null)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_AUDIO_INVALID');
  }
  return Object.freeze({
    disposition: record.disposition,
    audioMappingSha256,
    decoderMaySupplyOrReplaceAudio: false as const,
  });
}

function integerTextToSafeNumber(value: unknown, code: string): number {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,127})$/.test(value)) {
    throw new Error(code);
  }
  const parsed = BigInt(value);
  if (parsed < BigInt(0) || parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(code);
  return Number(parsed);
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function positiveSafeIntegerInRange(value: unknown, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new Error(code);
  }
  return Number(value);
}

function validHandle(value: unknown): string {
  if (typeof value !== 'string' || !HANDLE_PATTERN.test(value)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_HANDLE_INVALID');
  }
  return value;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw new Error(code);
  return value;
}

function identifier(value: unknown, code: string): string {
  return boundedText(value, 256, code);
}

function boundedText(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(code);
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}
