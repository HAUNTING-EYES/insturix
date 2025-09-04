import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { getJob, completeJob, failJob } from '@/lib/clickatron-jobs';
import { z } from 'zod';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextResponse } from 'next/server';
import { Variation } from '@/types/clickatron';

const mockImages = [
  'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=2874&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1554034483-04fda0d3507b?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1567359781514-3b964e2b04d6?q=80&w=2835&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
];

const getRandomImage = () => mockImages[Math.floor(Math.random() * mockImages.length)];

const workerRequestSchema = z.object({
  jobId: z.string(),
  sessionId: z.string(),
  variationId: z.string(),
  prompt: z.string(),
  userId: z.string(),
});

async function handler(req: Request) {
  try {
    console.log('Worker: Received request');
    const body = await req.json();
    console.log('Worker: Request body:', body);
    const { jobId, sessionId, variationId } = workerRequestSchema.parse(body);
    console.log('Worker: Parsed data - jobId:', jobId, 'sessionId:', sessionId, 'variationId:', variationId);

    const job = await getJob(jobId);
    console.log('Worker: Found job:', job);
    if (!job) {
      console.error('Worker: Job not found for jobId:', jobId);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    await getClickatronDb();
    const objectId = new Types.ObjectId(sessionId);
    const task = await ClickatronTask.findById(objectId);
    console.log('Worker: Found task:', task);

    if (!task || !task.details.canvas) {
      console.error('Worker: Task or canvas not found for sessionId:', sessionId);
      await failJob(jobId, { code: 'TASK_NOT_FOUND', message: 'Task or canvas not found' });
      return NextResponse.json({ error: 'Task or canvas not found' }, { status: 404 });
    }

    // Simulate image generation
    console.log('Worker: Starting image generation simulation...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    const mockImageUrl = getRandomImage();
    console.log('Worker: Image generation complete. Mock URL:', mockImageUrl);

    const variation = task.details.canvas.variations.find((v: Variation) => v.id === variationId);
    console.log('Worker: Found variation:', variation);
    if (variation) {
      variation.status = 'completed';
      variation.imageRef = mockImageUrl;
      console.log('Worker: Updated variation status and imageRef');
    }

    task.markModified('details');
    console.log('Worker: Marked task as modified');
    await task.save();
    console.log('Worker: Saved task to database');

    await completeJob(jobId, mockImageUrl);
    console.log('Worker: Completed job in QStash');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Worker error:', error);
    const jobId = (error as any)?.body?.jobId;
    if (jobId) {
      await failJob(jobId, { code: 'WORKER_EXECUTION_FAILED', message: (error as Error).message });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);