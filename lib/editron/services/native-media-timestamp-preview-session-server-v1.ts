import { createHash } from 'node:crypto';

import {
  assertNativeMediaTimestampPreviewMaterializeCommandV1,
  assertNativeMediaTimestampPreviewMaterializeCommandV2,
  assertNativeMediaTimestampPreviewReleaseCommandV1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
  type NativeMediaTimestampPreviewMaterializeCommandV1,
  type NativeMediaTimestampPreviewMaterializeCommandV2,
  type NativeMediaTimestampPreviewReleaseCommandV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-contract-v1';
import {
  assertNativeMediaTimestampPreviewWindowV2,
  type NativeMediaTimestampPreviewWindowV2,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-window-v2';

import type { NativeMediaTimestampPreviewSurfaceStorePortV1 } from './native-media-timestamp-ffmpeg-preview-decoder-v1';
import type { NativeMediaTimestampPreviewSurfaceReaderPortV1 } from './native-media-timestamp-r2-preview-surface-v1';
import type { NativeMediaTimestampPreviewMaterializerInputV1 } from './native-media-timestamp-preview-materializer-v1';

export {
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
};
export type {
  NativeMediaTimestampPreviewMaterializeCommandV1,
  NativeMediaTimestampPreviewMaterializeCommandV2,
  NativeMediaTimestampPreviewReleaseCommandV1,
};

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
  const command = assertNativeMediaTimestampPreviewMaterializeCommandV1(value);
  return Object.freeze({
    userId: identifier(userId, 'NATIVE_MEDIA_PREVIEW_SESSION_USER_INVALID'),
    projectId: command.projectId,
    sequenceId: command.sequenceId,
    overlayId: command.overlayId,
    windowLocalStartFrame: command.windowLocalStartFrame,
    windowDurationInFrames: command.windowDurationInFrames,
  });
}

export function parseNativeMediaTimestampPreviewMaterializeCommandV2(
  value: unknown,
  userId: string,
): NativeMediaTimestampPreviewMaterializerInputV1 {
  const command = assertNativeMediaTimestampPreviewMaterializeCommandV2(value);
  return Object.freeze({
    userId: identifier(userId, 'NATIVE_MEDIA_PREVIEW_SESSION_USER_INVALID'),
    projectId: command.projectId,
    sequenceId: command.sequenceId,
    overlayId: command.overlayId,
    expectedProjectRevision: command.expectedProjectRevision,
    windowLocalStartFrame: command.windowLocalStartFrame,
    windowDurationInFrames: command.windowDurationInFrames,
  });
}

export function parseCompatibleNativeMediaTimestampPreviewMaterializeCommandV2(
  value: unknown,
  userId: string,
): NativeMediaTimestampPreviewMaterializerInputV1 {
  if (isCommandIdentity(
    value,
    2,
    NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
  )) return parseNativeMediaTimestampPreviewMaterializeCommandV2(value, userId);
  if (isCommandIdentity(
    value,
    1,
    NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V1,
  )) return parseNativeMediaTimestampPreviewMaterializeCommandV1(value, userId);
  throw new Error('NATIVE_MEDIA_PREVIEW_MATERIALIZE_COMMAND_IDENTITY_INVALID');
}

export function parseNativeMediaTimestampPreviewReleaseCommandV1(
  value: unknown,
): NativeMediaTimestampPreviewReleaseCommandV1 {
  return assertNativeMediaTimestampPreviewReleaseCommandV1(value);
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

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function isCommandIdentity(value: unknown, schemaVersion: number, kind: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === schemaVersion && record.kind === kind;
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
