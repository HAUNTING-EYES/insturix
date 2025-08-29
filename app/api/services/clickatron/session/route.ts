import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { CreateSessionRequestSchema } from '@/types/clickatron';
import { z } from 'zod';

// POST /api/services/clickatron/session - Create new workflow record
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate request body
    const validatedData = CreateSessionRequestSchema.parse({
      ...body,
      clerkUserId: userId,
    });

    await getClickatronDb();

    // Create new ClickatronTask document
    const newTask = new ClickatronTask({
      clerkUserId: userId,
      title: validatedData.videoIdea,
      details: {
        workflow: {
          videoIdea: validatedData.videoIdea,
          stage: 'ideation',
          selectedPreset: validatedData.preset,
          referenceImageMeta: validatedData.referenceImage,
          workflowVersion: 1,
        },
        canvas: {
          variations: [],
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await newTask.save();

    return NextResponse.json({
      success: true,
      sessionId: newTask._id.toString(),
      taskData: {
        videoIdea: validatedData.videoIdea,
        timestamp: newTask.createdAt.getTime(),
        stage: 'ideation',
        selectedPreset: validatedData.preset,
        referenceImage: validatedData.referenceImage,
      },
    });
  } catch (error) {
    console.error('Error creating session:', error);
    
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

// GET /api/services/clickatron/session/:id - Fetch merged legacy + new fields
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    
    if (!id || typeof id !== 'string' || !id.match(/^[a-f\d]{24}$/i)) {
      return NextResponse.json({ error: 'Invalid Session ID' }, { status: 400 });
    }

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);

    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });
    
    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Check if this is a legacy task that needs auto-migration
    const hasWorkflow = task.details && typeof task.details === 'object' && 'workflow' in task.details;
    const hasCanvas = task.details && typeof task.details === 'object' && 'canvas' in task.details;
    const isLegacyAdapted = hasWorkflow && hasCanvas;

    // Auto-migrate legacy tasks if needed
    if (!isLegacyAdapted) {
      await migrateLegacyTask(task);
    }

    // Return unified session data
    const sessionData = {
      ...task.toObject(),
      _id: task._id.toString(),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      isLegacyAdapted: !isLegacyAdapted, // Mark if we just adapted it
    };

    return NextResponse.json({
      session: sessionData,
      isLegacyAdapted: !isLegacyAdapted,
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// Helper function to auto-migrate legacy tasks
async function migrateLegacyTask(task: any) {
  const prompt = task.results?.thumbnail?.prompt || task.details?.prompt || '';
  
  // Create synthetic workflow data
  // Determine stage from existing details or presence of a completed prompt/variation
  const inferredStage = (task.details && task.details.canvas && Array.isArray(task.details.canvas.variations) && task.details.canvas.variations.length > 0)
    ? 'canvas'
    : 'ideation';

  const workflowData = {
    videoIdea: task.title || task.details?.videoIdea || 'Legacy Task',
    stage: inferredStage,
    selectedDirection: prompt || undefined,
    selectedPreset: {
      id: 'youtube',
      name: 'YouTube Thumbnail',
      aspectRatio: '16:9',
      dimensions: '1920x1080',
      promptText: "What's your video about?",
      placeholder: '',
    },
    referenceImageMeta: null,
    workflowVersion: 1,
  };

  // Create initial canvas data with mock variation if completed
  const canvasData: any = {
    variations: [],
  };

  // If there is an existing prompt in results or canvas info, create a legacy variation record
  if (prompt) {
    canvasData.variations = [{
      id: `legacy_${task._id.toString()}`,
      prompt,
      // Use updatedAt as a fallback timestamp since session-level completedAt was removed
      timestamp: task.updatedAt.getTime(),
      status: 'completed' as const,
      metadata: {
        aspectRatio: '16:9',
        dimensions: '1920x1080',
      },
    }];
  }

  // Update the task with new structure
  task.details = {
    ...task.details,
    workflow: workflowData,
    canvas: canvasData,
  };
  
  task.updatedAt = new Date();
  await task.save();
}