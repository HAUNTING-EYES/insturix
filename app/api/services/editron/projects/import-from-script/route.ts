/**
 * POST /api/services/editron/projects/import-from-script
 *
 * Import a script (scenes) into a new or existing Editron project.
 * Converts SceneDescriptors into timeline overlays.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { projectService } from '@/lib/editron/services/project-service';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { addProjectToLinkBySessionId, createProjectLink, findLinkBySessionId } from '@/lib/shared/project-links';
import { scenesToOverlays, scenesToTotalFrames, type StoryboardImage } from '@/lib/pipeline/scene-to-editron';
import { CreditsService } from '@/lib/services/creditsService';
import type { SceneDescriptor } from '@/lib/pipeline/schemas/storyboard';

export const runtime = 'nodejs';

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
      title,
      aspectRatio,
      sourceScriptId,
      sourceSessionId,
      storyboardImages,
      brandId,
    }: {
      scenes: SceneDescriptor[];
      title?: string;
      aspectRatio?: string;
      sourceScriptId?: string;
      sourceSessionId?: string;
      storyboardImages?: StoryboardImage[];
      brandId?: string;
    } = body;

    const normalizedBrandId = nonEmptyString(brandId);
    const normalizedSourceSessionId = nonEmptyString(sourceSessionId);
    const normalizedSourceScriptId = nonEmptyString(sourceScriptId);
    const warnings: string[] = [];

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
      { quantity: 1 },
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

    // Reuse the source-session project when ThinkForge created one at script stage.
    const projectName = title || 'Imported Script';
    const existingProject = normalizedSourceSessionId
      ? await projectService.findProjectBySessionId(userId, normalizedSourceSessionId)
      : null;
    const project = existingProject || await projectService.createProject(userId, projectName, {
      brandId: normalizedBrandId,
      sourceSessionId: normalizedSourceSessionId,
    });

    if (existingProject) {
      const db = await getDatabase();
      const update: Record<string, unknown> = {
        name: projectName,
        pipelineStage: 'edit',
        updatedAt: new Date(),
      };
      if (normalizedBrandId) update.brandId = normalizedBrandId;
      await db.collection(COLLECTIONS.PROJECTS).updateOne(
        { userId, projectId: project.projectId },
        { $set: update },
      );
    }

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

    if (normalizedSourceSessionId) {
      try {
        const existingLink = await findLinkBySessionId(userId, normalizedSourceSessionId);
        if (existingLink) {
          await addProjectToLinkBySessionId(userId, normalizedSourceSessionId, project.projectId);
        } else {
          await createProjectLink(userId, {
            sessionId: normalizedSourceSessionId,
            sourceScriptId: normalizedSourceScriptId,
            projectId: project.projectId,
            brandId: normalizedBrandId,
          });
        }
      } catch (linkErr: any) {
        warnings.push(`Project link operation failed: ${linkErr.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      projectId: project.projectId,
      name: projectName,
      overlayCount: overlays.length,
      totalDurationFrames: totalFrames,
      totalDurationSeconds: Math.round(totalFrames / fps),
      creditsDeducted: 1,
      reusedProject: Boolean(existingProject),
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (error: any) {
    console.error('[import-from-script] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to import script' },
      { status: 500 },
    );
  }
}
