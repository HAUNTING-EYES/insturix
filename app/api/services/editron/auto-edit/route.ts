/**
 * POST /api/services/editron/auto-edit
 *
 * Auto-edit pipeline: Script + Raw Footage -> Rough Cut
 *
 * Accepts:
 *   { projectId: string, script: string, videoOverlayId?: string, preview?: boolean }
 *
 * If preview=true, returns the plan without executing.
 * Otherwise, executes the plan and returns the result.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { autoEditFromScript, executeAutoEdit } from '@/lib/editron/services/auto-edit-service';

export const runtime = 'nodejs';
export const maxDuration = 180; // 3 minutes max for transcription + assembly

interface AutoEditRequest {
  projectId: string;
  script: string;
  videoOverlayId?: string;
  preview?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    // Parse body
    const body: AutoEditRequest = await request.json();
    const { projectId, script, videoOverlayId, preview } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'projectId is required' },
        { status: 400 },
      );
    }

    if (!script || script.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'script text is required' },
        { status: 400 },
      );
    }

    // Step 1: Generate the auto-edit plan
    const plan = await autoEditFromScript(
      projectId,
      userId,
      script,
      videoOverlayId,
    );

    // If preview mode, return the plan without executing
    if (preview) {
      return NextResponse.json({
        success: true,
        mode: 'preview',
        plan,
      });
    }

    // Step 2: Execute the plan
    // Determine which video overlay to use (same logic as the service)
    const effectiveVideoOverlayId = videoOverlayId || await resolveVideoOverlayId(projectId, userId);

    const result = await executeAutoEdit(
      projectId,
      userId,
      effectiveVideoOverlayId,
      plan,
    );

    return NextResponse.json({
      success: true,
      mode: 'executed',
      plan,
      result,
    });
  } catch (error: any) {
    console.error('[auto-edit] Pipeline error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Auto-edit failed' },
      { status: 500 },
    );
  }
}

/**
 * Resolve the video overlay ID when not provided.
 * Picks the longest video overlay in the project.
 */
async function resolveVideoOverlayId(projectId: string, userId: string): Promise<string> {
  const { projectService } = await import('@/lib/editron/services/project-service');
  const project = await projectService.loadProject(userId, projectId);
  if (!project) throw new Error('Project not found');

  const videoOverlays = project.overlays
    .filter((o: any) => o.type === 'video' && o.assetId)
    .sort((a: any, b: any) => b.durationInFrames - a.durationInFrames);

  if (videoOverlays.length === 0) {
    throw new Error('No video overlays found in project');
  }

  return String(videoOverlays[0].id);
}
