import { auth } from '@clerk/nextjs/server';

import {
  materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1,
  type NativeMediaTimestampPreviewMaterializerReasonV1,
} from '@/lib/editron/services/native-media-timestamp-preview-materializer-v1';
import { createMediaSourcePtsCadenceR2RuntimePortsV1 } from '@/lib/editron/services/media-source-pts-cadence-r2-runtime-v1';
import {
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_SESSION_COMMAND_KIND_V3,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V2,
  parseNativeMediaTimestampPreviewMaterializeCommandV2,
  parseNativeMediaTimestampPreviewMaterializeSessionCommandV3,
  parseNativeMediaTimestampPreviewReleaseCommandV1,
  parseNativeMediaTimestampPreviewReleaseCommandV2,
  releaseNativeMediaTimestampPreviewSessionWindowV2,
  releaseNativeMediaTimestampPreviewWindowV1,
} from '@/lib/editron/services/native-media-timestamp-preview-session-server-v1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_COMMAND_BYTES = 64 * 1024;

let privateRuntime: ReturnType<typeof createMediaSourcePtsCadenceR2RuntimePortsV1> | null = null;

export async function POST(request: Request): Promise<Response> {
  const userId = await authenticatedUserId();
  if (!userId) return json({ disposition: 'UNAUTHORIZED' }, 401);

  let input:
    | ReturnType<typeof parseNativeMediaTimestampPreviewMaterializeCommandV2>
    | ReturnType<typeof parseNativeMediaTimestampPreviewMaterializeSessionCommandV3>;
  try {
    const command = await readCommand(request);
    if (hasIdentity(
      command,
      3,
      NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_SESSION_COMMAND_KIND_V3,
    )) {
      input = parseNativeMediaTimestampPreviewMaterializeSessionCommandV3(command, userId);
    } else if (hasIdentity(
      command,
      2,
      NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
    )) {
      input = parseNativeMediaTimestampPreviewMaterializeCommandV2(command, userId);
    } else {
      throw new Error('NATIVE_MEDIA_PREVIEW_MATERIALIZE_COMMAND_IDENTITY_INVALID');
    }
  } catch {
    return json({ disposition: 'INVALID_COMMAND' }, 400);
  }

  let result;
  try {
    result = 'deliveryContract' in input
      ? await materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1(input)
      : await materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1(input);
  } catch {
    return json({ disposition: 'UNVERIFIABLE', reason: 'RUNTIME_UNAVAILABLE' }, 503);
  }

  if (result.disposition === 'WINDOW_MATERIALIZED'
    || result.disposition === 'SESSION_WINDOW_MATERIALIZED'
    || result.disposition === 'NOT_APPLICABLE') {
    return json(result, 200);
  }
  return json(result, materializeStatus(result.reason));
}

export async function DELETE(request: Request): Promise<Response> {
  const userId = await authenticatedUserId();
  if (!userId) return json({ disposition: 'UNAUTHORIZED' }, 401);

  let command:
    | Readonly<{
        releaseKind: 'PICTURE_V1';
        parsed: ReturnType<typeof parseNativeMediaTimestampPreviewReleaseCommandV1>;
      }>
    | Readonly<{
        releaseKind: 'PAIRED_V2';
        parsed: ReturnType<typeof parseNativeMediaTimestampPreviewReleaseCommandV2>;
      }>;
  try {
    const value = await readCommand(request);
    if (hasIdentity(
      value,
      2,
      NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V2,
    )) {
      command = Object.freeze({
        releaseKind: 'PAIRED_V2' as const,
        parsed: parseNativeMediaTimestampPreviewReleaseCommandV2(value),
      });
    } else if (hasIdentity(
      value,
      1,
      NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
    )) {
      command = Object.freeze({
        releaseKind: 'PICTURE_V1' as const,
        parsed: parseNativeMediaTimestampPreviewReleaseCommandV1(value),
      });
    } else {
      throw new Error('NATIVE_MEDIA_PREVIEW_RELEASE_COMMAND_IDENTITY_INVALID');
    }
  } catch {
    return json({ disposition: 'INVALID_COMMAND' }, 400);
  }

  let result;
  try {
    const ports = previewRuntime();
    if (command.releaseKind === 'PAIRED_V2') {
      const scope = command.parsed.sessionWindow.pictureWindow;
      result = await releaseNativeMediaTimestampPreviewSessionWindowV2(
        { userId, sessionWindow: command.parsed.sessionWindow },
        {
          pictureReader: ports.previewSurface.createReader(),
          pictureDeleter: ports.previewSurface.createStore({
            userId,
            projectId: scope.projectId,
            sequenceId: scope.sequenceId,
            overlayId: scope.overlayId,
            projectRevision: scope.projectRevision,
          }),
          audioReader: ports.audioPreviewSurface.createReader(),
          audioDeleter: ports.audioPreviewSurface.createStore({
            userId,
            projectId: scope.projectId,
            sequenceId: scope.sequenceId,
            overlayId: scope.overlayId,
            projectRevision: scope.projectRevision,
          }),
        },
      );
    } else {
      result = await releaseNativeMediaTimestampPreviewWindowV1(
        { userId, window: command.parsed.window },
        {
          reader: ports.previewSurface.createReader(),
          deleter: ports.previewSurface.createStore({
            userId,
            projectId: command.parsed.window.projectId,
            sequenceId: command.parsed.window.sequenceId,
            overlayId: command.parsed.window.overlayId,
            projectRevision: command.parsed.window.projectRevision,
          }),
        },
      );
    }
  } catch {
    return json({ disposition: 'UNVERIFIABLE', reason: 'RUNTIME_UNAVAILABLE' }, 503);
  }
  if (result.disposition === 'RELEASED') return json(result, 200);
  return json(result, result.reason === 'INPUT_INVALID'
    ? 400
    : result.reason === 'SURFACE_SCOPE_MISMATCH'
      || result.reason === 'AUDIO_SURFACE_SCOPE_MISMATCH'
      ? 409
      : 503);
}

function hasIdentity(value: unknown, schemaVersion: number, kind: string): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (value as Record<string, unknown>).schemaVersion === schemaVersion
    && (value as Record<string, unknown>).kind === kind);
}

async function authenticatedUserId(): Promise<string | null> {
  try {
    return (await auth()).userId ?? null;
  } catch {
    return null;
  }
}

async function readCommand(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const parsed = Number(declaredLength);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_COMMAND_BYTES) {
      throw new Error('NATIVE_MEDIA_PREVIEW_COMMAND_BYTES_INVALID');
    }
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_COMMAND_BYTES) {
    throw new Error('NATIVE_MEDIA_PREVIEW_COMMAND_BYTES_INVALID');
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return JSON.parse(text) as unknown;
}

function previewRuntime(): ReturnType<typeof createMediaSourcePtsCadenceR2RuntimePortsV1> {
  privateRuntime ??= createMediaSourcePtsCadenceR2RuntimePortsV1();
  return privateRuntime;
}

function materializeStatus(reason: NativeMediaTimestampPreviewMaterializerReasonV1): number {
  if (reason === 'INPUT_INVALID') return 400;
  if (reason === 'PROJECT_UNAVAILABLE'
    || reason === 'OVERLAY_NOT_FOUND'
    || reason === 'ASSET_SCOPE_INVALID') return 404;
  if (reason === 'ASSET_UNAVAILABLE'
    || reason === 'CONFORM_FAILED'
    || reason === 'DECODER_FACTORY_FAILED'
    || reason === 'RUNTIME_UNAVAILABLE') return 503;
  return 409;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
