/**
 * POST /api/services/pipeline/storyboard/[id]/prefetch-sfx
 *
 * Pre-fetch SFX from Pixabay/Freesound library based on scene audioDescriptions.
 * Runs PARALLEL to video generation (fire-and-forget from frontend).
 * Results stored on storyboard scenes so finalize can use cached SFX
 * instead of slow AI generation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStoryboard, updateStoryboardScene } from '@/lib/pipeline/storyboard-db';
import { searchAndDownloadSFX } from '@/lib/pipeline/sfx-library-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    let userId: string | null = null;
    try { const a = await auth(); userId = a.userId; } catch {}
    const body = await req.json().catch(() => ({}));
    if (!userId && body.userId) userId = body.userId;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const storyboard = await getStoryboard(id, userId);
    if (!storyboard) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const scenesWithAudio = storyboard.scenes.filter(
      s => s.descriptor.audioDescription?.trim(),
    );

    if (scenesWithAudio.length === 0) {
      return NextResponse.json({ success: true, cached: 0, message: 'No scenes with audio descriptions' });
    }

    console.log(`[prefetch-sfx] Searching SFX library for ${scenesWithAudio.length} scenes`);

    let cached = 0;
    const results = await Promise.allSettled(
      scenesWithAudio.map(async (scene) => {
        const query = scene.descriptor.audioDescription!;
        const durationSec = Math.min(scene.descriptor.durationSeconds, 10);

        const sfx = await searchAndDownloadSFX(query, userId, { maxDuration: durationSec });
        if (sfx) {
          // Cache on the storyboard scene for finalize to use
          await updateStoryboardScene(id, scene.sceneIndex, {
            cachedSfx: {
              audioUrl: sfx.audioUrl,
              audioAssetId: sfx.audioAssetId,
              gcsPath: sfx.gcsPath,
              durationMs: sfx.durationMs,
              source: sfx.source,
              query,
            },
          } as any);
          cached++;
          console.log(`[prefetch-sfx] Scene ${scene.sceneIndex}: "${query.substring(0, 40)}" → ${sfx.source} (${sfx.originalTitle || sfx.audioAssetId})`);
        }
      }),
    );

    const failed = results.filter(r => r.status === 'rejected').length;
    console.log(`[prefetch-sfx] Done: ${cached} cached, ${failed} failed`);

    return NextResponse.json({ success: true, cached, failed, total: scenesWithAudio.length });
  } catch (error: any) {
    console.error('[prefetch-sfx] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
