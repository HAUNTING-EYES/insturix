import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { z } from 'zod';

// Define the schema inline since it's not exported
const UpsertSessionRequestSchema = z.object({
  workflow: z.object({
    videoIdea: z.string().optional(),
    stage: z.enum(['ideation', 'canvas']).optional(),
    selectedPreset: z.object({
      id: z.string(),
      name: z.string(),
      aspectRatio: z.string(),
      dimensions: z.string(),
      promptText: z.string(),
      placeholder: z.string(),
    }).optional(),
    selectedDirection: z.string().optional(),
    referenceImageMeta: z.object({
      name: z.string(),
      size: z.number(),
      type: z.string(),
      imageId: z.string(),
    }).optional(),
    workflowVersion: z.number().optional(),
  }).optional(),
  canvas: z.object({
    variations: z.array(z.object({
      id: z.string(),
      prompt: z.string(),
      timestamp: z.number(),
      status: z.enum(['generating', 'completed', 'failed']),
      fineTuning: z.object({
        brightness: z.number().min(0).max(200),
        contrast: z.number().min(0).max(200),
        saturation: z.number().min(0).max(200),
      }).optional(),
      imageRef: z.string().optional(),
      referenceImages: z.array(z.string()).optional(),
      metadata: z.object({
        aspectRatio: z.string().optional(),
        dimensions: z.string().optional(),
        style: z.string().optional(),
      }).optional(),
    })).optional(),
  }).optional(),
});

// GET /api/services/clickatron/session/:id - Fetch a session
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  try {
    const originHeader = (request.headers.get('x-origin') || request.headers.get('X-Origin') || 'unknown');
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] session GET RECEIVED origin=${originHeader} time=${new Date().toISOString()}`);
    }

    const { userId } = await auth();
    if (!userId) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API] session GET AUTH FAILED duration=${Date.now()-start}ms`);
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id || typeof id !== 'string' || !id.match(/^[a-f\d]{24}$/i)) {
      return NextResponse.json({ error: 'Invalid Session ID' }, { status: 400 });
    }

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);

    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });

    if (!task) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API] session GET NOT FOUND duration=${Date.now()-start}ms`);
      }
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] session GET DONE status=200 duration=${Date.now()-start}ms`);
    }
    return NextResponse.json({ session: task });
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
// PATCH /api/services/clickatron/session/:id - Upsert partial workflow / canvas fields
export async function PATCH(
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
    const validatedData = UpsertSessionRequestSchema.parse(body);

    // Prepare update object
    const update: any = { updatedAt: new Date() };

    // Handle workflow updates
    if (validatedData.workflow) {
      if (!task.details) {
        task.details = {};
      }
      
      // Initialize workflow if it doesn't exist
      if (!task.details.workflow) {
        task.details.workflow = {};
      }

      // Merge workflow updates
      Object.assign(task.details.workflow, validatedData.workflow);
    }

    // Handle canvas updates
    if (validatedData.canvas) {
      if (!task.details) {
        task.details = {};
      }
      
      // Initialize canvas if it doesn't exist
      if (!task.details.canvas) {
        task.details.canvas = { variations: [] };
      }

      // Merge canvas updates
      if (validatedData.canvas.variations) {
        // Add new variations while capping at 50
        const currentVariations = task.details.canvas.variations || [];
        const newVariations = [...currentVariations, ...validatedData.canvas.variations];
        
        // Keep only the 50 most recent variations
        task.details.canvas.variations = newVariations
          .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
          .slice(0, 50);
      }

      // Merge other canvas fields
      Object.assign(task.details.canvas, validatedData.canvas);
    }

    // Save the updated task
    await task.save();

    return NextResponse.json({
      success: true,
      sessionId: id,
      updatedFields: Object.keys(validatedData),
    });
  } catch (error) {
    console.error('Error updating session:', error);
    
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