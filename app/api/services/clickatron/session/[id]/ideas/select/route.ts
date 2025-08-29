import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { z } from 'zod';
import { getQStashClient } from '@/lib/qstash';

const SelectIdeaSchema = z.object({
  ideaId: z.string(),
  // Optional prompt override if user edits before selecting
  promptOverride: z.string().min(1).max(1000).optional(),
});

// POST /api/services/clickatron/session/:id/ideas/select
// Marks an idea as selected, advances stage to 'canvas', creates initial variation job
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const { ideaId, promptOverride } = SelectIdeaSchema.parse(body);

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });
    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const selected = task.details.workflow.generatedDirections.find((i: any) => i.id === ideaId);
    if (!selected) {
      return NextResponse.json({ error: 'Idea not found in session' }, { status: 404 });
    }

    // Persist selection and stage transition
    task.details.workflow.selectedDirection = selected;
    task.details.workflow.stage = 'canvas';

    // Initialize canvas structure
    if (!task.details.canvas) {
      task.details.canvas = { variations: [] };
    }

    // Create first variation placeholder and enqueue job
    const variationId = `var_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const prompt = promptOverride || selected.prompt;
    const variation = {
      id: variationId,
      prompt,
      timestamp: Date.now(),
      status: 'generating' as const,
      fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
      referenceImages: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    task.details.canvas.variations.unshift(variation);

    // Mark the mixed-type 'details' field as modified before saving
    task.markModified('details');
    await task.save();

    const qstash = getQStashClient();
    const workerUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/internal/workers/clickatron/variation`;
    const job = await qstash.publishJSON({
      url: workerUrl,
      body: {
        sessionId: id,
        variationId,
        prompt,
        userId,
        fineTuning: variation.fineTuning,
      },
      retries: 3,
    });

    return NextResponse.json({ success: true, variationId, jobId: job.messageId, stage: 'canvas' });
  } catch (error) {
    console.error('Error selecting idea:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

