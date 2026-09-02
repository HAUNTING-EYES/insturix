import { auth } from '@clerk/nextjs/server';

import { createMediaSourcePtsCadenceR2RuntimePortsV1 } from '@/lib/editron/services/media-source-pts-cadence-r2-runtime-v1';
import type { NativeMediaTimestampPreviewSurfaceReaderPortV1 } from '@/lib/editron/services/native-media-timestamp-r2-preview-surface-v1';
import { projectService, type ProjectRevisionV1 } from '@/lib/editron/services/project-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let reader: NativeMediaTimestampPreviewSurfaceReaderPortV1 | null = null;

export async function GET(
  _request: Request,
  context: Readonly<{ params: Promise<{ pictureHandle: string }> }>,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) return empty(401, 'UNAUTHORIZED');

  const { pictureHandle } = await context.params;
  let surface;
  try {
    surface = await previewReader().readPicture(pictureHandle);
  } catch (error) {
    if (knownCode(error) === 'NATIVE_MEDIA_PREVIEW_SURFACE_HANDLE_INVALID') {
      return empty(400, 'INVALID_HANDLE');
    }
    return empty(503, 'SURFACE_UNAVAILABLE');
  }

  if (surface.disposition === 'NOT_FOUND') return empty(404, 'NOT_FOUND');
  if (surface.disposition === 'EXPIRED') return empty(410, 'EXPIRED');

  const { binding } = surface;
  if (binding.userId !== userId) return empty(404, 'NOT_FOUND');

  let currentRevision: ProjectRevisionV1;
  try {
    currentRevision = await projectService.getProjectRevision(userId, binding.projectId);
  } catch {
    return empty(404, 'NOT_FOUND');
  }
  if (!sameRevision(currentRevision, binding.projectRevision)) {
    return empty(409, 'STALE_PROJECT_REVISION');
  }

  const body = new ArrayBuffer(surface.pngBytes.byteLength);
  new Uint8Array(body).set(surface.pngBytes);
  return new Response(body, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      'Content-Disposition': 'inline',
      'Content-Length': String(binding.pngByteLength),
      'Content-Type': 'image/png',
      'Cross-Origin-Resource-Policy': 'same-origin',
      ETag: `"sha256-${binding.pngContentSha256}"`,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Editron-Preview-Status': 'CURRENT',
    },
  });
}

function previewReader(): NativeMediaTimestampPreviewSurfaceReaderPortV1 {
  reader ??= createMediaSourcePtsCadenceR2RuntimePortsV1().previewSurface.createReader();
  return reader;
}

function sameRevision(left: ProjectRevisionV1, right: ProjectRevisionV1): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

function empty(status: number, disposition: string): Response {
  return new Response(null, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Editron-Preview-Status': disposition,
    },
  });
}

function knownCode(error: unknown): string | null {
  if (!(error instanceof Error) || !/^[A-Z0-9_]{1,160}$/.test(error.message)) return null;
  return error.message;
}
