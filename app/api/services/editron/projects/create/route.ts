/**
 * POST /api/services/editron/projects/create
 * Create a new project
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/editron/services/project-service';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, templateId, brandId, aspectRatio, initialScript } = body;

    const { userId, orgId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Project name is required' },
        { status: 400 }
      );
    }

    if (templateId !== undefined) {
      return NextResponse.json(
        { success: false, error: 'Project templates are not supported by this endpoint' },
        { status: 400 }
      );
    }

    // Validate optional intake extras. Both were previously collected by the
    // Script door UI and silently discarded here.
    const VALID_ASPECTS = ['16:9', '9:16', '1:1', '4:5'] as const;
    const requestedAspect =
      typeof aspectRatio === 'string' && (VALID_ASPECTS as readonly string[]).includes(aspectRatio)
        ? (aspectRatio as (typeof VALID_ASPECTS)[number])
        : undefined;
    const script =
      typeof initialScript === 'string' && initialScript.trim().length > 0
        ? initialScript.slice(0, 50_000) // sanity cap, not a silent truncation of real scripts
        : undefined;

    const project = await projectService.createProject(userId, name, {
      brandId,
      orgId: orgId ?? null,
      aspectRatio: requestedAspect,
      initialScript: script,
    });

    return NextResponse.json({
      success: true,
      projectId: project.projectId,
      project,
    });
  } catch (error: any) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create project' },
      { status: 500 }
    );
  }
}
