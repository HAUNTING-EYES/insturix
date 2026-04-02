import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Client } from '@upstash/qstash';
import { getStoryboard } from '@/lib/pipeline/storyboard-db';
import { projectService } from '@/lib/editron/services/project-service';
import { CreditsService } from '@/lib/services/creditsService';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import type { Storyboard } from '@/lib/pipeline/schemas/storyboard';
import { buildMusicPrompt, isBGMAvailable } from '@/lib/pipeline/bgm-service';
import { isSFXAvailable } from '@/lib/pipeline/sfx-service';
import { applyEditDirections } from '@/lib/pipeline/edit-direction-applier';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { getAnalysis, selectBestSegment } from '@/lib/editron/services/five-track-analysis';

export const runtime = 'nodejs';
export const maxDuration = 120; // Reduced — no longer generates audio inline

// withTimeout removed — BGM/SFX are now async QStash workers, not inline

/**
 * POST /api/services/pipeline/storyboard/[id]/finalize
 * Convert an approved storyboard into an Editron project.
 * Uses scene images as backgrounds, narration as text, voiceover as audio.
 * Cost: 1 credit.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { aspectRatio = '16:9', includeVoiceover = true, includeCaptions = true } = body;

    const storyboard = await getStoryboard(id, userId);
    if (!storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
    }

    // Deduct 1 credit
    const deductResult = await CreditsService.deductCredits(
      userId, 'pipeline', 'storyboard_finalize',
    );
    if (!deductResult.success) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    // Determine canvas dimensions
    let width = 1920, height = 1080;
    if (aspectRatio === '9:16') { width = 1080; height = 1920; }
    else if (aspectRatio === '1:1') { width = 1080; height = 1080; }
    else if (aspectRatio === '4:5') { width = 1080; height = 1350; }

    const fps = 30;
    const overlays: any[] = [];
    const warnings: string[] = [];
    let currentFrame = 0;
    let overlayId = Date.now() + Math.floor(Math.random() * 10000); // F6.4: random offset for ID uniqueness

    // Track per-scene frame offsets so we can place SFX overlays later
    const sceneFrameMap: Array<{ sceneIndex: number; fromFrame: number; durationFrames: number; durationSec: number }> = [];

    for (const scene of storyboard.scenes) {
      // Scene duration = MAX(video clip, voiceover, capped script estimate).
      // This prevents:
      // - Video cutting off (if video < voiceover)
      // - Voiceover overlapping into next scene (if voiceover > video)
      // - Huge gaps from script word-count estimates (capped at 15s)
      const videoScene = scene as any;
      const videoDurationSec = videoScene.videoDurationMs
        ? videoScene.videoDurationMs / 1000
        : null;
      const voiceoverDurationSec = scene.voiceover?.audioDurationMs
        ? scene.voiceover.audioDurationMs / 1000
        : null;
      const scriptDurationSec = scene.descriptor.durationSeconds || 0;

      // SCRIPT DURATION IS KING.
      // The script says how long each scene should be (from timestamps, narration length, etc.)
      // AI video clips are typically 5-10s but the scene might only need 2-4s of that.
      // We show only the FIRST N seconds of the video clip, matching the script's intent.
      //
      // Priority:
      // 1. Script duration (if > 0) — this is the creative intent from the script
      // 2. Voiceover duration — matches the spoken narration length
      // 3. Video clip duration — only when no script/voiceover data exists (e.g., user uploads)
      // 4. Default 5s
      let sceneDurationSec: number;
      if (scriptDurationSec > 0) {
        sceneDurationSec = scriptDurationSec;
      } else if (voiceoverDurationSec) {
        sceneDurationSec = voiceoverDurationSec;
      } else if (videoDurationSec) {
        sceneDurationSec = videoDurationSec;
      } else {
        sceneDurationSec = 5;
      }
      // Guard: ensure duration is valid (not NaN, 0, or negative)
      if (!sceneDurationSec || isNaN(sceneDurationSec) || sceneDurationSec <= 0) {
        warnings.push(`Scene ${scene.sceneIndex}: invalid duration ${sceneDurationSec}, defaulting to 5s (script=${scriptDurationSec}, vo=${voiceoverDurationSec}, video=${videoDurationSec})`);
        sceneDurationSec = 5;
      }
      const durationFrames = Math.round(sceneDurationSec * fps);

      // ─── Montage sub-shots with independent videos ─────────────
      // If this scene has sub-shots with their own video clips, place each
      // as a separate overlay on Row 2 (VIDEO), sequentially within the scene.
      const descriptor = scene.descriptor as any;
      const subShots = descriptor.subShots || [];
      const hasIndependentSubShots = subShots.some((s: any) => s.independentGeneration && (s.videoUrl || s.cachedStockVideo?.videoUrl || s.imageUrl));

      if (hasIndependentSubShots) {
        let subFrame = currentFrame;
        for (const sub of subShots) {
          if (!sub.independentGeneration) continue;
          // Sub-shot duration = targetDurationSeconds (how long to SHOW this cut),
          // NOT videoDurationMs (how long the AI clip is). A 5s AI clip shown for 1.3s
          // means we play only the first 1.3s. Using videoDurationMs here caused
          // sub-shots to play the FULL 5s clip → video "repeating" + timeline bloat (75s instead of 30s).
          let subDur = Math.round((sub.targetDurationSeconds || 3) * fps);
          if (!subDur || isNaN(subDur) || subDur <= 0) {
            warnings.push(`Scene ${scene.sceneIndex} sub-shot: invalid duration (targetDurationSeconds=${sub.targetDurationSeconds}), defaulting to 3s`);
            subDur = 90; // 3s at 30fps
          }
          // Enforce montage pacing bounds: min 1.5s, max 3s per sub-shot.
          // A scene with independent sub-shots IS a montage regardless of sceneType field
          // (parser may set sceneType='continuous' but still produce sub-shots).
          subDur = Math.max(subDur, 45); // Min 1.5s — shorter looks like a glitch
          subDur = Math.min(subDur, 90); // Max 3s for sub-shots — longer defeats rapid-cut purpose
          // Asset priority: AI video → cached stock video → storyboard image (Ken Burns last resort)
          const stockVideo = sub.cachedStockVideo;

          if (sub.videoUrl) {
            // Priority 1: AI-generated video clip
            const subOverlay: any = {
              id: overlayId++,
              type: 'video',
              from: subFrame,
              durationInFrames: subDur,
              row: ROW.VIDEO,
              left: 0, top: 0, width, height,
              isDragging: false, rotation: 0,
              content: sub.videoUrl,
              src: sub.videoUrl,
              assetId: sub.videoAssetId,
              posterUrl: sub.imageUrl || scene.imageUrl || undefined,
              styles: { objectFit: 'cover', opacity: 1 },
              metadata: {
                sceneIndex: scene.sceneIndex,
                subShotDescription: sub.description,
                isMontageSub: true,
                assetSource: 'ai-video',
              },
            };
            // Smart clip selection: pick best segment of the AI clip for the target duration
            if (sub.videoAssetId) {
              try {
                const analysis = await getAnalysis(sub.videoAssetId);
                if (analysis?.status === 'complete') {
                  const bestStart = selectBestSegment(analysis, subDur, fps);
                  if (bestStart > 0) {
                    subOverlay.videoStartTime = bestStart; // Remotion seeks to this frame
                    subOverlay.metadata.smartClipStart = bestStart;
                  }
                }
              } catch { /* analysis not available — use clip from start */ }
            }
            overlays.push(subOverlay);
          } else if (stockVideo?.videoUrl) {
            // Priority 2: Stock video from Pixabay/Pexels (prefetched)
            overlays.push({
              id: overlayId++,
              type: 'video',
              from: subFrame,
              durationInFrames: subDur,
              row: ROW.VIDEO,
              left: 0, top: 0, width, height,
              isDragging: false, rotation: 0,
              content: stockVideo.videoUrl,
              src: stockVideo.videoUrl,
              assetId: stockVideo.videoAssetId,
              posterUrl: stockVideo.thumbnailUrl || sub.imageUrl || scene.imageUrl || undefined,
              styles: { objectFit: 'cover', opacity: 1 },
              metadata: {
                sceneIndex: scene.sceneIndex,
                subShotDescription: sub.description,
                isMontageSub: true,
                assetSource: `stock-${stockVideo.source}`,
                stockQuery: stockVideo.query,
              },
            });
          } else if (sub.imageUrl) {
            // Priority 3 (LAST RESORT): Storyboard image as placeholder
            overlays.push({
              id: overlayId++,
              type: 'image',
              from: subFrame,
              durationInFrames: subDur,
              row: ROW.VIDEO,
              left: 0, top: 0, width, height,
              isDragging: false, rotation: 0,
              content: sub.imageUrl,
              src: sub.imageUrl,
              assetId: sub.imageAssetId,
              styles: { objectFit: 'cover', opacity: 1 },
              metadata: { sceneIndex: scene.sceneIndex, subShotDescription: sub.description, isMontageSub: true, assetSource: 'animated-still' },
            });
          }
          subFrame += subDur;
        }
        // Skip the normal video/image placement — sub-shots handle it
      } else {
      // ─── Asset Type Routing ─────────────────────────────────
      // Scenes classified as animated-still/stock/graphics-only skip AI video.
      // They use Ken Burns (drift-zoom) on the storyboard image for a cinematic feel.
      const assetRec = descriptor.assetRecommendation || 'ai-video';
      const isAnimatedStill = assetRec === 'animated-still' || assetRec === 'stock' || (scene as any).videoSkipped;
      const isGraphicsOnly = assetRec === 'graphics-only';

      if (isAnimatedStill && scene.imageUrl && !scene.videoUrl) {
        // Ken Burns drift-zoom: 1.0x → 1.06x scale over scene duration (RULE Z-030)
        // Adds gentle directional drift for cinematic motion
        const kenBurnsId = overlayId++;
        const zoomStart = 1.0;
        const zoomEnd = 1.06;
        // Randomize drift direction per scene for visual variety
        const driftDirections = [
          { xStart: 0, yStart: 0, xEnd: -8, yEnd: -5 },   // drift top-left
          { xStart: 0, yStart: 0, xEnd: 8, yEnd: -5 },    // drift top-right
          { xStart: -5, yStart: -3, xEnd: 5, yEnd: 3 },   // drift center-right
          { xStart: 5, yStart: -3, xEnd: -5, yEnd: 3 },   // drift center-left
        ];
        const drift = driftDirections[scene.sceneIndex % driftDirections.length];

        overlays.push({
          id: kenBurnsId,
          type: 'image',
          from: currentFrame,
          durationInFrames: durationFrames,
          row: ROW.VIDEO,
          left: 0, top: 0, width, height,
          isDragging: false, rotation: 0,
          content: scene.imageUrl,
          src: scene.imageUrl,
          assetId: scene.imageAssetId,
          styles: { objectFit: 'cover', opacity: 1 },
          metadata: {
            sceneIndex: scene.sceneIndex,
            assetType: assetRec,
            kenBurns: true,
          },
          // Ken Burns keyframes: scale + position drift over the scene duration
          keyframeTracks: [
            {
              property: 'scale' as any,
              keyframes: [
                { frame: 0, value: zoomStart, easing: 'linear' as const },
                { frame: durationFrames, value: zoomEnd, easing: 'linear' as const },
              ],
            },
            {
              property: 'x' as any,
              keyframes: [
                { frame: 0, value: drift.xStart, easing: 'linear' as const },
                { frame: durationFrames, value: drift.xEnd, easing: 'linear' as const },
              ],
            },
            {
              property: 'y' as any,
              keyframes: [
                { frame: 0, value: drift.yStart, easing: 'linear' as const },
                { frame: durationFrames, value: drift.yEnd, easing: 'linear' as const },
              ],
            },
          ],
        });
      } else if (isGraphicsOnly && !scene.videoUrl) {
        // Graphics-only scenes: no video/image, just motion graphics.
        // Director will add graphics templates. Place minimal transparent placeholder.
        overlays.push({
          id: overlayId++,
          type: 'image',
          from: currentFrame,
          durationInFrames: durationFrames,
          row: ROW.VIDEO,
          left: 0, top: 0, width, height,
          isDragging: false, rotation: 0,
          content: scene.imageUrl || '', // storyboard image as fallback background
          src: scene.imageUrl || '',
          assetId: scene.imageAssetId,
          styles: { objectFit: 'cover', opacity: scene.imageUrl ? 1 : 0 },
          metadata: { sceneIndex: scene.sceneIndex, assetType: 'graphics-only' },
        });
      } else if (scene.imageUrl && !scene.videoUrl) {
        // Standard image fallback (no asset classification, backward compat)
        overlays.push({
          id: overlayId++,
          type: 'image',
          from: currentFrame,
          durationInFrames: durationFrames,
          row: ROW.VIDEO,
          left: 0, top: 0, width, height,
          isDragging: false, rotation: 0,
          content: scene.imageUrl,
          src: scene.imageUrl,
          assetId: scene.imageAssetId,
          styles: { objectFit: 'cover', opacity: 1 },
        });
      }

      if (scene.videoUrl) {
        // AI-generated video clip on top of the image
        const mainVideoOverlay: any = {
          id: overlayId++,
          type: 'video',
          from: currentFrame,
          durationInFrames: durationFrames,
          row: ROW.VIDEO, // Video layer
          left: 0,
          top: 0,
          width,
          height,
          isDragging: false,
          rotation: 0,
          content: scene.videoUrl,
          src: scene.videoUrl,
          assetId: scene.videoAssetId,
          posterUrl: scene.imageUrl || undefined, // Storyboard image for timeline thumbnails (avoids CORS)
          styles: {
            objectFit: 'cover',
            opacity: 1,
          },
        };
        // Smart clip selection: if clip is longer than scene, pick best segment
        if (scene.videoAssetId && videoDurationSec && durationFrames < Math.round(videoDurationSec * fps)) {
          try {
            const analysis = await getAnalysis(scene.videoAssetId);
            if (analysis?.status === 'complete') {
              const bestStart = selectBestSegment(analysis, durationFrames, fps);
              if (bestStart > 0) {
                mainVideoOverlay.videoStartTime = bestStart;
              }
            }
          } catch { /* analysis not available — use clip from start */ }
        }
        overlays.push(mainVideoOverlay);
      }
      } // end else (non-montage asset routing)

      // Narration text overlay REMOVED — Director Agent adds proper captions
      // via add_captions/add_fancy_captions tool using word-level timing from
      // voiceover audio. Raw text boxes are ugly and don't sync to speech.

      // Voiceover audio overlay — CAPPED to scene duration to prevent bleed into next scene
      if (includeVoiceover && scene.voiceover?.audioUrl) {
        const voDurationFrames = Math.round((scene.voiceover.audioDurationMs / 1000) * fps);
        // Cap VO to scene duration so it never overlaps the next scene's voiceover
        const cappedVoDuration = Math.min(voDurationFrames, durationFrames);
        // F6.7: Warn if voiceover was truncated significantly (>20% cut off)
        if (voDurationFrames > durationFrames * 1.2) {
          warnings.push(`Scene ${scene.sceneIndex}: voiceover truncated from ${Math.round(voDurationFrames / fps * 10) / 10}s to ${Math.round(durationFrames / fps * 10) / 10}s`);
        }
        overlays.push({
          id: overlayId++,
          type: 'sound',
          from: currentFrame,
          durationInFrames: cappedVoDuration,
          row: ROW.VOICEOVER, // Voiceover audio track
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          isDragging: false,
          rotation: 0,
          content: scene.voiceover.audioUrl,
          src: scene.voiceover.audioUrl,
          assetId: scene.voiceover.audioAssetId,
          // Do NOT set audioStartFrame/audioEndFrame by default.
          // Setting them causes: (1) L-cut/J-cut handles showing unnecessarily,
          // (2) audio delay bug when applyEditDirections shifts overlay.from
          //     without updating audioStartFrame.
          // Users can enable L-cut/J-cut manually via the editor if needed.
          styles: { volume: 1 },
        });
      }

      // Scene title overlay removed — redundant with narration text overlay.
      // The narration text on row 0 already provides context. Having both
      // creates visual clutter and confuses users into thinking there are
      // duplicate layers. Director Agent can add titles via motion graphics
      // if the edit profile requires them.

      // Track frame offset for SFX placement
      sceneFrameMap.push({
        sceneIndex: scene.sceneIndex,
        fromFrame: currentFrame,
        durationFrames,
        durationSec: sceneDurationSec,
      });

      // Advance timeline cursor.
      // For montage sub-shots: use the ACTUAL total sub-shot duration if it exceeds
      // the scene duration. Otherwise the next scene overlaps the last sub-shots.
      if (hasIndependentSubShots && subShots.length > 0) {
        // Use targetDurationSeconds consistently (same as sub-shot placement logic above).
        // Previously used videoDurationMs here, which caused gaps when AI clips (5-10s) are
        // longer than the target display duration (1-3s).
        const totalSubFrames = subShots
          .filter((s: any) => s.independentGeneration)
          .reduce((sum: number, s: any) => {
            let dur = Math.round((s.targetDurationSeconds || 3) * fps);
            if (dur <= 0 || isNaN(dur)) dur = 90; // 3s default, matching placement
            dur = Math.max(dur, 45); // Min 1.5s, matching placement
            dur = Math.min(dur, 90); // Max 3s for sub-shots, matching placement
            return sum + dur;
          }, 0);
        currentFrame += Math.max(totalSubFrames, durationFrames);
      } else {
        currentFrame += durationFrames;
      }
    }

    // Register all media assets in the mediaAssets collection so the
    // asset resolver can map assetId → URL after saveProject strips URLs.
    const db = await getDatabase();
    for (const scene of storyboard.scenes) {
      if (scene.videoUrl && scene.videoAssetId) {
        const videoScene = scene as any;
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: scene.videoAssetId },
          {
            $setOnInsert: {
              assetId: scene.videoAssetId,
              userId,
              type: 'video',
              filename: `${scene.videoAssetId}.mp4`,
              source: 'user-upload',
              gcsPath: videoScene.videoGcsPath || null,
              r2Key: videoScene.videoR2Key || scene.videoAssetId || null,
              cachedUrl: scene.videoUrl,
              urlExpiresAt: scene.videoUrl?.includes('workers.dev') ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              size: 0,
              uploadedAt: new Date(),
            },
          },
          { upsert: true },
        );
      }
      if (scene.imageUrl && scene.imageAssetId) {
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: scene.imageAssetId },
          {
            $setOnInsert: {
              assetId: scene.imageAssetId,
              userId,
              type: 'image',
              filename: `${scene.imageAssetId}.png`,
              source: 'user-upload',
              gcsPath: (scene as any).imageGcsPath || null,
              r2Key: scene.imageAssetId || null,
              cachedUrl: scene.imageUrl,
              urlExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              size: 0,
              uploadedAt: new Date(),
            },
          },
          { upsert: true },
        );
      }
      // Register voiceover audio asset
      if (scene.voiceover?.audioUrl && scene.voiceover?.audioAssetId) {
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: scene.voiceover.audioAssetId },
          {
            $setOnInsert: {
              assetId: scene.voiceover.audioAssetId,
              userId,
              type: 'audio',
              filename: `${scene.voiceover.audioAssetId}.wav`,
              source: 'user-upload',
              gcsPath: (scene.voiceover as any).gcsPath || null,
              r2Key: (scene.voiceover as any).r2Key || scene.voiceover.audioAssetId || null,
              cachedUrl: scene.voiceover.audioUrl,
              urlExpiresAt: scene.voiceover.audioUrl?.includes('workers.dev') ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              // Store duration so transcription-service can generate accurate synthetic timings
              // without needing to download the audio file
              durationMs: scene.voiceover.audioDurationMs || null,
              audioDurationMs: scene.voiceover.audioDurationMs || null,
              size: 0,
              uploadedAt: new Date(),
            },
          },
          { upsert: true },
        );
      }
    }

    // ─── Apply edit directions (filters, transitions, pacing) ─────
    try {
      const scenesWithDirections = storyboard.scenes.map(s => ({
        sceneIndex: s.sceneIndex,
        editDirections: s.descriptor.editDirections,
        audioDescription: s.descriptor.audioDescription,
      }));
      // Merge global edit directions from storyboard with profile defaults
      const globalDirs = (storyboard as any).globalEditDirections || {};
      // If no default transition from script, use 'soft-cut' as universal default
      // (hard-cut = no transition overlay = looks like raw assembly)
      if (!globalDirs.defaultTransition) {
        globalDirs.defaultTransition = { type: 'soft-cut', durationMs: 500 };
      }
      const result = await applyEditDirections(
        overlays,
        scenesWithDirections,
        sceneFrameMap,
        globalDirs,
        width,
        height,
        fps,
      );
      console.log(`[Finalize] Edit directions applied: ${overlays.length} overlays (${result.totalFrameShift} frame shift)`);
    } catch (editErr: any) {
      // F6.3: Surface the error in response, not just logs
      console.warn('[Finalize] Edit direction application failed, continuing without:', editErr.message);
      warnings.push(`Edit directions partially failed: ${editErr.message}`);
    }

    // ─── Create Editron project FIRST, then dispatch audio workers ─────
    // BGM/SFX generation is moved to async QStash workers. The project is
    // created immediately with video + voiceover + text overlays. BGM and SFX
    // workers add their overlays to the project when they complete (could be
    // 2-5 minutes later). This prevents Vercel timeout killing the entire
    // finalize because beatoven is slow.

    // F6.2: Don't create empty project when all generation failed
    if (currentFrame === 0 || overlays.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No content to finalize — all scenes failed to generate. Try regenerating the storyboard.',
      }, { status: 400 });
    }

    // Create Editron project then save overlays + settings
    const projectName = storyboard.title || 'Storyboard Video';
    const project = await projectService.createProject(userId, projectName);

    await projectService.saveProject(userId, project.projectId, {
      overlays,
      aspectRatio: aspectRatio as any,
      playerDimensions: { width, height },
      fps,
      durationInFrames: currentFrame,
    });

    // ─── Link storyboard ↔ project bidirectionally ────────────────
    // Set projectId on the storyboard so regenerate_scene can find it
    // via getStoryboardByProjectId(), and set sourceStoryboardId on the
    // project so the fallback lookup also works.
    await db.collection('storyboards').updateOne(
      { storyboardId: id },
      { $set: { projectId: project.projectId, updatedAt: new Date() } },
    );
    await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId: project.projectId },
      { $set: { sourceStoryboardId: id, updatedAt: new Date() } },
    );

    // ─── Dispatch BGM + SFX workers via QStash (fire-and-forget) ────
    // These run asynchronously AFTER the project is created. Each worker
    // has its own 300s timeout. They add overlays to the project via
    // MongoDB $push when complete. User refreshes Editron to see them.
    const audioWorkerUrl = (() => {
      const base = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
      return `${base}/api/internal/workers/pipeline/audio`;
    })();

    const dispatchAudio = async (body: any, label: string) => {
      try {
        if (process.env.QSTASH_TOKEN) {
          const qstash = new Client({ token: process.env.QSTASH_TOKEN, baseUrl: process.env.QSTASH_URL || undefined });
          const result = await qstash.publishJSON({ url: audioWorkerUrl, body, retries: 2 });
          console.log(`[Finalize] ${label} dispatched via QStash: ${(result as any)?.messageId || 'ok'}`);
        } else {
          // Fallback: fire-and-forget fetch
          fetch(audioWorkerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }).catch(() => {});
          console.log(`[Finalize] ${label} dispatched via fetch (no QStash)`);
        }
      } catch (err: any) {
        console.error(`[Finalize] ${label} dispatch failed:`, err.message);
      }
    };

    if (isBGMAvailable() && currentFrame > 0) {
      const totalDurationSec = Math.round(currentFrame / fps);
      const musicPrompt = storyboard.overallMusicPrompt
        || buildMusicPrompt(
          storyboard.scenes.map(s => ({
            mood: s.descriptor.mood,
            audioDescription: s.descriptor.audioDescription,
          })),
        );
      console.log(`[Finalize] Dispatching BGM worker: "${musicPrompt.substring(0, 80)}", ${totalDurationSec}s`);
      await dispatchAudio({
        type: 'bgm',
        projectId: project.projectId,
        userId,
        storyboardId: id,
        musicPrompt,
        totalDurationSec,
        totalFrames: currentFrame,
        fps,
      }, 'BGM');
    }

    if (isSFXAvailable() && currentFrame > 0) {
      const sfxInputs = storyboard.scenes
        .filter(s => s.descriptor.audioDescription?.trim())
        .map(s => {
          const frameInfo = sceneFrameMap.find(f => f.sceneIndex === s.sceneIndex);
          return {
            sceneIndex: s.sceneIndex,
            audioDescription: s.descriptor.audioDescription!,
            videoUrl: s.videoUrl || undefined, // Pass to mirelo for video-synced SFX
            durationSeconds: frameInfo?.durationSec ?? Math.min(s.descriptor.durationSeconds, 15),
          };
        });

      if (sfxInputs.length > 0) {
        console.log(`[Finalize] Dispatching SFX worker: ${sfxInputs.length} scenes`);
        await dispatchAudio({
          type: 'sfx',
          projectId: project.projectId,
          userId,
          storyboardId: id,
          sfxInputs,
          sceneFrameMap,
        }, 'SFX');
      }
    }

    // ─── Store detected edit profile on project for Director ──────────
    // Director runs AFTER video generation completes (dispatched from video worker),
    // NOT here — because videos aren't ready yet at finalize time.
    // We store the profile detection result so the video worker can use it.
    try {
      const { getAutoSelectedProfile } = await import('@/lib/editron/services/profile-detection-service');
      const thinkforgeMetadata = {
        narration: storyboard.scenes.map(s => s.descriptor.narration || '').join(' '),
        visual: storyboard.scenes.map(s => s.descriptor.visualDescription || '').join(' '),
        music: storyboard.overallMusicPrompt || '',
        notes: '',
        environment: (storyboard as any).environmentNotes || '',
        character: '',
        mood: storyboard.scenes.map(s => s.descriptor.mood || '').join(', '),
        sceneCount: storyboard.scenes.length,
        totalDurationSec: Math.round(currentFrame / fps),
        platform: '',
        format: '',
      };
      const { profileId } = getAutoSelectedProfile(thinkforgeMetadata);
      // Store on project so video worker can dispatch Director with correct profile
      await db.collection(COLLECTIONS.PROJECTS).updateOne(
        { projectId: project.projectId },
        { $set: { pendingDirectorProfileId: profileId, pendingDirectorUserId: userId } },
      );
      console.log(`[Finalize] Director profile detected: ${profileId} (will run after video gen completes)`);
    } catch (dirErr: any) {
      console.warn(`[Finalize] Profile detection failed: ${dirErr.message}`);
      warnings.push(`Edit profile auto-detection failed: ${dirErr.message}`);
    }

    return NextResponse.json({
      success: true,
      projectId: project.projectId,
      name: projectName,
      overlayCount: overlays.length,
      totalDurationFrames: currentFrame,
      audioGenerating: true,
      directorQueued: true, // Director runs after video gen, not immediately
      ...(warnings.length > 0 && { warnings }),
    });
  } catch (error: any) {
    console.error('[Finalize]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
