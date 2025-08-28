import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { CreateVariationRequestSchema } from '@/types/clickatron';
import { z } from 'zod';

// POST /api/services/clickatron/session/:id/variation - Queue/generate a variation
export async function POST(
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

    // Find the task
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });
    
    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const body = await request.json();
    
    // Validate request body
    const validatedData = CreateVariationRequestSchema.parse({
      ...body,
      sessionId: id,
    });

    // Initialize canvas if it doesn't exist
    if (!task.details?.canvas) {
      task.details.canvas = { variations: [] };
    }

    // Create new variation
    const newVariation = {
      id: `var_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      prompt: validatedData.prompt,
      timestamp: Date.now(),
      status: 'generating' as const,
      fineTuning: validatedData.fineTuning || {
        brightness: 100,
        contrast: 100,
        saturation: 100,
      },
      referenceImages: validatedData.referenceImages || [],
      metadata: validatedData.metadata || {},
    };

    // Add variation to canvas (capping at 50)
    const currentVariations = task.details.canvas.variations || [];
    currentVariations.unshift(newVariation); // Add to beginning
    
    // Keep only the 50 most recent variations
    task.details.canvas.variations = currentVariations.slice(0, 50);

    // Update task status and save
    task.status = 'processing';
    task.updatedAt = new Date();
    await task.save();

    // Mock generation - simulate async processing
    setTimeout(async () => {
      try {
        // Simulate generation completion after 2-5 seconds
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
        
        // Update the variation status to completed
        const updatedTask = await ClickatronTask.findById(task._id);
        if (updatedTask && updatedTask.details?.canvas?.variations) {
          const variation = updatedTask.details.canvas.variations.find(
            (v: any) => v.id === newVariation.id
          );
          if (variation) {
            variation.status = 'completed';
            variation.timestamp = Date.now();
            // Mock image reference
            variation.imageRef = `generated_${newVariation.id}.png`;
            
            // If this is the first completed variation, update task status
            const hasCompletedVariation = updatedTask.details.canvas.variations.some(
              (v: any) => v.status === 'completed'
            );
            if (hasCompletedVariation) {
              updatedTask.status = 'completed';
            }
            
            updatedTask.updatedAt = new Date();
            await updatedTask.save();
          }
        }
      } catch (error) {
        console.error('Error during mock variation generation:', error);
        // Update variation status to failed on error
        const updatedTask = await ClickatronTask.findById(task._id);
        if (updatedTask && updatedTask.details?.canvas?.variations) {
          const variation = updatedTask.details.canvas.variations.find(
            (v: any) => v.id === newVariation.id
          );
          if (variation) {
            variation.status = 'failed';
            updatedTask.updatedAt = new Date();
            await updatedTask.save();
          }
        }
      }
    }, 100); // Small delay to allow the initial response to be sent

    return NextResponse.json({
      success: true,
      variationId: newVariation.id,
      status: 'generating',
      estimatedTime: 5, // seconds
    });
  } catch (error) {
    console.error('Error creating variation:', error);
    
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