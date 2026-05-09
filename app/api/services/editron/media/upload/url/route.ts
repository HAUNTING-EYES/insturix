/**
 * POST /api/services/editron/media/upload/url
 *
 * Returns a presigned URL for direct client-side upload.
 * Tries R2 first (always available on Preview + Production).
 * Falls back to GCS only if R2 is unavailable.
 *
 * The client uploads the file directly to the signed URL, then calls
 * POST /api/services/editron/media/upload to register the asset metadata.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { filename, contentType } = body;

    if (!filename || !contentType) {
      return NextResponse.json(
        { success: false, error: 'filename and contentType are required' },
        { status: 400 }
      );
    }

    const allowedPrefixes = ['video/', 'audio/', 'image/'];
    if (!allowedPrefixes.some((prefix) => contentType.startsWith(prefix))) {
      return NextResponse.json(
        { success: false, error: 'Unsupported content type' },
        { status: 400 }
      );
    }

    // Primary: R2 presigned upload (always available, never-expire CDN URLs)
    try {
      const { isR2Available, generateR2UploadUrl } = await import('@/lib/editron/services/r2-service');
      if (isR2Available()) {
        const result = await generateR2UploadUrl(userId, filename, contentType);
        return NextResponse.json({
          success: true,
          uploadUrl: result.uploadUrl,
          assetId: result.assetId,
          gcsPath: null, // R2 path, not GCS
          readUrl: result.readUrl,
          readUrlExpiresAt: result.readUrlExpiresAt.toISOString(),
          storage: 'r2',
        });
      }
    } catch (r2Err: unknown) {
      const msg = r2Err instanceof Error ? r2Err.message : String(r2Err);
      console.warn(`[upload/url] R2 presigned URL failed, trying GCS: ${msg}`);
    }

    // Fallback: GCS signed upload URL (requires GOOGLE_CLOUD_CREDENTIALS)
    try {
      const { generateUploadUrl } = await import('@/lib/editron/services/gcs-service');
      const result = await generateUploadUrl(userId, filename, contentType);
      return NextResponse.json({
        success: true,
        uploadUrl: result.uploadUrl,
        assetId: result.assetId,
        gcsPath: result.gcsPath,
        readUrl: result.readUrl,
        readUrlExpiresAt: result.readUrlExpiresAt.toISOString(),
        storage: 'gcs',
      });
    } catch (gcsErr: unknown) {
      const msg = gcsErr instanceof Error ? gcsErr.message : String(gcsErr);
      console.error(`[upload/url] Both R2 and GCS failed. R2 may not be configured. GCS error: ${msg}`);
      return NextResponse.json(
        { success: false, error: 'No storage backend available for uploads' },
        { status: 503 }
      );
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error generating upload URL:', msg);
    return NextResponse.json(
      { success: false, error: msg || 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
