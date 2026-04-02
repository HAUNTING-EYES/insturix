/**
 * POST /api/services/editron/quality-review
 *
 * Run quality review on a project and return the report.
 * Used by the quality review panel in the editor toolbar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runQualityReview } from '@/lib/editron/services/quality-review-service';
import { projectService } from '@/lib/editron/services/project-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId } = await req.json();
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const project = await projectService.loadProject(userId, projectId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const report = runQualityReview(project.overlays, project.durationInFrames, project.fps || 30);

    return NextResponse.json({
      success: true,
      ...report,
    });
  } catch (error: any) {
    console.error('[quality-review]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
