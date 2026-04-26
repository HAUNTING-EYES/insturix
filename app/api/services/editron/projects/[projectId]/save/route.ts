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

    const state = validationResult.data as any; // Type assertion for compatibility

    // ─── Overlay diff: detect added/removed assets + overrides ─────
    // Load previous state BEFORE save so we can diff
    let graphDispatchPromise: Promise<void> | null = null;
    try {
      const prev = await projectService.loadProject(userId, projectId);
      if (prev?.overlays) {
        graphDispatchPromise = dispatchOverlayDiff(
          userId, projectId, prev.overlays, state.overlays,
          prev as any,
        );
      }
    } catch { /* non-fatal — save still proceeds */ }

    await projectService.saveProject(userId, projectId, state);

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
  } catch (error: any) {
    console.error('Error saving project:', error);
    
    // Handle specific errors
    if (error.message === 'Project not found') {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save project' },
      { status: 500 }
    );
  }
}

// ─── Overlay Diff + Override Detection ───────────────────────────

async function dispatchOverlayDiff(
  userId: string,
  projectId: string,
  prevOverlays: any[],
  newOverlays: any[],
  prevProject: any,
) {
  const qstashToken = process.env.QSTASH_TOKEN;
  if (!qstashToken) return;

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  const graphSyncUrl = `${baseUrl}/api/internal/workers/graph-sync`;

  // Collect video/image asset IDs from overlays
  const getAssetIds = (overlays: any[]) => new Set(
    overlays
      .filter((o: any) => (o.type === 'video' || o.type === 'image') && o.metadata?.assetId)
      .map((o: any) => o.metadata.assetId as string)
  );

  const prevAssets = getAssetIds(prevOverlays);
  const newAssets = getAssetIds(newOverlays);

  // Added assets → USED_IN edges
  for (const assetId of newAssets) {
    if (!prevAssets.has(assetId)) {
      const overlay = newOverlays.find((o: any) => o.metadata?.assetId === assetId);
      try {
        await fetch('https://qstash.upstash.io/v2/publish/' + encodeURIComponent(graphSyncUrl), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${qstashToken}`,
            'Content-Type': 'application/json',
            'Upstash-Retries': '2',
          },
          body: JSON.stringify({
            action: 'asset_used',
            data: {
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
            },
          }),
        });
      } catch { /* non-fatal */ }
    }
  }

  // Removed assets → REMOVED_FROM edges
  for (const assetId of prevAssets) {
    if (!newAssets.has(assetId)) {
      const prevOverlay = prevOverlays.find((o: any) => o.metadata?.assetId === assetId);
      try {
        await fetch('https://qstash.upstash.io/v2/publish/' + encodeURIComponent(graphSyncUrl), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${qstashToken}`,
            'Content-Type': 'application/json',
            'Upstash-Retries': '2',
          },
          body: JSON.stringify({
            action: 'asset_removed',
            data: {
              assetId,
              projectId,
              props: {
                sceneId: `${projectId}_user_remove_${Date.now()}`,
                sceneMood: prevOverlay?.metadata?.mood ?? 'neutral',
                sceneEnergy: 0.5,
                sceneType: 'continuous',
                adjacentMood: 'neutral',
                assetColorTemp: 'neutral',
                assetEnergy: 0.5,
                assetMood: 'neutral',
                colorTempContrast: false,
                energyGap: 0,
                moodContrast: false,
                removedAt: new Date().toISOString(),
              },
            },
          }),
        });
      } catch { /* non-fatal */ }
    }
  }

  // Override detection: compare transitions, filters changed by user
  const overrides: string[] = [];

  const getTransitions = (overlays: any[]) =>
    overlays.filter((o: any) => o.type === 'transition').map((o: any) => ({
      id: o.id, type: (o as any).transitionStyle || (o as any).metadata?.transitionType,
    }));

  const prevTrans = getTransitions(prevOverlays);
  const newTrans = getTransitions(newOverlays);

  for (const nt of newTrans) {
    const pt = prevTrans.find((p: any) => p.id === nt.id);
    if (pt && pt.type !== nt.type) {
      overrides.push(`transition changed from ${pt.type} to ${nt.type}`);
    }
  }

  const prevFilters = prevOverlays.filter((o: any) => o.type === 'video').map((o: any) => o.filterPresetId).filter(Boolean);
  const newFilters = newOverlays.filter((o: any) => o.type === 'video').map((o: any) => o.filterPresetId).filter(Boolean);
  if (prevFilters.length > 0 && newFilters.length > 0 && prevFilters[0] !== newFilters[0]) {
    overrides.push(`filter changed from ${prevFilters[0]} to ${newFilters[0]}`);
  }

  // Dispatch override episode if changes detected
  if (overrides.length > 0) {
    try {
      const { addGraphitiEpisode } = await import('@/lib/editron/services/graph-service');
      await addGraphitiEpisode({
        type: 'user_override',
        name: `override_${projectId}_${Date.now()}`,
        body: `User made ${overrides.length} editing overrides on project ${projectId}: ${overrides.join('. ')}.`,
        sourceDescription: 'user_override',
        groupId: userId,
      });
    } catch { /* non-fatal */ }
  }
}
