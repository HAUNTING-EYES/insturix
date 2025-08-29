import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { ClickatronTask } from '@/schemas/Clickatron';
import { Types } from 'mongoose';

// Request schema for direction generation
const GenerateDirectionsRequestSchema = z.object({
  videoIdea: z.string().min(1, 'Video idea is required'),
  count: z.number().min(1).max(6).default(4),
  sessionId: z.string().min(1, 'sessionId is required'),
});

// Mock direction generation function (synchronous)
const generateMockDirections = (videoIdea: string, count: number) => {
  const directionTemplates = [
    {
      title: "Warm & Inviting",
      description: "Soft, warm lighting with inviting colors",
      prompt: `Create a warm and inviting thumbnail for "${videoIdea}" with soft lighting and welcoming colors`,
    },
    {
      title: "Bold & Dramatic",
      description: "High contrast with dramatic lighting effects",
      prompt: `Design a bold and dramatic thumbnail for "${videoIdea}" with high contrast and striking visual impact`,
    },
    {
      title: "Clean & Minimal",
      description: "Simple, clean design with minimal elements",
      prompt: `Create a clean and minimal thumbnail for "${videoIdea}" with simple composition and essential elements only`,
    },
    {
      title: "Energetic & Dynamic",
      description: "Fast-paced with dynamic movement and energy",
      prompt: `Design an energetic and dynamic thumbnail for "${videoIdea}" with movement and high energy visuals`,
    },
  ];

  const selectedDirections = [];

  // Generate 'count' directions, reusing templates if necessary
  for (let i = 0; i < count; i++) {
    // Use modulo to cycle through templates if count exceeds available templates
    const templateIndex = i % directionTemplates.length;
    const template = directionTemplates[templateIndex];

    selectedDirections.push({
      id: `direction_${Date.now()}_${i}`,
      title: template.title,
      description: template.description,
      prompt: template.prompt,
      icon: '🎯', // Keep the icon for the frontend
    });
  }

  return selectedDirections;
};

export async function POST(request: Request) {
  const start = Date.now();
  try {
    const originHeader = (request.headers.get('x-origin') || request.headers.get('X-Origin') || 'unknown');
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] generate-directions RECEIVED origin=${originHeader} time=${new Date().toISOString()}`);
    }

    const { userId } = await auth();
    if (!userId) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API] generate-directions AUTH FAILED duration=${Date.now()-start}ms`);
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = GenerateDirectionsRequestSchema.parse(body);

    // sessionId is already validated by the schema

    // Simulate a short processing delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const directions = generateMockDirections(
      validatedData.videoIdea,
      validatedData.count
    );

    // Persist generated directions into the session's workflow
    try {
      console.log(`[API] generate-directions: Persisting ${directions.length} directions to session ${validatedData.sessionId}`);
      await getClickatronDb();
      const objectId = new Types.ObjectId(validatedData.sessionId);
      const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });
      if (task) {
        console.log(`[API] generate-directions: Found task, current workflow:`, task.details?.workflow);

        // Ensure workflow exists
        if (!task.details) task.details = {};
        if (!task.details.workflow) {
          task.details.workflow = {
            videoIdea: task.title || validatedData.videoIdea,
            stage: 'ideation',
            workflowVersion: 1,
          };
        }

        // If session already moved to canvas, reject storing ideation directions
        if (task.details.workflow.stage === 'canvas') {
          console.log(`[API] generate-directions: Session already in canvas stage, rejecting`);
          return NextResponse.json({ error: 'Session already in canvas stage; cannot store directions' }, { status: 409 });
        }

        // Map and store directions with generatedAt timestamps
        const stored = directions.map((d: any) => ({
          id: d.id,
          title: d.title,
          description: d.description,
          prompt: d.prompt,
          generatedAt: new Date(),
        }));

        console.log(`[API] generate-directions: Updating task with ${stored.length} directions`);
        const updatedTask = await ClickatronTask.findByIdAndUpdate(
          objectId,
          {
            $set: {
              'details.workflow.generatedDirections': stored,
              updatedAt: new Date(),
            },
          },
          { new: true }
        );
        console.log(`[API] generate-directions: Successfully updated task, generatedDirections:`, updatedTask.details?.workflow?.generatedDirections?.length);
      } else {
        console.error(`[API] generate-directions: Task not found for session ${validatedData.sessionId}`);
      }
    } catch (err) {
      console.error('Failed to persist generated directions to session:', err);
      // don't fail the whole request — return directions but log error
    }
    

    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] generate-directions DONE status=200 duration=${Date.now()-start}ms`);
    }
    return NextResponse.json({ success: true, directions });
  } catch (error) {
    console.error('Error generating directions:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
  console.error(`[API] generate-directions ERROR duration=${Date.now()-start}ms`, error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}