import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';
import { logger } from "../../utils/logger";

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

    logger.info('GCS CORS configuration updated successfully');
  } catch (error) {
    // Log but don't throw
    logger.warn('Failed to update GCS CORS configuration', {
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
      logger.warn('Unauthorized upload attempt');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
      logger.warn('Missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if GCS is properly configured
    if (!hasGCSConfig || !bucket) {
      logger.error('GCS configuration missing or invalid');
      return NextResponse.json(
        { error: 'Storage configuration error' },
        { status: 500 }
      );
    }

    try {
      // Generate GCS path
      const timestamp = Date.now();
      const cleanFilename = timestamp + '_' + filename.replace(/[^a-zA-Z0-9-_.]/g, '_');
      const userId = session.userId.replace('user_', '');
      const gcsPath = `alyzitron/user_${userId}/uploads/${cleanFilename}`;
      
      // Get signed URL
      const file = bucket.file(gcsPath);

      // Basic signed URL config
      const signUrlConfig: GetSignedUrlConfig = {
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType: contentType,
        queryParams: { 'X-Goog-Meta-Upload-Source': 'alyzitron-web' }
      };

      const [signedUrl] = await file.getSignedUrl(signUrlConfig);
      const publicUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${gcsPath}`;

      logger.info('Generated GCS signed URL', {
        userId: session.userId,
        data: { filename: cleanFilename, gcsPath, publicUrl }
      });

      return NextResponse.json({
        url: signedUrl,
        gcsPath,
        publicUrl,
        storage: 'gcs',
        contentType
      });

    } catch (error) {
      logger.error('GCS signed URL generation failed', { 
        data: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }

  } catch (error) {
    logger.error('Failed to generate upload URL', {
      data: { error: error instanceof Error ? error.message : String(error) }
    });
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}