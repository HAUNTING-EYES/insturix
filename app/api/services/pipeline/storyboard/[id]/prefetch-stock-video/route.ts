/**
 * POST /api/services/pipeline/storyboard/[id]/prefetch-stock-video
 *
 * Pre-fetch stock video from Pixabay/Pexels for montage sub-shots.
 * Runs PARALLEL to AI video generation (fire-and-forget from frontend).
 * Results stored on storyboard scenes so finalize can use cached stock video
 * instead of AI-generated clips for sub-shots.
 *
 * Only processes sub-shots with assetRecommendation: 'stock'.
 * Ken Burns animated-still is the LAST RESORT — stock video is always preferred.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStoryboard, updateStoryboardScene } from '@/lib/pipeline/storyboard-db';
import { searchAndDownloadStockVideo, isStockVideoAvailable } from '@/lib/pipeline/stock-video-service';

export const runtime = 'nodejs';
export const maxDuration = 120; // Stock video download can be slow (large files)

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

    if (!isStockVideoAvailable()) {
      return NextResponse.json({ success: true, cached: 0, message: 'No stock video API keys configured' });
    }

    const { id } = await params;
    const storyboard = await getStoryboard(id, userId);
    if (!storyboard) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Determine aspect ratio for orientation
    const aspectRatio = (storyboard as any).aspectRatio || '16:9';
    const orientation = aspectRatio.includes('9:16') ? 'portrait' as const
      : aspectRatio.includes('1:1') ? 'square' as const
      : 'landscape' as const;

    // Collect all sub-shots that need stock video
    interface StockJob {
      sceneIndex: number;
      subShotIndex: number;
      query: string;
      minDurationSec: number;
      maxDurationSec: number;
    }
    const jobs: StockJob[] = [];

    for (const scene of storyboard.scenes) {
      const descriptor = scene.descriptor as any;
      const subShots = descriptor.subShots || [];

      for (let si = 0; si < subShots.length; si++) {
        const sub = subShots[si];
        // Only process sub-shots explicitly marked for stock
        if (sub.assetRecommendation === 'stock' && sub.independentGeneration) {
          const targetSec = sub.targetDurationSeconds || 3;
          jobs.push({
            sceneIndex: scene.sceneIndex,
            subShotIndex: si,
            query: sub.visualDescription || sub.description || '',
            minDurationSec: targetSec, // Stock clip must be at least this long (trim, never stretch)
            maxDurationSec: Math.max(targetSec + 5, 10), // Allow longer clips to trim from
          });
        }
      }
    }

    if (jobs.length === 0) {
      return NextResponse.json({ success: true, cached: 0, message: 'No sub-shots need stock video' });
    }

    console.log(`[prefetch-stock-video] Searching stock video for ${jobs.length} sub-shots (${orientation})`);

    let cached = 0;
    let failed = 0;

    // Process in parallel (max 5 concurrent to avoid rate limits)
    const CONCURRENCY = 5;
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      const batch = jobs.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (job) => {
          const result = await searchAndDownloadStockVideo(job.query, userId!, {
            minDurationSec: job.minDurationSec,
            maxDurationSec: job.maxDurationSec,
            orientation,
          });

          if (result) {
            // Cache on the storyboard scene's sub-shot
            const scene = storyboard.scenes.find(s => s.sceneIndex === job.sceneIndex);
            if (scene) {
              const descriptor = scene.descriptor as any;
              const subShots = descriptor.subShots || [];
              if (subShots[job.subShotIndex]) {
                subShots[job.subShotIndex].cachedStockVideo = {
                  videoUrl: result.videoUrl,
                  videoAssetId: result.assetId,
                  r2Key: result.r2Key,
                  durationMs: result.durationMs,
                  source: result.source,
                  thumbnailUrl: result.thumbnailUrl,
                  query: result.query,
                };
                // Update the entire descriptor (sub-shots are nested inside it)
                await updateStoryboardScene(id, job.sceneIndex, {
                  descriptor: descriptor,
                } as any);
              }
            }
            cached++;
            // Structured log for future quality gate tuning
            console.log(JSON.stringify({
              event: 'stock-video-placed',
              sceneIndex: job.sceneIndex,
              subShotIndex: job.subShotIndex,
              query: result.query,
              visualDescription: job.query.substring(0, 100),
              resultUrl: result.videoUrl,
              source: result.source,
              assetId: result.assetId,
              durationMs: result.durationMs,
              matchConfidence: 'unverified', // Will be set by quality gate when built
            }));
          } else {
            failed++;
            console.log(`[prefetch-stock-video] Scene ${job.sceneIndex} sub ${job.subShotIndex}: no stock found for "${job.query.substring(0, 40)}"`);
          }
        }),
      );

      // Count rejected promises
      failed += results.filter(r => r.status === 'rejected').length;
    }

    console.log(`[prefetch-stock-video] Done: ${cached} cached, ${failed} failed, ${jobs.length} total`);

    return NextResponse.json({
      success: true,
      cached,
      failed,
      total: jobs.length,
      orientation,
    });
  } catch (error: any) {
    console.error('[prefetch-stock-video] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
