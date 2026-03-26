/**
 * POST /api/internal/workers/pipeline/audio
 *
 * QStash worker that generates BGM or SFX for a finalized project.
 * Called AFTER finalize creates the project — adds audio overlays
 * to an existing project without blocking project creation.
 *
 * Each worker invocation has its own 300s Vercel timeout.
 * BGM and SFX are dispatched as separate QStash messages so they
 * run in parallel independently.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { generateBackgroundMusic, buildMusicPrompt } from '@/lib/pipeline/bgm-service';
import { generateSFXForScenes } from '@/lib/pipeline/sfx-service';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface AudioWorkerPayload {
  type: 'bgm' | 'sfx';
  projectId: string;
  userId: string;
  storyboardId: string;
  // BGM fields
  musicPrompt?: string;
  totalDurationSec?: number;
  totalFrames?: number;
  fps?: number;
  // SFX fields
  sfxInputs?: Array<{
    sceneIndex: number;
    audioDescription: string;
    durationSeconds: number;
    videoUrl?: string;
  }>;
  sceneFrameMap?: Array<{
    sceneIndex: number;
    fromFrame: number;
    durationFrames: number;
    durationSec: number;
  }>;
}

async function handler(request: NextRequest) {
  const startMs = Date.now();
  try {
    const payload: AudioWorkerPayload = await request.json();
    const { type, projectId, userId, storyboardId } = payload;

    console.log(`[AudioWorker] Processing ${type} for project ${projectId}`);

    const db = await getDatabase();

    if (type === 'bgm') {
      const { musicPrompt, totalDurationSec, totalFrames, fps } = payload;
      if (!musicPrompt || !totalDurationSec || !totalFrames || !fps) {
        console.error('[AudioWorker] BGM: missing required fields');
        return NextResponse.json({ success: false, error: 'Missing BGM fields' }, { status: 400 });
      }

      const bgm = await generateBackgroundMusic(musicPrompt, userId, totalDurationSec);

      // A5 FIX: Use timestamp + crypto random for guaranteed unique IDs across concurrent workers
      const overlayId = Date.now() * 1000 + Math.floor(Math.random() * 999999);
      const bgmOverlay = {
        id: overlayId,
        type: 'sound',
        from: 0,
        durationInFrames: totalFrames,
        row: 5,
        left: 0, top: 0, width: 0, height: 0,
        isDragging: false, rotation: 0,
        content: bgm.audioUrl,
        src: bgm.audioUrl,
        assetId: bgm.audioAssetId,
        styles: {
          volume: 0.75,
          opacity: 1,
          duckingConfig: {
            enabled: true,
            duckLevel: 0.20,
            rampDownMs: 300,
            rampUpMs: 600,
            lookAheadMs: 200,
          },
        },
      };

      // F6.6 FIX: Push to overlays AND mark as worker-added.
      // The _workerAdded flag tells saveProject to preserve these overlays
      // even when the user saves (browser autosave would otherwise clobber them).
      const markedBgm = { ...bgmOverlay, _workerAdded: true };
      await db.collection(COLLECTIONS.PROJECTS).updateOne(
        { projectId },
        {
          $push: { 'overlays': markedBgm as any },
          $set: { updatedAt: new Date() },
        },
      );

      // Register asset
      await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
        { assetId: bgm.audioAssetId },
        {
          $setOnInsert: {
            assetId: bgm.audioAssetId, userId, type: 'audio',
            filename: `${bgm.audioAssetId}.mp3`, source: 'user-upload',
            gcsPath: bgm.gcsPath, cachedUrl: bgm.audioUrl,
            urlExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            size: 0, uploadedAt: new Date(),
          },
        },
        { upsert: true },
      );

      console.log(`[AudioWorker] BGM complete: ${bgm.audioAssetId} (${Date.now() - startMs}ms)`);
      return NextResponse.json({ success: true, type: 'bgm', assetId: bgm.audioAssetId });

    } else if (type === 'sfx') {
      const { sfxInputs, sceneFrameMap } = payload;
      if (!sfxInputs || !sceneFrameMap || sfxInputs.length === 0) {
        console.error('[AudioWorker] SFX: missing required fields');
        return NextResponse.json({ success: false, error: 'Missing SFX fields' }, { status: 400 });
      }

      const sfxResults = await generateSFXForScenes(sfxInputs, userId);

      let overlayId = Date.now() * 1000 + 500000 + Math.floor(Math.random() * 499999);
      const sfxOverlays: any[] = [];

      for (const [sceneIndex, sfx] of sfxResults) {
        const frameInfo = sceneFrameMap.find(f => f.sceneIndex === sceneIndex);
        if (!frameInfo) continue;

        sfxOverlays.push({
          id: overlayId++,
          type: 'sound',
          from: frameInfo.fromFrame,
          durationInFrames: frameInfo.durationFrames,
          row: 6,
          left: 0, top: 0, width: 0, height: 0,
          isDragging: false, rotation: 0,
          content: sfx.audioUrl,
          src: sfx.audioUrl,
          assetId: sfx.audioAssetId,
          styles: { volume: 0.3, opacity: 1 }, // 30% — SFX should complement, not overpower narration
        });

        // Register asset
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: sfx.audioAssetId },
          {
            $setOnInsert: {
              assetId: sfx.audioAssetId, userId, type: 'audio',
              filename: `${sfx.audioAssetId}.mp3`, source: 'user-upload',
              gcsPath: sfx.gcsPath, cachedUrl: sfx.audioUrl,
              urlExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              size: 0, uploadedAt: new Date(),
            },
          },
          { upsert: true },
        );
      }

      // F6.6 FIX: Push SFX with _workerAdded flag
      if (sfxOverlays.length > 0) {
        const markedSfx = sfxOverlays.map(o => ({ ...o, _workerAdded: true }));
        await db.collection(COLLECTIONS.PROJECTS).updateOne(
          { projectId },
          {
            $push: { 'overlays': { $each: markedSfx } },
            $set: { updatedAt: new Date() },
          },
        );
      }

      console.log(`[AudioWorker] SFX complete: ${sfxResults.size} clips (${Date.now() - startMs}ms)`);
      return NextResponse.json({ success: true, type: 'sfx', clips: sfxResults.size });
    }

    return NextResponse.json({ success: false, error: `Unknown type: ${type}` }, { status: 400 });
  } catch (error: any) {
    console.error(`[AudioWorker] Error:`, error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
const hasSigningKeys = !!process.env.QSTASH_CURRENT_SIGNING_KEY && !!process.env.QSTASH_NEXT_SIGNING_KEY;

async function secureHandler(request: NextRequest) {
  if (!isDev && !hasSigningKeys) {
    console.error('[AudioWorker] SECURITY: QSTASH signing keys not set in production. Rejecting.');
    return NextResponse.json({ error: 'Worker not configured' }, { status: 500 });
  }
  return handler(request);
}

export const POST = isDev ? handler : (hasSigningKeys ? verifySignatureAppRouter(handler) : secureHandler);
