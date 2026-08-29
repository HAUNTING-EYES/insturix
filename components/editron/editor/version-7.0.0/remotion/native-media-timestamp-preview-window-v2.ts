import type { NativeMediaTimestampConsumptionReceiptV1 } from '@/lib/editron/services/native-media-timestamp-consumer-v1';

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_KIND_V2 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_V2' as const;

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_MAX_FRAMES_V2 = 1_024;

const HANDLE_PATTERN = /^nmpv1_[a-f0-9]{64}$/;
const LEASE_ID_PATTERN = /^nmpwl2_[a-f0-9]{64}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_OVERLAY_FRAMES = 100_000_000;
const MAX_WINDOWS = 10_000;
const MAX_LEASE_TTL_MS = 24 * 60 * 60 * 1_000;

export type NativeMediaTimestampPreviewWindowFrameV2 = Readonly<{
  localFrame: number;
  projectFrame: number;
  pictureHandle: string;
  decoderPictureRequestSha256: string;
  decodedPictureContentSha256: string;
}>;

export type NativeMediaTimestampPreviewWindowLeaseV2 = Readonly<{
  leaseId: string;
  issuedAtEpochMs: number;
  renewAfterEpochMs: number;
  expiresAtEpochMs: number;
}>;

export type NativeMediaTimestampPreviewWindowV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_KIND_V2;
  receiptSha256: string;
  decoderRequestSha256: string;
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
  windowLocalStartFrame: number;
  windowDurationInFrames: number;
  lease: NativeMediaTimestampPreviewWindowLeaseV2;
  audioOwnership: Readonly<{
    disposition: 'EXACT_SAMPLE_MAPPING_BOUND' | 'NO_AUDIO_MAPPING_REQUESTED';
    audioMappingSha256: string | null;
    decoderMaySupplyOrReplaceAudio: false;
  }>;
  frames: readonly NativeMediaTimestampPreviewWindowFrameV2[];
}>;

export type NativeMediaTimestampPreviewWindowLeaseDispositionV2 =
  | 'CURRENT'
  | 'RENEW_DUE'
  | 'EXPIRED';

export type NativeMediaTimestampPreviewWindowIndexV2 = Readonly<{
  frameFor(
    overlayId: string | number,
    localFrame: number,
  ): NativeMediaTimestampPreviewWindowFrameV2 | null;
  hasOverlay(overlayId: string | number): boolean;
  leaseDispositionFor(
    overlayId: string | number,
    localFrame: number,
  ): NativeMediaTimestampPreviewWindowLeaseDispositionV2 | null;
}>;

export type NativeMediaTimestampPreviewWindowPlanV2 = Readonly<{
  active: Readonly<{ localStartFrame: number; durationInFrames: number }>;
  prefetch: Readonly<{ localStartFrame: number; durationInFrames: number }> | null;
}>;

/**
 * Converts one bounded timestamp-consumption receipt into a transient preview
 * window. The supplied lease times must be conservative bounds issued by the
 * server coordinator; this browser-safe contract never invents storage TTL.
 */
export function createNativeMediaTimestampPreviewWindowV2(input: Readonly<{
  receipt: NativeMediaTimestampConsumptionReceiptV1;
  overlayFromFrame: number;
  overlayDurationInFrames: number;
  windowLocalStartFrame: number;
  windowDurationInFrames: number;
  lease: NativeMediaTimestampPreviewWindowLeaseV2;
}>): NativeMediaTimestampPreviewWindowV2 {
  const receipt = input.receipt;
  if (!receipt || receipt.schemaVersion !== 1
    || receipt.kind !== 'EDITRON_NATIVE_MEDIA_TIMESTAMP_CONSUMPTION_RECEIPT_V1'
    || receipt.audioOwnership.kind !== 'SEPARATE_NATIVE_SAMPLE_DOMAIN_V1'
    || receipt.audioOwnership.decoderMaySupplyOrReplaceAudio !== false) {
    throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_RECEIPT_INVALID');
  }
  const overlayFromFrame = nonNegativeSafeInteger(
    input.overlayFromFrame,
    'NATIVE_MEDIA_PREVIEW_WINDOW_OVERLAY_START_INVALID',
  );
  const overlayDurationInFrames = positiveSafeIntegerInRange(
    input.overlayDurationInFrames,
    MAX_OVERLAY_FRAMES,
    'NATIVE_MEDIA_PREVIEW_WINDOW_OVERLAY_DURATION_INVALID',
  );
  const windowLocalStartFrame = nonNegativeSafeInteger(
    input.windowLocalStartFrame,
    'NATIVE_MEDIA_PREVIEW_WINDOW_START_INVALID',
  );
  const windowDurationInFrames = positiveSafeIntegerInRange(
    input.windowDurationInFrames,
    NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_MAX_FRAMES_V2,
    'NATIVE_MEDIA_PREVIEW_WINDOW_DURATION_INVALID',
  );
  if (windowLocalStartFrame + windowDurationInFrames > overlayDurationInFrames) {
    throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_RANGE_INVALID');
  }
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
    throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_PICTURE_DUPLICATE');
  }
  const frames = receipt.timelinePictures.map((picture) => {
    const projectFrame = integerTextToSafeNumber(
      picture.timelineFrame,
      'NATIVE_MEDIA_PREVIEW_WINDOW_PROJECT_FRAME_INVALID',
    );
    const localFrame = projectFrame - overlayFromFrame;
    const decoded = pictures.get(picture.decoderPictureRequestSha256);
    if (!decoded
      || decoded.pictureHandle !== picture.pictureHandle
      || decoded.decodedPictureContentSha256 !== picture.decodedPictureContentSha256) {
      throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_PICTURE_SCOPE_MISMATCH');
    }
    return {
      localFrame,
      projectFrame,
      pictureHandle: picture.pictureHandle,
      decoderPictureRequestSha256: picture.decoderPictureRequestSha256,
      decodedPictureContentSha256: picture.decodedPictureContentSha256,
    };
  });
  return assertNativeMediaTimestampPreviewWindowV2({
    schemaVersion: 2,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_KIND_V2,
    receiptSha256: receipt.receiptSha256,
    decoderRequestSha256: receipt.decoderRequestSha256,
    projectId: receipt.projectId,
    sequenceId: receipt.sequenceId,
    overlayId: receipt.overlayId,
    projectRevision: receipt.projectRevision,
    overlayFromFrame,
    overlayDurationInFrames,
    windowLocalStartFrame,
    windowDurationInFrames,
    lease: input.lease,
    audioOwnership: {
      disposition: receipt.audioOwnership.disposition,
      audioMappingSha256: receipt.audioOwnership.audioMappingSha256,
      decoderMaySupplyOrReplaceAudio: false,
    },
    frames,
  });
}

export function assertNativeMediaTimestampPreviewWindowV2(
  value: unknown,
): NativeMediaTimestampPreviewWindowV2 {
  const record = objectRecord(value, 'NATIVE_MEDIA_PREVIEW_WINDOW_INVALID');
  exactKeys(record, [
    'audioOwnership', 'decoderRequestSha256', 'frames', 'kind', 'lease',
    'overlayDurationInFrames', 'overlayFromFrame', 'overlayId', 'projectId',
    'projectRevision', 'receiptSha256', 'schemaVersion', 'sequenceId',
    'windowDurationInFrames', 'windowLocalStartFrame',
  ], 'NATIVE_MEDIA_PREVIEW_WINDOW_FIELDS_INVALID');
  if (record.schemaVersion !== 2
    || record.kind !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_KIND_V2
    || !Array.isArray(record.frames)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_SCOPE_INVALID');
  }
  const overlayFromFrame = nonNegativeSafeInteger(
    record.overlayFromFrame,
    'NATIVE_MEDIA_PREVIEW_WINDOW_OVERLAY_START_INVALID',
  );
  const overlayDurationInFrames = positiveSafeIntegerInRange(
    record.overlayDurationInFrames,
    MAX_OVERLAY_FRAMES,
    'NATIVE_MEDIA_PREVIEW_WINDOW_OVERLAY_DURATION_INVALID',
  );
  const windowLocalStartFrame = nonNegativeSafeInteger(
    record.windowLocalStartFrame,
    'NATIVE_MEDIA_PREVIEW_WINDOW_START_INVALID',
  );
  const windowDurationInFrames = positiveSafeIntegerInRange(
    record.windowDurationInFrames,
    NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_MAX_FRAMES_V2,
    'NATIVE_MEDIA_PREVIEW_WINDOW_DURATION_INVALID',
  );
  if (windowLocalStartFrame + windowDurationInFrames > overlayDurationInFrames
    || record.frames.length !== windowDurationInFrames) {
    throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_COVERAGE_INVALID');
  }
  const normalizedFrames = record.frames.map(normalizeFrame);
  const byLocalFrame = new Map<number, NativeMediaTimestampPreviewWindowFrameV2>();
  const windowEnd = windowLocalStartFrame + windowDurationInFrames;
  for (const frame of normalizedFrames) {
    if (frame.localFrame < windowLocalStartFrame || frame.localFrame >= windowEnd
      || frame.projectFrame !== overlayFromFrame + frame.localFrame
      || byLocalFrame.has(frame.localFrame)) {
      throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_COVERAGE_INVALID');
    }
    byLocalFrame.set(frame.localFrame, frame);
  }
  const frames = Array.from({ length: windowDurationInFrames }, (_, offset) => {
    const frame = byLocalFrame.get(windowLocalStartFrame + offset);
    if (!frame) throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_COVERAGE_INVALID');
    return frame;
  });
  return deepFreeze({
    schemaVersion: 2 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_KIND_V2,
    receiptSha256: sha256(record.receiptSha256, 'NATIVE_MEDIA_PREVIEW_WINDOW_RECEIPT_HASH_INVALID'),
    decoderRequestSha256: sha256(
      record.decoderRequestSha256,
      'NATIVE_MEDIA_PREVIEW_WINDOW_DECODER_REQUEST_INVALID',
    ),
    projectId: identifier(record.projectId, 'NATIVE_MEDIA_PREVIEW_WINDOW_PROJECT_INVALID'),
    sequenceId: identifier(record.sequenceId, 'NATIVE_MEDIA_PREVIEW_WINDOW_SEQUENCE_INVALID'),
    overlayId: identifier(record.overlayId, 'NATIVE_MEDIA_PREVIEW_WINDOW_OVERLAY_INVALID'),
    projectRevision: normalizeRevision(record.projectRevision),
    overlayFromFrame,
    overlayDurationInFrames,
    windowLocalStartFrame,
    windowDurationInFrames,
    lease: normalizeLease(record.lease),
    audioOwnership: normalizeAudioOwnership(record.audioOwnership),
    frames,
  });
}

export function createNativeMediaTimestampPreviewWindowIndexV2(
  values: readonly NativeMediaTimestampPreviewWindowV2[] = [],
  options: Readonly<{ now?: () => number }> = {},
): NativeMediaTimestampPreviewWindowIndexV2 {
  if (!Array.isArray(values) || values.length > MAX_WINDOWS) {
    throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_SET_INVALID');
  }
  const now = options.now ?? Date.now;
  const windowsByOverlay = new Map<string, NativeMediaTimestampPreviewWindowV2[]>();
  for (const value of values) {
    const window = assertNativeMediaTimestampPreviewWindowV2(value);
    const windows = windowsByOverlay.get(window.overlayId) ?? [];
    const reference = windows[0];
    if (reference && !sameOverlayScope(reference, window)) {
      throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_OVERLAY_SCOPE_MISMATCH');
    }
    windows.push(window);
    windowsByOverlay.set(window.overlayId, windows);
  }
  for (const windows of windowsByOverlay.values()) {
    windows.sort((left, right) => left.windowLocalStartFrame - right.windowLocalStartFrame);
    for (let index = 1; index < windows.length; index += 1) {
      const previous = windows[index - 1]!;
      const current = windows[index]!;
      if (previous.windowLocalStartFrame + previous.windowDurationInFrames
        > current.windowLocalStartFrame) {
        throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_OVERLAP');
      }
    }
  }
  function windowFor(
    overlayId: string | number,
    localFrame: number,
  ): NativeMediaTimestampPreviewWindowV2 | null {
    const normalizedOverlayId = identifier(
      String(overlayId),
      'NATIVE_MEDIA_PREVIEW_WINDOW_OVERLAY_INVALID',
    );
    if (!Number.isSafeInteger(localFrame) || localFrame < 0) return null;
    return windowsByOverlay.get(normalizedOverlayId)?.find((window) => (
      localFrame >= window.windowLocalStartFrame
      && localFrame < window.windowLocalStartFrame + window.windowDurationInFrames
    )) ?? null;
  }
  return Object.freeze({
    frameFor(overlayId, localFrame) {
      const window = windowFor(overlayId, localFrame);
      if (!window) return null;
      if (leaseDisposition(window.lease, now) === 'EXPIRED') {
        throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_LEASE_EXPIRED');
      }
      return window.frames[localFrame - window.windowLocalStartFrame] ?? null;
    },
    hasOverlay(overlayId) {
      return windowsByOverlay.has(identifier(
        String(overlayId),
        'NATIVE_MEDIA_PREVIEW_WINDOW_OVERLAY_INVALID',
      ));
    },
    leaseDispositionFor(overlayId, localFrame) {
      const window = windowFor(overlayId, localFrame);
      return window ? leaseDisposition(window.lease, now) : null;
    },
  });
}

export function planNativeMediaTimestampPreviewWindowsV2(input: Readonly<{
  currentLocalFrame: number;
  overlayDurationInFrames: number;
  framesPerWindow: number;
}>): NativeMediaTimestampPreviewWindowPlanV2 {
  const overlayDurationInFrames = positiveSafeIntegerInRange(
    input.overlayDurationInFrames,
    MAX_OVERLAY_FRAMES,
    'NATIVE_MEDIA_PREVIEW_WINDOW_OVERLAY_DURATION_INVALID',
  );
  const currentLocalFrame = nonNegativeSafeInteger(
    input.currentLocalFrame,
    'NATIVE_MEDIA_PREVIEW_WINDOW_CURRENT_FRAME_INVALID',
  );
  if (currentLocalFrame >= overlayDurationInFrames) {
    throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_CURRENT_FRAME_OUT_OF_RANGE');
  }
  const framesPerWindow = positiveSafeIntegerInRange(
    input.framesPerWindow,
    NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_MAX_FRAMES_V2,
    'NATIVE_MEDIA_PREVIEW_WINDOW_SIZE_INVALID',
  );
  const activeStart = Math.floor(currentLocalFrame / framesPerWindow) * framesPerWindow;
  const activeDuration = Math.min(framesPerWindow, overlayDurationInFrames - activeStart);
  const prefetchStart = activeStart + activeDuration;
  return deepFreeze({
    active: { localStartFrame: activeStart, durationInFrames: activeDuration },
    prefetch: prefetchStart < overlayDurationInFrames
      ? {
          localStartFrame: prefetchStart,
          durationInFrames: Math.min(framesPerWindow, overlayDurationInFrames - prefetchStart),
        }
      : null,
  });
}

function normalizeFrame(value: unknown): NativeMediaTimestampPreviewWindowFrameV2 {
  const record = objectRecord(value, 'NATIVE_MEDIA_PREVIEW_WINDOW_FRAME_INVALID');
  exactKeys(record, [
    'decodedPictureContentSha256', 'decoderPictureRequestSha256', 'localFrame',
    'pictureHandle', 'projectFrame',
  ], 'NATIVE_MEDIA_PREVIEW_WINDOW_FRAME_FIELDS_INVALID');
  return Object.freeze({
    localFrame: nonNegativeSafeInteger(record.localFrame, 'NATIVE_MEDIA_PREVIEW_WINDOW_LOCAL_FRAME_INVALID'),
    projectFrame: nonNegativeSafeInteger(
      record.projectFrame,
      'NATIVE_MEDIA_PREVIEW_WINDOW_PROJECT_FRAME_INVALID',
    ),
    pictureHandle: validHandle(record.pictureHandle),
    decoderPictureRequestSha256: sha256(
      record.decoderPictureRequestSha256,
      'NATIVE_MEDIA_PREVIEW_WINDOW_PICTURE_REQUEST_INVALID',
    ),
    decodedPictureContentSha256: sha256(
      record.decodedPictureContentSha256,
      'NATIVE_MEDIA_PREVIEW_WINDOW_PICTURE_CONTENT_INVALID',
    ),
  });
}

function normalizeLease(value: unknown): NativeMediaTimestampPreviewWindowLeaseV2 {
  const record = objectRecord(value, 'NATIVE_MEDIA_PREVIEW_WINDOW_LEASE_INVALID');
  exactKeys(record, [
    'expiresAtEpochMs', 'issuedAtEpochMs', 'leaseId', 'renewAfterEpochMs',
  ], 'NATIVE_MEDIA_PREVIEW_WINDOW_LEASE_FIELDS_INVALID');
  const issuedAtEpochMs = nonNegativeSafeInteger(
    record.issuedAtEpochMs,
    'NATIVE_MEDIA_PREVIEW_WINDOW_LEASE_INVALID',
  );
  const renewAfterEpochMs = nonNegativeSafeInteger(
    record.renewAfterEpochMs,
    'NATIVE_MEDIA_PREVIEW_WINDOW_LEASE_INVALID',
  );
  const expiresAtEpochMs = nonNegativeSafeInteger(
    record.expiresAtEpochMs,
    'NATIVE_MEDIA_PREVIEW_WINDOW_LEASE_INVALID',
  );
  if (renewAfterEpochMs <= issuedAtEpochMs || expiresAtEpochMs <= renewAfterEpochMs
    || expiresAtEpochMs - issuedAtEpochMs > MAX_LEASE_TTL_MS) {
    throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_LEASE_INVALID');
  }
  if (typeof record.leaseId !== 'string' || !LEASE_ID_PATTERN.test(record.leaseId)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_LEASE_ID_INVALID');
  }
  return Object.freeze({
    leaseId: record.leaseId,
    issuedAtEpochMs,
    renewAfterEpochMs,
    expiresAtEpochMs,
  });
}

function normalizeRevision(value: unknown): NativeMediaTimestampPreviewWindowV2['projectRevision'] {
  const record = objectRecord(value, 'NATIVE_MEDIA_PREVIEW_WINDOW_REVISION_INVALID');
  exactKeys(record, [
    'compatibilityUpdatedAt', 'schemaVersion', 'value',
  ], 'NATIVE_MEDIA_PREVIEW_WINDOW_REVISION_FIELDS_INVALID');
  if (record.schemaVersion !== 1) throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_REVISION_INVALID');
  return Object.freeze({
    schemaVersion: 1 as const,
    value: nonNegativeSafeInteger(record.value, 'NATIVE_MEDIA_PREVIEW_WINDOW_REVISION_INVALID'),
    compatibilityUpdatedAt: boundedText(
      record.compatibilityUpdatedAt,
      240,
      'NATIVE_MEDIA_PREVIEW_WINDOW_REVISION_INVALID',
    ),
  });
}

function normalizeAudioOwnership(
  value: unknown,
): NativeMediaTimestampPreviewWindowV2['audioOwnership'] {
  const record = objectRecord(value, 'NATIVE_MEDIA_PREVIEW_WINDOW_AUDIO_INVALID');
  exactKeys(record, [
    'audioMappingSha256', 'decoderMaySupplyOrReplaceAudio', 'disposition',
  ], 'NATIVE_MEDIA_PREVIEW_WINDOW_AUDIO_FIELDS_INVALID');
  if ((record.disposition !== 'EXACT_SAMPLE_MAPPING_BOUND'
      && record.disposition !== 'NO_AUDIO_MAPPING_REQUESTED')
    || record.decoderMaySupplyOrReplaceAudio !== false) {
    throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_AUDIO_INVALID');
  }
  const audioMappingSha256 = record.audioMappingSha256 === null
    ? null
    : sha256(record.audioMappingSha256, 'NATIVE_MEDIA_PREVIEW_WINDOW_AUDIO_HASH_INVALID');
  if ((record.disposition === 'EXACT_SAMPLE_MAPPING_BOUND') !== (audioMappingSha256 !== null)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_AUDIO_INVALID');
  }
  return Object.freeze({
    disposition: record.disposition,
    audioMappingSha256,
    decoderMaySupplyOrReplaceAudio: false as const,
  });
}

function sameOverlayScope(
  left: NativeMediaTimestampPreviewWindowV2,
  right: NativeMediaTimestampPreviewWindowV2,
): boolean {
  return left.projectId === right.projectId
    && left.sequenceId === right.sequenceId
    && left.overlayId === right.overlayId
    && left.projectRevision.value === right.projectRevision.value
    && left.projectRevision.compatibilityUpdatedAt === right.projectRevision.compatibilityUpdatedAt
    && left.overlayFromFrame === right.overlayFromFrame
    && left.overlayDurationInFrames === right.overlayDurationInFrames
    && left.audioOwnership.disposition === right.audioOwnership.disposition
    && left.audioOwnership.audioMappingSha256 === right.audioOwnership.audioMappingSha256;
}

function leaseDisposition(
  lease: NativeMediaTimestampPreviewWindowLeaseV2,
  now: () => number,
): NativeMediaTimestampPreviewWindowLeaseDispositionV2 {
  const observedNow = nonNegativeSafeInteger(
    now(),
    'NATIVE_MEDIA_PREVIEW_WINDOW_CLOCK_INVALID',
  );
  if (observedNow >= lease.expiresAtEpochMs) return 'EXPIRED';
  return observedNow >= lease.renewAfterEpochMs ? 'RENEW_DUE' : 'CURRENT';
}

function integerTextToSafeNumber(value: unknown, code: string): number {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,127})$/.test(value)) throw new Error(code);
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
    throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_HANDLE_INVALID');
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
