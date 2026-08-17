import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { CreateSessionRequestSchema, type ClickatronSourceContext } from '@/types/clickatron';
import { z } from 'zod';
import { ClickatronR2Manager } from '@/lib/clickatron-r2';
import {
  claimIdempotencyKey,
  commitIdempotencyKey,
  createJob,
  failQueuedJob,
  recordJobCreditTransaction,
  releaseIdempotencyKey,
} from '@/lib/clickatron-jobs';
import { enqueueClickatronJob } from '@/lib/clickatron-qtask';
import { nanoid } from 'nanoid';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { CreditsService } from '@/lib/services/creditsService';
import {
  ClickatronModelCompatibilityError,
  resolveClickatronModelForGeneration,
} from '@/lib/config/clickatron-models';
import {
  ClickatronAspectRatioError,
  resolveClickatronImageGeometry,
} from '@/lib/clickatron/image-geometry';
import {
  resolveClickatronBrandReferenceEvidence,
  selectClickatronGenerationBrandEvidence,
} from '@/lib/clickatron/brand-reference-images';
import {
  admitClickatronCarouselPlan,
  ClickatronCarouselAdmissionError,
  type ClickatronCarouselSlideSpec,
} from '@/lib/thinkforge/schemas/clickatron-creative-contract';
import { resolveClickatronE2EMediaFixture } from '@/lib/clickatron/e2e-media-fixture';

interface CarouselParseResult {
  slides: ClickatronCarouselSlideSpec[];
  admissionError?: ClickatronCarouselAdmissionError;
}

/**
 * Extract carousel slides from the session `metadata` form field.
 *
 * A ThinkForge carousel handoff embeds the resolved creative spec at
 * metadata.clickatron.creativeSpec; when its kind is "carousel" the per-slide
 * prompts live at renderPlan.slides. The shared creative contract owns slide
 * completeness and cardinality; this route only extracts metadata and surfaces
 * typed admission failures before any billing or persistence.
 */
function parseCarouselSlides(metadataField: FormDataEntryValue | null): CarouselParseResult {
  if (typeof metadataField !== 'string' || metadataField.trim() === '') return { slides: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataField);
  } catch {
    return { slides: [] };
  }

  const creativeSpec = (parsed as any)?.clickatron?.creativeSpec;
  const requestedSlideCount = (parsed as any)?.clickatronHandoff?.visualChoices?.slideCount;
  try {
    return {
      slides: admitClickatronCarouselPlan({ creativeSpec, requestedSlideCount }),
    };
  } catch (error) {
    const admissionError = error instanceof ClickatronCarouselAdmissionError
      ? error
      : new ClickatronCarouselAdmissionError(
          'CAROUSEL_SPEC_INVALID',
          error instanceof Error ? error.message : 'Carousel creative spec is invalid.',
        );
    return { slides: [], admissionError };
  }
}

// POST /api/services/clickatron/session - Create new session and generate the first variation (or N carousel slides)
export async function POST(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestIdempotencyKey = request.headers.get('Idempotency-Key')?.trim();
  const scopedIdempotencyKey = requestIdempotencyKey
    ? `${userId}:${requestIdempotencyKey}`
    : null;
  const idempotencyClaimToken = nanoid();
  let ownsIdempotencyClaim = false;
  let idempotencyCommitted = false;
  let taskPersisted = false;

  if (scopedIdempotencyKey) {
    try {
      const claim = await claimIdempotencyKey(scopedIdempotencyKey, idempotencyClaimToken);
      if (claim.outcome === 'claimed') {
        ownsIdempotencyClaim = true;
      } else if (claim.value.startsWith('pending:')) {
        return NextResponse.json(
          {
            error: 'An identical generation request is already being created.',
            code: 'REQUEST_IN_PROGRESS',
          },
          {
            status: 409,
            headers: { 'Retry-After': '2' },
          },
        );
      } else {
        await getClickatronDb();
        const existingTask = await ClickatronTask.findOne({
          _id: claim.value,
          clerkUserId: userId,
        });
        if (!existingTask) {
          return NextResponse.json(
            {
              error: 'The generation request has stale idempotency state.',
              code: 'IDEMPOTENCY_STATE_INVALID',
            },
            { status: 409 },
          );
        }
        const existingVariations = existingTask.details?.canvas?.variations ?? [];
        return NextResponse.json({
          success: true,
          sessionId: claim.value,
          variation: existingVariations[0],
          variations: existingVariations,
        });
      }
    } catch (idemError) {
      console.error('[Clickatron] Idempotency claim failed:', idemError);
      return NextResponse.json(
        {
          error: 'Generation could not be started safely. Please retry.',
          code: 'IDEMPOTENCY_UNAVAILABLE',
        },
        { status: 503 },
      );
    }
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Invalid content type. Must be multipart/form-data.' }, { status: 400 });
    }

    const formData = await request.formData();

    // ── CAROUSEL FAN-OUT (P6) ──────────────────────────────────────────────
    // A ThinkForge carousel handoff carries N slide prompts in
    // metadata.clickatron.creativeSpec.renderPlan.slides. We fan those out to
    // N variations -> N jobs -> N images, and charge per slide. Parse the slide
    // count up-front so the credit check covers the whole batch.
    // NOTE FOR P6/P7 RECONCILIATION: the credit check was moved here (from the
    // top of POST) so it can read `quantity` from the parsed slides. P6 owns
    // ONLY this fan-out + the per-slide `quantity` charge. P7 owns credit
    // idempotency/refund/watchdog — the deduct()/refund() semantics below are
    // intentionally left as-is for P7 to reconcile.
    const carouselParse = parseCarouselSlides(formData.get('metadata'));
    if (carouselParse.admissionError) {
      return NextResponse.json(
        {
          error: carouselParse.admissionError.message,
          code: carouselParse.admissionError.code,
        },
        { status: 422 },
      );
    }
    const carouselSlides = carouselParse.slides;
    const quantity = carouselSlides.length > 0 ? carouselSlides.length : 1;
    const referenceImages = formData.getAll('referenceImage') as File[];
    const e2eMediaFixture = resolveClickatronE2EMediaFixture();
    if (e2eMediaFixture && referenceImages.length > 0) {
      return NextResponse.json(
        {
          error: 'Clickatron E2E media fixtures do not accept uploaded reference images.',
          code: 'E2E_REFERENCE_IMAGES_FORBIDDEN',
        },
        { status: 422 },
      );
    }
    const rawAspectRatio = formData.get('aspectRatio') || '16:9';
    let aspectRatio: string;
    try {
      aspectRatio = resolveClickatronImageGeometry(
        typeof rawAspectRatio === 'string' ? rawAspectRatio : String(rawAspectRatio),
      ).ratio;
    } catch (error) {
      if (error instanceof ClickatronAspectRatioError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 422 },
        );
      }
      throw error;
    }

    const parsedData = CreateSessionRequestSchema.parse({
      prompt: formData.get('prompt') || '',
      aspectRatio,
      modelId: formData.get('modelId') || undefined,
      brandId: formData.get('brandId'),
      projectId: formData.get('projectId'),
      universalId: formData.get('universalId'),
      sourceService: formData.get('sourceService'),
      sourceSessionId: formData.get('sourceSessionId'),
      sourceScriptId: formData.get('sourceScriptId'),
      metadata: formData.get('metadata'),
    });
    const isBlankProject = !parsedData.prompt || parsedData.prompt.trim() === '';
    const sourceContext = Object.fromEntries(
      Object.entries({
        sourceService: parsedData.sourceService,
        sourceSessionId: parsedData.sourceSessionId,
        sourceScriptId: parsedData.sourceScriptId,
        universalId: parsedData.universalId,
        brandId: parsedData.brandId,
        projectId: parsedData.projectId,
      }).filter(([, value]) => value != null)
    ) as ClickatronSourceContext;
    const hasSourceContext = Object.keys(sourceContext).length > 0;
    const creationMetadata = {
      ...(parsedData.metadata || {}),
      ...(hasSourceContext ? { sourceContext } : {}),
    };
    const hasCreationMetadata = Object.keys(creationMetadata).length > 0;
    const isBlankSession = isBlankProject && carouselSlides.length === 0;

    const brandReferenceResolution = isBlankSession
      ? null
      : await resolveClickatronBrandReferenceEvidence({
          userId,
          brandId: parsedData.brandId,
          metadata: creationMetadata,
          prompt: parsedData.prompt,
          orgId: orgId ?? null,
        });
    if (brandReferenceResolution?.needsUserInput) {
      return NextResponse.json(
        {
          error: brandReferenceResolution.needsUserInputReason,
          code: 'BRAND_LOGO_EVIDENCE_REQUIRED',
        },
        { status: 422 },
      );
    }

    const generationBrandEvidence = brandReferenceResolution
      ? selectClickatronGenerationBrandEvidence(brandReferenceResolution, {
          hasParentImage: false,
          userReferenceImageCount: referenceImages.length,
        })
      : [];
    let resolvedModel: ReturnType<typeof resolveClickatronModelForGeneration>;
    try {
      resolvedModel = resolveClickatronModelForGeneration({
        requestedModelId: parsedData.modelId,
        context: 'newVariation',
        referenceImageCount: referenceImages.length + generationBrandEvidence.length,
        aspectRatio,
      });
    } catch (error) {
      if (error instanceof ClickatronModelCompatibilityError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 422 },
        );
      }
      throw error;
    }
    if (resolvedModel.reason === 'aspect-ratio-fallback') {
      console.warn('[Clickatron] Model switched during generation preflight:', {
        requestedModelId: resolvedModel.requestedModelId,
        selectedModelId: resolvedModel.modelId,
        aspectRatio,
        userReferenceImageCount: referenceImages.length,
        brandReferenceImageCount: generationBrandEvidence.length,
      });
    }

    // Admission control uses the same final model the worker is required to run.
    if (!e2eMediaFixture) {
      const creditCheck = await checkCredits(userId, 'clickatron', 'variation', {
        quantity,
        model: resolvedModel.modelId,
      });
      if (!creditCheck.allowed) {
        return creditCheck.errorResponse;
      }
    }

    const validatedData = {
      ...parsedData,
      modelId: resolvedModel.modelId,
    };

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


    // 2. Create the variation(s).
    // A validated carousel fans out exactly one variation per canonical slide.
    // Otherwise this remains the existing single-image path.
    const isCarousel = carouselSlides.length > 0;
    const variationsToCreate: any[] = [];

    if (isCarousel) {
      carouselSlides.forEach((slide, slideIndex) => {
        const slideMetadata = {
          ...creationMetadata,
          slideId: slide.id,
          slideIndex,
          ...(slide.title ? { slideTitle: slide.title } : {}),
          isCarouselSlide: true,
          ...(e2eMediaFixture ? {
            e2eMediaFixture: {
              mode: e2eMediaFixture.mode,
              runId: e2eMediaFixture.runId,
            },
          } : {}),
        };
        variationsToCreate.push({
          id: nanoid(),
          prompt: slide.imagePrompt,
          // A carousel slide always has a prompt, so it never starts blank.
          status: e2eMediaFixture ? 'completed' : 'generating',
          aspectRatio: validatedData.aspectRatio,
          modelId: validatedData.modelId,
          createdAt: new Date(),
          updatedAt: new Date(),
          fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
          imageRef: e2eMediaFixture?.imageRef ?? '',
          thumbnailRef: e2eMediaFixture?.imageRef ?? '',
          referenceImageRefs: [],
          metadata: slideMetadata,
        });
      });
    } else {
      variationsToCreate.push({
        id: nanoid(),
        prompt: validatedData.prompt,
        status: isBlankProject ? 'blank' : e2eMediaFixture ? 'completed' : 'generating',
        aspectRatio: validatedData.aspectRatio,
        modelId: validatedData.modelId,
        createdAt: new Date(),
        updatedAt: new Date(),
        fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
        imageRef: !isBlankProject && e2eMediaFixture ? e2eMediaFixture.imageRef : '',
        thumbnailRef: !isBlankProject && e2eMediaFixture ? e2eMediaFixture.imageRef : '',
        referenceImageRefs: [],
        ...(hasCreationMetadata || e2eMediaFixture ? {
          metadata: {
            ...creationMetadata,
            ...(e2eMediaFixture ? {
              e2eMediaFixture: {
                mode: e2eMediaFixture.mode,
                runId: e2eMediaFixture.runId,
              },
            } : {}),
          },
        } : {}),
      });
    }

    // 3. Upload reference images if they exist (associated with the first variation)
    for (const referenceImage of referenceImages) {
      const buffer = Buffer.from(await referenceImage.arrayBuffer());
      const imageUrl = await ClickatronR2Manager.uploadImageBuffer(
        userId,
        newTask._id.toString(),
        variationsToCreate[0].id, // Associate with the first variation
        buffer,
        referenceImage.type
      );
      // Store the raw R2 URL without query parameters for long-term storage
      const rawImageUrl = imageUrl.split('?')[0];
      referenceImageRefs.push(rawImageUrl);
    }
    // Share the uploaded reference images across every variation in the batch.
    for (const variation of variationsToCreate) {
      variation.referenceImageRefs = referenceImageRefs;
    }

    // 4. Add the variation(s) to the canvas and save
    newTask.details.canvas.variations.push(...variationsToCreate);
    await newTask.save();
    taskPersisted = true;

    if (scopedIdempotencyKey) {
      const committed = await commitIdempotencyKey(
        scopedIdempotencyKey,
        idempotencyClaimToken,
        newTask._id.toString(),
      );
      if (!committed) {
        throw new Error('Failed to commit generation idempotency claim');
      }
      idempotencyCommitted = true;
    }

    const markVariationFailed = async (variation: any, message: string) => {
      variation.status = 'failed';
      variation.error = message;
      const result = await ClickatronTask.updateOne(
        { _id: newTask._id, 'details.canvas.variations.id': variation.id },
        {
          $set: {
            'details.canvas.variations.$.status': 'failed',
            'details.canvas.variations.$.error': message,
            'details.canvas.variations.$.updatedAt': new Date(),
          },
        },
      );
      if (result.matchedCount !== 1) {
        throw new Error(`Failed to persist terminal state for variation ${variation.id}`);
      }
    };

    // Only deduct credits and create jobs if it's NOT a blank project.
    if (!isBlankSession && !e2eMediaFixture) {
      // The batch check above is admission control. Billing and terminal state
      // are owned independently by each durable variation job.
      for (const variation of variationsToCreate) {
        const jobData = {
          userId,
          sessionId: newTask._id.toString(),
          variationId: variation.id,
          prompt: variation.prompt as string,
          modelId: variation.modelId as string,
          aspectRatio: variation.aspectRatio as string,
          referenceImageRefs,
          ...(variation.metadata ? { metadata: variation.metadata } : {}),
        };

        let jobId: string;
        try {
          jobId = await createJob(jobData);
        } catch (jobError) {
          console.error(`[Clickatron] Failed to create durable job for variation ${variation.id}:`, jobError);
          await markVariationFailed(variation, 'Failed to create generation job.');
          continue;
        }

        const charge = await CreditsService.deductCredits(
          userId,
          'clickatron',
          'variation',
          {
            model: variation.modelId as string,
            taskId: jobId,
            idempotencyKey: `clickatron:job:${jobId}:charge`,
          },
        );
        if (!charge.success || !charge.transactionId) {
          const failed = await failQueuedJob(jobId, {
            code: 'CREDIT_DEDUCTION_FAILED',
            message: charge.error || 'Credit deduction failed',
          });
          if (failed.outcome !== 'updated') {
            throw new Error(`Could not terminalize uncharged job ${jobId}`);
          }
          await markVariationFailed(variation, charge.error || 'Credit deduction failed.');
          continue;
        }

        const chargedCredits = charge.creditsDeducted;
        const chargeRecorded = await recordJobCreditTransaction(
          jobId,
          charge.transactionId,
          chargedCredits,
        );
        if (!chargeRecorded) {
          const failed = await failQueuedJob(jobId, {
            code: 'CREDIT_LEDGER_ATTACH_FAILED',
            message: 'Credit transaction could not be attached to the generation job',
          });
          if (failed.outcome !== 'updated') {
            throw new Error(`Could not terminalize job ${jobId} after ledger attach failure`);
          }
          const refund = await CreditsService.refundCredits(
            userId,
            chargedCredits,
            `Credit ledger attachment failed for variation ${variation.id}`,
            {
              service: 'clickatron',
              action: 'variation',
              originalTransactionId: charge.transactionId,
            },
          );
          if (!refund.success) {
            throw new Error(refund.error || `Failed to refund variation ${variation.id}`);
          }
          await markVariationFailed(variation, 'Failed to prepare generation billing.');
          continue;
        }

        try {
          await enqueueClickatronJob({ jobId, ...jobData });
        } catch (jobError) {
          console.error(`Failed to enqueue job for variation ${variation.id}:`, jobError);
          const failed = await failQueuedJob(jobId, {
            code: 'QUEUE_DISPATCH_FAILED',
            message: jobError instanceof Error ? jobError.message : 'Queue dispatch failed',
          });
          if (failed.outcome === 'updated') {
            const refund = await CreditsService.refundCredits(
              userId,
              chargedCredits,
              `Failed to dispatch generation job for variation ${variation.id}`,
              {
                service: 'clickatron',
                action: 'variation',
                originalTransactionId: charge.transactionId,
              },
            );
            if (!refund.success) {
              throw new Error(refund.error || `Failed to refund variation ${variation.id}`);
            }
            await markVariationFailed(variation, 'Failed to enqueue generation job.');
          } else if (
            failed.outcome === 'rejected'
            && (failed.job?.status === 'running' || failed.job?.status === 'completed')
          ) {
            console.warn(`[Clickatron] Dispatch acknowledgement failed after job ${jobId} was accepted; generation continues.`);
          } else if (failed.outcome === 'rejected' && failed.job) {
            await markVariationFailed(
              variation,
              failed.job.error?.message || 'Generation job is no longer active.',
            );
          } else {
            throw new Error(`Generation job ${jobId} disappeared during dispatch`);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      sessionId: newTask._id.toString(),
      variation: variationsToCreate[0],
      variations: variationsToCreate,
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
  } finally {
    if (
      scopedIdempotencyKey
      && ownsIdempotencyClaim
      && !idempotencyCommitted
      && !taskPersisted
    ) {
      try {
        await releaseIdempotencyKey(scopedIdempotencyKey, idempotencyClaimToken);
      } catch (releaseError) {
        console.error('[Clickatron] Failed to release idempotency claim:', releaseError);
      }
    }
  }
}
