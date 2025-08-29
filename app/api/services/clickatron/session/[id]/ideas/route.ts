import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { z } from 'zod';

// NOTE: Selection of an idea now happens via /ideas/select endpoint.
// This route ONLY stores freshly generated ideas and sets stage to 'ideation'.

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

  // Validate request body (no selectedIdeaId allowed now)
  const validatedData = StoreIdeasRequestSchema.parse(body);

    // Convert generatedAt strings to Date objects
    const ideas = validatedData.ideas.map(idea => ({
      ...idea,
      generatedAt: new Date(idea.generatedAt),
    }));

    // Initialize workflow if it doesn't exist
    if (!task.details) {
      task.details = {};
    }
    if (!task.details.workflow) {
      task.details.workflow = {
        videoIdea: task.title || 'Untitled Session',
        stage: 'ideation',
        workflowVersion: 1,
      };
    }

    // Guards
    if (task.details.workflow.stage === 'canvas') {
      return NextResponse.json({ error: 'Session already in canvas stage; cannot overwrite ideas' }, { status: 409 });
    }
    if (task.details.workflow.generatedIdeas?.length) {
      // Ideas already exist; do not overwrite (frontend should fetch existing instead of regenerating)
      return NextResponse.json({
        success: true,
        sessionId: id,
        storedIdeas: task.details.workflow.generatedIdeas.length,
        note: 'Ideas already existed; no changes applied'
      });
    }

    // Store ideas with no selection yet
    task.details.workflow.generatedIdeas = ideas;
    // Ensure no stray selectedIdea from previous inconsistent state
    if (task.details.workflow.selectedIdea) {
      delete task.details.workflow.selectedIdea;
    }

    task.updatedAt = new Date();
    await task.save();

    return NextResponse.json({
      success: true,
      sessionId: id,
      storedIdeas: ideas.length,
      selectedIdea: null,
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