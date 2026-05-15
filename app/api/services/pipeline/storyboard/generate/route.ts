/**
 * POST /api/services/pipeline/storyboard/generate
 *
 * Generate a full storyboard (one image per scene) from SceneDescriptors.
 * Credits: 2 per scene.
 *
 * Bundle 4 (2026-04-09) ARCHITECTURE CHANGE:
 *   OLD: Inline generateFullStoryboard() ran all scene image gen inside this
 *        route's 300s Vercel budget. Per-sub-shot gen (Bundle 2) pushed the
 *        math past the limit → 504 timeouts on 3+ scene scripts with montage.
 *   NEW: Route only:
 *        1. Validates + deducts credits
 *        2. Pre-uploads ref CDN URLs
 *        3. Creates storyboard shell + batch + per-scene job docs
 *        4. Dispatches N QStash messages (one per scene) to
 *           /api/internal/workers/pipeline/storyboard-image
 *        5. Returns { storyboardId, batchId, status: 'generating' } immediately
 *
 *   Frontend polls GET /api/services/pipeline/storyboard/[id]/generate-status
 *   until all scenes complete. Each scene worker has its own 300s budget, so
 *   20+ scene scripts with montage sub-shots no longer compete for one pool.
 *
 *   Scene 0 style-anchor was dropped (it required serialization). Style
 *   consistency now relies on IP-adapter refs + explicit style guide prompts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Client } from '@upstash/qstash';
import { nanoid } from 'nanoid';
import { CreditsService } from '@/lib/services/creditsService';
import { IMAGE_MODELS, type ImageModelKey } from '@/lib/pipeline/storyboard-service';
import { saveStoryboard } from '@/lib/pipeline/storyboard-db';
import {
  createStoryboardImageBatch,
  type StoryboardImageWorkerPayload,
} from '@/lib/pipeline/storyboard-image-queue';
import type {
  SceneDescriptor,
  StyleGuide,
  Storyboard,
} from '@/lib/pipeline/schemas/storyboard';
import { checkExpensiveRateLimit } from '@/lib/editron/utils/rate-limiter';
import { createProjectLink } from '@/lib/shared/project-links';

export const runtime = 'nodejs';
// This route now only VALIDATES + DISPATCHES. Should complete in <30s even for
// 40-scene scripts (credit deduction + ref CDN upload + QStash publish × N).
// Keeping 120s as a generous ceiling — no fal.ai calls happen inline anymore.
export const maxDuration = 120;

/**
 * Pre-upload a URL to fal.ai CDN if it isn't already a fal CDN URL.
 * Eliminates redundant per-scene re-uploads — each reference image is uploaded
 * exactly once here, then reused as-is by all workers.
 */
async function ensureFalCdnUrl(url: string): Promise<string> {
  if (!url) return url;
  if (url.startsWith('https://fal.media/') || url.startsWith('https://v3.fal.media/')) return url;
  if (!url.includes('?')) return url;

  const { fal } = await import('@fal-ai/client');
  if (process.env.FAL_AI_API_KEY) {
    fal.config({ credentials: process.env.FAL_AI_API_KEY });
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download reference image for CDN upload: ${res.status}`);
  const blob = await res.blob();
  const file = new File([blob], `ref_${Date.now()}.png`, { type: 'image/png' });
  return await fal.storage.upload(file);
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 5 per hour per user
    const rl = await checkExpensiveRateLimit(userId);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please wait before generating another storyboard.' },
        { status: 429, headers: { 'X-RateLimit-Reset': String(rl.reset) } },
      );
    }

    const body = await request.json();
    const {
      scenes,
      styleGuide,
      projectId,
      sourceScriptId,
      modelId,
      title,
      aspectRatio,
      overallMusicPrompt,
      refSetId,
      approvedReferences,
      checkConsistency,
      consistencyThreshold,
      globalEditDirections,
      suggestedProfileCategory,
      brandId,
    }: {
      scenes: SceneDescriptor[];
      styleGuide?: StyleGuide;
      projectId?: string;
      sourceScriptId?: string;
      modelId?: string;
      title?: string;
      aspectRatio?: string;
      overallMusicPrompt?: string;
      refSetId?: string;
      approvedReferences?: Array<{
        subjectId: string;
        name: string;
        category?: string;
        visualDescription?: string;
        imageUrl: string;
        scenesAppearingIn: number[];
      }>;
      checkConsistency?: boolean;
      consistencyThreshold?: number;
      globalEditDirections?: any;
      suggestedProfileCategory?: string;
      brandId?: string;
    } = body;

    const warnings: string[] = [];

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'scenes array is required' },
        { status: 400 },
      );
    }

    // Bundle 4: raised scene cap from 40 → 60 because routes no longer hit 300s.
    // Each scene is its own worker; we're only bounded by QStash fan-out cost
    // (~$0.0001 per message × 60 = $0.006, negligible).
    if (scenes.length > 60) {
      return NextResponse.json(
        { success: false, error: `Too many scenes (${scenes.length}). Maximum 60 scenes per storyboard.` },
        { status: 400 },
      );
    }

    // ─── Atomic credit deduction ───────────────────────────────────
    const costPerScene = 2;
    const totalCost = scenes.length * costPerScene;

    const preCheck = await CreditsService.getBalance(userId);
    if (!preCheck || preCheck.totalCredits < totalCost) {
      return NextResponse.json(
        { success: false, error: `Insufficient credits. Need ${totalCost}, have ${preCheck?.totalCredits || 0}` },
        { status: 402 },
      );
    }

    const deductResult = await CreditsService.deductCredits(
      userId,
      'pipeline',
      'storyboard_image_generation',
      { quantity: scenes.length },
    );
    if (!deductResult.success) {
      return NextResponse.json(
        { success: false, error: `Credit deduction failed. Need ${totalCost} credits.` },
        { status: 402 },
      );
    }

    // ─── Pre-upload reference CDN URLs ──────────────────────────────
    // Done inline (not per-worker) to avoid N × redundant uploads.
    if (approvedReferences && approvedReferences.length > 0) {
      const uniqueUrls = new Map<string, string>();
      const uploadStart = Date.now();
      for (const ref of approvedReferences) {
        if (ref.imageUrl && !uniqueUrls.has(ref.imageUrl)) {
          try {
            const cdnUrl = await ensureFalCdnUrl(ref.imageUrl);
            uniqueUrls.set(ref.imageUrl, cdnUrl);
          } catch (err: any) {
            const cdnWarn = `CDN pre-upload failed for reference "${ref.subjectId}": ${err.message}. Using original URL (may expire or be slow).`;
            console.warn(`[storyboard/generate] ${cdnWarn}`);
            warnings.push(cdnWarn);
            uniqueUrls.set(ref.imageUrl, ref.imageUrl);
          }
        }
      }
      console.log(`[storyboard/generate] Pre-uploaded ${uniqueUrls.size} unique reference URLs to CDN in ${Date.now() - uploadStart}ms`);

      // Replace original URLs with CDN URLs
      for (const ref of approvedReferences) {
        if (ref.imageUrl && uniqueUrls.has(ref.imageUrl)) {
          ref.imageUrl = uniqueUrls.get(ref.imageUrl)!;
        }
      }
    }

    // Build referenceImageMap from approved references
    let referenceImageMap:
      | Record<
          number,
          Array<{
            subjectId: string;
            imageUrl: string;
            weight?: number;
            name?: string;
            visualDescription?: string;
          }>
        >
      | undefined;
    if (approvedReferences && approvedReferences.length > 0) {
      referenceImageMap = {};
      for (const ref of approvedReferences) {
        for (const sceneIdx of ref.scenesAppearingIn) {
          if (!referenceImageMap[sceneIdx]) referenceImageMap[sceneIdx] = [];
          referenceImageMap[sceneIdx].push({
            subjectId: ref.subjectId,
            imageUrl: ref.imageUrl,
            weight: 0.6,
            name: ref.name,
            visualDescription: ref.visualDescription,
          });
        }
      }
      console.log(`[storyboard/generate] Reference image map built for ${Object.keys(referenceImageMap).length} scenes from ${approvedReferences.length} subjects`);
    }

    // Validate model resolution
    const resolvedModelId =
      modelId && modelId in IMAGE_MODELS ? IMAGE_MODELS[modelId as ImageModelKey] : modelId;

    if (modelId && !(modelId in IMAGE_MODELS) && !modelId.startsWith('fal-ai/') && !modelId.startsWith('photon')) {
      return NextResponse.json(
        { success: false, error: `Unknown image model "${modelId}".` },
        { status: 400 },
      );
    }

    // ─── Create storyboard shell + dispatch workers ─────────────────
    const storyboardId = `sb_${nanoid(12)}`;
    const now = new Date();

    const storyboard: Storyboard = {
      storyboardId,
      projectId,
      userId,
      sourceScriptId,
      title,
      styleGuide,
      overallMusicPrompt,
      refSetId,
      approvedReferences,
      globalEditDirections,
      suggestedProfileCategory,
      scenes: scenes.map((s) => ({
        sceneIndex: s.sceneIndex,
        descriptor: s,
        status: 'pending' as const,
        generationHistory: [],
      })),
      status: 'generating',
      createdAt: now,
      updatedAt: now,
    };
    await saveStoryboard(storyboard);

    // ─── Create project link (fail-open: link failure must NOT block generation) ──
    try {
      await createProjectLink(userId, {
        sessionId: projectId,
        sourceScriptId,
        storyboardId,
        brandId,
      });
      console.log(`[storyboard/generate] Project link created for storyboard ${storyboardId}`);
    } catch (linkErr: any) {
      const linkWarn = `Project link creation failed: ${linkErr.message}. Storyboard generated without link — reconciliation will fix.`;
      console.error(`[storyboard/generate] ${linkWarn}`);
      warnings.push(linkWarn);
    }

    // Create batch + job docs (tracked in MongoDB, polled by frontend)
    const sceneIndices = scenes.map((s) => s.sceneIndex);
    const { batchId } = await createStoryboardImageBatch(userId, storyboardId, sceneIndices);

    // Dispatch to workers via QStash (one message per scene)
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const workerUrl = `${baseUrl}/api/internal/workers/pipeline/storyboard-image`;

    console.log(`[storyboard/generate] Worker URL: ${workerUrl}, batch ${batchId}, ${scenes.length} scenes`);

    const buildPayload = (scene: SceneDescriptor): StoryboardImageWorkerPayload => ({
      jobId: `${batchId}_s${scene.sceneIndex}`,
      batchId,
      userId,
      storyboardId,
      sceneIndex: scene.sceneIndex,
      descriptor: scene,
      referenceImages: referenceImageMap?.[scene.sceneIndex],
      styleGuide,
      modelId: resolvedModelId,
      aspectRatio,
      totalScenes: scenes.length,
      runConsistencyCheck: checkConsistency !== false,
      consistencyThreshold,
    });

    const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
    let enqueueErrors = 0;
    const enqueueErrorDetails: string[] = [];

    if (isDev) {
      // Dev: fire-and-forget fetch (no signing keys)
      for (const scene of scenes) {
        fetch(workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(scene)),
        }).catch((err) => {
          console.error(`[storyboard/generate] Dev dispatch failed for scene ${scene.sceneIndex}:`, err.message);
        });
      }
    } else if (!process.env.QSTASH_TOKEN) {
      console.warn('[storyboard/generate] QSTASH_TOKEN not set, using fire-and-forget fetch');
      for (const scene of scenes) {
        fetch(workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(scene)),
        }).catch((err) => {
          console.error(`[storyboard/generate] Fetch dispatch failed for scene ${scene.sceneIndex}:`, err.message);
        });
      }
    } else {
      // Production: QStash
      const qstashClient = new Client({
        token: process.env.QSTASH_TOKEN,
        baseUrl: process.env.QSTASH_URL || undefined,
      });

      const qstashResults = await Promise.allSettled(
        scenes.map((scene) =>
          qstashClient.publishJSON({
            url: workerUrl,
            body: buildPayload(scene),
            retries: 2,
          }),
        ),
      );

      for (let i = 0; i < qstashResults.length; i++) {
        const r = qstashResults[i];
        if (r.status === 'rejected') {
          enqueueErrors++;
          const reason = r.reason?.message || String(r.reason);
          enqueueErrorDetails.push(`scene ${scenes[i].sceneIndex}: ${reason}`);
          console.error(`[storyboard/generate] QStash publish failed for scene ${scenes[i].sceneIndex}:`, reason);
        }
      }

      // Bundle 4 / Toyota B.race.2 fix: fail HARD on any enqueue error. Partial
      // dispatch leaves the user in a broken state where some scenes generate
      // and some don't — worse than a clean failure.
      if (enqueueErrors > 0) {
        // Refund credits since we're failing the whole batch
        try {
          await CreditsService.refundCredits(
            userId,
            totalCost,
            `storyboard dispatch failed (${enqueueErrors}/${scenes.length} enqueue errors)`,
            { service: 'pipeline', action: 'storyboard_image_generation' },
          );
        } catch (refundErr: any) {
          console.error(`[storyboard/generate] Credit refund failed: ${refundErr.message}`);
        }

        return NextResponse.json(
          {
            success: false,
            error: `Failed to enqueue ${enqueueErrors} of ${scenes.length} scenes. Credits refunded. Please retry.`,
            details: enqueueErrorDetails.slice(0, 5),
          },
          { status: 503 },
        );
      }
    }

    // ─── Return immediately with batch info for polling ────────────
    console.log(`[storyboard/generate] Dispatched ${scenes.length} scenes to ${workerUrl} (batch ${batchId})`);

    return NextResponse.json({
      success: true,
      storyboardId,
      batchId,
      status: 'generating',
      totalScenes: scenes.length,
      // Return scene stubs so the frontend can render the storyboard grid immediately
      scenes: scenes.map((s) => ({
        sceneIndex: s.sceneIndex,
        title: s.title,
        imageUrl: undefined,
        imageAssetId: undefined,
        status: 'pending',
      })),
      creditsDeducted: totalCost,
      async: true,
      pollUrl: `/api/services/pipeline/storyboard/${storyboardId}/generate-status?batchId=${batchId}`,
      ...(warnings.length > 0 && { warnings }),
    });
  } catch (error: any) {
    console.error('[storyboard/generate] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate storyboard' },
      { status: 500 },
    );
  }
}
