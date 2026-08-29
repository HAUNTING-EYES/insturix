import { auth } from '@clerk/nextjs/server';

import {
  materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1,
  type NativeMediaTimestampPreviewMaterializerReasonV1,
} from '@/lib/editron/services/native-media-timestamp-preview-materializer-v1';
import { createMediaSourcePtsCadenceR2RuntimePortsV1 } from '@/lib/editron/services/media-source-pts-cadence-r2-runtime-v1';
import {
  parseCompatibleNativeMediaTimestampPreviewMaterializeCommandV2,
  parseNativeMediaTimestampPreviewReleaseCommandV1,
  releaseNativeMediaTimestampPreviewWindowV1,
} from '@/lib/editron/services/native-media-timestamp-preview-session-server-v1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_COMMAND_BYTES = 64 * 1024;

let privateRuntime: ReturnType<typeof createMediaSourcePtsCadenceR2RuntimePortsV1> | null = null;

export async function POST(request: Request): Promise<Response> {
  const userId = await authenticatedUserId();
  if (!userId) return json({ disposition: 'UNAUTHORIZED' }, 401);

  let input;
  try {
    input = parseCompatibleNativeMediaTimestampPreviewMaterializeCommandV2(
      await readCommand(request),
      userId,
    );
  } catch {
    return json({ disposition: 'INVALID_COMMAND' }, 400);
  }

  const result = await materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1(input);
  if (result.disposition === 'WINDOW_MATERIALIZED'
    || result.disposition === 'NOT_APPLICABLE') {
    return json(result, 200);
  }
  return json(result, materializeStatus(result.reason));
}

export async function DELETE(request: Request): Promise<Response> {
  const userId = await authenticatedUserId();
  if (!userId) return json({ disposition: 'UNAUTHORIZED' }, 401);

  let command;
  try {
    command = parseNativeMediaTimestampPreviewReleaseCommandV1(await readCommand(request));
  } catch {
    return json({ disposition: 'INVALID_COMMAND' }, 400);
  }

  let result;
  try {
    const ports = previewRuntime();
    result = await releaseNativeMediaTimestampPreviewWindowV1(
      { userId, window: command.window },
      {
        reader: ports.previewSurface.createReader(),
        deleter: ports.previewSurface.createStore({
          userId,
          projectId: command.window.projectId,
          sequenceId: command.window.sequenceId,
          overlayId: command.window.overlayId,
          projectRevision: command.window.projectRevision,
        }),
      },
    );
  } catch {
    return json({ disposition: 'UNVERIFIABLE', reason: 'RUNTIME_UNAVAILABLE' }, 503);
  }
  if (result.disposition === 'RELEASED') return json(result, 200);
  return json(result, result.reason === 'INPUT_INVALID'
    ? 400
    : result.reason === 'SURFACE_SCOPE_MISMATCH'
      ? 409
      : 503);
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
