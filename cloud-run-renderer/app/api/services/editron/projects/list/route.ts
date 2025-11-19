/**
 * GET /api/services/editron/projects/list
 * List user's projects
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/services/project-service';
import { getUserId } from '@/components/editor/version-7.0.0/utils/user-id';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId();
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const sortBy = (searchParams.get('sortBy') || 'updatedAt') as 'createdAt' | 'updatedAt' | 'name';

    const result = await projectService.listProjects(userId, page, limit, sortBy);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Error listing projects:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to list projects' },
      { status: 500 }
    );
  }
}
