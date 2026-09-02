/**
 * GET /api/services/editron/projects/[projectId]
 * Load a specific project
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  ProjectMutationConflictError,
  ProjectNotFoundOrForbiddenError,
  projectService,
  type ProjectRevisionV1,
} from '@/lib/editron/services/project-service';
import { auth } from '@clerk/nextjs/server';
import { ProjectAssetSourceUnverifiableErrorV1 }
  from '@/lib/editron/services/asset-resolver';

export const runtime = 'nodejs';

function parseExpectedRevision(input: unknown): ProjectRevisionV1 | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const revision = (input as Record<string, unknown>).expectedRevision;
  if (!revision || typeof revision !== 'object' || Array.isArray(revision)) return null;
  const candidate = revision as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1
    || !Number.isSafeInteger(candidate.value)
    || (candidate.value as number) < 0
    || typeof candidate.compatibilityUpdatedAt !== 'string'
    || Number.isNaN(new Date(candidate.compatibilityUpdatedAt).getTime())
  ) return null;
  return {
    schemaVersion: 1,
    value: candidate.value as number,
    compatibilityUpdatedAt: new Date(candidate.compatibilityUpdatedAt).toISOString(),
  };
}

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
    const expectedRevision = parseExpectedRevision(
      await request.json().catch(() => null),
    );
    if (!expectedRevision) {
      return NextResponse.json(
        {
          success: false,
          error: 'Project deletion requires the exact revision shown to the user.',
          code: 'PROJECT_DELETE_REVISION_REQUIRED',
        },
        { status: 400 },
      );
    }

    const result = await projectService.deleteProject(userId, projectId, expectedRevision);

    return NextResponse.json({
      success: true,
      message: 'Project deleted successfully',
      deletionStatus: result.status,
      terminalRevision: result.tombstone.afterRevision,
    });
  } catch (error: unknown) {
    console.error('Error deleting project:', error);
    if (error instanceof ProjectMutationConflictError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
          currentRevision: error.currentRevision,
        },
        { status: 409 },
      );
    }
    if (error instanceof ProjectNotFoundOrForbiddenError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete project',
      },
      { status: 500 }
    );
  }
}
