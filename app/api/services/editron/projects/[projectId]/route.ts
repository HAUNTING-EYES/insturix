/**
 * GET /api/services/editron/projects/[projectId]
 * Load a specific project
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/editron/services/project-service';
import { auth } from '@clerk/nextjs/server';
import { ProjectAssetSourceUnverifiableErrorV1 }
  from '@/lib/editron/services/asset-resolver';

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

    // Report the source selected by this project. A reusable MediaAsset's
    // global `isProxy` lifecycle is not playback authority for any project.
    const proxyPins = new Map<string, {
      assetId: string;
      overlayIds: number[];
      sourceVersionSha256: string;
    }>();
    for (const overlay of project.overlays ?? []) {
      const pin = overlay.type === 'video' && 'sourceVersionPinV1' in overlay
        ? overlay.sourceVersionPinV1
        : undefined;
      if (!pin || pin.sourceRole !== 'PROXY') continue;
      const current = proxyPins.get(pin.assetId);
      if (current) {
        current.overlayIds.push(overlay.id);
      } else {
        proxyPins.set(pin.assetId, {
          assetId: pin.assetId,
          overlayIds: [overlay.id],
          sourceVersionSha256: pin.sourceVersionSha256,
        });
      }
    }
    let proxyAssets = Array.from(proxyPins.values()).map((entry) => ({
      ...entry,
      sourceRole: 'PROXY' as const,
      selectionAuthority: 'PROJECT_SOURCE_PIN' as const,
      filename: null as string | null,
    }));
    try {
      const proxyAssetIds = Array.from(proxyPins.keys());
      if (proxyAssetIds.length > 0) {
        const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        const assets = await db.collection(COLLECTIONS.MEDIA_ASSETS)
          .find({ assetId: { $in: proxyAssetIds } })
          .project({ assetId: 1, filename: 1, _id: 0 })
          .toArray();
        const filenames = new Map(
          assets.map((asset) => [String(asset.assetId), String(asset.filename)]),
        );
        proxyAssets = proxyAssets.map((entry) => ({
          ...entry,
          filename: filenames.get(entry.assetId) ?? null,
        }));
      }
    } catch (err: unknown) {
      // Filename enrichment is non-authoritative. Keep the validated pin status.
      console.warn('[ProjectLoad] proxy filename lookup failed:', err instanceof Error ? err.message : err);
    }

    return NextResponse.json({
      success: true,
      project,
      ...(proxyAssets.length > 0 && { proxyAssets }),
    });
  } catch (error: unknown) {
    console.error('Error loading project:', error);
    if (error instanceof ProjectAssetSourceUnverifiableErrorV1) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
          details: error.diagnostic,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load project',
      },
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
