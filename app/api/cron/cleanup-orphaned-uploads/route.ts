import { NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { getCollections } from '../../services/alyzitron/utils/mongodb';
import { logger } from '../../services/alyzitron/utils/logger';

// This should be called by a cron service (Vercel Cron, GitHub Actions, etc.)
export async function POST(request: Request) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Initialize GCS client
    const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
      ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
      : null;
    const bucketName = process.env.GCS_BUCKET_NAME;

    if (!gcsCredentials || !bucketName) {
      logger.error('GCS configuration missing for cleanup');
      return NextResponse.json({ error: 'GCS configuration missing' }, { status: 500 });
    }

    const storage = new Storage({
      projectId: gcsCredentials.project_id,
      credentials: gcsCredentials,
    });
    const bucket = storage.bucket(bucketName);

    const { uploadTracking } = await getCollections();
    
    // Find orphaned uploads (uploaded but never used for analysis, and expired)
    const orphanedUploads = await uploadTracking.find({
      status: 'uploaded',
      expiresAt: { $lt: new Date() },
    }).toArray();

    logger.info('Found orphaned uploads for cleanup', {
      data: { count: orphanedUploads.length },
    });

    if (orphanedUploads.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No orphaned uploads found',
        cleaned: 0 
      });
    }

    let cleanedCount = 0;
    const batchSize = 10; // Process in batches to avoid timeouts

    for (let i = 0; i < orphanedUploads.length && i < batchSize; i++) {
      const upload = orphanedUploads[i];
      
      try {
        // Extract object name from GCS path
        const objectName = upload.gcsPath.startsWith(`gs://${bucketName}/`)
          ? upload.gcsPath.substring(`gs://${bucketName}/`.length)
          : upload.gcsPath;

        // Delete from GCS
        await bucket.file(objectName).delete({ ignoreNotFound: true });

        // Update database record
        await uploadTracking.updateOne(
          { _id: upload._id },
          { 
            $set: { 
              status: 'deleted',
              deletedAt: new Date(),
            }
          }
        );

        cleanedCount++;
        
        logger.info('Cleaned up orphaned upload', {
          data: { 
            uploadId: upload.uploadId, 
            gcsPath: upload.gcsPath,
            userId: upload.userId,
          },
        });

      } catch (error) {
        logger.error('Failed to cleanup orphaned upload', {
          data: { 
            uploadId: upload.uploadId,
            gcsPath: upload.gcsPath,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    // If there are more uploads to process, we'll get them in the next run
    const remaining = Math.max(0, orphanedUploads.length - batchSize);

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${cleanedCount} orphaned uploads`,
      cleaned: cleanedCount,
      remaining,
    });

  } catch (error) {
    logger.error('Cleanup cron job failed', {
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}

// Also allow GET for manual testing
export async function GET() {
  return NextResponse.json({ 
    message: 'Cleanup cron endpoint. Use POST with proper authorization.' 
  });
}