/**
 * GET /api/services/editron/projects/[projectId]
 * Load a specific project
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/editron/services/project-service';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
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

    const project = await projectService.loadProject(userId, projectId);

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Check if any video overlay references a proxy asset (original still uploading)
    let proxyAssets: Array<{ assetId: string; filename: string }> = [];
    try {
      const videoAssetIds = (project.overlays || [])
        .filter((o: any) => o.type === 'video' && o.assetId)
        .map((o: any) => o.assetId);
      if (videoAssetIds.length > 0) {
        const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        const proxies = await db.collection(COLLECTIONS.MEDIA_ASSETS)
          .find({ assetId: { $in: videoAssetIds }, isProxy: true })
          .project({ assetId: 1, filename: 1, _id: 0 })
          .toArray();
        proxyAssets = proxies as Array<{ assetId: string; filename: string }>;
      }
    } catch (err: unknown) {
      // Non-fatal — project still loads, just without proxy info
      console.warn('[ProjectLoad] proxy asset lookup failed:', err instanceof Error ? err.message : err);
    }

    return NextResponse.json({
      success: true,
      project,
      ...(proxyAssets.length > 0 && { proxyAssets }),
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
  { params }: { params: Promise<{ projectId: string }> }
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
