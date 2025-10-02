import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCollections } from '@/app/api/services/uploaderx/utils/mongodb';

// Simple logger for UploaderX
const logger = {
  info: (message: string, data?: any) => console.log(`[UPLOADERX] ${message}`, data || ''),
  warn: (message: string, data?: any) => console.warn(`[UPLOADERX] ${message}`, data || ''),
  error: (message: string, data?: any) => console.error(`[UPLOADERX] ${message}`, data || ''),
};

// Track successful upload for UploaderX
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uploadId, gcsPath, filename, fileSize, contentType, videoUuid } = await request.json();

    if (!uploadId || !gcsPath || !filename || !videoUuid) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { uploadTracking } = await getCollections();

    const uploadRecord = {
      uploadId,
      userId,
      gcsPath,
      filename,
      videoUuid,
      fileSize: fileSize || 0,
      uploadedAt: new Date(),
      status: 'uploaded',
      service: 'uploaderx',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      metadata: {
        contentType: contentType || 'video/mp4',
        originalName: filename,
        uploadSource: 'uploaderx-web'
      },
    };

    await uploadTracking.insertOne(uploadRecord);

    logger.info('UploaderX upload tracked successfully', {
      data: { uploadId, gcsPath, userId, videoUuid },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to track UploaderX upload', {
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json({ error: 'Failed to track upload' }, { status: 500 });
  }
}

// Update upload status (when processing starts/completes)
export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uploadId, status, metadata } = await request.json();

    if (!uploadId || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { uploadTracking } = await getCollections();

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (metadata) {
      updateData.metadata = { ...updateData.metadata, ...metadata };
    }

    const result = await uploadTracking.updateOne(
      { uploadId, userId, service: 'uploaderx' },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }

    logger.info('UploaderX upload status updated', {
      data: { uploadId, status, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to update UploaderX upload status', {
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json({ error: 'Failed to update upload status' }, { status: 500 });
  }
}
