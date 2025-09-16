import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { CreateSessionRequest, CreateSessionRequestSchema } from '@/types/clickatron';
import { z } from 'zod';
import { ClickatronGCSManager } from '@/lib/clickatron-gcs';
import { createJob } from '@/lib/clickatron-jobs';
import { enqueueClickatronJob } from '@/lib/clickatron-qtask';
import { nanoid } from 'nanoid';

// POST /api/services/clickatron/session - Create new session and generate the first variation
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Invalid content type. Must be multipart/form-data.' }, { status: 400 });
    }

    const formData = await request.formData();
    const validatedData = CreateSessionRequestSchema.parse({
      prompt: formData.get('prompt'),
      aspectRatio: formData.get('aspectRatio'),
      modelId: formData.get('modelId'),
    });

    const referenceImages = formData.getAll('referenceImage') as File[];
    let referenceImageRefs: string[] = [];

    await getClickatronDb();

    // 1. Create the new Task (Session)
    const newTask = new ClickatronTask({
      clerkUserId: userId,
      title: validatedData.prompt, // Use the prompt as the initial title
      details: {
        // The videoIdea field is now repurposed to store the initial prompt
        videoIdea: validatedData.prompt,
        aspectRatio: validatedData.aspectRatio,
        canvas: {
          variations: [],
          chatHistory: [],
        },
      },
    });

    // 2. Create the first Variation
    const newVariationId = nanoid();
    const newVariation: any = {
      id: newVariationId,
      prompt: validatedData.prompt,
      status: 'generating',
      aspectRatio: validatedData.aspectRatio,
      modelId: validatedData.modelId,
      createdAt: new Date(),
      updatedAt: new Date(),
      fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
      imageRef: '',
      referenceImageRefs: [],
    };

    // 3. Upload reference images if they exist
    for (const referenceImage of referenceImages) {
      const buffer = Buffer.from(await referenceImage.arrayBuffer());
      const imageUrl = await ClickatronGCSManager.uploadImageBuffer(
        userId,
        newTask._id.toString(),
        newVariationId, // Associate with the new variation
        buffer,
        referenceImage.type
      );
      // Store the raw GCS URL without query parameters for long-term storage
      const rawImageUrl = imageUrl.split('?')[0];
      referenceImageRefs.push(rawImageUrl);
    }
    newVariation.referenceImageRefs = referenceImageRefs;
    
    // 4. Add the variation to the canvas and save
    newTask.details.canvas.variations.push(newVariation);
    await newTask.save();

    // 5. Create and Enqueue the Generation Job
    const jobData = {
      userId,
      sessionId: newTask._id.toString(),
      variationId: newVariationId,
      prompt: validatedData.prompt,
      modelId: validatedData.modelId,
      aspectRatio: validatedData.aspectRatio,
      referenceImageRefs,
    };
    
    console.log('Creating job with data:', jobData);
    const jobId = await createJob(jobData);

    console.log('Enqueuing job with ID:', jobId);
    await enqueueClickatronJob({ jobId, ...jobData });

    return NextResponse.json({
      success: true,
      sessionId: newTask._id.toString(),
      variation: newVariation,
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