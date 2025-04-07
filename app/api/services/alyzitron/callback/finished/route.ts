import { NextResponse } from 'next/server';
import { analysisEventEmitter } from '@/lib/sseManager';
import { getCollections } from '@/app/api/services/alyzitron/utils/mongodb';
import { logger } from '@/app/api/services/alyzitron/utils/logger';
import { AlyzitronAnalysis } from '../../types';

type UpdateData = {
  status: AlyzitronAnalysis['status'];
  completionTime: Date;
  updatedAt: Date;
  results?: AlyzitronAnalysis['results'];
  error?: AlyzitronAnalysis['error'];
}

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

    return NextResponse.json({ message: 'Finished event received' }, { status: 200 });

  } catch (error) {
    console.error('Callback Finished Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}