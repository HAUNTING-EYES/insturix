import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { z } from 'zod';
import { SelectIdeaRequestSchema } from '@/types/clickatron';

const mockImages = [
  'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=2874&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1554034483-04fda0d3507b?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  'https://images.unsplash.com/photo-1567359781514-3b964e2b04d6?q=80&w=2835&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
];

const getRandomImage = () => mockImages[Math.floor(Math.random() * mockImages.length)];

// POST /api/services/clickatron/session/:id/ideas/select
// Marks an idea as selected, and creates the initial canvas.
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
    if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ error: 'Invalid Session ID' }, { status: 400 });
    }

    const body = await request.json();
    const { selectedIdea } = SelectIdeaRequestSchema.parse(body);

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });
    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Persist selection
    task.details.selectedIdea = selectedIdea;

    // Initialize canvas with a default variation using session's aspect ratio
    const variationId = `var_${Date.now()}`;
    task.details.canvas = {
      variations: [
        {
          id: variationId,
          prompt: selectedIdea.prompt,
          status: 'completed',
          imageRef: getRandomImage(),
          aspectRatio: task.details.aspectRatio, // Use session's aspect ratio for first variation
          fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
        },
      ],
    };

    task.markModified('details');
    await task.save();

    return NextResponse.json({ success: true, message: 'Canvas initialized' });
  } catch (error) {
    console.error('Error selecting idea:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
