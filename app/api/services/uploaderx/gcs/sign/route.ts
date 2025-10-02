import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';

// Simple logger for UploaderX
const logger = {
  info: (message: string, data?: any) => console.log(`[UPLOADERX] ${message}`, data || ''),
  warn: (message: string, data?: any) => console.warn(`[UPLOADERX] ${message}`, data || ''),
  error: (message: string, data?: any) => console.error(`[UPLOADERX] ${message}`, data || ''),
};

// Check if we have complete GCS configuration
const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
  : null;
const hasGCSConfig = !!(gcsCredentials && process.env.GCS_BUCKET_NAME);

// Initialize storage with credentials if available
const storage = hasGCSConfig ? new Storage({
  projectId: gcsCredentials.project_id,
  credentials: gcsCredentials,
}) : null;

const bucket = hasGCSConfig ? storage?.bucket(process.env.GCS_BUCKET_NAME!) : null;

async function configureBucketCors() {
  if (!bucket) return;

  try {
    await bucket.setCorsConfiguration([
      {
        maxAgeSeconds: 3600,
        method: ['PUT', 'GET', 'HEAD', 'POST', 'OPTIONS'],
        origin: [
          'http://localhost:3000',
          'https://localhost:3000',
          process.env.NEXT_PUBLIC_APP_URL || 'https://www.insturix.com',
        ],
        responseHeader: [
          'Content-Type',
          'Content-Length',
          'Accept',
          'Origin',
          'Authorization',
          'Host',
          'Access-Control-Allow-Origin',
          'x-goog-*'
        ],
      },
    ]);

    logger.info('GCS CORS configuration updated successfully for UploaderX');
  } catch (error) {
    // Log but don't throw
    logger.warn('Failed to update GCS CORS configuration for UploaderX', {
      data: { error: error instanceof Error ? error.message : String(error) }
    });
  }
}

// Configure CORS on startup (but don't block)
if (hasGCSConfig) {
  configureBucketCors().catch(() => {});
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
      return NextResponse.json({ error: "Missing required fields: filename, contentType" }, { status: 400 });
    }

    if (!hasGCSConfig || !bucket) {
      return NextResponse.json(
        { error: "Storage configuration error" },
        { status: 500 }
      );
    }

    try {
      // Generate unique video UUID
      const videoUuid = crypto.randomUUID();
      const userId = session.userId.replace('user_', '');
      
      // Create GCS path following the specified structure: {user_id}/uploaderx/uploads/{video_uuid}
      const gcsPath = `${userId}/uploaderx/uploads/${videoUuid}`;
      
      // Get signed URL
      const file = bucket.file(gcsPath);

      // Basic signed URL config
      const signUrlConfig: GetSignedUrlConfig = {
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType: contentType,
        queryParams: { 'X-Goog-Meta-Upload-Source': 'uploaderx-web' }
      };

      const [signedUrl] = await file.getSignedUrl(signUrlConfig);
      const publicUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${gcsPath}`;

      logger.info('UploaderX signed URL generated successfully', {
        data: { userId, videoUuid, gcsPath }
      });

      return NextResponse.json({
        url: signedUrl,
        gcsPath,
        publicUrl,
        videoUuid,
        storage: 'gcs',
        contentType
      });

    } catch (error) {
      logger.error('UploaderX GCS signed URL generation failed', { 
        data: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }

  } catch (error) {
    logger.error('Failed to generate UploaderX upload URL', {
      data: { error: error instanceof Error ? error.message : String(error) }
    });
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
