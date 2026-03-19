/**
 * POST /api/services/pipeline/storyboard/generate
 *
 * Generate a full storyboard (one image per scene) from SceneDescriptors.
 * Credits: 2 per scene.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { CreditsService } from '@/lib/services/creditsService';
import { generateFullStoryboard } from '@/lib/pipeline/storyboard-service';
import type { SceneDescriptor, StyleGuide } from '@/lib/pipeline/schemas/storyboard';

export const runtime = 'nodejs';
export const maxDuration = 120; // storyboard gen can take a while

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
    }: {
      scenes: SceneDescriptor[];
      styleGuide?: StyleGuide;
      projectId?: string;
      sourceScriptId?: string;
      modelId?: string;
      title?: string;
      aspectRatio?: string;
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
      totalCost,
      { sceneCount: scenes.length },
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

    const storyboard = await generateFullStoryboard(scenes, {
      userId,
      styleGuide,
      projectId,
      sourceScriptId,
      modelId,
      title,
      aspectRatio,
    });

    return NextResponse.json({
      success: true,
      storyboardId: storyboard.storyboardId,
      status: storyboard.status,
      scenes: storyboard.scenes.map((s) => ({
        sceneIndex: s.sceneIndex,
        title: s.descriptor.title,
        imageUrl: s.imageUrl,
        status: s.status,
      })),
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
