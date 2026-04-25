/**
 * POST /api/internal/workers/graph-sync
 *
 * QStash worker that syncs MongoDB writes to the Neo4j knowledge graph.
 * Dispatched after: asset upload, asset analysis complete, project create,
 * Director complete, user override, asset removal.
 *
 * Each action type maps to a specific graph-service operation.
 * On failure: retried by QStash (3x exponential backoff), then
 * graphSyncStatus set to 'failed' on the MongoDB doc for cron re-queue.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

export const runtime = 'nodejs';
export const maxDuration = 30;

type SyncAction =
  | 'asset_created'
  | 'asset_enriched'
  | 'project_created'
  | 'project_director_complete'
  | 'project_outcome'
  | 'scene_batch'
  | 'asset_used'
  | 'asset_removed'
  | 'asset_kept';

interface GraphSyncPayload {
  action: SyncAction;
  data: Record<string, unknown>;
}

async function handler(request: NextRequest) {
  const startMs = Date.now();

  try {
    const payload: GraphSyncPayload = await request.json();
    const { action, data } = payload;

    if (!action || !data) {
      return NextResponse.json({ error: 'Missing action or data' }, { status: 400 });
    }

    const {
      createAssetNode,
      enrichAssetNode,
      createProjectNode,
      updateProjectAfterDirector,
      updateProjectOutcome,
      writeSceneBatch,
      createUsedInEdge,
      createRemovedFromEdge,
      markAssetKept,
      updateMongoSyncStatus,
      isNeo4jAvailable,
    } = await import('@/lib/editron/services/graph-service');

    const available = await isNeo4jAvailable();
    if (!available) {
      console.warn(`[GraphSync] Neo4j unavailable, skipping ${action}`);
      return NextResponse.json({ success: false, error: 'Neo4j unavailable' }, { status: 503 });
    }

    let result: { ok: boolean; error?: string };

    switch (action) {
      case 'asset_created': {
        const { assetId, userId, type, duration } = data as {
          assetId: string; userId: string; type: 'video' | 'image' | 'audio'; duration?: number;
        };
        result = await createAssetNode(assetId, userId, type, (duration as number) ?? null);
        if (result.ok) {
          await updateMongoSyncStatus('mediaAssets', assetId, 'assetId', 'synced');
        }
        break;
      }

      case 'asset_enriched': {
        const { assetId, enrichment } = data as { assetId: string; enrichment: Parameters<typeof enrichAssetNode>[1] };
        result = await enrichAssetNode(assetId, enrichment);
        if (result.ok) {
          await updateMongoSyncStatus('mediaAssets', assetId, 'assetId', 'synced');
        }
        break;
      }

      case 'project_created': {
        const { projectId, userId, contentType, brandId, sceneCount, durationSec } = data as {
          projectId: string; userId: string; contentType: string;
          brandId?: string; sceneCount?: number; durationSec?: number;
        };
        result = await createProjectNode({ projectId, userId, contentType, brandId, sceneCount, durationSec });
        if (result.ok) {
          await updateMongoSyncStatus('projects', projectId, 'projectId', 'synced');
        }
        break;
      }

      case 'project_director_complete': {
        const { projectId, update } = data as { projectId: string; update: Parameters<typeof updateProjectAfterDirector>[1] };
        result = await updateProjectAfterDirector(projectId, update);
        break;
      }

      case 'project_outcome': {
        const { projectId, outcome } = data as { projectId: string; outcome: 'published' | 'archived' };
        result = await updateProjectOutcome(projectId, outcome);
        break;
      }

      case 'scene_batch': {
        const { projectId, version, scenes } = data as {
          projectId: string; version: number; scenes: Parameters<typeof writeSceneBatch>[2];
        };
        result = await writeSceneBatch(projectId, version, scenes);
        break;
      }

      case 'asset_used': {
        const { assetId, projectId, props } = data as {
          assetId: string; projectId: string; props: Parameters<typeof createUsedInEdge>[2];
        };
        result = await createUsedInEdge(assetId, projectId, props);
        break;
      }

      case 'asset_removed': {
        const { assetId, projectId, props } = data as {
          assetId: string; projectId: string; props: Parameters<typeof createRemovedFromEdge>[2];
        };
        result = await createRemovedFromEdge(assetId, projectId, props);
        break;
      }

      case 'asset_kept': {
        const { assetId, projectId, sceneId } = data as {
          assetId: string; projectId: string; sceneId: string;
        };
        result = await markAssetKept(assetId, projectId, sceneId);
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const durationMs = Date.now() - startMs;
    if (result.ok) {
      console.log(`[GraphSync] ${action} succeeded (${durationMs}ms)`);
      return NextResponse.json({ success: true, action, durationMs });
    }

    console.error(`[GraphSync] ${action} failed: ${result.error}`);
    // 500 triggers QStash retry
    return NextResponse.json({ success: false, action, error: result.error }, { status: 500 });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[GraphSync] Worker error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler;
