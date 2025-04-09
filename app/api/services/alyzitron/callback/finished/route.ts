import { NextResponse } from 'next/server';
import { analysisEventEmitter } from '@/lib/sseManager';
import { getCollections } from '@/app/api/services/alyzitron/utils/mongodb';
import { logger } from '@/app/api/services/alyzitron/utils/logger';
import { AlyzitronAnalysis } from '../../types';
import { Storage } from '@google-cloud/storage'; // Import GCS Storage

type UpdateData = {
  status: AlyzitronAnalysis['status'];
  completionTime: Date;
  updatedAt: Date;
  results?: AlyzitronAnalysis['results'];
  error?: AlyzitronAnalysis['error'];
}

// --- GCS Configuration Check ---
const gcsProjectId = process.env.GCS_PROJECT_ID; // Use GCS_ prefix
const gcsClientEmail = process.env.GCS_CLIENT_EMAIL; // Use GCS_ prefix
const gcsPrivateKey = process.env.GCS_PRIVATE_KEY; // Use GCS_ prefix
const bucketName = process.env.GCS_BUCKET_NAME;

const gcsConfigured = gcsProjectId && gcsClientEmail && gcsPrivateKey && bucketName;

if (!gcsConfigured) {
    logger.error("GCS environment variables are not fully configured for finished callback cleanup. Deletion skipped.", {
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

// Add necessary imports for validation/authentication if needed

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // --- Validation ---
    const { taskId, userId, status, results, error } = body;
    if (!taskId || !userId || !status) {
      console.error('Callback Finished Error: Missing required fields in request body', body);
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (status !== 'completed' && status !== 'failed') {
      console.error('Callback Finished Error: Invalid status value', status);
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }
    if (status === 'failed' && !error) {
       console.warn(`Callback Finished Warning: Status is 'failed' but no error object provided for taskId=${taskId}`);
       // Allow proceeding, but frontend might not show specific error
    }

    // --- Authentication/Authorization (Optional but Recommended) ---
    // Verify the request came from your trusted Python server

    console.log(`Callback Finished: Received status=${status} for taskId=${taskId}, userId=${userId}`);

    const { analyses } = await getCollections();

    const analysis = await analyses.findOne({ taskId });

    const payload = {
      userId,
      taskId,
      analysisId: analysis?._id?.toString(),
      status,
      expectedDurationSeconds: null,
      results,
      error,
    };
    console.log('Emitting SSE analysisUpdate (finished):', payload);
    analysisEventEmitter.emit('analysisUpdate', payload);

    // Update database record
    const now = new Date();

    const updateData: UpdateData = {
      status,
      completionTime: now,
      updatedAt: now,
    };

    if (status === 'completed') {
      updateData.results = results;
    } else if (status === 'failed') {
      updateData.error = error;
    }

    const updateResult = await analyses.updateOne(
      { taskId },
      { $set: updateData }
    );

    if (updateResult.matchedCount === 0) {
      logger.warn('Callback Finished: No analysis found for taskId', { taskId });
    } else {
      logger.info('Callback Finished: Updated analysis', { taskId, status });
    }
// --- Delete GCS file if it exists and status is terminal ---
if (gcsConfigured && analysis && analysis.gcsPath && (status === 'completed' || status === 'failed')) {
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
            logger.info('Deleting GCS file for finished analysis', { data: { userId, taskId, gcsPath: analysis.gcsPath, objectName, status } });
            await bucket.file(objectName).delete({ ignoreNotFound: true });
            logger.info('Successfully deleted GCS file for finished analysis', { data: { userId, taskId, gcsPath: analysis.gcsPath, objectName, status } });
        } else {
             logger.error('Could not extract object name from gcsPath for finished analysis', { data: { userId, taskId, gcsPath: analysis.gcsPath, status } });
        }
    } catch (deleteError) {
        const errorMessage = deleteError instanceof Error ? deleteError.message : 'Unknown GCS deletion error';
        logger.error('Failed to delete GCS file for finished analysis', { data: { userId, taskId, gcsPath: analysis.gcsPath, status, error: errorMessage } });
        // Log the error but allow the callback response to proceed
    }
} else if (analysis && analysis.gcsPath && (status === 'completed' || status === 'failed')) {
     logger.warn('Skipping GCS deletion for finished analysis because GCS is not configured.', { data: { userId, taskId, gcsPath: analysis.gcsPath, status } });
}
// --- End GCS Deletion ---

return NextResponse.json({ message: 'Finished event received' }, { status: 200 });

  } catch (error) {
    console.error('Callback Finished Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}