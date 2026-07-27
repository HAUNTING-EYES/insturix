import { auth } from '@clerk/nextjs/server';
import { fileTypeFromBuffer } from 'file-type';
import { NextRequest, NextResponse } from 'next/server';

import { EpidemicMusicCatalogProvider } from '@/lib/editron/music-catalog/epidemic-provider';
import {
  ingestMusicCatalogTrack,
  MongoMusicCatalogIngestStore,
  MusicCatalogIngestError,
  type MusicCatalogIngestRequest,
  type MusicCatalogIngestResult,
} from '@/lib/editron/music-catalog/ingest-service';
import { MusicCatalogProviderError } from '@/lib/editron/music-catalog/types';
import { projectService } from '@/lib/editron/services/project-service';
import { deleteFromGCS } from '@/lib/editron/services/gcs-service';
import { deleteFromR2 } from '@/lib/editron/services/r2-service';
import { uploadMedia, type UploadResult } from '@/lib/editron/services/upload-service';
import { inspectEncodedMusicAudio } from '@/lib/pipeline/audio-conditioning';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const productionStore = new MongoMusicCatalogIngestStore();

interface MusicCatalogIngestRouteDependencies {
  authenticate: () => Promise<{ userId: string | null }>;
  ingest(input: MusicCatalogIngestRequest): Promise<MusicCatalogIngestResult>;
}

export async function handleMusicCatalogIngest(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
  dependencies: MusicCatalogIngestRouteDependencies,
) {
  const { userId } = await dependencies.authenticate();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_REQUEST_BODY_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: 'Request body is too large',
          code: 'REQUEST_TOO_LARGE',
        },
        { status: 413 },
      );
    }
    const parsed: unknown = text.trim() ? JSON.parse(text) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SyntaxError('Request body must be a JSON object');
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Request body must be a valid JSON object',
        code: 'INVALID_REQUEST',
      },
      { status: 400 },
    );
  }

  const { projectId } = await params;
  try {
    const result = await dependencies.ingest({
      userId,
      projectId,
      provider: body.provider as MusicCatalogIngestRequest['provider'],
      providerTrackId: body.providerTrackId as string,
      idempotencyKey: body.idempotencyKey as string,
    });
    return NextResponse.json(
      { success: true, ...result },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof MusicCatalogIngestError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.httpStatus },
      );
    }
    if (error instanceof MusicCatalogProviderError) {
      const routeError = providerRouteError(error);
      console.warn('[MusicCatalogIngestRoute] Provider request failed', {
        code: error.code,
        providerStatus: error.providerStatus,
      });
      return NextResponse.json(
        { success: false, error: error.message, code: routeError.code },
        {
          status: routeError.status,
          headers:
            error.retryAfterSeconds !== undefined
              ? { 'retry-after': String(error.retryAfterSeconds) }
              : undefined,
        },
      );
    }
    console.error('[MusicCatalogIngestRoute] Unexpected failure', {
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
      {
        success: false,
        error: 'Music catalog ingest failed',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return handleMusicCatalogIngest(request, context, {
    authenticate: auth,
    ingest: (input) =>
      ingestMusicCatalogTrack(input, {
        provider: new EpidemicMusicCatalogProvider(),
        providerAgreementId: process.env.EPIDEMIC_SOUND_LICENSE_AGREEMENT_ID,
        loadProject: (userId, projectId) => projectService.loadProject(userId, projectId),
        inspectAudio: inspectEncodedMusicAudio,
        detectFileType: fileTypeFromBuffer,
        upload: uploadMedia,
        cleanupUpload: cleanupControlledUpload,
        store: productionStore,
      }),
  });
}

async function cleanupControlledUpload(upload: UploadResult): Promise<void> {
  if (upload.r2Key) {
    await deleteFromR2(upload.r2Key);
    return;
  }
  if (upload.gcsPath) {
    await deleteFromGCS(upload.gcsPath);
    return;
  }
  throw new Error(`Controlled upload ${upload.assetId} has no deletable storage key`);
}

function providerRouteError(error: MusicCatalogProviderError): {
  status: number;
  code: string;
} {
  switch (error.code) {
    case 'NOT_CONFIGURED':
      return { status: 503, code: 'MUSIC_CATALOG_NOT_CONFIGURED' };
    case 'INVALID_QUERY':
      return { status: 400, code: 'INVALID_REQUEST' };
    case 'UPSTREAM_FORBIDDEN':
      return { status: 403, code: 'TRACK_NOT_ENTITLED' };
    case 'UPSTREAM_TIMEOUT':
      return { status: 504, code: 'MUSIC_CATALOG_TIMEOUT' };
    case 'UPSTREAM_RATE_LIMITED':
      return { status: 503, code: 'MUSIC_CATALOG_RATE_LIMITED' };
    case 'UPSTREAM_UNAUTHORIZED':
      return { status: 502, code: 'MUSIC_CATALOG_AUTH_FAILED' };
    case 'INVALID_UPSTREAM_RESPONSE':
      return { status: 502, code: 'MUSIC_CATALOG_INVALID_RESPONSE' };
    case 'UPSTREAM_UNAVAILABLE':
      return { status: 502, code: 'MUSIC_CATALOG_UNAVAILABLE' };
  }
}
