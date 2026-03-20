/**
 * POST /api/services/editron/projects/import-from-script
 *
 * Import a script (scenes) into a new Editron project.
 * Converts SceneDescriptors into timeline overlays.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { projectService } from '@/lib/editron/services/project-service';
import { scenesToOverlays, scenesToTotalFrames, type StoryboardImage } from '@/lib/pipeline/scene-to-editron';
import { CreditsService } from '@/lib/services/creditsService';
import type { SceneDescriptor } from '@/lib/pipeline/schemas/storyboard';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      scenes,
      title,
      aspectRatio,
      sourceScriptId,
      storyboardImages,
    }: {
      scenes: SceneDescriptor[];
      title?: string;
      aspectRatio?: string;
      sourceScriptId?: string;
      storyboardImages?: StoryboardImage[];
    } = body;

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'scenes array is required and must not be empty' },
        { status: 400 },
      );
    }

    // Deduct credits (1 credit for script import)
    const deductResult = await CreditsService.deductCredits(
      userId,
      'pipeline',
      'script_import',
      1,
      { sceneCount: scenes.length, sourceScriptId },
    );
    if (!deductResult.success) {
      return NextResponse.json(
        { success: false, error: deductResult.error || 'Insufficient credits' },
        { status: 402 },
      );
    }

    // Determine dimensions from aspect ratio
    const ar = aspectRatio || '16:9';
    let width = 1920;
    let height = 1080;
    if (ar === '9:16') { width = 1080; height = 1920; }
    else if (ar === '1:1') { width = 1080; height = 1080; }
    else if (ar === '4:5') { width = 1080; height = 1350; }

    const fps = 30;

    // Create Editron project
    const projectName = title || 'Imported Script';
    const project = await projectService.createProject(userId, projectName);

    // Convert scenes to overlays (with storyboard images if available)
    const overlays = scenesToOverlays(scenes, { fps, width, height }, storyboardImages);
    const totalFrames = scenesToTotalFrames(scenes, fps);

    // Save overlays to the project
    await projectService.saveProject(userId, project.projectId, {
      overlays,
      aspectRatio: ar as any,
      playerDimensions: { width, height },
      fps,
      durationInFrames: totalFrames,
    });

    return NextResponse.json({
      success: true,
      projectId: project.projectId,
      name: projectName,
      overlayCount: overlays.length,
      totalDurationFrames: totalFrames,
      totalDurationSeconds: Math.round(totalFrames / fps),
      creditsDeducted: 1,
    });
  } catch (error: any) {
    console.error('[import-from-script] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to import script' },
      { status: 500 },
    );
  }
}
