import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCollections } from '../utils/mongodb';
import { logger, withLogging } from '../utils/logger';
import { Storage } from '@google-cloud/storage'; // Import GCS Storage

const PYTHON_SERVER_URL = process.env.PYTHON_SERVER_URL;
if (!PYTHON_SERVER_URL) {
  throw new Error('PYTHON_SERVER_URL environment variable is not set');
}

// --- GCS Configuration Check ---
const gcsProjectId = process.env.GCS_PROJECT_ID; // Use GCS_ prefix
const gcsClientEmail = process.env.GCS_CLIENT_EMAIL; // Use GCS_ prefix
const gcsPrivateKey = process.env.GCS_PRIVATE_KEY; // Use GCS_ prefix
const bucketName = process.env.GCS_BUCKET_NAME;

const gcsConfigured = gcsProjectId && gcsClientEmail && gcsPrivateKey && bucketName;

if (!gcsConfigured) {
    logger.error("GCS environment variables are not fully configured for cancellation cleanup. Deletion skipped.", {
        data: {
            hasProjectId: !!gcsProjectId,
            hasClientEmail: !!gcsClientEmail,
            hasPrivateKey: !!gcsPrivateKey, // Don't log the key itself
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
        analysisId: analysis._id.toString()
      }
    });

    // Request cancellation from Python server
    const response = await fetch(`${PYTHON_SERVER_URL}/api/v1/task/${taskId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to cancel task on Python server', {
        userId: session.userId,
        data: {
          taskId,
          analysisId: analysis._id.toString(),
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
    if (gcsConfigured && analysis.gcsPath) {
        try {
            // Initialize storage only if needed and configured
             if (!storage) {
                storage = new Storage({
                    projectId: gcsProjectId,
                    credentials: {
                        client_email: gcsClientEmail,
                        private_key: gcsPrivateKey?.replace(/\\n/g, '\n'),
                    },
                });
            }
            const bucket = storage.bucket(bucketName!); // Use non-null assertion as gcsConfigured checks bucketName
            const objectName = analysis.gcsPath.startsWith(`gs://${bucketName}/`)
                ? analysis.gcsPath.substring(`gs://${bucketName}/`.length)
                : analysis.gcsPath;

            if (objectName) {
                logger.info('Deleting GCS file for cancelled analysis', { data: { userId: session.userId, gcsPath: analysis.gcsPath, objectName } });
                await bucket.file(objectName).delete({ ignoreNotFound: true });
                logger.info('Successfully deleted GCS file for cancelled analysis', { data: { userId: session.userId, gcsPath: analysis.gcsPath, objectName } });
            } else {
                 logger.error('Could not extract object name from gcsPath for cancelled analysis', { data: { userId: session.userId, gcsPath: analysis.gcsPath } });
            }
        } catch (deleteError) {
            const errorMessage = deleteError instanceof Error ? deleteError.message : 'Unknown GCS deletion error';
            logger.error('Failed to delete GCS file for cancelled analysis', { data: { userId: session.userId, gcsPath: analysis.gcsPath, error: errorMessage } });
            // Log the error but allow the cancellation response to proceed
        }
    } else if (analysis.gcsPath) {
         logger.warn('Skipping GCS deletion for cancelled analysis because GCS is not configured.', { data: { userId: session.userId, gcsPath: analysis.gcsPath } });
    }
    // --- End GCS Deletion ---

    logger.info('Analysis cancelled successfully', {
      userId: session.userId,
      data: {
        taskId,
        analysisId: analysis._id.toString()
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