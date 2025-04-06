import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';
import { logger } from "../../utils/logger";

// Check if we have complete GCS configuration
const hasGCSConfig = !!(
  process.env.GCS_PROJECT_ID &&
  process.env.GCS_BUCKET_NAME &&
  process.env.GCS_CLIENT_EMAIL &&
  process.env.GCS_PRIVATE_KEY
);

// Initialize storage with credentials if available
const storage = hasGCSConfig ? new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }
}) : null;

const bucket = hasGCSConfig ? storage?.bucket(process.env.GCS_BUCKET_NAME!) : null;

async function configureBucketCors() {
  if (!bucket) return;

  try {
    await bucket.setCorsConfiguration([
      {
        maxAgeSeconds: 3600,
        method: ['PUT', 'GET', 'HEAD', 'POST', 'OPTIONS'],
        origin: ['*'],
        responseHeader: [
          'Content-Type',
          'Content-Length',
          'Accept',
          'Origin',
          'Authorization',
          'Host',
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

    const { filename, contentType, fileSize } = await request.json();

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
      const gcsPath = `services/alyzitron/user_${userId}/${cleanFilename}`;
      
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