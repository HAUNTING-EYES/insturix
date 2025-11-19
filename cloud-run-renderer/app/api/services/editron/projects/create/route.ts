/**
 * POST /api/services/editron/projects/create
 * Create a new project
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/services/project-service';
import { getUserId } from '@/components/editor/version-7.0.0/utils/user-id';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, templateId } = body;

    // Get user ID (for now using the existing utility, can be replaced with auth later)
    const userId = getUserId();

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Project name is required' },
        { status: 400 }
      );
    }

    const project = await projectService.createProject(userId, name, templateId);

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
