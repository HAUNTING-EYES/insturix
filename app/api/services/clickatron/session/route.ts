import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { CreateSessionRequestSchema, type ClickatronSourceContext } from '@/types/clickatron';
import { z } from 'zod';
import { ClickatronR2Manager } from '@/lib/clickatron-r2';
import { createJob, getIdempotencyKey, setIdempotencyKey } from '@/lib/clickatron-jobs';
import { enqueueClickatronJob } from '@/lib/clickatron-qtask';
import { nanoid } from 'nanoid';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { getCreditCost } from '@/lib/config/creditCosts';
import { CreditsService } from '@/lib/services/creditsService';
import { resolveClickatronModelForGeneration } from '@/lib/config/clickatron-models';

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

/**
 * Extract carousel slides from the session `metadata` form field.
 *
 * A ThinkForge carousel handoff embeds the resolved creative spec at
 * metadata.clickatron.creativeSpec; when its kind is "carousel" the per-slide
 * prompts live at renderPlan.slides. Returns the slides clamped to
 * MAX_CAROUSEL_SLIDES, or [] when this is not a carousel (single-image path).
 *
 * This is intentionally defensive: malformed/oversized metadata degrades to the
 * single-image path rather than throwing, so a bad handoff can never 500 here.
 */
function parseCarouselSlides(metadataField: FormDataEntryValue | null): ParsedCarouselSlide[] {
  if (typeof metadataField !== 'string' || metadataField.trim() === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataField);
  } catch (parseErr) {
    // LOUDFAIL: temporary loud logging for testing — remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md)
    console.error('[LOUDFAIL][Clickatron][CAROUSEL-PARSE-DEGRADED] session metadata failed to JSON.parse — falling back to SINGLE-image billing:', parseErr);
    return [];
  }

  const creativeSpec = (parsed as any)?.clickatron?.creativeSpec;
  if (!creativeSpec || creativeSpec.kind !== 'carousel') return [];

  const rawSlides = creativeSpec?.renderPlan?.slides;
  if (!Array.isArray(rawSlides) || rawSlides.length === 0) {
    // LOUDFAIL: temporary loud logging for testing — remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md)
    console.error('[LOUDFAIL][Clickatron][CAROUSEL-EMPTY] spec.kind=carousel but renderPlan.slides missing/empty — billing + generating as a SINGLE image:', { slides: rawSlides });
    return [];
  }

  return rawSlides
    .slice(0, MAX_CAROUSEL_SLIDES)
    .map((slide: any): ParsedCarouselSlide => ({
      id: typeof slide?.id === 'string' ? slide.id : undefined,
      title: typeof slide?.title === 'string' ? slide.title : undefined,
      imagePrompt: typeof slide?.imagePrompt === 'string' ? slide.imagePrompt : undefined,
    }));
}

// POST /api/services/clickatron/session - Create new session and generate the first variation (or N carousel slides)
export async function POST(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Idempotency check MUST run before any credit deduction or task creation so a
  // retried request (double-click / client retry) with the same Idempotency-Key
  // returns the already-created session instead of creating a duplicate task and
  // charging again. The stored value is the sessionId of the originally created task.
  // (The credit check itself runs inside the try below, where the carousel slide
  // count is known so the per-slide quantity multiplier can be applied.)
  const idempotencyKey = request.headers.get('Idempotency-Key');
  if (idempotencyKey) {
    try {
      const existingSessionId = await getIdempotencyKey(idempotencyKey);
      if (existingSessionId) {
        await getClickatronDb();
        const existingTask = await ClickatronTask.findOne({ _id: existingSessionId, clerkUserId: userId });
        if (existingTask) {
          // Carousel-aware: return the full variation set, not just the first slide.
          const existingVariations = existingTask.details?.canvas?.variations ?? [];
          return NextResponse.json({
            success: true,
            sessionId: existingSessionId,
            variation: existingVariations[0],
            variations: existingVariations,
          });
        }
      }
    } catch (idemError) {
      // Fail open to normal creation (worst case = pre-existing behavior). Never
      // block a paid request on the idempotency cache, but surface the error.
      console.error('[Clickatron] Idempotency lookup failed, proceeding without it:', idemError);
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
    const carouselSlides = parseCarouselSlides(formData.get('metadata'));
    const quantity = carouselSlides.length > 0 ? carouselSlides.length : 1;
    const referenceImages = formData.getAll('referenceImage') as File[];
    const rawAspectRatio = formData.get('aspectRatio') || '16:9';
    const resolvedModel = resolveClickatronModelForGeneration({
      requestedModelId: formData.get('modelId') as string | null,
      context: 'newVariation',
      referenceImageCount: referenceImages.length,
      aspectRatio: typeof rawAspectRatio === 'string' ? rawAspectRatio : String(rawAspectRatio),
    });
    if (resolvedModel.reason === 'aspect-ratio-fallback') {
      console.warn('[Clickatron] Model switched for aspect-ratio compatibility:', {
        requestedModelId: resolvedModel.requestedModelId,
        selectedModelId: resolvedModel.modelId,
        aspectRatio: rawAspectRatio,
      });
    }

    // Check credits (3 credits per variation, multiplied by the slide quantity)
    const creditCheck = await checkCredits(userId, 'clickatron', 'variation', { quantity, model: resolvedModel.modelId });
    if (!creditCheck.allowed) {
      return creditCheck.errorResponse;
    }

    const validatedData = CreateSessionRequestSchema.parse({
      prompt: formData.get('prompt') || '',
      aspectRatio: rawAspectRatio,
      modelId: resolvedModel.modelId,
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

    // A carousel never counts as a blank project (every slide has a prompt).
    const isBlankSession = isBlankProject && !isCarousel;

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

    // Only deduct credits and create jobs if it's NOT a blank project.
    if (!isBlankSession) {
      // 5. Deduct credits once for the whole batch (cost already = quantity * baseCost).
      await creditCheck.deduct();

      // Per-slide refund unit (3 credits). A mid-batch enqueue failure must refund
      // ONLY the failed slide, not the whole batch — earlier slides already enqueued
      // and will generate (and bill). We also mark the failed slide 'failed' so the
      // stuck-slide watchdog (which only refunds 'generating' slides) never refunds
      // it again: every slide is refunded by exactly one mechanism, never both.
      const refundPerSlide = getCreditCost('clickatron', 'variation', {});

      // 6. Create and Enqueue one Generation Job per variation. Best-effort: a single
      // slide's failure fails+refunds that slide and continues, rather than aborting
      // the whole carousel.
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

        console.log('Creating job for variation:', variation.id);
        const jobId = await createJob(jobData);

        try {
          console.log('Enqueuing job with ID:', jobId);
          await enqueueClickatronJob({ jobId, ...jobData });
        } catch (jobError) {
          console.error(`Failed to enqueue job for variation ${variation.id}:`, jobError);
          // Fail this slide (in-memory so the response reflects it, and in the DB so
          // the watchdog skips it), then refund ONLY this slide.
          variation.status = 'failed';
          variation.error = 'Failed to enqueue generation job.';
          if (refundPerSlide > 0) {
            try {
              await CreditsService.refundCredits(
                userId,
                refundPerSlide,
                `Failed to enqueue generation job for variation ${variation.id}`,
                { service: 'clickatron', action: 'variation' },
              );
            } catch (refundError) {
              // LOUDFAIL: temporary loud logging for testing — remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md)
              console.error('[LOUDFAIL][Clickatron][REFUND-FAILED][MONEY-LOSS] user CHARGED but NOT refunded; watchdog cannot recover (slide already marked failed):', { userId, sessionId: newTask._id.toString(), variationId: variation.id, amount: refundPerSlide, refundError });
            }
          }
          try {
            await ClickatronTask.updateOne(
              { _id: newTask._id, 'details.canvas.variations.id': variation.id },
              {
                $set: {
                  'details.canvas.variations.$.status': 'failed',
                  'details.canvas.variations.$.error': 'Failed to enqueue generation job.',
                  'details.canvas.variations.$.updatedAt': new Date(),
                },
              },
            );
          } catch (markError) {
            // LOUDFAIL: temporary loud logging for testing — remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md)
            console.error('[LOUDFAIL][Clickatron][MARK-FAILED][DOUBLE-REFUND-RISK] slide stayed generating after in-memory refund; watchdog may refund it AGAIN:', { userId, sessionId: newTask._id.toString(), variationId: variation.id, markError });
          }
          // Continue to the next slide — do not abort the whole batch.
        }
      }
    }

    // Persist the idempotency key -> sessionId mapping so a retried request with
    // the same key returns this session instead of creating a duplicate + charging
    // again. Set for both blank (no charge) and non-blank paths once the task
    // exists. A Redis write failure must not fail an already-successful (and
    // already-charged) request, so it is logged but not thrown.
    if (idempotencyKey) {
      try {
        await setIdempotencyKey(idempotencyKey, newTask._id.toString());
      } catch (idemError) {
        // LOUDFAIL: temporary loud logging for testing — remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md)
        console.error('[LOUDFAIL][Clickatron][IDEMPOTENCY-PERSIST-FAILED][DUP-CHARGE-RISK] key->session not stored; a retry will create + charge a duplicate:', { idempotencyKey, sessionId: newTask._id.toString(), idemError });
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
  }
}
