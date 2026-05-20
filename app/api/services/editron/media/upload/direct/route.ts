/**
 * POST /api/services/editron/media/upload/direct
 *
 * Server-side proxy upload: client sends file as FormData → server uploads to R2.
 * Avoids CORS issues with R2 presigned URLs (R2 bucket needs CORS config for
 * direct browser uploads, which isn't set up).
 *
 * Returns: assetId, readUrl (CDN), gcsPath (null for R2).
 * Client then calls /auto-edit/from-asset with the assetId.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const allowedPrefixes = ['video/', 'audio/', 'image/'];
    if (!allowedPrefixes.some(p => file.type.startsWith(p))) {
      return NextResponse.json({ success: false, error: 'Unsupported file type' }, { status: 400 });
    }

    // 100MB limit for server-side proxy (larger files need chunked upload)
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'File too large for direct upload. Max 100MB.' }, { status: 413 });
    }

    console.log(`[upload/direct] Uploading ${file.name} (${Math.round(file.size / 1024)}KB, ${file.type})`);

    const buffer = Buffer.from(await file.arrayBuffer());
    const { uploadMedia } = await import('@/lib/editron/services/upload-service');
    const result = await uploadMedia(buffer, userId, file.name, file.type);

    // Persist to media_assets
    const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    const mediaType = file.type.startsWith('video/') ? 'video'
      : file.type.startsWith('audio/') ? 'audio' : 'image';

    await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId: result.assetId },
      {
        $setOnInsert: {
          assetId: result.assetId,
          userId,
          type: mediaType,
          filename: file.name,
          contentType: file.type,
          size: file.size,
          source: 'user-upload',
          cachedUrl: result.signedUrl,
          gcsPath: result.gcsPath,
          r2Key: result.r2Key,
          uploadedAt: new Date(),
        },
      },
      { upsert: true },
    );

    console.log(`[upload/direct] Done: ${result.assetId} (${mediaType})`);

    return NextResponse.json({
      success: true,
      assetId: result.assetId,
      readUrl: result.signedUrl,
      gcsPath: result.gcsPath,
      type: mediaType,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[upload/direct] Failed: ${msg}`);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
