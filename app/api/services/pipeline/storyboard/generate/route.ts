/**
 * POST /api/services/pipeline/storyboard/generate
 *
 * Generate a full storyboard (one image per scene) from SceneDescriptors.
 * Credits: 2 per scene.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { CreditsService } from '@/lib/services/creditsService';
import { generateFullStoryboard, IMAGE_MODELS, type ImageModelKey } from '@/lib/pipeline/storyboard-service';
import type { SceneDescriptor, StyleGuide } from '@/lib/pipeline/schemas/storyboard';
import { checkExpensiveRateLimit } from '@/lib/editron/utils/rate-limiter';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — IP-adapter scenes are slow (~30s each)

/**
 * Pre-upload a URL to fal.ai CDN if it isn't already a fal CDN URL.
 * This eliminates redundant per-scene re-uploads — each reference image
 * is uploaded exactly once here, then reused as-is downstream.
 */
async function ensureFalCdnUrl(url: string): Promise<string> {
  if (!url) return url;
  // Already on fal CDN — no work needed
  if (url.startsWith('https://fal.media/') || url.startsWith('https://v3.fal.media/')) return url;
  // Clean URL with no query params is likely already a CDN URL
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
    } = body;

    // H2 FIX: Track warnings to surface in response
    const warnings: string[] = [];

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'scenes array is required' },
        { status: 400 },
      );
    }

    // H7 FIX: Cap scene count to prevent timeout — 40+ scenes will exceed 300s
    if (scenes.length > 40) {
      return NextResponse.json(
        { success: false, error: `Too many scenes (${scenes.length}). Maximum 40 scenes per storyboard to prevent timeout. Please reduce scene count or split into multiple storyboards.` },
        { status: 400 },
      );
    }

    if (scenes.length > 60) {
      return NextResponse.json(
        { success: false, error: 'Maximum 60 scenes per storyboard' },
        { status: 400 },
      );
    }

    // A1 FIX: Atomic credit deduction — deduct ALL at once, not in a loop.
    // Pre-check + single deduction prevents race conditions where another
    // request consumes credits between pre-check and per-scene deduction.
    const costPerScene = 2;
    const totalCost = scenes.length * costPerScene;

    const preCheck = await CreditsService.getBalance(userId);
    if (!preCheck || preCheck.totalCredits < totalCost) {
      return NextResponse.json(
        { success: false, error: `Insufficient credits. Need ${totalCost}, have ${preCheck?.totalCredits || 0}` },
        { status: 402 },
      );
    }

    // Single atomic deduction for all scenes
    const deductResult = await CreditsService.deductCredits(
      userId, 'pipeline', 'storyboard_image_generation', { quantity: scenes.length },
    );
    if (!deductResult.success) {
      return NextResponse.json(
        { success: false, error: `Credit deduction failed. Need ${totalCost} credits.` },
        { status: 402 },
      );
    }

    if (scenes.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: deductResult.error || 'Insufficient credits',
          creditsRequired: totalCost,
        },
        { status: 402 },
      );
    }

    // Pre-upload all reference image URLs to fal CDN once (eliminates per-scene re-uploads).
    // This is the single point of CDN caching — downstream code uses URLs as-is.
    if (approvedReferences && approvedReferences.length > 0) {
      const uniqueUrls = new Map<string, string>(); // original → CDN URL
      const uploadStart = Date.now();
      for (const ref of approvedReferences) {
        if (ref.imageUrl && !uniqueUrls.has(ref.imageUrl)) {
          try {
            const cdnUrl = await ensureFalCdnUrl(ref.imageUrl);
            uniqueUrls.set(ref.imageUrl, cdnUrl);
          } catch (err: any) {
            // H2 FIX: Add to warnings (not just console.warn) — stale URL risk for users
            const cdnWarn = `CDN pre-upload failed for reference "${ref.subjectId}": ${err.message}. Using original URL (may expire or be slow).`;
            console.warn(`[storyboard/generate] ${cdnWarn}`);
            warnings.push(cdnWarn);
            uniqueUrls.set(ref.imageUrl, ref.imageUrl); // fallback to original
          }
        }
      }
      console.log(`[storyboard/generate] Pre-uploaded ${uniqueUrls.size} unique reference URLs to CDN in ${Date.now() - uploadStart}ms`);

      // Replace original URLs with CDN URLs in approvedReferences
      for (const ref of approvedReferences) {
        if (ref.imageUrl && uniqueUrls.has(ref.imageUrl)) {
          ref.imageUrl = uniqueUrls.get(ref.imageUrl)!;
        }
      }
    }

    // Build referenceImageMap from approved references (now with clean CDN URLs)
    // Maps sceneIndex → array of reference images for IP-adapter consistency
    let referenceImageMap: Record<number, Array<{ subjectId: string; imageUrl: string; weight?: number; name?: string; visualDescription?: string }>> | undefined;
    if (approvedReferences && approvedReferences.length > 0) {
      referenceImageMap = {};
      for (const ref of approvedReferences) {
        for (const sceneIdx of ref.scenesAppearingIn) {
          if (!referenceImageMap[sceneIdx]) {
            referenceImageMap[sceneIdx] = [];
          }
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

    // H3 FIX: Validate model resolution — reject unknown model IDs that aren't full fal-ai paths
    const resolvedModelId = modelId && (modelId in IMAGE_MODELS)
      ? IMAGE_MODELS[modelId as ImageModelKey]
      : modelId; // pass through if already a full model ID or undefined

    if (modelId && !(modelId in IMAGE_MODELS) && !modelId.startsWith('fal-ai/')) {
      return NextResponse.json(
        { success: false, error: `Unknown image model "${modelId}". Use a valid model key (${Object.keys(IMAGE_MODELS).join(', ')}) or a full fal-ai model ID (e.g., "fal-ai/flux/dev").` },
        { status: 400 },
      );
    }

    const storyboard = await generateFullStoryboard(scenes, {
      userId,
      styleGuide,
      projectId,
      sourceScriptId,
      modelId: resolvedModelId,
      title,
      aspectRatio,
      overallMusicPrompt,
      referenceImageMap,
      approvedReferences,
      refSetId,
      checkConsistency,
      consistencyThreshold,
      globalEditDirections,
    });

    const succeeded = storyboard.scenes.filter(s => s.imageUrl).length;
    const failed = storyboard.scenes.filter(s => !s.imageUrl).length;

    // Count how many scenes used IP-adapter vs fell back
    const ipAdapterUsed = storyboard.scenes.filter(s => {
      const lastEntry = s.generationHistory[s.generationHistory.length - 1];
      return lastEntry && (lastEntry as any).usedIpAdapter === true;
    }).length;
    const ipAdapterFellBack = succeeded - ipAdapterUsed;

    return NextResponse.json({
      success: succeeded > 0,
      storyboardId: storyboard.storyboardId,
      status: storyboard.status,
      scenes: storyboard.scenes.map((s) => ({
        sceneIndex: s.sceneIndex,
        title: s.descriptor.title,
        imageUrl: s.imageUrl,
        imageAssetId: s.imageAssetId,
        status: s.status,
      })),
      summary: { total: storyboard.scenes.length, succeeded, failed, ipAdapterUsed, ipAdapterFellBack },
      creditsDeducted: totalCost,
      consistencyReport: storyboard.consistencyReport ?? null,
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
