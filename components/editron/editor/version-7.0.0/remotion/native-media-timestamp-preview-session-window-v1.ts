import {
  assertNativeMediaTimestampPreviewAudioWindowV1,
  type NativeMediaTimestampPreviewAudioWindowV1,
} from './native-media-timestamp-preview-audio-window-v1';
import {
  assertNativeMediaTimestampPreviewWindowV2,
  type NativeMediaTimestampPreviewWindowV2,
} from './native-media-timestamp-preview-window-v2';

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_V1' as const;

export type NativeMediaTimestampPreviewSessionWindowV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_KIND_V1;
  pictureWindow: NativeMediaTimestampPreviewWindowV2;
  audioWindow: NativeMediaTimestampPreviewAudioWindowV1 | null;
}>;

/**
 * Binds independently timed picture and audio windows into one disposable
 * preview lease. This contract validates pairing only; it never creates,
 * rounds, resamples or substitutes either media essence.
 */
export function assertNativeMediaTimestampPreviewSessionWindowV1(
  value: unknown,
): NativeMediaTimestampPreviewSessionWindowV1 {
  const record = exactRecord(
    value,
    ['audioWindow', 'kind', 'pictureWindow', 'schemaVersion'],
    'NATIVE_MEDIA_PREVIEW_SESSION_WINDOW_FIELDS_INVALID',
  );
  if (record.schemaVersion !== 1
    || record.kind !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_KIND_V1) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SESSION_WINDOW_INVALID');
  }
  const pictureWindow = assertNativeMediaTimestampPreviewWindowV2(record.pictureWindow);
  const audioWindow = record.audioWindow === null
    ? null
    : assertNativeMediaTimestampPreviewAudioWindowV1(record.audioWindow);
  if (pictureWindow.audioOwnership.disposition === 'EXACT_SAMPLE_MAPPING_BOUND') {
    if (!audioWindow) throw new Error('NATIVE_MEDIA_PREVIEW_SESSION_AUDIO_REQUIRED');
    if (pictureWindow.audioOwnership.audioMappingSha256
        !== audioWindow.audioMappingSha256) {
      throw new Error('NATIVE_MEDIA_PREVIEW_SESSION_AUDIO_MAPPING_MISMATCH');
    }
  } else if (audioWindow !== null) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SESSION_AUDIO_UNEXPECTED');
  }
  if (audioWindow && !sameScope(pictureWindow, audioWindow)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SESSION_AUDIO_SCOPE_MISMATCH');
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_KIND_V1,
    pictureWindow,
    audioWindow,
  });
}

function sameScope(
  picture: NativeMediaTimestampPreviewWindowV2,
  audio: NativeMediaTimestampPreviewAudioWindowV1,
): boolean {
  return picture.projectId === audio.projectId
    && picture.sequenceId === audio.sequenceId
    && picture.overlayId === audio.overlayId
    && sameRevision(picture.projectRevision, audio.projectRevision)
    && picture.windowLocalStartFrame === audio.windowLocalStartFrame
    && picture.windowDurationInFrames === audio.windowDurationInFrames
    && picture.overlayFromFrame + picture.windowLocalStartFrame
      === audio.windowProjectStartFrame
    && picture.overlayFromFrame + picture.windowLocalStartFrame
      + picture.windowDurationInFrames === audio.windowProjectEndExclusiveFrame
    && sameLease(picture.lease, audio.lease);
}

function sameRevision(
  left: NativeMediaTimestampPreviewWindowV2['projectRevision'],
  right: NativeMediaTimestampPreviewAudioWindowV1['projectRevision'],
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

function sameLease(
  left: NativeMediaTimestampPreviewWindowV2['lease'],
  right: NativeMediaTimestampPreviewAudioWindowV1['lease'],
): boolean {
  return left.leaseId === right.leaseId
    && left.issuedAtEpochMs === right.issuedAtEpochMs
    && left.renewAfterEpochMs === right.renewAfterEpochMs
    && left.expiresAtEpochMs === right.expiresAtEpochMs;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  code: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) throw new Error(code);
  return record;
}
