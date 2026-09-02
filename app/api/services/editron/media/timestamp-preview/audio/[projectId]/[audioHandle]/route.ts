import { auth } from '@clerk/nextjs/server';

import { createMediaSourcePtsCadenceR2RuntimePortsV1 } from '@/lib/editron/services/media-source-pts-cadence-r2-runtime-v1';
import {
  nativeMediaTimestampPreviewIdentitySha256V1,
  type NativeMediaTimestampPreviewAudioSurfaceReaderPortV1,
} from '@/lib/editron/services/native-media-timestamp-r2-preview-audio-surface-v1';
import { projectService, type ProjectRevisionV1 } from '@/lib/editron/services/project-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let reader: NativeMediaTimestampPreviewAudioSurfaceReaderPortV1 | null = null;

export async function GET(
  request: Request,
  context: Readonly<{ params: Promise<{ projectId: string; audioHandle: string }> }>,
): Promise<Response> {
  const userId = await authenticatedUserId();
  if (!userId) return empty(401, 'UNAUTHORIZED');

  let projectId: string;
  let audioHandle: string;
  try {
    const params = await context.params;
    projectId = identifier(params.projectId);
    audioHandle = params.audioHandle;
  } catch {
    return empty(400, 'INVALID_SCOPE');
  }

  let surface;
  try {
    surface = await previewReader().readAudioSegment(audioHandle);
  } catch (error) {
    if (knownCode(error) === 'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_HANDLE_INVALID') {
      return empty(400, 'INVALID_HANDLE');
    }
    return empty(503, 'SURFACE_UNAVAILABLE');
  }
  if (surface.disposition === 'NOT_FOUND') return empty(404, 'NOT_FOUND');
  if (surface.disposition === 'EXPIRED') return empty(410, 'EXPIRED');

  const { binding } = surface;
  if (binding.userIdSha256 !== nativeMediaTimestampPreviewIdentitySha256V1(userId)
    || binding.projectIdSha256 !== nativeMediaTimestampPreviewIdentitySha256V1(projectId)) {
    return empty(404, 'NOT_FOUND');
  }

  let currentRevision: ProjectRevisionV1;
  try {
    currentRevision = await projectService.getProjectRevision(userId, projectId);
  } catch {
    return empty(404, 'NOT_FOUND');
  }
  if (!sameRevision(currentRevision, binding.projectRevision)) {
    return empty(409, 'STALE_PROJECT_REVISION');
  }

  const etag = '"sha256-' + binding.wavContentSha256 + '"';
  const rangeHeader = request.headers.get('range');
  const ifRange = request.headers.get('if-range');
  let selected: ByteSelectionV1;
  try {
    selected = selectBytes(
      ifRange === null || ifRange === etag ? rangeHeader : null,
      binding.wavByteLength,
    );
  } catch {
    return empty(416, 'RANGE_NOT_SATISFIABLE', {
      'Accept-Ranges': 'bytes',
      'Content-Range': 'bytes */' + String(binding.wavByteLength),
    });
  }

  const bytes = surface.wavBytes.subarray(selected.start, selected.endExclusive);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body, {
    status: selected.partial ? 206 : 200,
    headers: {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      'Content-Disposition': 'inline; filename="editron-preview-audio.wav"',
      'Content-Length': String(bytes.byteLength),
      ...(selected.partial
        ? {
            'Content-Range': 'bytes ' + String(selected.start) + '-'
              + String(selected.endExclusive - 1) + '/'
              + String(binding.wavByteLength),
          }
        : {}),
      'Content-Type': 'audio/wav',
      'Cross-Origin-Resource-Policy': 'same-origin',
      ETag: etag,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Editron-Audio-Segment': binding.segmentIdentitySha256,
      'X-Editron-Preview-Status': 'CURRENT',
    },
  });
}

type ByteSelectionV1 = Readonly<{
  start: number;
  endExclusive: number;
  partial: boolean;
}>;

function selectBytes(range: string | null, byteLength: number): ByteSelectionV1 {
  if (!Number.isSafeInteger(byteLength) || byteLength < 1) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_ROUTE_BYTES_INVALID');
  }
  if (range === null) return { start: 0, endExclusive: byteLength, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_ROUTE_RANGE_INVALID');
  }
  let start: number;
  let endExclusive: number;
  if (!match[1]) {
    const suffixLength = safeIntegerText(match[2]);
    if (suffixLength < 1) {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_ROUTE_RANGE_INVALID');
    }
    start = Math.max(0, byteLength - suffixLength);
    endExclusive = byteLength;
  } else {
    start = safeIntegerText(match[1]);
    const requestedEnd = match[2] ? safeIntegerText(match[2]) : byteLength - 1;
    if (start >= byteLength || requestedEnd < start) {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_ROUTE_RANGE_INVALID');
    }
    endExclusive = Math.min(requestedEnd + 1, byteLength);
  }
  return { start, endExclusive, partial: true };
}

function previewReader(): NativeMediaTimestampPreviewAudioSurfaceReaderPortV1 {
  reader ??= createMediaSourcePtsCadenceR2RuntimePortsV1()
    .audioPreviewSurface.createReader();
  return reader;
}

async function authenticatedUserId(): Promise<string | null> {
  try {
    return (await auth()).userId ?? null;
  } catch {
    return null;
  }
}

function sameRevision(left: ProjectRevisionV1, right: ProjectRevisionV1): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

function identifier(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_ROUTE_PROJECT_INVALID');
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_ROUTE_PROJECT_INVALID');
  }
  return normalized;
}

function safeIntegerText(value: string | undefined): number {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,15})$/.test(value)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_ROUTE_RANGE_INVALID');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_ROUTE_RANGE_INVALID');
  }
  return parsed;
}

function empty(
  status: number,
  disposition: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(null, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Editron-Preview-Status': disposition,
      ...extraHeaders,
    },
  });
}

function knownCode(error: unknown): string | null {
  if (!(error instanceof Error) || !/^[A-Z0-9_]{1,160}$/.test(error.message)) return null;
  return error.message;
}
