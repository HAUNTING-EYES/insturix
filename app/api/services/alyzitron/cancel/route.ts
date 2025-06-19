import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCollections } from '../utils/mongodb';
import { logger, withLogging } from '../utils/logger';
import { Storage } from '@google-cloud/storage'; // Import GCS Storage

const ALYZITRON_BACKEND_URL = process.env.ALYZITRON_BACKEND_URL;
if (!ALYZITRON_BACKEND_URL) {
  throw new Error('ALYZITRON_BACKEND_URL environment variable is not set');
}

// --- GCS Configuration Check ---
const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
  : null;
const bucketName = process.env.ALYZITRON_GCS_BUCKET_NAME;

const gcsConfigured = gcsCredentials && bucketName;

if (!gcsConfigured) {
    logger.error("GCS environment variables are not fully configured for cancellation cleanup. Deletion skipped.", {
        data: {
            hasCredentials: !!gcsCredentials,
            hasBucketName: !!bucketName,
        }
    });
}
// --- End GCS Configuration Check ---

let storage: Storage | null = null; // Initialize storage lazily

async function handleCancelRequest(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      logger.warn('Unauthorized cancel request');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { taskId } = body;

    if (!taskId) {
      logger.warn('Missing taskId in cancel request', {
        userId: session.userId
      });
      return NextResponse.json(
        { error: 'Missing taskId' },
        { status: 400 }
      );
    }

    // Get the analysis record
    const { analyses } = await getCollections();
    const analysis = await analyses.findOne({
      taskId,
      clerkUserId: session.userId,
    });

    if (!analysis) {
      logger.warn('Analysis not found for cancel request', {
        userId: session.userId,
        data: { taskId }
      });
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    if (analysis.status !== 'queued') {
      logger.warn('Cannot cancel non-queued analysis', {
        userId: session.userId,
        data: {
          taskId,
          currentStatus: analysis.status
        }
      });
      return NextResponse.json(
        {
          error: 'Cannot cancel analysis',
          message: 'Analysis is already being processed or completed',
        },
        { status: 400 }
      );
    }

    logger.info('Requesting task cancellation from Python server', {
      userId: session.userId,
      data: {
        taskId,
        analysisId: analysis._id
      }
    });

    // Request cancellation from Python server
    const response = await fetch(`${ALYZITRON_BACKEND_URL}/api/v1/task/${taskId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to cancel task on Python server', {
        userId: session.userId,
        data: {
          taskId,
          analysisId: analysis._id,
          error: error.error
        }
      });
      return NextResponse.json(
        { error: error.error || 'Failed to cancel analysis' },
        { status: response.status }
      );
    }

    // Update analysis record
    await analyses.updateOne(
      { taskId },
      {
        $set: {
          status: 'failed',
          error: {
            code: 'CANCELLED',
            message: 'Analysis cancelled by user',
            action: 'You can start a new analysis if needed',
          },
          completionTime: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    // --- Delete GCS file if it exists ---
    const isGcsVideo = analysis.videoUrl.startsWith(`gs://${bucketName}/`);
    if (gcsConfigured && isGcsVideo) {
        try {
            // Initialize storage only if needed and configured
             if (!storage) {
                storage = new Storage({
                    projectId: gcsCredentials.project_id,
                    credentials: gcsCredentials,
                });
            }
            const bucket = storage.bucket(bucketName!); // Use non-null assertion as gcsConfigured checks bucketName
            const objectName = analysis.videoUrl.substring(`gs://${bucketName}/`.length);

            if (objectName) {
                logger.info('Deleting GCS file for cancelled analysis', { data: { userId: session.userId, videoUrl: analysis.videoUrl, objectName } });
                await bucket.file(objectName).delete({ ignoreNotFound: true });
                logger.info('Successfully deleted GCS file for cancelled analysis', { data: { userId: session.userId, videoUrl: analysis.videoUrl, objectName } });
            } else {
                 logger.error('Could not extract object name from videoUrl for cancelled analysis', { data: { userId: session.userId, videoUrl: analysis.videoUrl } });
            }
        } catch (deleteError) {
            const errorMessage = deleteError instanceof Error ? deleteError.message : 'Unknown GCS deletion error';
            logger.error('Failed to delete GCS file for cancelled analysis', { data: { userId: session.userId, videoUrl: analysis.videoUrl, error: errorMessage } });
            // Log the error but allow the cancellation response to proceed
        }
    } else if (isGcsVideo) {
         logger.warn('Skipping GCS deletion for cancelled analysis because GCS is not configured.', { data: { userId: session.userId, videoUrl: analysis.videoUrl } });
    }
    // --- End GCS Deletion ---

    logger.info('Analysis cancelled successfully', {
      userId: session.userId,
      data: {
        taskId,
        analysisId: analysis._id
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Analysis cancelled successfully',
    });

  } catch (error) {
    logger.error('Cancel analysis failed', {
      code: 'CANCEL_ERROR',
      data: {
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    });
    return NextResponse.json(
      { error: 'Failed to cancel analysis' },
      { status: 500 }
    );
  }
}

export const POST = withLogging(handleCancelRequest);