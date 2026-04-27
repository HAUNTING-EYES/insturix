/**
 * POST /api/internal/workers/pipeline/video
 *
 * QStash worker that generates a SINGLE video clip for one scene.
 * Called by QStash with job data — each scene gets its own worker invocation
 * with its own 300s Vercel timeout.
 *
 * This is the same proven pattern used by Clickatron workers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import {
  generateVideoClip,
} from '@/lib/pipeline/video-generation-service';
import { updateStoryboardScene } from '@/lib/pipeline/storyboard-db';
import { getDatabase } from '@/lib/editron/db/mongodb';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Job tracking collection
const VIDEO_JOBS_COLLECTION = 'pipeline_video_jobs';

interface VideoWorkerPayload {
  jobId: string;
  batchId: string;
  userId: string;
  storyboardId: string;
  sceneIndex: number;
  imageUrl: string;
  motionPrompt: string;
  durationSeconds: number;
  aspectRatio?: string;
  videoModel: string;
  nextSceneImageUrl?: string;
  /** Sub-shot index within a montage scene (undefined for continuous scenes) */
  subShotIndex?: number;
  /** Scene context for LLM prompt refinement (moved from route to worker for quality).
   *  If present, worker refines motionPrompt via LLM before generating video.
   *  If absent, motionPrompt is used as-is (backward compat). */
  refinementContext?: {
    visualDescription?: string;
    narration?: string;
    mood?: string;
    artStyle?: string;
    videoQualityTokens?: string;
    cameraDirection?: string;
    videoMotionPrompt?: string;
    referenceSubjects?: string[];
    transitionHint?: { type?: string };
    /** Sound design description from script (ambient + spot SFX). Fed into Seedance
     *  audio layer to generate matching foley natively. Unused for non-Seedance models. */
    sfxDescription?: string;
  };
}

async function handler(request: NextRequest) {
  console.log(`[VideoWorker] Received request from ${request.headers.get('user-agent')?.substring(0, 50) || 'unknown'}`);
  try {
    const payload: VideoWorkerPayload = await request.json();
    const {
      jobId,
      batchId,
      userId,
      storyboardId,
      sceneIndex,
      imageUrl,
      motionPrompt,
      durationSeconds,
      aspectRatio,
      videoModel,
      nextSceneImageUrl,
      subShotIndex,
    } = payload;

    console.log(`[VideoWorker] Processing job ${jobId}: scene ${sceneIndex}, model=${videoModel}`);

    const db = await getDatabase();

    // Mark as processing
    await db.collection(VIDEO_JOBS_COLLECTION).updateOne(
      { _id: jobId } as any,
      { $set: { status: 'processing', startedAt: new Date() } },
    );

    // ── LLM Prompt Refinement (moved from route → worker for quality) ──
    // Each worker has its own 300s budget, so refinement (~15s) doesn't
    // compete with other scenes. Quality stays identical — just runs in
    // the right place instead of blocking the route.
    let refinedPrompt = motionPrompt;
    const ctx = payload.refinementContext;
    if (ctx) {
      try {
        const { refineVideoPrompt } = await import('@/lib/pipeline/llm-scene-parser');
        // Cinema hardware: derive camera/lens language from content mood + art style.
        // This enriches the LLM prompt with physical camera terminology that models
        // (especially Kling, Veo) respond strongly to.
        const { getCinemaSettingsFromContent, buildCinemaFragment } = await import('@/lib/editron/data/cinema-prompt-config');
        const cinemaSettings = getCinemaSettingsFromContent(ctx.mood, ctx.artStyle);
        const cinemaHardware = buildCinemaFragment(cinemaSettings);

        // Determine prompt-tuning family from the video model key. This activates
        // model-specific prompt templates (e.g., Seedance's 4-layer structure with
        // ambient audio guidance, or Veo's short 150-300 char spec). Previously
        // targetModel was never passed, so all refinements fell through to the
        // generic default — the Seedance template existed as dead code.
        const { getPromptTuningFamily } = await import('@/lib/pipeline/adapters/video-model-configs');
        const targetModel = getPromptTuningFamily(videoModel) ?? undefined;

        refinedPrompt = await Promise.race([
          refineVideoPrompt({
            visualDescription: ctx.visualDescription || '',
            videoMotionPrompt: ctx.videoMotionPrompt || motionPrompt,
            narration: ctx.narration,
            mood: ctx.mood,
            durationSeconds,
            artStyle: ctx.artStyle,
            aspectRatio,
            referenceSubjects: ctx.referenceSubjects as any,
            videoQualityTokens: ctx.videoQualityTokens,
            cameraDirection: ctx.cameraDirection,
            transitionHint: ctx.transitionHint as any,
            cinemaHardware,
            targetModel,
            // Pass the script's sound-design description. For Seedance, this gets
            // woven into the audio layer so the model generates matching foley natively.
            // For non-Seedance models it's ignored (kept in interface for symmetry).
            sfxDescription: ctx.sfxDescription,
            // suppressDialogue is auto-inferred inside refineVideoPrompt based on
            // (targetModel === 'seedance' && narration exists). Kokoro TTS generates
            // the voice consistently across all scenes — Seedance must not speak.
          }),
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('LLM refinement timeout')), 30000)),
        ]);
        console.log(`[VideoWorker] Scene ${sceneIndex}: prompt refined (${refinedPrompt.length} chars)`);
      } catch (refineErr: any) {
        // Refinement failed — use the basic prompt. Still generates video, just less polished prompt.
        console.warn(`[VideoWorker] Scene ${sceneIndex}: refinement failed (${refineErr.message}), using basic prompt`);
        const { buildMotionPrompt } = await import('@/lib/pipeline/video-generation-service');
        refinedPrompt = buildMotionPrompt({
          visualDescription: ctx.visualDescription || '',
          narration: ctx.narration,
          cameraDirection: ctx.cameraDirection,
          mood: ctx.mood,
          videoMotionPrompt: ctx.videoMotionPrompt || motionPrompt,
          videoQualityTokens: ctx.videoQualityTokens,
        });
      }
    }

    // Generate the video clip
    const result = await generateVideoClip(
      {
        imageUrl,
        motionPrompt: refinedPrompt,
        durationSeconds,
        aspectRatio: aspectRatio as any,
        falVideoModel: videoModel as any,
        nextSceneImageUrl,
      },
      userId,
    );

    // Update storyboard scene — include videoDurationMs so finalize
    // uses the actual clip length (not the script's word-count estimate)
    if (subShotIndex !== undefined && subShotIndex !== null) {
      // Sub-shot video: update the specific sub-shot within the scene's subShots array
      // This allows finalize to find individual sub-shot videos
      const db2 = await getDatabase();
      await db2.collection('storyboards').updateOne(
        { storyboardId },
        { $set: {
          [`scenes.$[elem].descriptor.subShots.${subShotIndex}.videoUrl`]: result.videoUrl,
          [`scenes.$[elem].descriptor.subShots.${subShotIndex}.videoAssetId`]: result.assetId,
          [`scenes.$[elem].descriptor.subShots.${subShotIndex}.videoR2Key`]: (result as any).r2Key || result.assetId || null,
          [`scenes.$[elem].descriptor.subShots.${subShotIndex}.videoDurationMs`]: result.durationMs || (durationSeconds * 1000),
          [`scenes.$[elem].descriptor.subShots.${subShotIndex}.hasNativeAudio`]: result.hasNativeAudio || false,
          updatedAt: new Date(),
        }},
        { arrayFilters: [{ 'elem.sceneIndex': sceneIndex }] },
      );
      console.log(`[VideoWorker] Sub-shot ${subShotIndex} of scene ${sceneIndex}: stored videoUrl on storyboard`);

      // Also update scene-level videoUrl if this is the FIRST sub-shot (for thumbnail/fallback)
      if (subShotIndex === 0) {
        await updateStoryboardScene(storyboardId, sceneIndex, {
          videoUrl: result.videoUrl,
          videoAssetId: result.assetId,
          videoGcsPath: result.gcsPath,
          videoR2Key: (result as any).r2Key || result.assetId || null,
          videoProvider: result.provider || 'fal-ai',
          videoDurationMs: result.durationMs || (durationSeconds * 1000),
          hasNativeAudio: result.hasNativeAudio || false,
        });
      }
    } else {
      // Normal scene: update scene-level video
      await updateStoryboardScene(storyboardId, sceneIndex, {
        videoUrl: result.videoUrl,
        videoAssetId: result.assetId,
        videoGcsPath: result.gcsPath,
        videoR2Key: (result as any).r2Key || result.assetId || null,
        videoProvider: result.provider || 'fal-ai',
        videoDurationMs: result.durationMs || (durationSeconds * 1000),
        hasNativeAudio: result.hasNativeAudio || false,
      });
    }

    // Also update the Editron project overlay if this storyboard is linked to a project.
    // Without this, video regen updates the storyboard but the editor still shows the old clip.
    try {
      const { getStoryboard } = await import('@/lib/pipeline/storyboard-db');
      const sb = await getStoryboard(storyboardId, userId);
      const linkedProjectId = sb?.projectId;
      if (linkedProjectId) {
        // Find the video overlay for this scene (by matching assetId or from-frame position)
        const scene = sb.scenes?.find((s: any) => s.sceneIndex === sceneIndex);
        const oldAssetId = scene?.videoAssetId;

        // Register the new asset first
        await db.collection('media_assets').updateOne(
          { assetId: result.assetId },
          {
            $setOnInsert: {
              assetId: result.assetId, userId, type: 'video',
              filename: `${result.assetId}.mp4`, source: 'video-regen',
              gcsPath: result.gcsPath,
              r2Key: (result as any).r2Key || result.assetId || null,
              cachedUrl: result.videoUrl,
              urlExpiresAt: result.videoUrl?.includes('workers.dev') ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              uploadedAt: new Date(),
            },
          },
          { upsert: true },
        );

        // Update the overlay in the project that has the old assetId
        if (oldAssetId) {
          await db.collection('projects').updateOne(
            { projectId: linkedProjectId, 'overlays.assetId': oldAssetId },
            {
              $set: {
                'overlays.$.src': result.videoUrl,
                'overlays.$.content': result.videoUrl,
                'overlays.$.assetId': result.assetId,
                'overlays.$.videoDurationMs': result.durationMs || (durationSeconds * 1000),
                updatedAt: new Date(),
              },
            },
          );
          console.log(`[VideoWorker] Updated Editron project ${linkedProjectId} overlay: ${oldAssetId} → ${result.assetId}`);
        }
      }
    } catch (projErr: any) {
      // H4 FIX: Retry once on project overlay update failure before giving up
      console.warn(`[VideoWorker] Project overlay update failed (attempt 1): ${projErr.message}`);
      try {
        await new Promise(r => setTimeout(r, 1000)); // Brief delay before retry
        const { getStoryboard: getStoryboard2 } = await import('@/lib/pipeline/storyboard-db');
        const sb2 = await getStoryboard2(storyboardId, userId);
        const linkedProjectId2 = sb2?.projectId;
        if (linkedProjectId2) {
          const scene2 = sb2.scenes?.find((s: any) => s.sceneIndex === sceneIndex);
          const oldAssetId2 = scene2?.videoAssetId;
          if (oldAssetId2) {
            await db.collection('projects').updateOne(
              { projectId: linkedProjectId2, 'overlays.assetId': oldAssetId2 },
              {
                $set: {
                  'overlays.$.src': result.videoUrl,
                  'overlays.$.content': result.videoUrl,
                  'overlays.$.assetId': result.assetId,
                  'overlays.$.videoDurationMs': result.durationMs || (durationSeconds * 1000),
                  updatedAt: new Date(),
                },
              },
            );
            console.log(`[VideoWorker] Project overlay update succeeded on retry`);
          }
        }
      } catch (retryErr: any) {
        // Non-fatal after retry — user can still re-finalize
        console.warn(`[VideoWorker] Project overlay update failed on retry (non-fatal): ${retryErr.message}`);
      }
    }

    // Run 5-Track analysis on the generated video immediately.
    // Analysis is cached in MongoDB — Director reads it instantly later.
    // This removes analysis from the Director's time budget entirely.
    // ALSO derives a quality score from the analysis (no extra download/Gemini call).
    try {
      const { runFullAnalysis, getAnalysis } = await import('@/lib/editron/services/five-track-analysis');

      // Only analyze if not already cached (e.g., from a previous generation)
      let analysis = await getAnalysis(result.assetId);
      if (!analysis) {
        const durationMs = result.durationMs || (durationSeconds * 1000);

        // Get storyboard scene for metadata enrichment
        const { getStoryboard } = await import('@/lib/pipeline/storyboard-db');
        const storyboard = await getStoryboard(storyboardId, userId);
        const scene = storyboard?.scenes?.find((s: any) => s.sceneIndex === sceneIndex);

        analysis = await runFullAnalysis(result.assetId, userId, {
          videoUrl: result.videoUrl,
          audioUrl: undefined, // Voiceover added later, not available yet
          durationMs,
          storyboardScene: scene?.descriptor,
          sourceType: 'ai-generated',
        });

        console.log(`[VideoWorker] 5-Track analysis cached for ${result.assetId}`);
      }

      // Quality scoring: 2-tier approach.
      // Tier 1 (deterministic, zero cost): checks from 5-Track data.
      // Tier 2 (Gemini Vision, ~$0.003): sends keyframes for artifact detection.
      // Per creative_production_knowledge.md §7: check anatomical correctness,
      // text hallucination, temporal consistency, composition, motion naturalness.
      if (analysis) {
        const kfAnalyses = analysis.keyframeAnalyses || [];
        const subjectTracks = analysis.subjectTracks || [];
        const motionSegs = analysis.motionSegments || [];

        // ── Tier 1: Deterministic checks from 5-Track ──

        // 1. Motion smoothness (0-10): erratic motion = AI artifacts
        const motionIntensities = motionSegs.map((s: any) => s.motionIntensity || 0);
        const motionJumps = motionIntensities.filter((_: number, i: number) =>
          i > 0 && Math.abs(motionIntensities[i] - motionIntensities[i - 1]) > 0.5
        ).length;
        const motionScore = Math.max(0, 10 - motionJumps * 3);

        // 2. Subject stability (0-10): subjects appearing/disappearing = morphing
        const subjectFrameCounts = subjectTracks.map((t: any) => (t.frames || []).length);
        const avgPersistence = subjectFrameCounts.length > 0
          ? subjectFrameCounts.reduce((a: number, b: number) => a + b, 0) / subjectFrameCounts.length
          : 0;
        const stabilityScore = Math.min(10, avgPersistence * 2);

        // 3. Keyframe description consistency (0-10): wildly different descriptions = temporal incoherence
        const descriptions = kfAnalyses.map((kf: any) => (kf.description || '').toLowerCase());
        let descOverlap = 5;
        if (descriptions.length >= 2) {
          const words0 = new Set(descriptions[0].split(/\s+/).filter((w: string) => w.length > 3));
          const wordsLast = new Set(descriptions[descriptions.length - 1].split(/\s+/).filter((w: string) => w.length > 3));
          const shared = [...words0].filter(w => wordsLast.has(w)).length;
          descOverlap = Math.min(10, (shared / Math.max(words0.size, 1)) * 15);
        }

        // 4. Composition check (0-10): subjects detected in frame center vs edges
        let compositionScore = 5;
        for (const track of subjectTracks) {
          const frames = (track as any).frames || [];
          if (frames.length > 0 && frames[0].box) {
            const cx = frames[0].box.x + frames[0].box.w / 2;
            const cy = frames[0].box.y + frames[0].box.h / 2;
            const thirdX = cx > 0.25 && cx < 0.75;
            const thirdY = cy > 0.25 && cy < 0.75;
            if (thirdX && thirdY) compositionScore = 8;
            break;
          }
        }

        // Deterministic score (0-100)
        const deterministicScore = Math.round(
          (motionScore * 0.30 + stabilityScore * 0.25 + descOverlap * 0.25 + compositionScore * 0.20) * 10
        );

        // ── Tier 2: Gemini Vision artifact check (only on borderline or low scores) ──
        let visionScore: number | null = null;
        let visionIssues: string[] = [];
        const shouldRunVision = deterministicScore < 75 && kfAnalyses.length > 0;

        if (shouldRunVision) {
          try {
            const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
            if (apiKey && kfAnalyses[0]?.description) {
              const { GoogleGenerativeAI } = await import('@google/generative-ai');
              const genAI = new GoogleGenerativeAI(apiKey);
              const visionModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

              const kfSummary = kfAnalyses.slice(0, 3).map((kf: any, i: number) =>
                `Frame ${i + 1}: ${(kf.description || '').substring(0, 200)}`
              ).join('\n');

              const visionResult = await visionModel.generateContent(
                `Rate this AI-generated video on a scale of 0-10 based on these keyframe descriptions. Check for: melted/extra fingers, face morphing, text hallucination, temporal flickering, unnatural physics, composition issues. Be strict.

Keyframes:
${kfSummary}

Original prompt: ${refinedPrompt?.substring(0, 200) || 'unknown'}

Reply with ONLY a JSON object: {"score": N, "issues": ["issue1", "issue2"]}`
              );

              const visionText = visionResult.response?.text() || '';
              try {
                const parsed = JSON.parse(visionText.replace(/```json\n?|\n?```/g, '').trim());
                visionScore = Math.max(0, Math.min(10, parsed.score || 5));
                visionIssues = parsed.issues || [];
              } catch { visionScore = null; }
            }
          } catch (visionErr: any) {
            console.warn(`[VideoWorker] Vision quality check failed (non-fatal): ${visionErr.message}`);
          }
        }

        // Final score: blend deterministic + vision (if available)
        const qualityScore = visionScore !== null
          ? Math.round((deterministicScore * 0.4 + visionScore * 10 * 0.6))
          : deterministicScore;

        const qualitySource = visionScore !== null ? 'hybrid-vision' : 'deterministic-5track';
        await db.collection(VIDEO_JOBS_COLLECTION).updateOne(
          { _id: jobId } as any,
          { $set: {
            qualityScore,
            qualitySource,
            qualityDeterministic: deterministicScore,
            ...(visionScore !== null && { qualityVision: visionScore * 10, qualityVisionIssues: visionIssues }),
          } },
        );

        console.log(`[VideoWorker] Quality ${qualityScore}/100 (${qualitySource}) for scene ${sceneIndex}${visionIssues.length > 0 ? ` — issues: ${visionIssues.join(', ')}` : ''}`);

        if (qualityScore < 40) {
          console.warn(`[VideoWorker] LOW QUALITY (${qualityScore}/100) for scene ${sceneIndex}`);
          await db.collection(VIDEO_JOBS_COLLECTION).updateOne(
            { _id: jobId } as any,
            { $set: { qualityFlag: 'low', qualityShouldRegenerate: true } },
          );
          // H5 FIX: Add warning to project document so user can see quality issues in the editor
          try {
            const { getStoryboard: getSb } = await import('@/lib/pipeline/storyboard-db');
            const sbForQuality = await getSb(storyboardId, userId);
            const qualityProjectId = sbForQuality?.projectId;
            if (qualityProjectId) {
              await db.collection('projects').updateOne(
                { projectId: qualityProjectId },
                {
                  $push: {
                    'qualityWarnings': {
                      sceneIndex,
                      qualityScore,
                      message: `Scene ${sceneIndex}: Low quality video (${qualityScore}/100). Consider regenerating this scene.`,
                      createdAt: new Date(),
                    } as any,
                  },
                },
              );
            }
          } catch { /* non-fatal */ }
        } else {
          console.log(`[VideoWorker] Quality OK (${qualityScore}/100) for scene ${sceneIndex} (5-Track derived)`);
        }
      }
    } catch (analysisErr: any) {
      // Non-fatal — Director will run analysis if cache miss
      console.warn(`[VideoWorker] Analysis failed (non-fatal): ${analysisErr.message}`);
    }

    // Mark job complete
    await db.collection(VIDEO_JOBS_COLLECTION).updateOne(
      { _id: jobId } as any,
      {
        $set: {
          status: 'completed',
          videoUrl: result.videoUrl,
          videoAssetId: result.assetId,
          videoGcsPath: result.gcsPath,
          modelUsed: (result as any).modelUsed || videoModel,
          completedAt: new Date(),
        },
      },
    );

    // Update batch counters
    await db.collection('pipeline_video_batches').updateOne(
      { _id: batchId } as any,
      { $inc: { completed: 1 }, $set: { updatedAt: new Date() } },
    );
    await updateBatchStatus(batchId);

    console.log(`[VideoWorker] Job ${jobId} completed: ${result.assetId}`);
    return NextResponse.json({ success: true, jobId, videoUrl: result.videoUrl });
  } catch (error: any) {
    console.error('[VideoWorker] Error:', error.message);

    // Try to mark job as failed
    try {
      const payload: VideoWorkerPayload = await request.clone().json().catch(() => ({} as any));
      if (payload.jobId) {
        const db = await getDatabase();
        await db.collection(VIDEO_JOBS_COLLECTION).updateOne(
          { _id: payload.jobId } as any,
          { $set: { status: 'failed', error: error.message, completedAt: new Date() } },
        );
        if (payload.batchId) {
          await db.collection('pipeline_video_batches').updateOne(
            { _id: payload.batchId } as any,
            { $inc: { failed: 1 }, $set: { updatedAt: new Date() } },
          );
          await updateBatchStatus(payload.batchId);
        }
      }
    } catch (err) { console.error('[VideoWorker] Failed to mark job as failed:', err); } // Best-effort

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

async function updateBatchStatus(batchId: string): Promise<void> {
  const db = await getDatabase();
  const batch = await db.collection('pipeline_video_batches').findOne({ _id: batchId } as any) as any;
  if (!batch) return;

  const done = (batch.completed || 0) + (batch.failed || 0);
  let status = 'processing';
  if (done >= batch.totalScenes) {
    if (batch.failed === 0) status = 'completed';
    else if (batch.completed === 0) status = 'failed';
    else status = 'partial';
  }

  await db.collection('pipeline_video_batches').updateOne(
    { _id: batchId } as any,
    { $set: { status, updatedAt: new Date() } },
  );

  // ─── Dispatch Director Agent when ALL videos are done ──────────
  // Only runs once (when done count first reaches totalScenes).
  // Reads pendingDirectorProfileId stored by finalize route.
  // Gets projectId from storyboard (not batch — batch doesn't always have it).
  const resolvedProjectId = batch.projectId
    || (batch.storyboardId ? (await db.collection('storyboards').findOne({ storyboardId: batch.storyboardId }) as any)?.projectId : null);

  if (done >= batch.totalScenes && resolvedProjectId) {
    try {
      const project = await db.collection('projects').findOne({ projectId: resolvedProjectId }) as any;
      let profileId = project?.pendingDirectorProfileId;
      const userId = project?.pendingDirectorUserId || project?.userId;

      // H6 FIX: If pendingDirectorProfileId is missing, try auto-detection instead of skipping entirely
      if (!profileId) {
        try {
          const { getAutoSelectedProfile } = await import('@/lib/editron/services/profile-detection-service');
          // Gather metadata from storyboard for profile detection
          const sbDoc = batch.storyboardId
            ? await db.collection('storyboards').findOne({ storyboardId: batch.storyboardId }) as any
            : null;
          if (sbDoc) {
            // Bundle 3: include title + onScreenText + rawProductionNotes so profile
            // detection has enough signal to score emotional/brand-narrative content properly.
            const thinkforgeMetadata = {
              title: sbDoc.title || '',
              scenes: (sbDoc.scenes || []).map((s: any) => ({
                narration: s.descriptor?.narration || '',
                visualDescription: s.descriptor?.visualDescription || '',
                mood: s.descriptor?.mood || '',
                audioDescription: s.descriptor?.audioDescription || '',
                rawProductionNotes: s.descriptor?.rawProductionNotes || '',
                editDirections: {
                  onScreenText: s.descriptor?.editDirections?.onScreenText || [],
                  motionGraphicCue: s.descriptor?.editDirections?.motionGraphicCue || '',
                },
              })),
              overallMusicPrompt: sbDoc.overallMusicPrompt || '',
              environmentNotes: sbDoc.environmentNotes || '',
              globalEditDirections: sbDoc.globalEditDirections || undefined,
            };
            const detected = getAutoSelectedProfile(thinkforgeMetadata);
            profileId = detected.profile.profileId;
            console.log(`[VideoWorker] Auto-detected Director profile: ${profileId} confidence=${detected.detection.confidence.toFixed(2)} (was missing from project)`);
          } else {
            console.log(`[VideoWorker] Batch ${batchId} complete but no pending Director profile and no storyboard for auto-detection — skipping`);
            return;
          }
        } catch (detectErr: any) {
          console.log(`[VideoWorker] Batch ${batchId} complete but Director profile detection failed: ${detectErr.message} — skipping`);
          return;
        }
      }

      // Clear pending flag so Director doesn't run twice
      await db.collection('projects').updateOne(
        { projectId: resolvedProjectId },
        { $unset: { pendingDirectorProfileId: '', pendingDirectorUserId: '' } },
      );

      const directorUrl = (() => {
        const base = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
        return `${base}/api/services/editron/director/execute`;
      })();

      if (process.env.QSTASH_TOKEN) {
        const { Client } = await import('@upstash/qstash');
        const qstash = new Client({ token: process.env.QSTASH_TOKEN, baseUrl: process.env.QSTASH_URL || undefined });
        await qstash.publishJSON({
          url: directorUrl,
          body: { projectId: resolvedProjectId, editProfileId: profileId, userId, _internal: true },
          retries: 1,
        });
        console.log(`[VideoWorker] Batch ${batchId} complete (${status}) — Director dispatched for ${resolvedProjectId} (profile: ${profileId})`);
      } else {
        fetch(directorUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: resolvedProjectId, editProfileId: profileId, userId, _internal: true }),
        }).catch(() => {});
        console.log(`[VideoWorker] Batch ${batchId} complete — Director dispatched via fetch for ${resolvedProjectId} (profile: ${profileId})`);
      }
    } catch (dirErr: any) {
      console.error(`[VideoWorker] Director dispatch failed after batch ${batchId} complete:`, dirErr.message);
    }
  }
}

// SECURITY: Always verify QStash signature in production.
// In dev, skip verification for local testing.
// If signing keys are missing in production, REJECT the request — don't leave endpoints open.
const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
const hasSigningKeys = !!process.env.QSTASH_CURRENT_SIGNING_KEY && !!process.env.QSTASH_NEXT_SIGNING_KEY;

async function secureHandler(request: NextRequest) {
  if (!isDev && !hasSigningKeys) {
    console.error('[VideoWorker] SECURITY: QSTASH signing keys not set in production. Rejecting request.');
    return NextResponse.json({ error: 'Worker not configured — missing signing keys' }, { status: 500 });
  }
  return handler(request);
}

export const POST = isDev ? handler : (hasSigningKeys ? verifySignatureAppRouter(handler) : secureHandler);
