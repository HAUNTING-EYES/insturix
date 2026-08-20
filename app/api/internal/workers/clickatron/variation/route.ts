import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import {
  claimJobForExecution,
  completeJob,
  failJob,
  failQueuedJob,
  getJob,
  getJobCreditTransaction,
} from '@/lib/clickatron-jobs';
import { ClickatronR2Manager } from '@/lib/clickatron-r2';
import { z } from 'zod';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextResponse } from 'next/server';
import { Variation } from '@/types/clickatron';
import { fal } from "@fal-ai/client";
import {
  CLICKATRON_MODELS,
  generateModelPayload,
  modelSupportsAspectRatio,
  modelSupportsSeed,
  processParentVariationImage,
  processReferenceImages,
  resolveClickatronModelForGeneration,
} from '@/lib/config/clickatron-models';
import { getCreditCost } from '@/lib/config/creditCosts';
import { CreditsService } from '@/lib/services/creditsService';
import { recordProviderCostEvent } from '@/lib/financials/provider-cost-events';
import {
  buildClickatronGenerationPrompt,
  resolveClickatronBrandContextBlock,
  resolveClickatronPromptBrandId,
} from '@/lib/clickatron/brand-prompt-context';
import {
  resolveClickatronBrandReferenceEvidence,
  selectClickatronGenerationBrandEvidence,
} from '@/lib/clickatron/brand-reference-images';
import { resolveClickatronImageGeometry } from '@/lib/clickatron/image-geometry';
import sharp from 'sharp';

// Configure Fal AI client
if (process.env.FAL_AI_API_KEY) {
  fal.config({
    credentials: process.env.FAL_AI_API_KEY,
  });
}

// Vercel function timeout. Fal image generation runs ~20-40s inside fal.subscribe
// below; without this the route runs at the platform default (~10-15s) and gets
// killed mid-generation, leaving the variation stuck "generating" while Fal still
// bills the image. 300s matches the sibling generation workers
// (pipeline/storyboard-image, pipeline/video, director, asset-analysis).
export const maxDuration = 300;

const workerRequestSchema = z.object({
  jobId: z.string(),
  sessionId: z.string(),
  variationId: z.string(),
  prompt: z.string(),
  userId: z.string(),
  parentVariationId: z.string().optional(),
  modelId: z.string().optional(),
  fineTuning: z.object({
    brightness: z.number(),
    contrast: z.number(),
    saturation: z.number(),
  }).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
      referenceImageRefs: z.array(z.string()).optional(), // R2 URIs of reference images
  aspectRatio: z.string().optional(),
  maskUrl: z.string().optional(), // R2 URI for generative fill mask
});

function asPromptMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getClickatronVariationRefundAmount(modelId?: string): number {
  return getCreditCost('clickatron', 'variation', { model: modelId });
}

type ClickatronCostJob = NonNullable<Awaited<ReturnType<typeof getJob>>>;

async function refundClaimedJob(
  job: ClickatronCostJob,
  reason: string,
  modelId?: string,
): Promise<void> {
  const ledger = getJobCreditTransaction(job);
  const amount = ledger.chargedCredits
    ?? getClickatronVariationRefundAmount(modelId || job.modelId);
  if (amount <= 0) return;

  const refund = await CreditsService.refundCredits(
    job.userId,
    amount,
    reason,
    {
      service: 'clickatron',
      action: 'variation',
      originalTransactionId: ledger.transactionId,
    },
  );
  if (!refund.success) {
    throw new Error(refund.error || `Failed to refund Clickatron job ${job.id}`);
  }
}

/**
 * Persist fields onto ONE variation atomically (positional $ + $elemMatch), never by
 * saving the whole task document. [R7]
 *
 * WHY: carousel fan-out runs N workers concurrently against the SAME session document.
 * Each used to load the doc at start, mutate its own variation, and task.save() the
 * whole doc — a classic lost-update race: the last writer's stale copy overwrote every
 * sibling's completion (verified in prod logs 2026-07-05: 6/6 slides generated and
 * uploaded to R2, but only the LAST worker's save survived; 5 completed slides were
 * reverted to 'generating' and later watchdog-failed). Single images never trip this
 * (one writer). This mirrors the already-correct pattern in
 * app/api/cron/check-task-timeouts (updateOne + $elemMatch + positional $).
 *
 * Returns false (and logs loud) when nothing matched — e.g. the variation was deleted
 * mid-generation; callers decide whether that is fatal.
 */
async function persistVariationFieldsAtomic(
  sessionId: string,
  variationId: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  if (!Types.ObjectId.isValid(sessionId)) {
    console.error('Worker: atomic variation update skipped; invalid sessionId:', sessionId);
    return false;
  }
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) $set[`details.canvas.variations.$.${key}`] = value;
  }
  const result = await ClickatronTask.updateOne(
    {
      _id: new Types.ObjectId(sessionId),
      'details.canvas.variations': { $elemMatch: { id: variationId } },
    },
    { $set },
  );
  if (result.matchedCount === 0) {
    console.error('Worker: atomic variation update matched nothing (variation deleted mid-run?):', { sessionId, variationId });
    return false;
  }
  return true;
}

async function markVariationFailedForJob(job: ClickatronCostJob, errorMessage: string): Promise<void> {
  try {
    await getClickatronDb();
    await persistVariationFieldsAtomic(job.sessionId, job.variationId, {
      status: 'failed',
      error: errorMessage,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Worker: Failed to mark Clickatron variation failed for job:', job.id, error);
  }
}

/**
 * Unified inline failure for an already-loaded worker task/variation.
 * Every early-return rejection in the handler routes through this so a failure
 * ALWAYS (a) fails the job, (b) persists variation.error (so the UI can show the
 * real reason), and (c) refunds the model-aware credit cost. This closes the old
 * gap [R3] where early returns marked the variation failed but set no error and
 * issued no refund => silent credit loss + an undiagnosable "Image generation
 * failed". The refund mirrors the deduction (same getCreditCost model multiplier)
 * and is idempotent: it is skipped when the variation was already terminal, so a
 * QStash redelivery re-entering the same deterministic reject cannot double-refund.
 */
async function failVariationInline(
  activeJobId: string,
  variation: Variation,
  job: ClickatronCostJob,
  { code, message, refund = true }: { code: string; message: string; refund?: boolean },
): Promise<void> {
  const failedJob = await failJob(activeJobId, { code, message });
  if (!failedJob) return;
  try {
    // Keep the in-memory copy consistent for downstream reads, but persist atomically
    // (positional $) — never task.save(), which loses sibling carousel slides. [R7]
    variation.status = 'failed';
    variation.error = message;
    variation.updatedAt = new Date();
    await persistVariationFieldsAtomic(job.sessionId, variation.id, {
      status: 'failed',
      error: message,
      modelId: variation.modelId,
    });
  } catch (saveError) {
    console.error('Worker: Failed to persist inline variation failure:', saveError);
  }
  if (refund) {
    try {
      await refundClaimedJob(
        failedJob,
        `Variation generation failed: ${message}`,
        variation.modelId,
      );
    } catch (refundError) {
      console.error('Worker: Failed to refund after inline failure, user:', job.userId, refundError);
    }
  }
}

function getFalProviderJobId(result: any): string | undefined {
  return result?.request_id ?? result?.requestId ?? result?.data?.request_id ?? result?.data?.requestId;
}

function getFalImageCount(result: any): number | undefined {
  const count = Array.isArray(result?.data?.images) ? result.data.images.length : undefined;
  return count && count > 0 ? count : undefined;
}

function getClickatronCostModel(job: ClickatronCostJob, variation?: Variation): string | undefined {
  return variation?.modelId || job.modelId;
}

async function recordClickatronFalProviderCost({
  job,
  variation,
  status,
  result,
  error,
  chargedCredits,
}: {
  job: ClickatronCostJob;
  variation?: Variation;
  status: 'success' | 'failed';
  result?: any;
  error?: unknown;
  chargedCredits?: number;
}): Promise<void> {
  await recordProviderCostEvent({
    eventId: `pce_clickatron_fal_${job.id}_${status}`,
    idempotencyKey: `clickatron:variation:${job.id}:fal:${status}`,
    status,
    userId: job.userId,
    taskId: job.id,
    assetId: job.variationId,
    service: 'clickatron',
    action: 'variation',
    route: '/api/internal/workers/clickatron/variation',
    provider: 'fal-ai',
    model: getClickatronCostModel(job, variation),
    operation: 'image_generation',
    chargedCredits,
    providerJobId: getFalProviderJobId(result),
    units: {
      imageCount: getFalImageCount(result),
      requestCount: 1,
    },
    metadata: {
      sessionId: job.sessionId,
      variationId: job.variationId,
      parentVariationId: job.parentVariationId,
      referenceImageCount: job.referenceImageRefs?.length,
      falImageCount: getFalImageCount(result),
      errorClass: error instanceof Error ? error.name : undefined,
    },
  });
}

async function recordClickatronR2StorageCost({
  job,
  imageBytes,
  thumbnailBytes,
}: {
  job: ClickatronCostJob;
  imageBytes: number;
  thumbnailBytes: number;
}): Promise<void> {
  await recordProviderCostEvent({
    eventId: `pce_clickatron_r2_${job.id}_success`,
    idempotencyKey: `clickatron:variation:${job.id}:r2:success`,
    status: 'success',
    userId: job.userId,
    taskId: job.id,
    assetId: job.variationId,
    service: 'clickatron',
    action: 'variation',
    route: '/api/internal/workers/clickatron/variation',
    provider: 'cloudflare-r2',
    operation: 'storage',
    units: {
      storageBytes: imageBytes + thumbnailBytes,
      bytesIn: imageBytes + thumbnailBytes,
      requestCount: 2,
    },
    metadata: {
      sessionId: job.sessionId,
      variationId: job.variationId,
      imageBytes,
      thumbnailBytes,
      objectCount: 2,
    },
  });
}
async function handler(req: Request) {
  let jobId: string | undefined;
  let claimedJob: ClickatronCostJob | undefined;

  try {
    const body = await req.json();

    // Extract jobId early for error handling
    jobId = body.jobId;

    const {
      jobId: parsedJobId,
      sessionId: requestSessionId,
      variationId: requestVariationId,
      userId: requestUserId,
    } = workerRequestSchema.parse(body);
    const activeJobId: string = parsedJobId;
    jobId = activeJobId; // Preserve for outer error handling.
    const claim = await claimJobForExecution(activeJobId, 'generating');
    if (claim.outcome === 'missing' || !claim.job) {
      console.error('Worker: Job not found for jobId:', activeJobId);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (claim.outcome === 'rejected') {
      return NextResponse.json({
        success: true,
        skipped: true,
        status: claim.job.status,
      });
    }
    const job = claim.job;
    claimedJob = job;

    if (
      requestSessionId !== job.sessionId
      || requestVariationId !== job.variationId
      || requestUserId !== job.userId
    ) {
      const failedJob = await failJob(activeJobId, {
        code: 'JOB_PAYLOAD_MISMATCH',
        message: 'Worker payload does not match the durable job identity',
      });
      if (failedJob) {
        await markVariationFailedForJob(failedJob, 'Generation job payload was invalid.');
        await refundClaimedJob(failedJob, 'Clickatron worker payload identity mismatch');
      }
      return NextResponse.json({ error: 'Job payload mismatch' }, { status: 400 });
    }

    const sessionId = job.sessionId;
    const variationId = job.variationId;
    await getClickatronDb();
    const objectId = new Types.ObjectId(sessionId);
    const task = await ClickatronTask.findById(objectId);
    if (!task || !task.details.canvas) {
      console.error('Worker: Task or canvas not found for sessionId:', sessionId);
      const failedJob = await failJob(activeJobId, {
        code: 'TASK_NOT_FOUND',
        message: 'Task or canvas not found',
      });
      if (failedJob) {
        await refundClaimedJob(failedJob, 'Clickatron task or canvas was not found');
      }
      return NextResponse.json({ error: 'Task or canvas not found' }, { status: 404 });
    }

    // Validate job ownership
    if (job.userId !== task.clerkUserId) {
      console.error('Worker: Job ownership validation failed', { jobUserId: job.userId, taskUserId: task.clerkUserId });
      const failedJob = await failJob(activeJobId, {
        code: 'UNAUTHORIZED',
        message: 'Job ownership validation failed',
      });
      if (failedJob) {
        await refundClaimedJob(failedJob, 'Clickatron job ownership validation failed');
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const variation = task.details.canvas.variations.find((v: Variation) => v.id === variationId);
    if (!variation) {
      console.error('Worker: Variation not found - likely deleted');
      const failedJob = await failJob(activeJobId, {
        code: 'VARIATION_DELETED',
        message: 'Variation was deleted before processing',
      });
      if (failedJob) {
        await refundClaimedJob(failedJob, 'Clickatron variation was deleted before processing');
      }
      return NextResponse.json({ error: 'Variation not found' }, { status: 404 });
    }

    // Check if Fal AI is configured
    if (!process.env.FAL_AI_API_KEY) {
      console.error('Worker: Fal AI API key not configured');
      await failVariationInline(activeJobId, variation, job, {
        code: 'FAL_AI_NOT_CONFIGURED',
        message: 'Image generation is temporarily unavailable (provider not configured).',
      });
      return NextResponse.json({ error: 'Fal AI not configured' }, { status: 500 });
    }

    let falResult: any;
    let falCallAttempted = false;
    let falCostRecorded = false;

    try {
      const requestedGeometry = resolveClickatronImageGeometry(variation.aspectRatio);
      const { ratio } = requestedGeometry;
      let { width, height } = requestedGeometry;

      // Prepare generation parameters
      const generationParams: any = {
        prompt: job.prompt,
        // Note: image_size is not added by default, it will be handled model-specifically
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        // CRITICAL: Ensure safety checker is explicitly false by default to avoid "Adjust Prompt" errors
        enable_safety_checker: false,
        output_format: "jpeg",
        seed: Math.floor(Math.random() * 1000000),
      };

      // Process parent variation image if it exists (for image-to-image)
      const parentImageUrl = await processParentVariationImage(body.parentVariationId, task.details.canvas.variations, ClickatronR2Manager);
      
      // Validate parent image URL for generative fill
      if (body.maskUrl && parentImageUrl) {
        try {
          const imageResponse = await fetch(parentImageUrl, { method: 'HEAD' });
          if (!imageResponse.ok) {
            console.error('Worker: Parent image URL is not accessible:', imageResponse.status, imageResponse.statusText);
            throw new Error(`Cannot access parent variation image. The image may have been deleted or expired. Status: ${imageResponse.status}`);
          }
        } catch (error) {
          console.error('Worker: Failed to validate parent image URL:', error);
          throw new Error(`Something went wrong. Cannot access the source image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // Process reference images from job payload if they exist (for image-to-image)
      const referenceImageUrls = await processReferenceImages(body.referenceImageRefs, ClickatronR2Manager);

      // Check if this is a sketch-to-edit job
      const isSketchToEdit = body.metadata?.inputMode === 'sketchToEdit';
      // For sketch-to-edit, we need both original (img1) and annotated (img2) images
      if (isSketchToEdit && referenceImageUrls.length > 0) {
        // Add system prompt for sketch-to-edit if not already in prompt
        const systemPrompt = "Make changes according to the annotations and instructions in the second image. Apply the edits from img2 to img1 without changing other details, objects, quality, lighting, composition, or unrelated elements. Preserve original quality and data.";
        if (job.prompt && !job.prompt.includes(systemPrompt)) {
          job.prompt = `${job.prompt}\n\n${systemPrompt}`;
        } else if (!job.prompt) {
          job.prompt = systemPrompt;
        }
      }

      const promptMetadata = {
        ...asPromptMetadataRecord(task.metadata),
        ...asPromptMetadataRecord(job.metadata),
        ...asPromptMetadataRecord(variation.metadata),
      };
      const promptBrandId = resolveClickatronPromptBrandId(task.brandId, promptMetadata);
      const rawGenerationPrompt = job.prompt;
      // Org-scope the brand resolution (Phase A.3) â€” task carries orgId on ClickatronTask.
      const brandContextBlock = await resolveClickatronBrandContextBlock(
        job.userId,
        promptBrandId,
        undefined,
        task.orgId ?? null,
      );

      // Process mask URL if it exists (for inpainting/generative fill)
      let maskUrl: string | null = null;
      if (body.maskUrl) {
        try {
          // If it's a raw R2 URL (not containing signature parameters), get a fresh signed URL
          if (body.maskUrl && !body.maskUrl.includes('GoogleAccessId') &&
            !body.maskUrl.includes('Signature')) {
            maskUrl = await ClickatronR2Manager.getSignedUrl(body.maskUrl);
          } else {
            maskUrl = body.maskUrl;
          }
        } catch (error) {
          console.error('Worker: Failed to process mask URL:', error);
          throw new Error(`Failed to process mask URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Combine parent image and reference images into generation parameters.
      // Always use image_urls internally for consistency.
      const imageUrls: string[] = [];
      if (parentImageUrl) {
        imageUrls.push(parentImageUrl);
      }
      imageUrls.push(...referenceImageUrls);

      const brandReferenceResolution = await resolveClickatronBrandReferenceEvidence({
        userId: job.userId,
        brandId: promptBrandId,
        metadata: promptMetadata,
        prompt: rawGenerationPrompt,
        orgId: task.orgId ?? null,
      });

      if (brandReferenceResolution.needsUserInput) {
        const message = brandReferenceResolution.needsUserInputReason
          ?? 'needs_user_input: Brand Vault logo evidence is required before generation.';
        variation.metadata = {
          ...(variation.metadata ?? {}),
          needsUserInput: {
            code: 'missing_brand_logo_evidence',
            assetRole: 'logo',
            message,
          },
          brandReferenceEvidence: {
            intent: brandReferenceResolution.intent,
            evidence: [],
          },
        };
        const needsInputError = new Error(message) as Error & { code?: string };
        needsInputError.code = 'NEEDS_USER_INPUT';
        throw needsInputError;
      }

      // A logo must NOT be seeded as a generation reference on a fresh text-to-image job.
      // Doing so inflates the reference-image count, which forces the model resolver into
      // image-to-image mode (models.ts: referenceImageCount > 0 => 'image-to-image') and makes
      // the model "edit the logo" — or get rejected against a maxImages:0 text-to-image model.
      // This is a top cause of branded "no image". The locked brand mark belongs on the
      // editable overlay layer, so only pass the logo to the model when there is already an
      // image context (parent or user reference images) that resolves to a reference-accepting
      // edit/compose model. Product seeding on a blank canvas is intentional (product-mockup
      // i2i) and is left unchanged.
      // TODO(Phase 2): when the model roster/adapters land, route fresh brand-reference
      // composition to a compose model (nano-banana-pro/edit, seedream edit) instead of
      // dropping the logo to an overlay.
      const brandReferenceEvidence = selectClickatronGenerationBrandEvidence(
        brandReferenceResolution,
        {
          hasParentImage: Boolean(parentImageUrl),
          userReferenceImageCount: referenceImageUrls.length,
        },
      );

      if (brandReferenceEvidence.length > 0) {
        imageUrls.push(...brandReferenceEvidence.map((item) => item.url));
        generationParams.brandReferenceEvidence = brandReferenceEvidence;
        if (brandReferenceEvidence.some((item) => item.assetRole === 'logo')) {
          generationParams.logoReferencePolicy = 'brand_vault_reference_required';
        }
      }

      const enrichedPrompt = buildClickatronGenerationPrompt({
        prompt: rawGenerationPrompt,
        metadata: promptMetadata,
        brandContextBlock,
        // The model was selected and billed before the worker was dispatched.
        modelId: variation.modelId || job.modelId,
        aspectRatio: ratio,
        logoEvidenceAvailable: brandReferenceEvidence.some((item) => item.assetRole === 'logo'),
        generationMode: maskUrl
          ? 'inpainting'
          : imageUrls.length > 0
            ? 'image-to-image'
            : 'text-to-image',
      });
      job.prompt = enrichedPrompt;
      generationParams.prompt = enrichedPrompt;
      generationParams.promptContextApplied = enrichedPrompt !== rawGenerationPrompt;

      // Only add image_urls to generationParams if we have images
      if (imageUrls.length > 0) {
        generationParams.image_urls = imageUrls;
      }

      // Add mask URL for inpainting models
      if (maskUrl) {
        generationParams.mask_url = maskUrl;
        // For Seedream inpainting, keep image_urls as array (don't convert to single image_url)
        // The payload generator will handle the array format
        if (imageUrls.length === 0) {
          console.error('Worker: Inpainting requires an image but no parent image was found!');
          throw new Error('Inpainting requires a parent image');
        }
      }

      // Get the model configuration from the variation
      const selectedModelId = variation.modelId || job.modelId || '';

      // Validate URLs before passing to Fal AI (especially for inpainting)
      if (generationParams.image_url) {
        try {
          const imageResponse = await fetch(generationParams.image_url, { method: 'HEAD' });
          if (!imageResponse.ok) {
            console.warn(`Worker: Image URL returned non-200 status: ${imageResponse.status} ${imageResponse.statusText}. Fal AI might still be able to access it.`);
          }
        } catch (error) {
          console.warn('Worker: Failed to validate image_url (network error?). Proceeding anyway.', error);
        }
      }

      if (generationParams.mask_url) {
        try {
          const maskResponse = await fetch(generationParams.mask_url, { method: 'HEAD' });
          if (!maskResponse.ok) {
            console.warn(`Worker: Mask URL returned non-200 status: ${maskResponse.status} ${maskResponse.statusText}. Fal AI might still be able to access it.`);
          }
        } catch (error) {
          console.warn('Worker: Failed to validate mask_url (network error?). Proceeding anyway.', error);
        }
      }

      // Count the number of reference images
      let referenceImageCount = 0;
      if (generationParams.image_url) {
        // For single image URL
        referenceImageCount = 1;
      } else if (Array.isArray(generationParams.image_urls)) {
        // For array of image URLs
        referenceImageCount = generationParams.image_urls.length;
      }


      const hasParentImageForGeneration = Boolean(parentImageUrl);
      const resolverReferenceImageCount = hasParentImageForGeneration
        ? Math.max(0, referenceImageCount - 1)
        : referenceImageCount;
      const resolutionContext = hasParentImageForGeneration ? 'edit' : 'newVariation';
      const resolvedModel = !maskUrl
        ? resolveClickatronModelForGeneration({
            requestedModelId: selectedModelId,
            context: resolutionContext,
            referenceImageCount: resolverReferenceImageCount,
            hasParentImage: hasParentImageForGeneration,
            aspectRatio: ratio,
          })
        : undefined;

      if (resolvedModel && resolvedModel.modelId !== selectedModelId) {
        const message = `Generation inputs changed after billing; expected model ${selectedModelId}, resolved ${resolvedModel.modelId}.`;
        console.error('Worker: Generation preflight drift detected:', {
          billedModelId: selectedModelId,
          executionModelId: resolvedModel.modelId,
          aspectRatio: ratio,
          referenceImageCount,
        });
        await failVariationInline(activeJobId, variation, job, {
          code: 'MODEL_PREFLIGHT_DRIFT',
          message,
        });
        return NextResponse.json(
          { error: message, code: 'MODEL_PREFLIGHT_DRIFT' },
          { status: 409 },
        );
      }

      const modelConfig = CLICKATRON_MODELS[selectedModelId];

      if (!modelConfig) {
        console.error('Worker: Model configuration not found for modelId:', selectedModelId);
        await failVariationInline(activeJobId, variation, job, {
          code: 'MODEL_NOT_FOUND',
          message: `Selected image model is unavailable (${selectedModelId}).`,
        });
        return NextResponse.json({ error: 'Model configuration not found' }, { status: 400 });
      }

      if (!modelSupportsAspectRatio(modelConfig, ratio)) {
        console.error('Worker: Selected model does not support aspect ratio:', { modelId: selectedModelId, ratio });
        throw new Error(`${modelConfig.name} does not support aspect ratio ${ratio}`);
      }

      ({ width, height } = resolveClickatronImageGeometry(
        ratio,
        modelConfig.constraints.customImageLongEdge,
      ));

      // Validate that the selected model supports the number of reference images
      const minImages = modelConfig.constraints?.minImages ?? 0;
      const maxImages = modelConfig.constraints?.maxImages ?? 0;

      if (referenceImageCount < minImages || referenceImageCount > maxImages) {
        console.error('Worker: Selected model does not support the number of reference images:', referenceImageCount);
        await failVariationInline(activeJobId, variation, job, {
          code: 'INVALID_MODEL',
          message: `Selected model ${selectedModelId} does not support ${referenceImageCount} reference image(s).`,
        });
        return NextResponse.json({ error: `Selected model ${selectedModelId} does not support ${referenceImageCount} reference images` }, { status: 400 });
      }

      // Use the model ID directly (already includes 'fal-ai/' prefix)
      let modelId = modelConfig.id;

      // Map legacy IDs to valid endpoints
      if (modelId === 'fal-ai/flux/dev/inpainting') {
        modelId = 'fal-ai/flux-general/inpainting';
      } else if (modelId === 'fal-ai/flux-kontext/dev/inpainting') {
        // Map to Flux General/Dev Inpainting which allows disabling safety checker
        modelId = 'fal-ai/flux-general/inpainting';
      } else if (modelId === 'fal-ai/stable-diffusion-inpainting') {
        // Explicitly map stable diffusion legacy ID to Flux Pro Fill for better results if desired, 
        // or keep it if it's handled. For now let's map it to Flux Pro Fill as done before.
        modelId = 'fal-ai/flux-pro/v1/fill';
      }



      // Determine if this is an image-to-image generation
      const isImageToImage = !!generationParams.image_url;

      // Validate image URL accessibility before making the API call
      if (isImageToImage && generationParams.image_url) {
        try {
          const imageResponse = await fetch(generationParams.image_url, {
            method: 'HEAD'
          });

          if (!imageResponse.ok) {
            console.error('Worker: Image URL returned non-200 status:', imageResponse.status, imageResponse.statusText);

            // If this is a URL that might have expired, try to regenerate the signed URL
                if (generationParams.image_url && !generationParams.image_url.includes('GoogleAccessId') &&
                  !generationParams.image_url.includes('Signature')) {
              try {
                // Extract the base URL (without signature parameters)
                const urlObj = new URL(generationParams.image_url);
                const baseUrl = `${urlObj.origin}${urlObj.pathname}`;

                // Get a fresh signed URL
                const freshSignedUrl = await ClickatronR2Manager.getSignedUrl(baseUrl);

                // Update the generation parameters with the fresh URL
                generationParams.image_url = freshSignedUrl;

                // Test the fresh URL
                const freshResponse = await fetch(freshSignedUrl, { method: 'HEAD' });

                if (!freshResponse.ok) {
                  throw new Error(`Fresh image URL also returned status ${freshResponse.status}: ${freshResponse.statusText}`);
                }
              } catch (regenError) {
                console.error('Worker: Failed to regenerate signed URL:', regenError);
                throw new Error(`Cannot access reference image: ${regenError instanceof Error ? regenError.message : 'Unknown error'}`);
              }
            } else {
              throw new Error(`Image URL returned status ${imageResponse.status}: ${imageResponse.statusText}`);
            }
          }

        } catch (error) {
          console.error('Worker: Failed to access image URL:', error);
          throw new Error(`Cannot access reference image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Validate image URLs accessibility for models that use image_urls array
      if (generationParams.image_urls && Array.isArray(generationParams.image_urls)) {
        try {
          for (let i = 0; i < generationParams.image_urls.length; i++) {
            const imageUrl = generationParams.image_urls[i];
            const imageResponse = await fetch(imageUrl, {
              method: 'HEAD'
            });

            if (!imageResponse.ok) {
              console.error(`Worker: Image URL ${i + 1} returned non-200 status:`, imageResponse.status, imageResponse.statusText);

            // If this is a URL that might have expired, try to regenerate the signed URL
              if (imageUrl.includes('X-Amz-Algorithm=') || imageUrl.includes('X-Amz-Signature=') || imageUrl.includes('r2.cloudflarestorage.com')) {
                try {
                // Extract the base URL (without signature parameters)
                  const urlObj = new URL(imageUrl);
                  const baseUrl = `${urlObj.origin}${urlObj.pathname}`;

                  // Get a fresh signed URL
                  const freshSignedUrl = await ClickatronR2Manager.getSignedUrl(baseUrl);

                  // Update the generation parameters with the fresh URL
                  generationParams.image_urls[i] = freshSignedUrl;

                  // Test the fresh URL
                  const freshResponse = await fetch(freshSignedUrl, { method: 'HEAD' });

                  if (!freshResponse.ok) {
                    throw new Error(`Fresh image URL ${i + 1} also returned status ${freshResponse.status}: ${freshResponse.statusText}`);
                  }
                } catch (regenError) {
                  console.error(`Worker: Failed to regenerate signed URL for image ${i + 1}:`, regenError);
                  throw new Error(`Cannot access reference image ${i + 1}: ${regenError instanceof Error ? regenError.message : 'Unknown error'}`);
                }
              } else {
                throw new Error(`Image URL ${i + 1} returned status ${imageResponse.status}: ${imageResponse.statusText}`);
              }
            }
          }
        } catch (error) {
          console.error('Worker: Failed to access image URLs:', error);
          throw new Error(`Cannot access reference images: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Construct the payload dynamically based on the model configuration
      const payload = generateModelPayload(modelConfig.id, generationParams, job, ratio, width, height);
      const payloadPrompt = typeof payload.prompt === 'string' ? payload.prompt : '';
      const modelPromptLimit = modelConfig.constraints.promptMaxLength;
      if (modelPromptLimit !== undefined && payloadPrompt.length > modelPromptLimit) {
        const promptLimitError = new Error(
          `Prompt compiler produced ${payloadPrompt.length} characters for ${modelConfig.id}, exceeding its ${modelPromptLimit}-character limit.`,
        ) as Error & { code?: string };
        promptLimitError.code = 'CLICKATRON_PROMPT_COMPILER_LIMIT_VIOLATION';
        throw promptLimitError;
      }
      generationParams.finalPromptLength = payloadPrompt.length;

      falCallAttempted = true;
      const result = await fal.subscribe(modelId, {
        input: payload,
        logs: false,
      });
      falResult = result;

      if (!result.data || !result.data.images || result.data.images.length === 0) {
        throw new Error('No image generated');
      }

      const generatedImageUrl = result.data.images[0].url;

      // Upload image to R2
      const r2Url = await ClickatronR2Manager.uploadImageFromUrl(
        job.userId,
        job.sessionId,
        job.variationId,
        generatedImageUrl
      );

      // Store the raw R2 URL without query parameters for long-term storage
      const rawR2Url = r2Url.split('?')[0];

      // Get a signed URL for fetching the image from R2
      const signedUrl = await ClickatronR2Manager.getSignedUrl(rawR2Url);

      const imageResponse = await fetch(signedUrl);
      if (!imageResponse.ok) {
        throw new Error('Failed to download image for thumbnail creation');
      }
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

      const thumbnailBuffer = await sharp(imageBuffer)
        .resize(512, 512, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality: 75,
          effort: 4, // good balance between speed & compression
        })
        .toBuffer();

      // Upload thumbnail to R2
      const thumbnailR2Url = await ClickatronR2Manager.uploadThumbnailBuffer(
        job.userId,
        job.sessionId,
        job.variationId,
        thumbnailBuffer
      );

      try {
        await recordClickatronR2StorageCost({
          job,
          imageBytes: imageBuffer.length,
          thumbnailBytes: thumbnailBuffer.length,
        });
      } catch (costError) {
        console.error('Worker: Failed to record R2 storage cost:', costError);
      }

      // Update variation with generated image. In-memory mutation is kept for the
      // downstream reads in this handler (cost recording, CalOS callback), but
      // persistence is ATOMIC on this one variation — never task.save(). Six carousel
      // workers saving the whole doc concurrently was the lost-update race that wiped
      // 5 of 6 completed slides (prod logs 2026-07-05). [R7]
      variation.status = 'completed';
      variation.imageRef = rawR2Url;
      variation.thumbnailRef = thumbnailR2Url;
      variation.updatedAt = new Date();
      variation.modelId = selectedModelId; // Use the (possibly updated) selected model ID
      // Only store seed for models that support it
      if (modelSupportsSeed(selectedModelId)) {
        variation.seed = generationParams.seed;
      }
      variation.generationParams = generationParams;

      const completionPersisted = await persistVariationFieldsAtomic(job.sessionId, variation.id, {
        status: 'completed',
        imageRef: rawR2Url,
        thumbnailRef: thumbnailR2Url,
        modelId: selectedModelId,
        seed: modelSupportsSeed(selectedModelId) ? generationParams.seed : undefined,
        generationParams,
      });
      if (!completionPersisted) {
        // Variation vanished mid-run (e.g. deleted by the user). The image exists in R2
        // and was paid for — do NOT throw into the failure/refund path; just log loud.
        console.error('Worker: generated image could not be attached — variation missing at completion:', { sessionId: job.sessionId, variationId: variation.id, rawR2Url });
      }

      try {
        const completedJob = await completeJob(activeJobId, rawR2Url);
        if (!completedJob) {
          console.error('Worker: Generated asset persisted but job completion transition was rejected:', {
            jobId: activeJobId,
          });
        }
      } catch (completionError) {
        console.error('Worker: Generated asset persisted but Redis completion failed:', completionError);
      }
      try {
        await recordClickatronFalProviderCost({
          job,
          variation,
          status: 'success',
          result,
          chargedCredits: getJobCreditTransaction(job).chargedCredits
            ?? getClickatronVariationRefundAmount(variation.modelId || job.modelId),
        });
      } catch (costError) {
        console.error('Worker: Failed to record Fal success cost:', costError);
      } finally {
        falCostRecorded = true;
      }

      // CalOS completion callback (isolated â€” can never fail the Clickatron job): if this image was
      // generated for a CalOS deliverable (ThinkForge handoff today, or a CalOS kickoff later), land
      // the finished image on the card and advance it drafting -> generated.
      const calosSuccessMeta = { ...asPromptMetadataRecord(task.metadata), ...asPromptMetadataRecord(job.metadata) };
      const calosSuccessDeliverableId =
        (calosSuccessMeta.clickatronHandoff as { contentCardId?: string } | undefined)?.contentCardId ??
        (calosSuccessMeta.sourceContext as { calosDeliverableId?: string } | undefined)?.calosDeliverableId;
      if (calosSuccessDeliverableId && task.brandId) {
        try {
          const { attachGeneratedAsset } = await import('@/lib/calos/attach-generated-asset');
          await attachGeneratedAsset({
            deliverableId: calosSuccessDeliverableId,
            ownerUserId: job.userId,
            brandId: task.brandId,
            assetUrl: rawR2Url,
            serviceRef: { service: 'clickatron', jobId: activeJobId, sessionId: job.sessionId, variationId: job.variationId },
          });
        } catch (e) {
          // TODO(CALOS_LOUD): revert to warn once stable. Image generated but never lands on the card.
          console.error('[CALOS_LOUD] clickatron CalOS asset attach FAILED (image not landed on card):', e);
        }
      }
    } catch (generationError: any) {
      console.error('Worker: Image generation failed:', generationError);

      // Enhanced error logging
      if (generationError.body) {
        console.error('Worker: Error Body:', JSON.stringify(generationError.body, null, 2));
      }
      if (generationError.data) {
        console.error('Worker: Error Data:', JSON.stringify(generationError.data, null, 2));
      }
      // Inspect message for more clues
      console.error('Worker: Full error message:', generationError.message);


      // Provide more specific error message based on error type
      let errorMessage = generationError.message || generationError.body?.detail || 'Image generation failed';
      let errorCode = 'GENERATION_FAILED';

      // Handle different error types with specific messages
      if (generationError.code === 'NEEDS_USER_INPUT') {
        errorCode = 'NEEDS_USER_INPUT';
        errorMessage = generationError.message || 'needs_user_input: Brand Vault evidence is required before generation.';
      } else if (
        generationError.code === 'CLICKATRON_PROMPT_REQUIRED_CONTEXT_EXCEEDS_MODEL_LIMIT'
        || generationError.code === 'CLICKATRON_PROMPT_COMPILER_LIMIT_VIOLATION'
      ) {
        errorCode = generationError.code;
        errorMessage = generationError.message || 'The selected image model cannot safely fit this creative brief.';
      } else if (generationError.status === 422) {
        errorCode = 'INVALID_PARAMETERS';

        // Check for specific 422 error patterns
        if (generationError.message?.includes('image') || generationError.message?.includes('url')) {
          errorMessage = 'Image processing error. The reference image may be corrupted, too large, or inaccessible. Please try with a different image.';
        } else if (generationError.message?.includes('size') || generationError.message?.includes('dimension')) {
          errorMessage = 'Image size error. The image dimensions may be too small or too large for the model requirements.';
        } else {
          errorMessage = 'Invalid generation parameters. This might be due to using the wrong model for text-to-image vs image-to-image generation, or the reference image format is not supported.';
        }
      } else if (generationError.status === 401) {
        errorCode = 'AUTHENTICATION_FAILED';
        errorMessage = 'Authentication failed with the image generation service. Please check the API configuration.';
      } else if (generationError.status === 403) {
        errorCode = 'FORBIDDEN';
        errorMessage = 'Access denied to the image generation service. The API key may be invalid or expired.';
      } else if (generationError.status === 429) {
        errorCode = 'RATE_LIMITED';
        errorMessage = 'Rate limit exceeded. Please wait and try again later.';
      } else if (generationError.code === 'ENOTFOUND' || generationError.code === 'ECONNREFUSED') {
        errorCode = 'NETWORK_ERROR';
        errorMessage = 'Network error connecting to the image generation service. Please check your internet connection and try again.';
      } else if (generationError.name === 'TimeoutError') {
        errorCode = 'TIMEOUT';
        errorMessage = 'The image generation request timed out. Please try again.';
      }

      console.error('Worker: Detailed error - Code:', errorCode, 'Message:', errorMessage);

      if (falCallAttempted && !falCostRecorded) {
        try {
          await recordClickatronFalProviderCost({
            job,
            variation,
            status: 'failed',
            result: falResult,
            error: generationError,
          });
        } catch (costError) {
          console.error('Worker: Failed to record Fal failure cost:', costError);
        }
      }

      const failedJob = await failJob(activeJobId, {
        code: errorCode,
        message: errorMessage,
        details: generationError,
      });
      if (!failedJob) {
        console.error('Worker: Failure handling skipped because job is already terminal:', {
          jobId: activeJobId,
        });
        return NextResponse.json({ success: true, skipped: true });
      }

      // Ensure variation is updated with failed status — atomically on this ONE
      // variation (never task.save(): sibling carousel slides must not be clobbered).
      // metadata is included because the NEEDS_USER_INPUT path writes
      // variation.metadata.needsUserInput in-memory before throwing into this catch;
      // the old whole-doc save persisted it implicitly, so carry it explicitly now. [R7]
      try {
        variation.status = 'failed';
        variation.error = errorMessage; // Save the specific error message
        variation.updatedAt = new Date();
        await persistVariationFieldsAtomic(job.sessionId, variation.id, {
          status: 'failed',
          error: errorMessage,
          modelId: variation.modelId,
          metadata: variation.metadata,
        });
      } catch (saveError) {
        console.error('Worker: Failed to save variation status:', saveError);
        // Even if we can't save to the database, we still need to fail the job
      }

      // CalOS failure callback (isolated): record the error on the deliverable, keep it in drafting
      // (success-wins, so a later retry that succeeds still overwrites this).
      const calosFailMeta = { ...asPromptMetadataRecord(task.metadata), ...asPromptMetadataRecord(job.metadata) };
      const calosFailDeliverableId =
        (calosFailMeta.clickatronHandoff as { contentCardId?: string } | undefined)?.contentCardId ??
        (calosFailMeta.sourceContext as { calosDeliverableId?: string } | undefined)?.calosDeliverableId;
      if (calosFailDeliverableId && task.brandId) {
        try {
          const { markGeneratedAssetFailed } = await import('@/lib/calos/attach-generated-asset');
          await markGeneratedAssetFailed({
            deliverableId: calosFailDeliverableId,
            ownerUserId: job.userId,
            brandId: task.brandId,
            errorMessage,
            serviceRef: { service: 'clickatron', jobId: activeJobId, sessionId: job.sessionId, variationId: job.variationId },
          });
        } catch (e) {
          // TODO(CALOS_LOUD): revert to warn once stable.
          console.error('[CALOS_LOUD] clickatron CalOS asset-failed callback FAILED (card not marked failed):', e);
        }
      }

      try {
        await refundClaimedJob(
          failedJob,
          `Variation generation failed: ${errorMessage}`,
          variation.modelId,
        );
      } catch (refundError) {
        console.error('Failed to process refund for user:', job.userId, refundError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Worker error:', error);
    console.error('Worker error details - jobId:', jobId, 'error type:', (error as Error).constructor.name);

    if (claimedJob) {
      try {
        const failedJob = await failJob(claimedJob.id, {
          code: 'WORKER_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error occurred in worker',
          details: error,
        });
        if (failedJob) {
          const errorMessage = error instanceof Error
            ? error.message
            : 'Unknown error occurred in worker';
          await markVariationFailedForJob(failedJob, errorMessage);
          await refundClaimedJob(
            failedJob,
            'Outer catch block failure in Clickatron worker',
          );
        }
      } catch (failError) {
        console.error('Worker: Failed to terminalize outer-catch job:', failError);
      }
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Add error handling for signature verification
// Only enable signature verification in production (not in development)
const protectedHandler = (process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.APP_ENV !== 'development' && process.env.NODE_ENV !== 'development')
  ? verifySignatureAppRouter(handler)
  : handler;

export const POST = async (req: Request) => {
  try {
    return await protectedHandler(req);
  } catch (error) {
    console.error('Worker signature verification failed:', error);

    // Try to extract jobId from request for error reporting
    let jobId: string | undefined;
    try {
      const body = await req.json();
      jobId = body.jobId;
    } catch (bodyError) {
      console.error('Worker: Failed to parse request body for error reporting:', bodyError);
    }

    // If we have a jobId, fail the job and mirror that terminal state to Mongo.
    if (jobId) {
      try {
        const failed = await failQueuedJob(jobId, {
          code: 'SIGNATURE_VERIFICATION_FAILED',
          message: 'Failed to verify QStash signature. Check your UPSTASH_QSTASH keys.',
          details: error,
        });
        if (failed.outcome === 'updated' && failed.job) {
          await markVariationFailedForJob(
            failed.job,
            'Generation worker signature verification failed before image generation could start.',
          );

          try {
            await refundClaimedJob(
              failed.job,
              'QStash signature verification failed in worker',
            );
          } catch (refundError) {
            console.error('Failed to process signature-failure refund:', refundError);
          }
        }
      } catch (failError) {
        console.error('Worker: Failed to mark job as failed after signature verification:', failError);
      }
    }

    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }
};
