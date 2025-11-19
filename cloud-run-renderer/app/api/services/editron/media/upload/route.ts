/**
 * POST /api/services/editron/media/upload
 * Upload media file to GCS
 */

import { NextRequest, NextResponse } from 'next/server';
import { uploadToGCS } from '@/lib/services/gcs-service';
import { getDatabase, COLLECTIONS } from '@/lib/db/mongodb';
import { getUserId } from '@/components/editor/version-7.0.0/utils/user-id';
import type { MediaAsset } from '@/lib/services/asset-resolver';

export const runtime = 'nodejs';

// Disable body parsing - we'll handle multipart/form-data manually
export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId();
    
    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const projectId = formData.get('projectId') as string | null;
    const type = formData.get('type') as 'video' | 'audio' | 'image' | null;
    const thumbnail = formData.get('thumbnail') as string | null;
    const duration = formData.get('duration') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to GCS
    const uploadResult = await uploadToGCS(
      buffer,
      userId,
      file.name,
      file.type
    );

    // Determine file type
    let fileType: 'video' | 'audio' | 'image';
    if (type) {
      fileType = type;
    } else if (file.type.startsWith('video/')) {
      fileType = 'video';
    } else if (file.type.startsWith('image/')) {
      fileType = 'image';
    } else if (file.type.startsWith('audio/')) {
      fileType = 'audio';
    } else {
      return NextResponse.json(
        { success: false, error: 'Unsupported file type' },
        { status: 400 }
      );
    }

    // TODO: Extract duration and dimensions from media files
    // For now, we'll skip this and let the client handle it

    // Save metadata to MongoDB
    const mediaAsset: MediaAsset = {
      assetId: uploadResult.assetId,
      userId,
      projectId: projectId || undefined,
      type: fileType,
      filename: file.name,
      gcsPath: uploadResult.gcsPath,
      cachedUrl: uploadResult.signedUrl,
      urlExpiresAt: uploadResult.urlExpiresAt,
      size: uploadResult.size,
      thumbnail: thumbnail || undefined,
      duration: duration ? parseFloat(duration) : undefined,
      uploadedAt: new Date(),
    };

    const db = await getDatabase();
    await db.collection(COLLECTIONS.MEDIA_ASSETS).insertOne(mediaAsset);

    return NextResponse.json({
      success: true,
      assetId: uploadResult.assetId,
      url: uploadResult.signedUrl,
      type: fileType,
      filename: file.name,
      size: uploadResult.size,
    });
  } catch (error: any) {
    console.error('Error uploading media:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to upload media' },
      { status: 500 }
    );
  }
}
