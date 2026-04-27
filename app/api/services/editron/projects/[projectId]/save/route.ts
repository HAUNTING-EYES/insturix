/**
 * POST /api/services/editron/projects/[projectId]/save
 * Manual save project
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/lib/editron/services/project-service';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

export const runtime = 'nodejs';

// Input validation schema
const SaveProjectSchema = z.object({
  overlays: z.array(z.any()),
  aspectRatio: z.string(),
  playerDimensions: z.object({
    width: z.number().positive(),
    height: z.number().positive()
  }),
  fps: z.number().positive().optional(),
  durationInFrames: z.number().nonnegative().optional()
});

export async function POST(
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

    // Validate projectId format
    if (!projectId || projectId.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Invalid project ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    
    // Validate input
    const validationResult = SaveProjectSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid project data', 
          details: validationResult.error.issues
        },
        { status: 400 }
      );
    }

    const state = validationResult.data;

    // ─── Overlay diff: detect added/removed assets + overrides ─────
    // Load previous state BEFORE save so we can diff
    let graphDispatchPromise: Promise<void> | null = null;
    try {
      const prev = await projectService.loadProject(userId, projectId);
      if (prev?.overlays) {
        // Safe upcast: Overlay[] → OverlayLike[] (OverlayLike is a subset of Overlay's shape)
        graphDispatchPromise = dispatchOverlayDiff(
          userId, projectId, prev.overlays as OverlayLike[], state.overlays as OverlayLike[],
        );
      }
    } catch (diffLoadErr: unknown) {
      // Save MUST proceed even if diff loading fails, but make the failure visible.
      const msg = diffLoadErr instanceof Error ? diffLoadErr.message : String(diffLoadErr);
      console.warn(`[Save] Overlay diff pre-load failed: ${msg}. Save proceeds without graph diff.`);
    }

    // Zod's z.any() overlays can't express the full EditorState type.
    // This is the one legitimate cast — the Zod schema validates structure,
    // but saveProject expects the full EditorState interface.
    await projectService.saveProject(userId, projectId, state as Parameters<typeof projectService.saveProject>[2]);

    // Await graph dispatch after save (non-blocking pattern — errors don't fail save)
    if (graphDispatchPromise) {
      graphDispatchPromise.catch((err: Error) =>
        console.warn(`[Save] Graph diff dispatch failed: ${err.message}`)
      );
    }

    return NextResponse.json({
      success: true,
      savedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error saving project:', errMsg);

    // Handle specific errors
    if (errMsg === 'Project not found') {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: errMsg || 'Failed to save project' },
      { status: 500 }
    );
  }
}

// ─── Overlay Diff + Override Detection ───────────────────────────
// Minimal overlay shape — covers the fields we actually access.
// Avoids `as any` casts (Rule 12N) while remaining compatible with
// the untyped Zod `z.array(z.any())` output from SaveProjectSchema.
interface OverlayLike {
  id: number | string;
  type: string;
  from?: number;
  durationInFrames?: number;
  row?: number;
  assetId?: string;
  transitionStyle?: string;
  filterPresetId?: string;
  metadata?: {
    assetId?: string;
    sceneIndex?: number;
    mood?: string;
    transitionType?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

async function dispatchOverlayDiff(
  userId: string,
  projectId: string,
  prevOverlays: OverlayLike[],
  newOverlays: OverlayLike[],
) {
  const qstashToken = process.env.QSTASH_TOKEN;
  if (!qstashToken) return;

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  const graphSyncUrl = `${baseUrl}/api/internal/workers/graph-sync`;

  // Collect video/image asset IDs from overlays
  const getAssetIds = (overlays: OverlayLike[]) => new Set(
    overlays
      .filter(o => (o.type === 'video' || o.type === 'image') && o.metadata?.assetId)
      .map(o => o.metadata!.assetId as string)
  );

  const prevAssets = getAssetIds(prevOverlays);
  const newAssets = getAssetIds(newOverlays);

  // Helper: dispatch to graph-sync worker via QStash
  const dispatchGraphSync = async (action: string, data: Record<string, unknown>) => {
    await fetch('https://qstash.upstash.io/v2/publish/' + encodeURIComponent(graphSyncUrl), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${qstashToken}`,
        'Content-Type': 'application/json',
        'Upstash-Retries': '2',
      },
      body: JSON.stringify({ action, data }),
    });
  };

  // Added assets → USED_IN edges
  for (const assetId of newAssets) {
    if (!prevAssets.has(assetId)) {
      const overlay = newOverlays.find(o => o.metadata?.assetId === assetId);
      try {
        await dispatchGraphSync('asset_used', {
          assetId,
          projectId,
          props: {
            sceneId: `${projectId}_user_add_${Date.now()}`,
            sceneIndex: overlay?.metadata?.sceneIndex ?? 0,
            trimStart: null,
            trimEnd: null,
            role: 'hero',
            filterApplied: null,
            wasKept: true,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[Save] USED_IN dispatch failed for ${assetId}: ${msg}`);
      }
    }
  }

  // Removed assets → REMOVED_FROM edges
  // OLD: hardcoded neutral values (sceneEnergy:0.5, assetMood:'neutral', etc.) — Rule 23N violation.
  //   The contextual scoring math was structurally degenerate because every removal looked identical.
  // NEW: send assetId + sceneIndex only. The graph-sync worker queries Neo4j for real Asset + Scene
  //   attributes (mood, energy, colorTemp) and computes contrast flags before writing the edge.
  for (const assetId of prevAssets) {
    if (!newAssets.has(assetId)) {
      const prevOverlay = prevOverlays.find(o => o.metadata?.assetId === assetId);
      try {
        await dispatchGraphSync('asset_removed', {
          assetId,
          projectId,
          sceneIndex: prevOverlay?.metadata?.sceneIndex ?? null,
          removedAt: new Date().toISOString(),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[Save] REMOVED_FROM dispatch failed for ${assetId}: ${msg}`);
      }
    }
  }

  // Override detection: compare transitions, filters changed by user
  const overrides: string[] = [];

  const getTransitions = (overlays: OverlayLike[]) =>
    overlays.filter(o => o.type === 'transition').map(o => ({
      id: o.id,
      type: o.transitionStyle || o.metadata?.transitionType || null,
    }));

  const prevTrans = getTransitions(prevOverlays);
  const newTrans = getTransitions(newOverlays);

  for (const nt of newTrans) {
    const pt = prevTrans.find(p => p.id === nt.id);
    if (pt && pt.type !== nt.type) {
      overrides.push(`transition changed from ${pt.type} to ${nt.type}`);
    }
  }

  const getFilter = (overlays: OverlayLike[]) =>
    overlays.filter(o => o.type === 'video' && o.filterPresetId).map(o => o.filterPresetId!);
  const prevFilters = getFilter(prevOverlays);
  const newFilters = getFilter(newOverlays);
  if (prevFilters.length > 0 && newFilters.length > 0 && prevFilters[0] !== newFilters[0]) {
    overrides.push(`filter changed from ${prevFilters[0]} to ${newFilters[0]}`);
  }

  // Dispatch override episode if changes detected.
  // Rule 11N: scope to brandId when available so agency multi-brand intelligence stays separate.
  if (overrides.length > 0) {
    try {
      const { addGraphitiEpisode } = await import('@/lib/editron/services/graph-service');
      // Try to get brandId from the MongoDB project doc (set during finalize if brand was selected).
      let groupId = userId;
      try {
        const { getDatabase } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        const projDoc = await db.collection('projects').findOne(
          { projectId },
          { projection: { brandId: 1 } },
        );
        if (projDoc?.brandId) groupId = projDoc.brandId as string;
      } catch {
          // Fallback to userId if project lookup fails. Episode still dispatches,
          // just without brand scoping. Logged per Rule 18N.
          console.warn(`[Save] brandId lookup failed for project ${projectId}, falling back to userId`);
        }

      await addGraphitiEpisode({
        type: 'user_override',
        name: `override_${projectId}_${Date.now()}`,
        body: `User made ${overrides.length} editing overrides on project ${projectId}: ${overrides.join('. ')}.`,
        sourceDescription: 'user_override',
        groupId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Save] Override episode dispatch failed: ${msg}`);
    }
  }
}
