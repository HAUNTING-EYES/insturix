import { createHash } from 'node:crypto';

import {
  assertNativeMediaTimestampPreviewWindowV2,
  type NativeMediaTimestampPreviewWindowV2,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-window-v2';

import type { NativeMediaTimestampPreviewSurfaceStorePortV1 } from './native-media-timestamp-ffmpeg-preview-decoder-v1';
import type { NativeMediaTimestampPreviewSurfaceReaderPortV1 } from './native-media-timestamp-r2-preview-surface-v1';
import type { NativeMediaTimestampPreviewMaterializerInputV1 } from './native-media-timestamp-preview-materializer-v1';

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_V1' as const;
export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_V1' as const;

export type NativeMediaTimestampPreviewMaterializeCommandV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V1;
  projectId: string;
  sequenceId: string;
  overlayId: string;
  windowLocalStartFrame: number;
  windowDurationInFrames: number;
}>;

export type NativeMediaTimestampPreviewReleaseCommandV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1;
  window: NativeMediaTimestampPreviewWindowV2;
}>;

export type NativeMediaTimestampPreviewReleaseResultV1 = Readonly<
  | {
      disposition: 'RELEASED';
      deletedPictureCount: number;
      alreadyAbsentPictureCount: number;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason:
        | 'INPUT_INVALID'
        | 'SURFACE_UNAVAILABLE'
        | 'SURFACE_SCOPE_MISMATCH'
        | 'RELEASE_INCOMPLETE';
      failedPictureCount: number;
    }
>;

export function parseNativeMediaTimestampPreviewMaterializeCommandV1(
  value: unknown,
  userId: string,
): NativeMediaTimestampPreviewMaterializerInputV1 {
  const record = exactRecord(value, [
    'kind', 'overlayId', 'projectId', 'schemaVersion', 'sequenceId',
    'windowDurationInFrames', 'windowLocalStartFrame',
  ], 'NATIVE_MEDIA_PREVIEW_MATERIALIZE_COMMAND_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V1) {
    throw new Error('NATIVE_MEDIA_PREVIEW_MATERIALIZE_COMMAND_INVALID');
  }
  return Object.freeze({
    userId: identifier(userId, 'NATIVE_MEDIA_PREVIEW_SESSION_USER_INVALID'),
    projectId: identifier(record.projectId, 'NATIVE_MEDIA_PREVIEW_SESSION_PROJECT_INVALID'),
    sequenceId: identifier(record.sequenceId, 'NATIVE_MEDIA_PREVIEW_SESSION_SEQUENCE_INVALID'),
    overlayId: identifier(record.overlayId, 'NATIVE_MEDIA_PREVIEW_SESSION_OVERLAY_INVALID'),
    windowLocalStartFrame: nonNegativeInteger(
      record.windowLocalStartFrame,
      'NATIVE_MEDIA_PREVIEW_SESSION_WINDOW_START_INVALID',
    ),
    windowDurationInFrames: positiveInteger(
      record.windowDurationInFrames,
      'NATIVE_MEDIA_PREVIEW_SESSION_WINDOW_DURATION_INVALID',
    ),
  });
}

export function parseNativeMediaTimestampPreviewReleaseCommandV1(
  value: unknown,
): NativeMediaTimestampPreviewReleaseCommandV1 {
  const record = exactRecord(
    value,
    ['kind', 'schemaVersion', 'window'],
    'NATIVE_MEDIA_PREVIEW_RELEASE_COMMAND_INVALID',
  );
  if (record.schemaVersion !== 1
    || record.kind !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1) {
    throw new Error('NATIVE_MEDIA_PREVIEW_RELEASE_COMMAND_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
    window: assertNativeMediaTimestampPreviewWindowV2(record.window),
  });
}

export async function releaseNativeMediaTimestampPreviewWindowV1(
  input: Readonly<{
    userId: string;
    window: NativeMediaTimestampPreviewWindowV2;
  }>,
  ports: Readonly<{
    reader: NativeMediaTimestampPreviewSurfaceReaderPortV1;
    deleter: Pick<NativeMediaTimestampPreviewSurfaceStorePortV1, 'deletePicture'>;
  }>,
): Promise<NativeMediaTimestampPreviewReleaseResultV1> {
  let userId: string;
  let window: NativeMediaTimestampPreviewWindowV2;
  try {
    userId = identifier(input.userId, 'NATIVE_MEDIA_PREVIEW_SESSION_USER_INVALID');
    window = assertNativeMediaTimestampPreviewWindowV2(input.window);
  } catch {
    return unverifiable('INPUT_INVALID', 0);
  }
  if (!ports?.reader || typeof ports.reader.readPicture !== 'function'
    || !ports.deleter || typeof ports.deleter.deletePicture !== 'function') {
    return unverifiable('INPUT_INVALID', 0);
  }

  const expectedByHandle = new Map<string, Readonly<{
    decoderPictureRequestSha256: string;
    decodedPictureContentSha256: string;
  }>>();
  for (const frame of window.frames) {
    const previous = expectedByHandle.get(frame.pictureHandle);
    if (previous && (previous.decoderPictureRequestSha256 !== frame.decoderPictureRequestSha256
      || previous.decodedPictureContentSha256 !== frame.decodedPictureContentSha256)) {
      return unverifiable('INPUT_INVALID', 0);
    }
    expectedByHandle.set(frame.pictureHandle, {
      decoderPictureRequestSha256: frame.decoderPictureRequestSha256,
      decodedPictureContentSha256: frame.decodedPictureContentSha256,
    });
  }

  const deleteHandles: string[] = [];
  let alreadyAbsentPictureCount = 0;
  for (const [pictureHandle, expected] of expectedByHandle) {
    let surface: Awaited<ReturnType<typeof ports.reader.readPicture>>;
    try {
      surface = await ports.reader.readPicture(pictureHandle);
    } catch {
      return unverifiable('SURFACE_UNAVAILABLE', 0);
    }
    if (surface.disposition === 'NOT_FOUND') {
      alreadyAbsentPictureCount += 1;
      continue;
    }
    const binding = surface.binding;
    if (binding.pictureHandle !== pictureHandle
      || binding.userId !== userId
      || binding.projectId !== window.projectId
      || !sameRevision(binding.projectRevision, window.projectRevision)
      || binding.sequenceIdSha256 !== digestText(window.sequenceId)
      || binding.overlayIdSha256 !== digestText(window.overlayId)
      || binding.decoderRequestSha256 !== window.decoderRequestSha256
      || binding.decoderPictureRequestSha256 !== expected.decoderPictureRequestSha256
      || binding.decodedPictureContentSha256 !== expected.decodedPictureContentSha256
      || binding.expiresAtEpochMs !== window.lease.expiresAtEpochMs) {
      return unverifiable('SURFACE_SCOPE_MISMATCH', 0);
    }
    deleteHandles.push(pictureHandle);
  }

  let deletedPictureCount = 0;
  let failedPictureCount = 0;
  for (const pictureHandle of deleteHandles) {
    try {
      await ports.deleter.deletePicture(pictureHandle);
      deletedPictureCount += 1;
    } catch {
      failedPictureCount += 1;
    }
  }
  if (failedPictureCount > 0) {
    return unverifiable('RELEASE_INCOMPLETE', failedPictureCount);
  }
  return Object.freeze({
    disposition: 'RELEASED' as const,
    deletedPictureCount,
    alreadyAbsentPictureCount,
  });
}

function sameRevision(
  left: NativeMediaTimestampPreviewWindowV2['projectRevision'],
  right: NativeMediaTimestampPreviewWindowV2['projectRevision'],
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

function digestText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function exactRecord(value: unknown, keys: readonly string[], code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) throw new Error(code);
  return record;
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function nonNegativeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function positiveInteger(value: unknown, code: string): number {
  const normalized = nonNegativeInteger(value, code);
  if (normalized < 1) throw new Error(code);
  return normalized;
}

function unverifiable(
  reason: Extract<NativeMediaTimestampPreviewReleaseResultV1, {
    disposition: 'UNVERIFIABLE';
  }>['reason'],
  failedPictureCount: number,
): NativeMediaTimestampPreviewReleaseResultV1 {
  return Object.freeze({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    failedPictureCount,
  });
}
