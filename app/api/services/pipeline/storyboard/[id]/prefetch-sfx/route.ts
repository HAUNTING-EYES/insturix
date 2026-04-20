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
import { searchAndDownloadSFX, audioDescriptionToSearchQuery } from '@/lib/pipeline/sfx-library-service';

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

    // 2026-04-20 fix (part of SFX 3-chain Phase B2):
    //
    // Old code pulled `audioDescription` as a fallback source when sfxDescription
    // and sfxCue were both empty. But per the SceneDescriptor schema,
    // audioDescription is the DEPRECATED field that now holds MUSIC description
    // (copy of musicDescription for backward compat). Passing music to a SFX
    // library search returns zero hits — confirmed in proj_FRDtVSjoFvZr log
    // ("uplifting and warm piano music, swelling..." → 0 results).
    //
    // Fix: only source from SFX-specific fields (sfxDescription, sfxCue). If
    // both are empty, the scene genuinely has no SFX intent — skip pre-fetch.
    const scenesWithAudio = storyboard.scenes.filter(s => {
      const desc = s.descriptor as any;
      return desc.sfxDescription?.trim() || desc.editDirections?.sfxCue?.trim();
    });

    if (scenesWithAudio.length === 0) {
      return NextResponse.json({ success: true, cached: 0, message: 'No scenes with SFX descriptions' });
    }

    console.log(`[prefetch-sfx] Searching SFX library for ${scenesWithAudio.length} scenes`);

    let cached = 0;
    const results = await Promise.allSettled(
      scenesWithAudio.map(async (scene) => {
        const desc = scene.descriptor as any;
        const rawQuery = desc.sfxDescription?.trim() || desc.editDirections?.sfxCue?.trim() || '';

        // 2026-04-20 fix (SFX 3-chain Phase B2):
        //
        // Old code passed rawQuery (natural-language, e.g. "faint distant
        // children's laughter, subtle ambient restaurant hum") straight to
        // Freesound — which indexes by single-word tags. Zero hits confirmed in
        // proj_FRDtVSjoFvZr log for every scene.
        //
        // The codebase already has audioDescriptionToSearchQuery() which
        // extracts one atomic KB token ("laugh", "chatter", "whoosh") from the
        // description. sfx-service.ts:80 uses it correctly; only this prefetch
        // route was bypassing it. Wiring it in now so prefetch has the same
        // hit rate as the main SFX path.
        const searchQuery = audioDescriptionToSearchQuery(rawQuery);
        const durationSec = Math.min(scene.descriptor.durationSeconds, 10);

        const sfx = await searchAndDownloadSFX(searchQuery, userId!, durationSec);
        if (sfx) {
          // Cache on the storyboard scene for finalize to use
          await updateStoryboardScene(id, scene.sceneIndex, {
            cachedSfx: {
              audioUrl: sfx.audioUrl,
              audioAssetId: sfx.audioAssetId,
              gcsPath: sfx.gcsPath,
              durationMs: sfx.durationMs,
              source: sfx.source,
              query: searchQuery,
              rawDescription: rawQuery,
            },
          } as any);
          cached++;
          console.log(`[prefetch-sfx] Scene ${scene.sceneIndex}: "${rawQuery.substring(0, 40)}" → tok="${searchQuery}" → ${sfx.source} (${sfx.originalTitle || sfx.audioAssetId})`);
        } else {
          console.log(`[prefetch-sfx] Scene ${scene.sceneIndex}: "${rawQuery.substring(0, 40)}" → tok="${searchQuery}" → no library match (will fall back to mirelo/CassetteAI during finalize)`);
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
