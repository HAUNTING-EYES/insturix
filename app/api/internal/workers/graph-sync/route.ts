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
import { withInternalQStashWorkerAuth } from '@/lib/editron/security/internal-worker-auth';

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
        // NEW: Worker enriches REMOVED_FROM edge with real Asset + Scene attributes from Neo4j.
        // OLD: save route sent hardcoded neutral values (Rule 23N violation — contextual scoring was degenerate).
        // NOW: save route sends assetId + sceneIndex only, worker queries Neo4j for real data.
        const { assetId: removedAssetId, projectId: removedProjectId, sceneIndex, removedAt } = data as {
          assetId: string; projectId: string; sceneIndex: number | null; removedAt: string;
        };

        // Query Asset node for real attributes
        const { getAssetNode, getActiveScenes } = await import('@/lib/editron/services/graph-service');
        const assetNode = await getAssetNode(removedAssetId);
        const assetMood = assetNode?.mood ?? 'neutral';
        const assetEnergy = assetNode?.energy ?? 0.5;
        const assetColorTemp = assetNode?.colorTemp ?? 'neutral';

        // Query Scene node for real context
        let sceneMood = 'neutral';
        let sceneEnergy = 0.5;
        let sceneType = 'continuous';
        let adjacentMood = 'neutral';
        if (sceneIndex != null) {
          const activeScenes = await getActiveScenes(removedProjectId);
          const scene = activeScenes.find(s => s.sceneIndex === sceneIndex);
          if (scene) {
            sceneMood = scene.mood ?? 'neutral';
            sceneEnergy = scene.energy ?? 0.5;
            sceneType = scene.sceneType ?? 'continuous';
          }
          // Adjacent mood: the scene before or after
          const adjacent = activeScenes.find(s => s.sceneIndex === (sceneIndex + 1))
            || activeScenes.find(s => s.sceneIndex === (sceneIndex - 1));
          if (adjacent) adjacentMood = adjacent.mood ?? 'neutral';
        }

        // Compute contrast flags (real math, not hardcoded false)
        const colorTempContrast = assetColorTemp !== 'neutral' && assetColorTemp !== sceneMood;
        const energyGap = Math.abs(assetEnergy - sceneEnergy);
        const moodContrast = assetMood !== sceneMood && assetMood !== 'neutral' && sceneMood !== 'neutral';

        const enrichedProps = {
          sceneId: `${removedProjectId}_user_remove_${Date.now()}`,
          sceneMood,
          sceneEnergy,
          sceneType,
          adjacentMood,
          assetColorTemp,
          assetEnergy,
          assetMood,
          colorTempContrast,
          energyGap,
          moodContrast,
          removedAt: removedAt || new Date().toISOString(),
        };

        console.log(`[GraphSync] asset_removed enriched: asset=${removedAssetId} mood=${assetMood} scene=${sceneMood} contrast=${moodContrast} gap=${energyGap.toFixed(2)}`);
        result = await createRemovedFromEdge(removedAssetId, removedProjectId, enrichedProps);
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

export const POST = withInternalQStashWorkerAuth(handler, 'graph-sync');
