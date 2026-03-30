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
      const scriptEstimateSec = Math.min(scene.descriptor.durationSeconds, 15);

      // VIDEO duration is king — scene duration matches the actual video clip.
      // If videoDurationMs isn't set but video URL exists, cap to 10s (max AI clip length).
      // Voiceover is capped to fit within the scene (no extending for long narration).
      // NEVER use script estimate when video exists — script estimates are based on word count
      // and can be 20-30s while the actual AI clip is only 5-10s.
      let sceneDurationSec: number;
      if (videoDurationSec) {
        sceneDurationSec = videoDurationSec;
      } else if (scene.videoUrl) {
        // Video exists but no duration recorded — cap to 5s (typical AI clip length).
        // AI models like Kling/Wan/LTX produce 5-10s clips. Using 5s prevents freeze-frame
        // stretching where Remotion shows a frozen last frame for the extra seconds.
        // If the actual clip is longer, users can manually extend on the timeline.
        sceneDurationSec = Math.min(scriptEstimateSec, 5);
      } else if (voiceoverDurationSec) {
        sceneDurationSec = voiceoverDurationSec;
      } else {
        sceneDurationSec = scriptEstimateSec;
      }
      const durationFrames = Math.round(sceneDurationSec * fps);

      // Scene background: Only add storyboard image when NO video exists.
      // Storyboard is a stencil for consistency — not needed on the timeline
      // when a real video clip is present.
      if (scene.imageUrl && !scene.videoUrl) {
        overlays.push({
          id: overlayId++,
          type: 'image',
          from: currentFrame,
          durationInFrames: durationFrames,
          row: ROW.VIDEO, // Image on video row (no video exists for this scene)
          left: 0,
          top: 0,
          width,
          height,
          isDragging: false,
          rotation: 0,
          content: scene.imageUrl,
          src: scene.imageUrl,
          assetId: scene.imageAssetId,
          styles: {
            objectFit: 'cover',
            opacity: 1,
          },
        });
      }

      if (scene.videoUrl) {
        // AI-generated video clip on top of the image
        overlays.push({
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
        });
      }

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

      currentFrame += durationFrames;
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

    // ─── Dispatch Director Agent via QStash (delayed 15s) ──────────
    // Director auto-applies: filters, transitions, captions, motion graphics,
    // audio ducking, quality review. Delayed to let BGM/SFX workers start first.
    // Uses auto-detected edit profile from script metadata.
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

      const directorUrl = (() => {
        const base = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
        return `${base}/api/services/editron/director/execute`;
      })();

      if (process.env.QSTASH_TOKEN) {
        const qstash = new Client({ token: process.env.QSTASH_TOKEN, baseUrl: process.env.QSTASH_URL || undefined });
        const dirResult = await qstash.publishJSON({
          url: directorUrl,
          body: { projectId: project.projectId, editProfileId: profileId, userId, _internal: true },
          retries: 1,
          delay: 15, // 15 seconds delay — let BGM/SFX workers start
        });
        console.log(`[Finalize] Director dispatched (profile: ${profileId}, delay: 15s): ${(dirResult as any)?.messageId || 'ok'}`);
      } else {
        // Dev fallback: fire-and-forget after 15s
        setTimeout(() => {
          fetch(directorUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: project.projectId, editProfileId: profileId, userId, _internal: true }),
          }).catch(() => {});
        }, 15000);
        console.log(`[Finalize] Director dispatched via fetch fallback (profile: ${profileId})`);
      }
    } catch (dirErr: any) {
      // Non-fatal — project is already created, Director can be run manually
      console.warn(`[Finalize] Director auto-dispatch failed: ${dirErr.message}`);
      warnings.push(`Director auto-run failed: ${dirErr.message}. You can run it manually from the editor.`);
    }

    return NextResponse.json({
      success: true,
      projectId: project.projectId,
      name: projectName,
      overlayCount: overlays.length,
      totalDurationFrames: currentFrame,
      audioGenerating: true, // Frontend can show "BGM/SFX generating in background"
      directorQueued: true, // Director Agent will auto-apply edits in ~15s
      ...(warnings.length > 0 && { warnings }),
    });
  } catch (error: any) {
    console.error('[Finalize]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
