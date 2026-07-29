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

// Hard upper bound on carousel slides we will fan out into variations/jobs.
// Source: product spec (max 7 slides per carousel). The ThinkForge writers and
// the creative contract do not cap slide count, so this route is the authority
// that clamps the batch — protecting the credit charge and the job queue from a
// runaway writer array. A value of 7 ← product requirement (P6 task brief).
const MAX_CAROUSEL_SLIDES = 7;

interface ParsedCarouselSlide {
  id?: string;
  title?: string;
  imagePrompt?: string;
}

interface CarouselParseResult {
  slides: ParsedCarouselSlide[];
  /**
   * True ONLY when the handoff explicitly declared kind:"carousel" but carried no
   * usable renderPlan.slides — an unambiguous broken carousel. The caller fails this
   * loud (422, no charge) instead of silently billing + generating a single image [R8].
   * A JSON-parse failure is NOT flagged here: we can't know a malformed blob was meant
   * to be a carousel, and a single-image request with junk metadata must still generate.
   */
  carouselWithoutSlides: boolean;
}

/**
 * Extract carousel slides from the session `metadata` form field.
 *
 * A ThinkForge carousel handoff embeds the resolved creative spec at
 * metadata.clickatron.creativeSpec; when its kind is "carousel" the per-slide
 * prompts live at renderPlan.slides. Returns the slides clamped to
 * MAX_CAROUSEL_SLIDES, or [] when this is not a carousel (single-image path).
 *
 * Never throws (a bad handoff can never 500 here). It surfaces an explicitly-broken
 * carousel via carouselWithoutSlides so the caller can fail loud rather than degrade
 * silently; all other malformed inputs fall back to the single-image path.
 */
function parseCarouselSlides(metadataField: FormDataEntryValue | null): CarouselParseResult {
  if (typeof metadataField !== 'string' || metadataField.trim() === '') return { slides: [], carouselWithoutSlides: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataField);
  } catch (parseErr) {
    // Ambiguous: we don't know this was a carousel, so degrade to single (still generates).
    console.error('[LOUDFAIL][Clickatron][CAROUSEL-PARSE-DEGRADED] session metadata failed to JSON.parse — falling back to SINGLE-image billing:', parseErr);
    return { slides: [], carouselWithoutSlides: false };
  }

  const creativeSpec = (parsed as any)?.clickatron?.creativeSpec;
  if (!creativeSpec || creativeSpec.kind !== 'carousel') return { slides: [], carouselWithoutSlides: false };

  const rawSlides = creativeSpec?.renderPlan?.slides;
  if (!Array.isArray(rawSlides) || rawSlides.length === 0) {
    // Unambiguous broken carousel: declared kind:"carousel" but no slides to fan out.
    console.error('[LOUDFAIL][Clickatron][CAROUSEL-EMPTY] spec.kind=carousel but renderPlan.slides missing/empty — failing loud (no charge):', { slides: rawSlides });
    return { slides: [], carouselWithoutSlides: true };
  }

  return {
    slides: rawSlides
      .slice(0, MAX_CAROUSEL_SLIDES)
      .map((slide: any): ParsedCarouselSlide => ({
        id: typeof slide?.id === 'string' ? slide.id : undefined,
        title: typeof slide?.title === 'string' ? slide.title : undefined,
        imagePrompt: typeof slide?.imagePrompt === 'string' ? slide.imagePrompt : undefined,
      })),
    carouselWithoutSlides: false,
  };
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
    if (carouselParse.carouselWithoutSlides) {
      // Loud fail instead of silently billing + generating ONE image for a carousel
      // whose slide plan was empty. Returns before the credit check => no charge. The
      // ThinkForge handoff dialog surfaces this error to the user. [R8]
      return NextResponse.json(
        {
          error: 'This carousel could not be built because its slide plan was empty, so no images were generated and you were not charged. Please re-send the carousel from ThinkForge.',
          code: 'CAROUSEL_NO_SLIDES',
        },
        { status: 422 },
      );
    }
    const carouselSlides = carouselParse.slides;
    const quantity = carouselSlides.length > 0 ? carouselSlides.length : 1;
    const referenceImages = formData.getAll('referenceImage') as File[];
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
    const creditCheck = await checkCredits(userId, 'clickatron', 'variation', {
      quantity,
      model: resolvedModel.modelId,
    });
    if (!creditCheck.allowed) {
      return creditCheck.errorResponse;
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
    // For a carousel handoff we fan out one variation per slide (already clamped
    // to MAX_CAROUSEL_SLIDES in parseCarouselSlides). Otherwise a single variation.
    const isCarousel = carouselSlides.length > 0;
    const variationsToCreate: any[] = [];

    if (isCarousel) {
      carouselSlides.forEach((slide, slideIndex) => {
        const slidePrompt = slide.imagePrompt || validatedData.prompt || 'New Slide';
        const slideMetadata = {
          ...creationMetadata,
          slideId: slide.id ?? `slide_${slideIndex + 1}`,
          slideIndex,
          ...(slide.title ? { slideTitle: slide.title } : {}),
          isCarouselSlide: true,
        };
        variationsToCreate.push({
          id: nanoid(),
          prompt: slidePrompt,
          // A carousel slide always has a prompt, so it never starts blank.
          status: 'generating',
          aspectRatio: validatedData.aspectRatio,
          modelId: validatedData.modelId,
          createdAt: new Date(),
          updatedAt: new Date(),
          fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
          imageRef: '',
          thumbnailRef: '',
          referenceImageRefs: [],
          metadata: slideMetadata,
        });
      });
    } else {
      variationsToCreate.push({
        id: nanoid(),
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
    if (!isBlankSession) {
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
