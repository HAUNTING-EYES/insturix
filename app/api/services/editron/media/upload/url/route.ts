/**
 * POST /api/services/editron/media/upload/url
 *
 * Returns a signed URL for direct client-side upload to GCS.
 * The client uploads the file directly to GCS, then calls
 * POST /api/services/editron/media/upload to register the asset metadata.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateUploadUrl } from '@/lib/editron/services/gcs-service';
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

    // Validate content type
    const allowedPrefixes = ['video/', 'audio/', 'image/'];
    if (!allowedPrefixes.some((prefix) => contentType.startsWith(prefix))) {
      return NextResponse.json(
        { success: false, error: 'Unsupported content type' },
        { status: 400 }
      );
    }

    const result = await generateUploadUrl(userId, filename, contentType);

    return NextResponse.json({
      success: true,
      uploadUrl: result.uploadUrl,
      assetId: result.assetId,
      gcsPath: result.gcsPath,
      readUrl: result.readUrl,
      readUrlExpiresAt: result.readUrlExpiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error('Error generating upload URL:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
