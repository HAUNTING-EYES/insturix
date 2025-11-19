/**
 * POST /api/services/editron/projects/[projectId]/autosave
 * Autosave project (background save)
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/editron/services/project-service';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const { projectId } = await params;
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
