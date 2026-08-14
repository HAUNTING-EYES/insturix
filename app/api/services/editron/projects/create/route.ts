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
    const { name, templateId, brandId } = body;

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

    const project = await projectService.createProject(userId, name, {
      brandId,
      orgId: orgId ?? null,
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
