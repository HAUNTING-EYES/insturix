/**
 * GET /api/services/editron/projects/[projectId]
 * Load a specific project
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/services/project-service';
import { getUserId } from '@/components/editor/version-7.0.0/utils/user-id';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const userId = getUserId();
    const { projectId } = params;

    const project = await projectService.loadProject(userId, projectId);

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (error: any) {
    console.error('Error loading project:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load project' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const userId = getUserId();
    const { projectId } = params;

    await projectService.deleteProject(userId, projectId);

    return NextResponse.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete project' },
      { status: 500 }
    );
  }
}
