import { createHash } from 'node:crypto';

import {
  assertNativeMediaTimestampPreviewMaterializeCommandV2,
  assertNativeMediaTimestampPreviewReleaseCommandV1,
  assertNativeMediaTimestampPreviewReleaseCommandV2,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V2,
  type NativeMediaTimestampPreviewMaterializeCommandV2,
  type NativeMediaTimestampPreviewReleaseCommandV1,
  type NativeMediaTimestampPreviewReleaseCommandV2,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-contract-v1';
import {
  assertNativeMediaTimestampPreviewSessionWindowV1,
  type NativeMediaTimestampPreviewSessionWindowV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-window-v1';
import {
  assertNativeMediaTimestampPreviewWindowV2,
  type NativeMediaTimestampPreviewWindowV2,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-window-v2';

import type { NativeMediaTimestampPreviewSurfaceStorePortV1 } from './native-media-timestamp-ffmpeg-preview-decoder-v1';
import type {
  NativeMediaTimestampPreviewAudioSurfaceBindingV1,
  NativeMediaTimestampPreviewAudioSurfaceReaderPortV1,
  NativeMediaTimestampPreviewAudioSurfaceStorePortV1,
} from './native-media-timestamp-r2-preview-audio-surface-v1';
import type { NativeMediaTimestampPreviewSurfaceReaderPortV1 } from './native-media-timestamp-r2-preview-surface-v1';
import type { NativeMediaTimestampPreviewMaterializerInputV1 } from './native-media-timestamp-preview-materializer-v1';

export {
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V2,
};
export type {
  NativeMediaTimestampPreviewMaterializeCommandV2,
  NativeMediaTimestampPreviewReleaseCommandV1,
  NativeMediaTimestampPreviewReleaseCommandV2,
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

type NativeMediaTimestampPreviewReleaseReasonV1 = Extract<
  NativeMediaTimestampPreviewReleaseResultV1,
  { disposition: 'UNVERIFIABLE' }
>['reason'];

export type NativeMediaTimestampPreviewReleaseResultV2 = Readonly<
  | {
      disposition: 'RELEASED';
      deletedPictureCount: number;
      alreadyAbsentPictureCount: number;
      deletedAudioCount: number;
      alreadyAbsentAudioCount: number;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason:
        | NativeMediaTimestampPreviewReleaseReasonV1
        | 'AUDIO_SURFACE_UNAVAILABLE'
        | 'AUDIO_SURFACE_SCOPE_MISMATCH';
      failedPictureCount: number;
      failedAudioCount: number;
    }
>;

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

export function parseNativeMediaTimestampPreviewReleaseCommandV1(
  value: unknown,
): NativeMediaTimestampPreviewReleaseCommandV1 {
  return assertNativeMediaTimestampPreviewReleaseCommandV1(value);
}

export function parseNativeMediaTimestampPreviewReleaseCommandV2(
  value: unknown,
): NativeMediaTimestampPreviewReleaseCommandV2 {
  return assertNativeMediaTimestampPreviewReleaseCommandV2(value);
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

export async function releaseNativeMediaTimestampPreviewSessionWindowV2(
  input: Readonly<{
    userId: string;
    sessionWindow: NativeMediaTimestampPreviewSessionWindowV1;
  }>,
  ports: Readonly<{
    pictureReader: NativeMediaTimestampPreviewSurfaceReaderPortV1;
    pictureDeleter: Pick<NativeMediaTimestampPreviewSurfaceStorePortV1, 'deletePicture'>;
    audioReader: NativeMediaTimestampPreviewAudioSurfaceReaderPortV1;
    audioDeleter: Pick<NativeMediaTimestampPreviewAudioSurfaceStorePortV1, 'deleteAudioSegment'>;
  }>,
): Promise<NativeMediaTimestampPreviewReleaseResultV2> {
  let userId: string;
  let sessionWindow: NativeMediaTimestampPreviewSessionWindowV1;
  try {
    userId = identifier(input.userId, 'NATIVE_MEDIA_PREVIEW_SESSION_USER_INVALID');
    sessionWindow = assertNativeMediaTimestampPreviewSessionWindowV1(input.sessionWindow);
  } catch {
    return unverifiableV2('INPUT_INVALID', 0, 0);
  }
  if (!ports?.pictureReader || typeof ports.pictureReader.readPicture !== 'function'
    || !ports.pictureDeleter || typeof ports.pictureDeleter.deletePicture !== 'function'
    || !ports.audioReader || typeof ports.audioReader.readAudioSegment !== 'function'
    || !ports.audioDeleter || typeof ports.audioDeleter.deleteAudioSegment !== 'function') {
    return unverifiableV2('INPUT_INVALID', 0, 0);
  }

  const audioHandles: string[] = [];
  let alreadyAbsentAudioCount = 0;
  if (sessionWindow.audioWindow) {
    for (const segment of sessionWindow.audioWindow.segments) {
      if (segment.kind !== 'PCM') continue;
      let surface: Awaited<ReturnType<typeof ports.audioReader.readAudioSegment>>;
      try {
        surface = await ports.audioReader.readAudioSegment(segment.audioHandle);
      } catch {
        return unverifiableV2('AUDIO_SURFACE_UNAVAILABLE', 0, 0);
      }
      if (surface.disposition === 'NOT_FOUND') {
        alreadyAbsentAudioCount += 1;
        continue;
      }
      if (!sameAudioSurfaceScope(
        surface.binding,
        userId,
        sessionWindow.audioWindow,
        segment,
      )) {
        return unverifiableV2('AUDIO_SURFACE_SCOPE_MISMATCH', 0, 0);
      }
      audioHandles.push(segment.audioHandle);
    }
  }

  const pictureResult = await releaseNativeMediaTimestampPreviewWindowV1(
    { userId, window: sessionWindow.pictureWindow },
    { reader: ports.pictureReader, deleter: ports.pictureDeleter },
  );
  if (pictureResult.disposition === 'UNVERIFIABLE') {
    return unverifiableV2(pictureResult.reason, pictureResult.failedPictureCount, 0);
  }

  let deletedAudioCount = 0;
  let failedAudioCount = 0;
  for (const audioHandle of audioHandles) {
    try {
      await ports.audioDeleter.deleteAudioSegment(audioHandle);
      deletedAudioCount += 1;
    } catch {
      failedAudioCount += 1;
    }
  }
  if (failedAudioCount > 0) {
    return unverifiableV2('RELEASE_INCOMPLETE', 0, failedAudioCount);
  }
  return Object.freeze({
    disposition: 'RELEASED' as const,
    deletedPictureCount: pictureResult.deletedPictureCount,
    alreadyAbsentPictureCount: pictureResult.alreadyAbsentPictureCount,
    deletedAudioCount,
    alreadyAbsentAudioCount,
  });
}

function sameAudioSurfaceScope(
  binding: NativeMediaTimestampPreviewAudioSurfaceBindingV1,
  userId: string,
  window: NonNullable<NativeMediaTimestampPreviewSessionWindowV1['audioWindow']>,
  segment: Extract<
    NonNullable<NativeMediaTimestampPreviewSessionWindowV1['audioWindow']>['segments'][number],
    { kind: 'PCM' }
  >,
): boolean {
  return binding.audioHandle === segment.audioHandle
    && binding.userIdSha256 === digestText(userId)
    && binding.projectIdSha256 === digestText(window.projectId)
    && sameRevision(binding.projectRevision, window.projectRevision)
    && binding.sequenceIdSha256 === digestText(window.sequenceId)
    && binding.overlayIdSha256 === digestText(window.overlayId)
    && binding.audioMappingSha256 === window.audioMappingSha256
    && binding.audioSampleEpochMapSha256 === window.audioSampleEpochMapSha256
    && binding.decodedPcmSha256 === window.decodedPcmSha256
    && binding.sampleRate === window.sampleRate
    && binding.channelCount === window.channelCount
    && binding.sourceStartSampleFrame === segment.sourceStartSampleFrame
    && binding.sourceEndExclusiveSampleFrame === segment.sourceEndExclusiveSampleFrame
    && samePosition(binding.decodedStartSamplePosition, segment.decodedStartSamplePosition)
    && samePosition(
      binding.decodedEndExclusiveSamplePosition,
      segment.decodedEndExclusiveSamplePosition,
    )
    && samePosition(binding.timelineStartSamplePosition, segment.timelineStartSamplePosition)
    && samePosition(
      binding.timelineEndExclusiveSamplePosition,
      segment.timelineEndExclusiveSamplePosition,
    )
    && binding.segmentIdentitySha256 === segment.segmentIdentitySha256
    && binding.expiresAtEpochMs === window.lease.expiresAtEpochMs;
}

function samePosition(
  left: Readonly<{ numerator: string; denominator: string; disposition: string }>,
  right: Readonly<{ numerator: string; denominator: string; disposition: string }>,
): boolean {
  return left.numerator === right.numerator
    && left.denominator === right.denominator
    && left.disposition === right.disposition;
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

function unverifiableV2(
  reason: Extract<NativeMediaTimestampPreviewReleaseResultV2, {
    disposition: 'UNVERIFIABLE';
  }>['reason'],
  failedPictureCount: number,
  failedAudioCount: number,
): NativeMediaTimestampPreviewReleaseResultV2 {
  return Object.freeze({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    failedPictureCount,
    failedAudioCount,
  });
}
