/**
 * POST /api/services/editron/sfx-library/ingest
 *
 * Materialize an exact Freesound result into controlled storage. The client
 * supplies only the provider ID; URL, license and audio claims are re-fetched.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import {
  ingestFreesoundSfxById,
  SfxLibraryIngestError,
  type SFXLibraryResult,
} from '@/lib/pipeline/sfx-library-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_REQUEST_BODY_BYTES = 4 * 1024;

interface SfxLibraryIngestRouteDependencies {
  authenticate: () => Promise<{ userId: string | null }>;
  ingest: (providerAssetId: string, userId: string) => Promise<SFXLibraryResult>;
}

export async function handleSfxLibraryIngest(
  request: NextRequest,
  dependencies: SfxLibraryIngestRouteDependencies,
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

  if (typeof body.providerAssetId !== 'string' || !body.providerAssetId.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: 'A provider asset ID is required',
        code: 'SFX_INVALID_PROVIDER_ASSET_ID',
      },
      { status: 400 },
    );
  }

  try {
    const result = await dependencies.ingest(body.providerAssetId, userId);
    return NextResponse.json(
      { success: true, ...result },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof SfxLibraryIngestError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.httpStatus },
      );
    }
    console.error('[SFXLibraryIngestRoute] Unexpected failure', {
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
      {
        success: false,
        error: 'Sound ingest failed',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleSfxLibraryIngest(request, {
    authenticate: auth,
    ingest: ingestFreesoundSfxById,
  });
}
