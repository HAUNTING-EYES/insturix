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
    } = body;

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'scenes array is required' },
        { status: 400 },
      );
    }

    if (scenes.length > 30) {
      return NextResponse.json(
        { success: false, error: 'Maximum 30 scenes per storyboard' },
        { status: 400 },
      );
    }

    // Deduct credits upfront: 2 per scene
    const totalCost = scenes.length * 2;
    const deductResult = await CreditsService.deductCredits(
      userId,
      'pipeline',
      'storyboard_image_generation',
    );

    if (!deductResult.success) {
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
            console.warn(`[storyboard/generate] CDN pre-upload failed for ${ref.subjectId}: ${err.message}`);
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
    let referenceImageMap: Record<number, Array<{ subjectId: string; imageUrl: string; weight?: number }>> | undefined;
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

    // Resolve model key (e.g. 'flux-dev') to fal.ai model ID (e.g. 'fal-ai/flux/dev')
    const resolvedModelId = modelId && (modelId in IMAGE_MODELS)
      ? IMAGE_MODELS[modelId as ImageModelKey]
      : modelId; // pass through if already a full model ID or undefined

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
    });
  } catch (error: any) {
    console.error('[storyboard/generate] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate storyboard' },
      { status: 500 },
    );
  }
}
