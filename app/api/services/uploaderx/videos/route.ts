import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCollections } from '@/app/api/services/uploaderx/utils/mongodb';
import { Storage } from '@google-cloud/storage';

// Simple logger for UploaderX
const logger = {
  info: (message: string, data?: any) => console.log(`[UPLOADERX] ${message}`, data || ''),
  warn: (message: string, data?: any) => console.warn(`[UPLOADERX] ${message}`, data || ''),
  error: (message: string, data?: any) => console.error(`[UPLOADERX] ${message}`, data || ''),
};

// Get user's videos
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uploadTracking } = await getCollections();

    // Fetch all videos for the user from uploaderx service
    const videos = await uploadTracking
      .find({
        userId,
        service: 'uploaderx'
      })
      .sort({ uploadedAt: -1 })
      .toArray();

    // Generate signed URLs for video access
    const generateSignedUrl = async (gcsPath: string) => {
      try {
        const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
          ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
          : null;
        
        if (!gcsCredentials || !process.env.GCS_BUCKET_NAME) {
          return `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${gcsPath}`;
        }

        const storage = new Storage({
          projectId: gcsCredentials.project_id,
          credentials: gcsCredentials,
        });

        const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
        const file = bucket.file(gcsPath);

        // Generate signed URL for reading (valid for 1 hour)
        const [signedUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 60 * 60 * 1000, // 1 hour
        });

        return signedUrl;
      } catch (error) {
        logger.warn('Failed to generate signed URL, falling back to public URL', {
          data: { gcsPath, error: error instanceof Error ? error.message : String(error) }
        });
        return `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${gcsPath}`;
      }
    };

    // Transform the data to match the frontend interface
    const transformedVideos = await Promise.all(videos.map(async video => ({
      videoUuid: video.videoUuid,
      filename: video.filename,
      gcsPath: video.gcsPath,
      publicUrl: await generateSignedUrl(video.gcsPath),
      fileSize: video.fileSize,
      uploadedAt: video.uploadedAt,
      status: video.status || 'uploaded',
      platforms: video.platforms || [],
      metadata: video.metadata || {}
    })));

    logger.info('UploaderX videos fetched successfully', {
      data: { userId, count: transformedVideos.length }
    });

    // Debug: Log the first video URL to help with debugging
    if (transformedVideos.length > 0) {
      logger.info('Sample video URL for debugging', {
        data: { 
          firstVideo: {
            videoUuid: transformedVideos[0].videoUuid,
            filename: transformedVideos[0].filename,
            publicUrl: transformedVideos[0].publicUrl,
            gcsPath: transformedVideos[0].gcsPath
          }
        }
      });
    }

    return NextResponse.json({
      success: true,
      videos: transformedVideos
    });

  } catch (error) {
    logger.error('Failed to fetch UploaderX videos', {
      data: { error: error instanceof Error ? error.message : String(error) }
    });
    return NextResponse.json({ error: 'Failed to fetch videos' }, { status: 500 });
  }
}

// Delete a video
export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { videoUuid } = await request.json();

    if (!videoUuid) {
      return NextResponse.json({ error: 'Missing videoUuid' }, { status: 400 });
    }

    const { uploadTracking } = await getCollections();

    // Find the video to get its GCS path
    const video = await uploadTracking.findOne({
      userId,
      videoUuid,
      service: 'uploaderx'
    });

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Delete from database
    const deleteResult = await uploadTracking.deleteOne({
      userId,
      videoUuid,
      service: 'uploaderx'
    });

    if (deleteResult.deletedCount === 0) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Delete from GCS (optional - you might want to keep files for a while)
    try {
      const { Storage } = await import('@google-cloud/storage');
      const storage = new Storage({
        credentials: JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS || '{}'),
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
      });

      const bucket = storage.bucket(process.env.GCS_BUCKET_NAME || '');
      await bucket.file(video.gcsPath).delete({ ignoreNotFound: true });

      logger.info('UploaderX video deleted from GCS', {
        data: { userId, videoUuid, gcsPath: video.gcsPath }
      });
    } catch (gcsError) {
      logger.warn('Failed to delete video from GCS, but database record was deleted', {
        data: { userId, videoUuid, error: gcsError }
      });
    }

    logger.info('UploaderX video deleted successfully', {
      data: { userId, videoUuid }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    logger.error('Failed to delete UploaderX video', {
      data: { error: error instanceof Error ? error.message : String(error) }
    });
    return NextResponse.json({ error: 'Failed to delete video' }, { status: 500 });
  }
}
