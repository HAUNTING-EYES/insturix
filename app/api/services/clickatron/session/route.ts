import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { CreateSessionRequestSchema, type ClickatronSourceContext } from '@/types/clickatron';
import { z } from 'zod';
import { ClickatronR2Manager } from '@/lib/clickatron-r2';
import { createJob } from '@/lib/clickatron-jobs';
import { enqueueClickatronJob } from '@/lib/clickatron-qtask';
import { nanoid } from 'nanoid';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { getDefaultClickatronModelIdForInput } from '@/lib/config/clickatron-models';


// POST /api/services/clickatron/session - Create new session and generate the first variation
export async function POST(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check credits (3 credits for a variation)
  const creditCheck = await checkCredits(userId, 'clickatron', 'variation');
  if (!creditCheck.allowed) {
    return creditCheck.errorResponse;
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Invalid content type. Must be multipart/form-data.' }, { status: 400 });
    }

    const formData = await request.formData();
    const referenceImages = formData.getAll('referenceImage') as File[];
    const defaultModelId = getDefaultClickatronModelIdForInput({
      context: 'newVariation',
      referenceImageCount: referenceImages.length,
    });
    const validatedData = CreateSessionRequestSchema.parse({
      prompt: formData.get('prompt') || '',
      aspectRatio: formData.get('aspectRatio') || '16:9',
      modelId: formData.get('modelId') || defaultModelId,
      brandId: formData.get('brandId'),
      projectId: formData.get('projectId'),
      universalId: formData.get('universalId'),
      sourceService: formData.get('sourceService'),
      sourceSessionId: formData.get('sourceSessionId'),
      sourceScriptId: formData.get('sourceScriptId'),
      metadata: formData.get('metadata'),
    });

    const isBlankProject = !validatedData.prompt || validatedData.prompt.trim() === '';
    const sourceContext = Object.fromEntries(
      Object.entries({
        sourceService: validatedData.sourceService,
        sourceSessionId: validatedData.sourceSessionId,
        sourceScriptId: validatedData.sourceScriptId,
        universalId: validatedData.universalId,
        brandId: validatedData.brandId,
        projectId: validatedData.projectId,
      }).filter(([, value]) => value != null)
    ) as ClickatronSourceContext;
    const hasSourceContext = Object.keys(sourceContext).length > 0;
    const creationMetadata = {
      ...(validatedData.metadata || {}),
      ...(hasSourceContext ? { sourceContext } : {}),
    };
    const hasCreationMetadata = Object.keys(creationMetadata).length > 0;

    const referenceImageRefs: string[] = [];

    await getClickatronDb();

    // Get creator name for org context display
    let createdByName: string | undefined;
    if (orgId) {
      try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        createdByName = user.firstName 
          ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
          : user.username || user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'Unknown';
      } catch (e) {
        console.error('[Clickatron] Failed to get user name:', e);
      }
    }

    // 1. Create the new Task (Session)
    const newTask = new ClickatronTask({
      clerkUserId: userId,
      orgId: orgId || undefined,  // Store org context (undefined = personal)
      createdByName,  // Store creator name for org display
      brandId: validatedData.brandId,
      projectId: validatedData.projectId,
      universalId: validatedData.universalId,
      sourceService: validatedData.sourceService,
      sourceSessionId: validatedData.sourceSessionId,
      sourceScriptId: validatedData.sourceScriptId,
      metadata: hasCreationMetadata ? creationMetadata : undefined,
      title: `project ${validatedData.aspectRatio} #${Date.now()}`, // Use a generic title
      details: {
        // The videoIdea field is now repurposed to store the initial prompt
        videoIdea: validatedData.prompt || 'New Project',
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
      status: isBlankProject ? 'blank' : 'generating',
      aspectRatio: validatedData.aspectRatio,
      modelId: validatedData.modelId,
      createdAt: new Date(),
      updatedAt: new Date(),
      fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
      imageRef: '',
      thumbnailRef: '',
      referenceImageRefs: [],
      ...(hasCreationMetadata ? { metadata: creationMetadata } : {}),
    };

    // 3. Upload reference images if they exist
    for (const referenceImage of referenceImages) {
      const buffer = Buffer.from(await referenceImage.arrayBuffer());
      const imageUrl = await ClickatronR2Manager.uploadImageBuffer(
        userId,
        newTask._id.toString(),
        newVariationId, // Associate with the new variation
        buffer,
        referenceImage.type
      );
      // Store the raw R2 URL without query parameters for long-term storage
      const rawImageUrl = imageUrl.split('?')[0];
      referenceImageRefs.push(rawImageUrl);
    }
    newVariation.referenceImageRefs = referenceImageRefs;

    // 4. Add the variation to the canvas and save
    newTask.details.canvas.variations.push(newVariation);
    await newTask.save();

    // Only deduct credits and create job if it's NOT a blank project
    if (!isBlankProject) {
      // 5. Deduct credits
      await creditCheck.deduct();

      // 6. Create and Enqueue the Generation Job
      const jobData = {
        userId,
        sessionId: newTask._id.toString(),
        variationId: newVariationId,
        prompt: validatedData.prompt as string,
        modelId: validatedData.modelId as string,
        aspectRatio: validatedData.aspectRatio as string,
        referenceImageRefs,
        ...(hasCreationMetadata ? { metadata: creationMetadata } : {}),
      };

      console.log('Creating job with data:', jobData);
      const jobId = await createJob(jobData);

      try {
        console.log('Enqueuing job with ID:', jobId);
        await enqueueClickatronJob({ jobId, ...jobData });
      } catch (jobError) {
        console.error('Failed to enqueue job:', jobError);
        // Refund credits if job enqueue fails
        await creditCheck.refund('Failed to enqueue generation job');
        throw jobError;
      }
    }

    return NextResponse.json({
      success: true,
      sessionId: newTask._id.toString(),
      variation: newVariation,
    });

  } catch (error) {
    console.error('Error creating session:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
