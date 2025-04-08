import { NextResponse } from 'next/server';
import { analysisEventEmitter } from '@/lib/sseManager';
import { getCollections } from '@/app/api/services/alyzitron/utils/mongodb';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // --- Validation ---
    // Add robust validation for the request body here
    const { taskId, userId, expectedDurationSeconds } = body;
    if (!taskId || !userId) {
      console.error('Callback Started Error: Missing required fields in request body', body);
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    // Optional: Validate expectedDurationSeconds is a number if provided

    // --- Authentication/Authorization (Optional but Recommended) ---
    // Verify the request came from your trusted Python server (e.g., using a shared secret)

    console.log(`Callback Started: Received for taskId=${taskId}, userId=${userId}`);

    const { analyses } = await getCollections();

    const now = new Date();

    await analyses.updateOne(
      { taskId },
      {
        $set: {
          status: 'processing',
          processingStartTime: now.getTime(),
          updatedAt: now,
        },
      }
    );

    const analysis = await analyses.findOne({ taskId });

    if (!analysis) {
      console.error('Callback Started Error: Analysis not found for taskId', taskId);
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    // Send complete analysis data in the event
    const payload = {
      userId,
      taskId,
      analysisId: analysis._id.toString(),
      status: 'processing',
      type: analysis.type,
      videoUrl: analysis.videoUrl,
      gcsPath: analysis.gcsPath,
      estimatedTime: expectedDurationSeconds || analysis.estimatedTime,
      processingStartTime: analysis.processingStartTime,
      results: analysis.results,
      error: null,
      metadata: analysis.metadata,
      createdAt: analysis.createdAt,
      updatedAt: now,
      _id: analysis._id.toString()
    };
    
    console.log('Emitting SSE analysisUpdate (started) with full context:', payload);
    analysisEventEmitter.emit('analysisUpdate', payload);

    return NextResponse.json({ message: 'Processing event received' }, { status: 200 });

  } catch (error) {
    console.error('Callback Started Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}