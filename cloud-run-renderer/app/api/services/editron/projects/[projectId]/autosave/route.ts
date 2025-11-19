/**
 * POST /api/services/editron/projects/[projectId]/autosave
 * Autosave project (background save)
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/services/project-service';
import { getUserId } from '@/components/editor/version-7.0.0/utils/user-id';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const userId = getUserId();
    const { projectId } = params;
    const state = await request.json();

    await projectService.autosaveProject(userId, projectId, state);

    return NextResponse.json({
      success: true,
      autosavedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error autosaving project:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to autosave project' },
      { status: 500 }
    );
  }
}
