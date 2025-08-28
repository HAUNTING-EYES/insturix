import { NextResponse } from 'next/server';
import { WorkerPayloadSchema } from '@/types/clickatron';
import {
  getJob,
  startJob,
  updateJob,
  completeJob,
  failJob,
  validateJobOwnership
} from '@/lib/clickatron-jobs';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';

// POST /api/internal/workers/clickatron/variation - Execute variation generation job
export async function POST(request: Request) {
  try {
    // Verify QStash signature (in production, this would validate the signature)
    // For now, we'll trust the payload but validate the job exists

    const body = await request.json();

    // Validate request payload
    const validatedData = WorkerPayloadSchema.parse(body);
    const { jobId, sessionId, variationId, prompt, userId, fineTuning, metadata } = validatedData;

    console.log(`Processing job ${jobId} for session ${sessionId}, variation ${variationId}`);

    // Get job from Redis
    const job = await getJob(jobId);
    if (!job) {
      console.error(`Job ${jobId} not found`);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Check if job is already terminal
    if (['completed', 'failed', 'canceled'].includes(job.status)) {
      console.log(`Job ${jobId} already in terminal state: ${job.status}`);
      return NextResponse.json({ message: 'Job already processed' }, { status: 200 });
    }

    // Start job execution
    await startJob(jobId, 'prompting');

    try {
      // Step 1: Prompt enhancement (simulate AI call)
      await updateJob(jobId, { progress: 20, stage: 'prompting' });

      // Simulate prompt enhancement with Gemini/OpenAI
      const enhancedPrompt = await enhancePrompt(prompt);
      console.log(`Enhanced prompt for job ${jobId}: ${enhancedPrompt}`);

      // Step 2: Generate variation (simulate external API call)
      await updateJob(jobId, { progress: 40, stage: 'generating' });

      // Simulate generation delay
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

      // Step 3: Process and refine
      await updateJob(jobId, { progress: 80, stage: 'refining' });

      // Generate GCS path and metadata
      const gcsPath = `https://storage.googleapis.com/${process.env.GCS_BUCKET || 'clickatron-bucket'}/variations/${variationId}.png`;
      const fileSize = 1024000 + Math.random() * 2048000; // Mock file size (1-3MB)
      const contentType = 'image/png';

      // Step 4: Update MongoDB with completed variation
      await getClickatronDb();
      const objectId = new Types.ObjectId(sessionId);

      const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });
      if (!task) {
        throw new Error('Session not found in database');
      }

      // Initialize canvas if it doesn't exist
      if (!task.details?.canvas) {
        task.details.canvas = { variations: [] };
      }

      // Find and update the variation
      const variationIndex = task.details.canvas.variations.findIndex(
        (v: any) => v.id === variationId
      );

      if (variationIndex === -1) {
        throw new Error('Variation not found in session');
      }

      // Update variation with completion data and GCS metadata
      const updatedVariation = {
        ...task.details.canvas.variations[variationIndex],
        status: 'completed',
        imageRef: gcsPath,
        timestamp: Date.now(),
        createdAt: task.details.canvas.variations[variationIndex].createdAt || new Date(),
        updatedAt: new Date(),
        metadata: {
          ...task.details.canvas.variations[variationIndex].metadata,
          ...metadata,
          gcsPath,
          fileSize,
          contentType,
        },
      };

      task.details.canvas.variations[variationIndex] = updatedVariation;

      // Update workflow stage if moving to canvas
      if (!task.details.workflow) {
        task.details.workflow = {
          videoIdea: task.title || 'Untitled Session',
          stage: 'canvas',
          workflowVersion: 1,
        };
      } else if (task.details.workflow.stage === 'ideation') {
        task.details.workflow.stage = 'canvas';
      }
      // Note: We don't change to 'completed' stage since canvas is ongoing

      // Note: We don't change task status to 'completed' since canvas work is ongoing
      // Users can continue working and generating new variations anytime

      task.updatedAt = new Date();
      await task.save();

      // Step 5: Complete the job
      await completeJob(jobId, gcsPath);

      console.log(`Job ${jobId} completed successfully`);
      return NextResponse.json({
        success: true,
        jobId,
        resultRef: gcsPath,
        variationId,
      });

    } catch (error) {
      console.error(`Error processing job ${jobId}:`, error);

      // Update variation status to failed in MongoDB
      try {
        const objectId = new Types.ObjectId(sessionId);
        const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });

        if (task && task.details?.canvas?.variations) {
          const variationIndex = task.details.canvas.variations.findIndex(
            (v: any) => v.id === variationId
          );

          if (variationIndex !== -1) {
            task.details.canvas.variations[variationIndex].status = 'failed';
            task.updatedAt = new Date();
            await task.save();
          }
        }
      } catch (dbError) {
        console.error('Error updating variation status in DB:', dbError);
      }

      // Fail the job
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await failJob(jobId, {
        code: 'PROCESSING_ERROR',
        message: errorMessage,
      });

      // Return 200 to prevent QStash retries for processing errors
      return NextResponse.json({
        success: false,
        jobId,
        error: errorMessage,
      }, { status: 200 });
    }

  } catch (error) {
    console.error('Error in worker:', error);

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid request payload', details: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * Simulate prompt enhancement using AI
 */
async function enhancePrompt(originalPrompt: string): Promise<string> {
  // Simulate AI call delay
  await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

  // Simple prompt enhancement (in production, this would call Gemini/OpenAI)
  const enhancements = [
    'with professional lighting and composition',
    'in a clean, modern style',
    'with vibrant colors and dynamic elements',
    'using high-quality production values',
    'with cinematic framing and depth',
  ];

  const randomEnhancement = enhancements[Math.floor(Math.random() * enhancements.length)];

  return `${originalPrompt}, ${randomEnhancement}`;
}