import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { StoreIdeasRequest } from '@/types/clickatron';
import { z } from 'zod';

// Validation schema
const StoreIdeasRequestSchema = z.object({
  ideas: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    prompt: z.string(),
    tags: z.array(z.string()),
    styleHints: z.array(z.string()),
    generatedAt: z.string().datetime(),
  })),
  selectedIdeaId: z.string().optional(),
});

// POST /api/services/clickatron/session/:id/ideas - Store generated ideas
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

    if (!id || typeof id !== 'string' || !id.match(/^[a-f\d]{24}$/i)) {
      return NextResponse.json({ error: 'Invalid Session ID' }, { status: 400 });
    }

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);

    // Find the task
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });

    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const body = await request.json();

    // Validate request body
    const validatedData = StoreIdeasRequestSchema.parse(body);

    // Convert generatedAt strings to Date objects
    const ideas = validatedData.ideas.map(idea => ({
      ...idea,
      generatedAt: new Date(idea.generatedAt),
    }));

    // Find selected idea if specified
    const selectedIdea = validatedData.selectedIdeaId
      ? ideas.find(idea => idea.id === validatedData.selectedIdeaId)
      : undefined;

    // Initialize workflow if it doesn't exist
    if (!task.details) {
      task.details = {};
    }
    if (!task.details.workflow) {
      task.details.workflow = {
        videoIdea: task.title || 'Untitled Session',
        stage: 'spark',
        workflowVersion: 1,
      };
    }

    // Store ideas and selection
    task.details.workflow.generatedIdeas = ideas;
    if (selectedIdea) {
      task.details.workflow.selectedIdea = selectedIdea;
      task.details.workflow.stage = 'ideation';
    }

    task.updatedAt = new Date();
    await task.save();

    return NextResponse.json({
      success: true,
      sessionId: id,
      storedIdeas: ideas.length,
      selectedIdea: selectedIdea?.id,
    });
  } catch (error) {
    console.error('Error storing ideas:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}