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
import { DEFAULT_CONFIG } from '@/lib/editron/config/editron-config';

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

    const fps = DEFAULT_CONFIG.timing.fps;
    const overlays: any[] = [];
    const warnings: string[] = [];
    // Pipeline warning collector — structured error visibility
    const { createPipelineWarnings } = await import('@/lib/editron/services/pipeline-warnings');
    const pipelineWarnings = createPipelineWarnings();
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
        pipelineWarnings.fallbackUsed('finalize', `scene ${scene.sceneIndex} duration`, 5);
        sceneDurationSec = 5;
      }
      // Cap scene duration to actual video length to prevent freeze frames.
      // If script says 5.7s but Kling only generated 5s, use 5s.
      // Without this cap, Remotion freezes on the last frame for the extra 0.7s.
      //
      // SKIP for montage scenes with independent sub-shots: each sub-shot has its
      // own targetDurationSeconds (e.g., 3.6s × 5 = 18s total). The parent scene's
      // videoDurationSec is just ONE sub-shot's video length (4s). Capping to 4s
      // squeezes all 5 sub-shots into 4s total — destroying the montage pacing.
      const descriptorForCap = scene.descriptor as any;
      // NOTE: Parser produces either ALL-independent or ALL-shared sub-shots (Mode A vs B
      // in llm-scene-parser.ts). Mixed scenes are not generated. If mixed scenes are ever
      // supported, .some() here means the cap is skipped for the whole scene even if only
      // one sub-shot is independent — non-independent sub-shots would need separate handling.
      const hasIndependentSubShotsForCap = (descriptorForCap.subShots || []).some(
        (s: any) => s.independentGeneration && (s.videoUrl || s.imageUrl)
      );
      if (!hasIndependentSubShotsForCap && videoDurationSec && videoDurationSec > 0 && sceneDurationSec > videoDurationSec) {
        console.log(`[Finalize] Scene ${scene.sceneIndex}: capping duration from ${sceneDurationSec.toFixed(1)}s to ${videoDurationSec.toFixed(1)}s (video shorter than script)`);
        sceneDurationSec = videoDurationSec;
      }
      const durationFrames = Math.round(sceneDurationSec * fps);

      // ─── Montage sub-shots with independent videos ─────────────
      // If this scene has sub-shots with their own video clips, place each
      // as a separate overlay on Row 2 (VIDEO), sequentially within the scene.
      const descriptor = scene.descriptor as any;
      const subShots = descriptor.subShots || [];
      const hasIndependentSubShots = subShots.some((s: any) => s.independentGeneration && (s.videoUrl || s.imageUrl));

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
          // Asset priority: AI video → storyboard image (Ken Burns last resort)
          // Stock video REMOVED from pipeline default (2026-04-02 strategy pivot).
          // Users can still add stock manually via editor's searchStockFootage tool.
          if (sub.videoUrl) {
            // Priority 1: AI-generated video clip
            // Phase A3.5.13 fix: inherit `hasNativeAudio` from parent scene. If the scene
            // was generated with Seedance 1.5 (or any model with nativeAudio:true in
            // video-model-configs.ts), the scene-level video has the flag set. All
            // sub-shots of that scene used the same model, so they should too.
            // Without this, SFX worker filter `!hasNativeAudio` lets sub-shot SFX through
            // even though the video already has embedded foley → audio collision + wasted credits.
            // Proper fix (per-sub-shot model detection) belongs in the video worker — Phase 2.
            const parentHasNativeAudio = (scene as any).hasNativeAudio || (sub as any).hasNativeAudio || false;
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
              hasNativeAudio: parentHasNativeAudio,
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
                  // Detect AI slop (teleports, morphing, artifacts) so selectBestSegment
                  // can avoid those frame ranges when picking the trim window.
                  // Slop detection is deterministic + cheap (structural checks on analysis).
                  const { detectSlop } = await import('@/lib/editron/services/asset-briefing');
                  const slopRanges = detectSlop(analysis);
                  const bestStart = selectBestSegment(analysis, subDur, fps, undefined, slopRanges);
                  if (bestStart > 0) {
                    subOverlay.videoStartTime = bestStart; // Remotion seeks to this frame
                    subOverlay.metadata.smartClipStart = bestStart;
                    subOverlay.metadata.slopRangesAvoided = slopRanges.length;
                  }
                }
              } catch { /* analysis not available — use clip from start */ }
            }
            overlays.push(subOverlay);
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
      // Scenes classified as animated-still/graphics-only skip AI video.
      // They use Ken Burns (drift-zoom) on the storyboard image for a cinematic feel.
      const assetRec = descriptor.assetRecommendation || 'ai-video';
      const isAnimatedStill = assetRec === 'animated-still' || (scene as any).videoSkipped;
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
          hasNativeAudio: (scene as any).hasNativeAudio || false,
        };
        // Smart clip selection: if clip is longer than scene, pick best segment.
        // Slop-aware: AI artifacts (morphing, teleports, object count changes) in the
        // generated clip are heavily penalized during window selection, so the trim
        // window naturally avoids slop. Double-duty: duration fit + quality uplift.
        if (scene.videoAssetId && videoDurationSec && durationFrames < Math.round(videoDurationSec * fps)) {
          try {
            const analysis = await getAnalysis(scene.videoAssetId);
            if (analysis?.status === 'complete') {
              const { detectSlop } = await import('@/lib/editron/services/asset-briefing');
              const slopRanges = detectSlop(analysis);
              const bestStart = selectBestSegment(analysis, durationFrames, fps, undefined, slopRanges);
              if (bestStart > 0) {
                mainVideoOverlay.videoStartTime = bestStart;
                (mainVideoOverlay as any).metadata = { ...(mainVideoOverlay as any).metadata, slopRangesAvoided: slopRanges.length };
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
      if (includeVoiceover && scene.descriptor?.narration?.trim() && !scene.voiceover?.audioUrl) {
        warnings.push(`Scene ${scene.sceneIndex}: has narration ("${scene.descriptor.narration.substring(0, 40)}...") but no voiceover audio — TTS may have failed or not run`);
        pipelineWarnings.degraded('finalize', `scene ${scene.sceneIndex} voiceover`, 'narration exists but voiceover audio missing');
      }
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

      // ─── On-screen text overlays from script ───────────────────────────
      // REMOVED 2026-04-19: the caption-fallback path that used to live here
      // (Phase A3.4, commit 55106894) was the source of the duplicate-text
      // regression seen in proj_3jE3Q8mx5fB5 — it emitted onScreenText as
      // Caption overlays while the EDL's graphic path ALSO emitted the same
      // text as html-scene keyword-highlights. Same text rendered twice in
      // two different visual systems.
      //
      // Architectural rule (Refined Option 1, user-approved 2026-04-19):
      //   - Captions are for SPEECH. They render what's being said.
      //   - Graphics are for STANDALONE on-screen text. They render script
      //     text that isn't tied to a voiceover moment.
      //   - Never both for the same content.
      //
      // After this change:
      //   - Scene has VO → caption service transcribes VO → Caption overlays (row 0).
      //     onScreenText is handled by the EDL path as a graphic (see below).
      //   - Scene has no VO → no caption fallback. onScreenText becomes a graphic
      //     via EDL's applyGraphic (keyword-highlight / lower-third / etc.).
      //   - Scene has no VO and no onScreenText → no text overlay. Correct behavior.
      //
      // EDL handling of onScreenText:
      //   - unified-edit-intelligence.ts feeds scene.editDirections.onScreenText
      //     to Gemini, which emits graphicIntents (see line ~430 prompt:
      //     "Include ALL onScreenText entries as separate graphics").
      //   - intent-translator.ts converts graphicIntents → graphic decisions.
      //   - edl-executor.applyGraphic() creates html-scene overlays.
      //   - auto-post-processing.validateScreenZones() enforces caption/graphic
      //     screen-zone separation (Zone 3 reserved for captions).
      //
      // If a future regression shows onScreenText missing from output, the fix
      // belongs in the EDL path (make emission deterministic), NOT here. Do not
      // re-add a caption fallback — it violates the routing rule above.
      //
      // See: memory/edge_cases_backlog.md #21, #23, #24 for follow-ups on
      // styling, positioning, and motion-graphics polish.

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

      // Register sub-shot video assets in media_assets collection.
      // Without this, the asset resolver can't map sub-shot assetIds → URLs
      // after saveProject strips URLs → src becomes '' → video player breaks.
      const descriptor = scene.descriptor as any;
      const subShots = descriptor?.subShots || [];
      for (const sub of subShots) {
        if (sub.videoUrl && sub.videoAssetId) {
          await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
            { assetId: sub.videoAssetId },
            {
              $setOnInsert: {
                assetId: sub.videoAssetId,
                userId,
                type: 'video',
                filename: `${sub.videoAssetId}.mp4`,
                source: 'user-upload',
                r2Key: sub.videoAssetId || null,
                cachedUrl: sub.videoUrl,
                urlExpiresAt: sub.videoUrl?.includes('workers.dev') ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                size: 0,
                uploadedAt: new Date(),
              },
            },
            { upsert: true },
          );
        }
      }
    }

    // ─── Apply edit directions (filters, transitions, pacing) ─────
    let editDirectionsFailed = false;
    let editDirectionsError: string | undefined;
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
      // Bundle 4 Toyota B.silent.1 fix: was swallowed before, now LOUDLY surfaced.
      // Previous behavior: caught the error, logged a warning, returned success:true
      // and the user got a project with NO filters/transitions/pacing and never knew.
      //
      // NEW behavior: still continue (don't break retries on flaky LLM), but:
      //   1. Promote severity from 'warn' to 'error' in console
      //   2. Use errorSwallowed() which writes severity:'error' to pipelineWarnings
      //   3. Track editDirectionsFailed flag + set prominent warning string
      //   4. Set a dedicated field on the final project doc so the Editor UI
      //      can surface an "Edit directions failed — filters/transitions missing" banner
      //   5. Include the full error message in the finalize response warnings array
      //      so the export dialog can also show it
      editDirectionsFailed = true;
      editDirectionsError = editErr.message || String(editErr);
      console.error('[Finalize] Edit direction application FAILED (project will have no filters/transitions):', editDirectionsError);
      warnings.push(`⚠️ Edit directions failed — your project will NOT have filters, transitions, or pacing applied. Error: ${editDirectionsError}`);
      pipelineWarnings.errorSwallowed('finalize', editErr, 'edit direction application (project rendered without filters/transitions/pacing)');
    }

    // ─── Close gaps ONCE after initial assembly ──────────────────
    // Eliminate black frames between scenes caused by sub-shot duration
    // mismatches or duration capping. This runs ONLY here during finalize —
    // never again automatically, so user-introduced gaps are preserved.
    const videoOverlaysSorted = overlays
      .filter(o => o.type === 'video' || o.type === 'image')
      .sort((a, b) => a.from - b.from);
    let gapsClosed = 0;
    for (let i = 1; i < videoOverlaysSorted.length; i++) {
      const prev = videoOverlaysSorted[i - 1];
      const prevEnd = prev.from + prev.durationInFrames;
      const curr = videoOverlaysSorted[i];
      const gap = curr.from - prevEnd;
      if (gap > 0) {
        // Shift this overlay and all overlays starting at or after it
        const shiftFrom = curr.from;
        for (const o of overlays) {
          if (o.from >= shiftFrom) {
            o.from -= gap;
          }
        }
        gapsClosed++;
        // Re-sort after shifting
        videoOverlaysSorted.sort((a, b) => a.from - b.from);
        i--; // Re-check this index since positions changed
      }
    }
    if (gapsClosed > 0) {
      // Update total duration after closing gaps
      const maxEnd = overlays.reduce((max, o) => Math.max(max, o.from + o.durationInFrames), 0);
      currentFrame = maxEnd;
      console.log(`[Finalize] Closed ${gapsClosed} gaps between scenes. New duration: ${(currentFrame / fps).toFixed(1)}s`);
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
      {
        $set: {
          sourceStoryboardId: id,
          updatedAt: new Date(),
          // Bundle 4 Toyota B.silent.1 fix: if applyEditDirections failed,
          // persist that flag on the project so the editor UI can show a
          // "Edit directions failed — filters/transitions/pacing missing"
          // banner. Previously this was completely invisible.
          ...(editDirectionsFailed && {
            editDirectionsFailed: true,
            editDirectionsError: editDirectionsError || 'Unknown error',
          }),
        },
      },
    );

    // ─── Graph sync: create Project + Scene nodes in Neo4j ────────
    try {
      if (process.env.QSTASH_TOKEN) {
        const graphSyncUrl = (() => {
          const base = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
          return `${base}/api/internal/workers/graph-sync`;
        })();
        const qstashGraph = new Client({ token: process.env.QSTASH_TOKEN, baseUrl: process.env.QSTASH_URL || undefined });

        await qstashGraph.publishJSON({
          url: graphSyncUrl,
          body: {
            action: 'project_created',
            data: {
              projectId: project.projectId,
              userId,
              contentType: (storyboard as any).suggestedProfileCategory || 'brand-ad',
              sceneCount: storyboard.scenes.length,
              durationSec: currentFrame / fps,
            },
          },
          retries: 3,
        });

        const sceneInputs = storyboard.scenes.map((s: any, idx: number) => ({
          sceneIndex: idx,
          mood: s.mood || null,
          sceneType: s.sceneType || 'continuous',
          contentSummary: (s.visualDescription || '').slice(0, 200),
          subjects: (s.subjects || []).slice(0, 10),
        }));

        await qstashGraph.publishJSON({
          url: graphSyncUrl,
          body: {
            action: 'scene_batch',
            data: {
              projectId: project.projectId,
              version: 1,
              scenes: sceneInputs,
            },
          },
          retries: 3,
        });

        console.log(`[Finalize] Graph sync dispatched: project + ${sceneInputs.length} scenes`);
      }
    } catch (graphErr: any) {
      console.warn(`[Finalize] Graph sync dispatch failed: ${graphErr.message}`);
    }

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

    // ─── Beat-sync: synchronous BGM path when parser flagged beatSyncActive ──
    // Design: pipeline_investigations.md "Beat-sync design doc (Option C)"
    //   2026-04-17. For beat-sync-critical content (montages, hype reels,
    //   music-aware profiles), BGM must complete BEFORE Director runs so the
    //   beat grid is available for cut placement. Non-beat-sync content keeps
    //   the fast async QStash path below.
    //
    // Failure mode: any error in sync generation → fall back to async (degraded
    // mode — beat-sync won't engage but videos still render). Graceful per Rule 16.
    const beatSyncActive = (storyboard as any).beatSyncActive === true;
    let bgmSyncCompleted = false;

    if (isBGMAvailable() && currentFrame > 0 && beatSyncActive) {
      const totalDurationSec = Math.round(currentFrame / fps);
      const musicPrompt = storyboard.overallMusicPrompt
        || buildMusicPrompt(
          storyboard.scenes.map(s => ({
            mood: s.descriptor.mood,
            musicDescription: (s.descriptor as any).musicDescription,
            audioDescription: s.descriptor.audioDescription,
          })),
        );

      try {
        console.log(
          `[Finalize] Beat-sync ACTIVE — generating BGM synchronously for beat detection (${totalDurationSec}s, "${musicPrompt.substring(0, 60)}")`
        );
        const { generateBackgroundMusic } = await import('@/lib/pipeline/bgm-service');
        const bgm = await Promise.race([
          generateBackgroundMusic(musicPrompt, userId, totalDurationSec),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('BGM sync timeout (120s)')), 120_000),
          ),
        ]);

        // Detect beats (heuristic from BPM — upgrade path to audio analysis
        // documented in beat-detection-service.ts header).
        const { detectBeats } = await import('@/lib/editron/services/beat-detection-service');
        const beatGrid = await detectBeats({
          audioUrl: bgm.audioUrl,
          bpm: (storyboard as any).bpm,
          durationFrames: currentFrame,
          fps,
          hints: {
            mood: storyboard.scenes[0]?.descriptor.mood,
            profileId: (project as any).pendingDirectorProfileId,
          },
        });

        console.log(
          `[Finalize] Beat grid computed: ${beatGrid.bpm} BPM, ` +
          `${beatGrid.beats.length} beats, ${beatGrid.downbeats.length} downbeats, ` +
          `source=${beatGrid.source}`
        );

        // Build BGM overlay mirroring audio worker's shape (route.ts:118-140)
        // so downstream Director + editor treat it identically to async-generated BGM.
        // Beat grid stored on overlay metadata so Director reads from the BGM source itself.
        const bgmOverlayId = Date.now() * 1000 + Math.floor(Math.random() * 999999);
        overlays.push({
          id: bgmOverlayId,
          type: 'sound',
          from: 0,
          durationInFrames: currentFrame,
          row: ROW.BGM,
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
          metadata: {
            source: 'finalize-sync-beat-sync',
            beatSyncActive: true,
            beatGrid,
          },
        } as any);

        // Register asset (same as audio worker does after generation)
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: bgm.audioAssetId },
          {
            $setOnInsert: {
              assetId: bgm.audioAssetId,
              userId,
              type: 'audio',
              filename: `${bgm.audioAssetId}.mp3`,
              source: 'user-upload',
              gcsPath: bgm.gcsPath,
              cachedUrl: bgm.audioUrl,
              urlExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              size: 0,
              uploadedAt: new Date(),
            },
          },
          { upsert: true },
        );

        bgmSyncCompleted = true;
        console.log(`[Finalize] Sync BGM + beat grid ready for Director`);
      } catch (syncBgmErr: any) {
        console.error(`[Finalize] Sync BGM failed: ${syncBgmErr.message} — falling back to async (beat-sync degraded)`);
        pipelineWarnings.degraded(
          'bgm',
          'beat-sync-sync-dispatch',
          `Sync BGM for beat-sync flow failed: ${syncBgmErr.message}. Falling back to async QStash dispatch — beat-sync will not engage for this run.`,
        );
        // Fall through to async path below (bgmSyncCompleted stays false)
      }
    }

    if (isBGMAvailable() && currentFrame > 0 && !bgmSyncCompleted) {
      const totalDurationSec = Math.round(currentFrame / fps);
      const musicPrompt = storyboard.overallMusicPrompt
        || buildMusicPrompt(
          storyboard.scenes.map(s => ({
            mood: s.descriptor.mood,
            musicDescription: (s.descriptor as any).musicDescription,
            audioDescription: s.descriptor.audioDescription, // fallback for old projects
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
      // SFX dispatch design (S-28, 2026-04-20 — corrects the over-reach of S-26):
      //
      // ─── History ───
      // S-26 removed the `!hasNativeAudio` filter, arguing "Three-Layer Sound
      // Model says never leave a scene silent, so layer content SFX on every
      // scene." User (correctly) pushed back: that over-mandated Freesound SFX
      // on top of Seedance scenes that already had usable audio, creating
      // over-layered muddy output. The doc's "never silent" rule is already
      // satisfied when Seedance audio is present — even if imperfect. The
      // right response to "Seedance audio is sometimes hallucinated speech"
      // is to fix it AT SOURCE (via content-aware gating in the video-gen
      // request), not to blanket-layer Freesound on every clip.
      //
      // S-28 restores the `!hasNativeAudio` filter. Content SFX dispatches
      // only for scenes where the video clip has no usable native audio —
      // i.e., Seedance was disabled, or the model was text-video-only (Kling,
      // Veo, MiniMax, etc.), or future Mode 2/3 user-uploaded clips that
      // arrive as mute tracks.
      //
      // ─── Kept from S-26 (still right) ───
      // The `audioDescription` music-leak fallback was a real bug, separate
      // from the filter question. audioDescription mirrors musicDescription
      // (schema deprecation note), so falling back to it routed music prompts
      // to the SFX worker → Freesound searched for piano music → zero hits.
      // S-28 keeps that removal — source only from sfxDescription and sfxCue.
      //
      // ─── Per-scene ambient, not continuous ───
      // creative_production_knowledge.md §3 says "ambient beds should be
      // continuous — don't start/stop between cuts." That rule assumes a
      // SINGLE-LOCATION scene or sequence. For montage across DIFFERENT
      // settings (restaurant → train → park), ambient MUST vary by scene —
      // continuous would be wrong. Per-scene SFX payload preserved here.
      //
      // ─── Modes 2/3 note ───
      // When user-uploaded footage arrives (Phase C asset-centric path),
      // `hasNativeAudio` currently only flags AI-gen models. A future
      // extension should flag any clip with usable audio (user recording OR
      // AI-gen). For now, this filter still handles the AI-gen case
      // correctly; Mode 2/3 audio handling is its own architectural work.
      const sfxInputs = storyboard.scenes
        .filter(s => {
          const desc = s.descriptor as any;
          return (desc.sfxDescription?.trim() || desc.editDirections?.sfxCue?.trim());
        })
        .filter(s => !(s as any).hasNativeAudio)
        .map(s => {
          const desc = s.descriptor as any;
          const frameInfo = sceneFrameMap.find(f => f.sceneIndex === s.sceneIndex);
          const sfxText = desc.sfxDescription?.trim()
            || desc.editDirections?.sfxCue?.trim()
            || '';
          return {
            sceneIndex: s.sceneIndex,
            audioDescription: sfxText, // named for SFX worker payload-shape compat
            videoUrl: s.videoUrl || undefined,
            durationSeconds: frameInfo?.durationSec ?? Math.min(s.descriptor.durationSeconds, 15),
          };
        });

      const hasSfxIntent = storyboard.scenes.filter(s => {
        const desc = s.descriptor as any;
        return (desc.sfxDescription?.trim() || desc.editDirections?.sfxCue?.trim());
      }).length;
      const nativeAudioSceneCount = storyboard.scenes.filter(s => (s as any).hasNativeAudio).length;

      if (sfxInputs.length > 0) {
        console.log(
          `[Finalize] Dispatching SFX worker: ${sfxInputs.length} scenes ` +
          `(from ${hasSfxIntent} with sfxDescription/sfxCue; ${nativeAudioSceneCount} skipped due to hasNativeAudio — those rely on the clip's own audio)`,
        );
        await dispatchAudio({
          type: 'sfx',
          projectId: project.projectId,
          userId,
          storyboardId: id,
          sfxInputs,
          sceneFrameMap,
        }, 'SFX');
      } else if (hasSfxIntent > 0 && nativeAudioSceneCount > 0) {
        console.log(
          `[Finalize] SFX worker NOT dispatched — all ${hasSfxIntent} scene(s) with SFX intent have hasNativeAudio=true ` +
          `(clip's own audio is the ambient bed; layering Freesound on top would over-mix). ` +
          `If native audio is unreliable, fix that at the video-gen gate (C2 dialogue-intent work), not here.`,
        );
      } else {
        console.log('[Finalize] SFX worker NOT dispatched — no scene has sfxDescription or sfxCue');
      }
    }

    // ─── Store detected edit profile on project for Director ──────────
    // Director runs AFTER video generation completes (dispatched from video worker),
    // NOT here — because videos aren't ready yet at finalize time.
    // We store the profile detection result so the video worker can use it.
    try {
      const { getAutoSelectedProfileWithEmbeddings, getAutoSelectedProfile } = await import('@/lib/editron/services/profile-detection-service');
      // Bundle 3 (2026-04-08) fix: previously this object was a FLAT pre-extracted-signals
      // shape (narration: "...", visual: "...") which does NOT match the ThinkForgeMetadata
      // interface getAutoSelectedProfile() expects (`scenes: Array<{...}>`). The function's
      // extractSignals() then called `metadata.scenes || []` → empty scenes → all empty
      // signal strings → every profile scored 0 → always fell through to G-01 Universal Clean.
      // This is why the user saw G-01 applied to a nostalgia brand ad in proj_r8E_z9WVaBX9
      // despite my Bundle 2 E-04 keyword work. Now we pass the correct shape.
      const thinkforgeMetadata = {
        title: storyboard.title || (storyboard as any).sourceScriptTitle || '',
        scenes: storyboard.scenes.map(s => ({
          narration: s.descriptor.narration || '',
          visualDescription: s.descriptor.visualDescription || '',
          mood: s.descriptor.mood || '',
          audioDescription: s.descriptor.audioDescription || '',
          rawProductionNotes: (s.descriptor as any).rawProductionNotes || '',
          editDirections: {
            onScreenText: (s.descriptor.editDirections as any)?.onScreenText || [],
            motionGraphicCue: s.descriptor.editDirections?.motionGraphicCue || '',
          },
        })),
        overallMusicPrompt: storyboard.overallMusicPrompt || '',
        environmentNotes: (storyboard as any).environmentNotes || '',
        characterDescriptions: (storyboard as any).characterDescriptions || {},
        globalEditDirections: storyboard.globalEditDirections || undefined,
        // LLM-suggested profile category (2026-04-17): semantic content classification from
        // parser's full-script understanding. Drives category-filtered profile detection,
        // eliminating cross-category false positives (e.g., Nike ≠ Screen Demo).
        suggestedProfileCategory: (storyboard as any).suggestedProfileCategory || undefined,
      };
      // Use embedding-enhanced detection (async, Gemini API). Falls back to keyword-only if unavailable.
      let { profile: detectedProfile, autoSelected, detection } = await getAutoSelectedProfileWithEmbeddings(thinkforgeMetadata).catch(() => getAutoSelectedProfile(thinkforgeMetadata));

      // Phase 4b: Graphiti preference boost (server-side only)
      try {
        const { searchGraphitiFacts } = await import('@/lib/editron/services/graph-service');
        const facts = await searchGraphitiFacts(
          'What editing profile does this user prefer or override to?',
          userId,
          3,
        );
        if (facts.length > 0) {
          const { EDIT_PROFILES } = await import('@/lib/editron/data/edit-profiles');
          const profileIds = Object.keys(EDIT_PROFILES);
          const preferred = profileIds.find(id => facts.some(f => f.includes(id)));
          if (preferred && preferred !== detectedProfile.profileId) {
            console.log(`[Finalize] Graphiti suggests profile ${preferred} over detected ${detectedProfile.profileId}`);
            detectedProfile = EDIT_PROFILES[preferred as keyof typeof EDIT_PROFILES];
            detection = { ...detection, confidence: Math.min(1.0, detection.confidence + 0.15), reasoning: [...detection.reasoning, `Graphiti: user historically prefers ${preferred}`] };
          }
        }
      } catch { /* Graphiti unavailable */ }

      console.log(`[Finalize] Profile detection: ${detectedProfile.profileId} confidence=${detection.confidence.toFixed(2)} auto=${autoSelected} reasoning=[${detection.reasoning.slice(0, 3).join('; ')}]`);
      const profileId = detectedProfile.profileId;
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

    // Log pipeline warning summary
    if (pipelineWarnings.hasErrors() || pipelineWarnings.count().warnings > 0) {
      console.log(`[Finalize] ${pipelineWarnings.getSummary()}`);
    }

    // ─── Brand Intelligence: emit project_created + set status to generating ───
    try {
      const { emitBrandEvent } = await import('@/lib/shared/brand-events');
      const { transitionProjectStatus } = await import('@/lib/shared/project-status');

      await transitionProjectStatus(project.projectId, userId, 'generating', 'pipeline_finalize');

      emitBrandEvent({
        userId,
        projectId: project.projectId,
        service: 'pipeline',
        type: 'project_created',
        payload: {
          overlayCount: overlays.length,
          durationFrames: currentFrame,
          sceneCount: storyboard.scenes?.length ?? 0,
          warningCount: warnings.length,
        },
      }).catch((e) => console.warn('[Finalize] Brand event failed:', e));
    } catch (brandErr: any) {
      console.warn(`[Finalize] Brand intelligence wiring failed: ${brandErr.message}`);
    }

    return NextResponse.json({
      success: true,
      projectId: project.projectId,
      name: projectName,
      overlayCount: overlays.length,
      totalDurationFrames: currentFrame,
      audioGenerating: true,
      directorQueued: true,
      ...(warnings.length > 0 && { warnings }),
      pipelineHealth: pipelineWarnings.count(),
    });
  } catch (error: any) {
    console.error('[Finalize]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
