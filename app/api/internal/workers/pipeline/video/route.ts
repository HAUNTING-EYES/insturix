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
import { getStoryboard, updateStoryboardScene } from '@/lib/pipeline/storyboard-db';
import { COLLECTIONS, getDatabase } from '@/lib/editron/db/mongodb';
import { recordProviderCostEvent } from '@/lib/financials/provider-cost-events';
import { isInternalQStashWorkerAuthConfigured } from '@/lib/editron/security/internal-worker-auth';
import type { ProjectRevisionV1 } from '@/lib/editron/services/project-service';
import type { PipelineVideoProjectDeliveryRequestV1 } from '@/lib/editron/services/pipeline-video-project-delivery-v1';

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
  creditTransactionId?: string;
  chargedCredits?: number;
  nextSceneImageUrl?: string;
  /** Sub-shot index within a montage scene (undefined for continuous scenes) */
  subShotIndex?: number;
  /** Exact producer-snapshotted target for a post-generation ProjectService delivery. */
  projectDelivery?: PipelineVideoProjectDeliveryRequestV1;
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

interface VideoWorkerProjectDeliveryOutcome {
  status: 'NOT_REQUESTED' | 'APPLIED' | 'ALREADY_APPLIED' | 'CONFLICT';
  deliveryId?: string;
  materialHash?: string;
  requestedRevision?: ProjectRevisionV1;
  beforeRevision?: ProjectRevisionV1;
  afterRevision?: ProjectRevisionV1;
  rebase?: 'FRESH' | 'SAFE_REBASED_TARGET_UNCHANGED';
  conflict?: {
    reason: string;
    currentRevision?: ProjectRevisionV1;
  };
}

async function handler(request: NextRequest) {
  console.log(`[VideoWorker] Received request from ${request.headers.get('user-agent')?.substring(0, 50) || 'unknown'}`);
  let payloadForFailure: Partial<VideoWorkerPayload> = {};
  let providerCostRecorded = false;
  try {
    const payload: VideoWorkerPayload = await request.json();
    payloadForFailure = payload;
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
      creditTransactionId,
      chargedCredits,
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
        console.log(`[VideoWorker] Scene ${sceneIndex}: prompt refined (${refinedPrompt.length} chars): "${refinedPrompt.substring(0, 200)}"`);
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

    await recordPipelineVideoProviderCost({
      payload,
      status: 'success',
      result,
      creditTransactionId,
      chargedCredits,
    });
    providerCostRecorded = true;

    const sceneVideoProvenance = {
      videoModel: result.modelUsed || videoModel,
      ...(result.nativeAudioRights ? { nativeAudioRights: result.nativeAudioRights } : {}),
      ...(result.generatedVideoReceipt ? { generatedVideoReceipt: result.generatedVideoReceipt } : {}),
    };

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
          [`scenes.$[elem].descriptor.subShots.${subShotIndex}.videoProvider`]: result.provider || 'fal-ai',
          [`scenes.$[elem].descriptor.subShots.${subShotIndex}.videoModel`]: result.modelUsed || videoModel,
          [`scenes.$[elem].descriptor.subShots.${subShotIndex}.videoDurationMs`]: result.durationMs || (durationSeconds * 1000),
          [`scenes.$[elem].descriptor.subShots.${subShotIndex}.hasNativeAudio`]: result.hasNativeAudio || false,
          ...(result.nativeAudioRights ? {
            [`scenes.$[elem].descriptor.subShots.${subShotIndex}.nativeAudioRights`]: result.nativeAudioRights,
          } : {}),
          ...(result.generatedVideoReceipt ? {
            [`scenes.$[elem].descriptor.subShots.${subShotIndex}.generatedVideoReceipt`]: result.generatedVideoReceipt,
          } : {}),
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
          ...sceneVideoProvenance,
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
        ...sceneVideoProvenance,
      });
    }

    if (
      (subShotIndex === undefined || subShotIndex === null || subShotIndex === 0)
      && (!result.nativeAudioRights || !result.generatedVideoReceipt)
    ) {
      await db.collection('storyboards').updateOne(
        { storyboardId },
        {
          $unset: {
            ...(!result.nativeAudioRights ? { 'scenes.$[elem].nativeAudioRights': '' } : {}),
            ...(!result.generatedVideoReceipt ? { 'scenes.$[elem].generatedVideoReceipt': '' } : {}),
          },
        },
        { arrayFilters: [{ 'elem.sceneIndex': sceneIndex }] },
      );
    }

    if (
      subShotIndex !== undefined
      && subShotIndex !== null
      && (!result.nativeAudioRights || !result.generatedVideoReceipt)
    ) {
      const subShotPath = `scenes.$[elem].descriptor.subShots.${subShotIndex}`;
      await db.collection('storyboards').updateOne(
        { storyboardId },
        {
          $unset: {
            ...(!result.nativeAudioRights ? { [`${subShotPath}.nativeAudioRights`]: '' } : {}),
            ...(!result.generatedVideoReceipt ? { [`${subShotPath}.generatedVideoReceipt`]: '' } : {}),
          },
        },
        { arrayFilters: [{ 'elem.sceneIndex': sceneIndex }] },
      );
    }

    // A project-linked regeneration receives its exact target from the
    // producer. The worker never re-discovers a target through a broad asset
    // query and never falls back to a raw project write.
    let projectDelivery: VideoWorkerProjectDeliveryOutcome = { status: 'NOT_REQUESTED' };
    if (payload.projectDelivery) {
      await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
        { assetId: result.assetId },
        {
          $set: {
            source: result.provider === 'fal-ai' ? 'generated' : 'video-regen',
            hasNativeAudio: result.hasNativeAudio || false,
            ...(result.nativeAudioRights ? { audioRights: result.nativeAudioRights } : {}),
            ...(result.generatedVideoReceipt ? { generatedVideoReceipt: result.generatedVideoReceipt } : {}),
            updatedAt: new Date(),
          },
          $setOnInsert: {
            assetId: result.assetId, userId, type: 'video',
            filename: `${result.assetId}.mp4`,
            gcsPath: result.gcsPath,
            r2Key: (result as any).r2Key || result.assetId || null,
            cachedUrl: result.videoUrl,
            urlExpiresAt: result.videoUrl?.includes('workers.dev') ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            uploadedAt: new Date(),
          },
          ...(!result.nativeAudioRights || !result.generatedVideoReceipt ? {
            $unset: {
              ...(!result.nativeAudioRights ? { audioRights: '' } : {}),
              ...(!result.generatedVideoReceipt ? { generatedVideoReceipt: '' } : {}),
            },
          } : {}),
        },
        { upsert: true },
      );

      try {
        const { projectService } = await import('@/lib/editron/services/project-service');
        const deliveryResult = await projectService.commitPipelineVideoDeliveryV1(
          userId,
          payload.projectDelivery.projectId,
          {
            expectedRevision: payload.projectDelivery.expectedRevision,
            deliveryId: payload.projectDelivery.deliveryId,
            target: payload.projectDelivery.target,
            // The worker relays the producer's admission envelope unchanged;
            // ProjectService is the only owner that can validate and apply it.
            prerequisite: payload.projectDelivery.prerequisite,
            replacement: {
              assetId: result.assetId,
              sourceUrl: result.videoUrl,
              durationMs: result.durationMs || (durationSeconds * 1000),
              hasNativeAudio: result.hasNativeAudio || false,
              audioRights: result.nativeAudioRights || null,
              generatedVideoReceipt: result.generatedVideoReceipt || null,
            },
          },
        );
        const receipt = deliveryResult.deliveryReceipt;
        projectDelivery = {
          status: deliveryResult.disposition,
          deliveryId: receipt.deliveryId,
          materialHash: receipt.materialHash,
          requestedRevision: receipt.requestedRevision,
          beforeRevision: receipt.beforeRevision,
          afterRevision: receipt.afterRevision,
          rebase: receipt.rebase,
        };
      } catch (deliveryErr: any) {
        if (deliveryErr?.code !== 'PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT') {
          throw deliveryErr;
        }
        const conflictReason = typeof deliveryErr.reason === 'string'
          ? deliveryErr.reason
          : 'UNKNOWN';
        projectDelivery = {
          status: 'CONFLICT',
          deliveryId: payload.projectDelivery.deliveryId,
          conflict: {
            reason: conflictReason,
            ...(deliveryErr.currentRevision ? { currentRevision: deliveryErr.currentRevision } : {}),
          },
        };
        console.warn(`[VideoWorker] Project delivery conflict for ${payload.projectDelivery.deliveryId}: ${conflictReason}`);
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

        // ── Tier 2: Gemini Vision artifact check (runs on ALL videos per Fix 6) ──
        // OLD: gated by `deterministicScore < 75` — most videos scored above 75 so
        // vision check NEVER ran. Combined with the gemini-2.0-flash deprecation,
        // this meant zero artifact detection for months.
        // NEW: runs on every video with keyframe data. Cost: ~$0.003/video.
        let visionScore: number | null = null;
        let visionIssues: string[] = [];
        const shouldRunVision = kfAnalyses.length > 0;

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
              } catch (err: unknown) { console.warn('[VideoWorker] vision JSON parse failed:', err instanceof Error ? err.message : err); visionScore = null; }
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
          console.warn(`[VideoWorker] LOW QUALITY (${qualityScore}/100) for scene ${sceneIndex}. Prompt sent: "${refinedPrompt?.substring(0, 150)}". Model: ${videoModel}`);
          await db.collection(VIDEO_JOBS_COLLECTION).updateOne(
            { _id: jobId } as any,
            { $set: { qualityFlag: 'low', qualityShouldRegenerate: true } },
          );
          // Quality classification remains an analysis concern. ProjectService
          // is the only owner allowed to persist the resulting project fact.
          try {
            const sbForQuality = await getStoryboard(storyboardId, userId);
            const qualityProjectId = sbForQuality?.projectId;
            if (qualityProjectId) {
              const { projectService } = await import('@/lib/editron/services/project-service');
              const snapshot = await projectService.loadProjectForMutation(userId, qualityProjectId);
              const qualityWarning = await projectService.recordPipelineVideoQualityWarningV1(
                userId,
                qualityProjectId,
                {
                  expectedRevision: snapshot.revision,
                  batchId,
                  jobId,
                  storyboardId,
                  sceneIndex,
                  assetId: result.assetId,
                  qualityScore,
                  qualitySource,
                },
              );
              console.log(
                `[VideoWorker] Project quality warning ${qualityWarning.disposition} for ${jobId}.`,
              );
            }
          } catch (err: unknown) { console.warn('[VideoWorker] quality warning persistence failed:', err instanceof Error ? err.message : err); }
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
          hasNativeAudio: result.hasNativeAudio || false,
          ...(result.nativeAudioRights ? { nativeAudioRights: result.nativeAudioRights } : {}),
          ...(result.generatedVideoReceipt ? { generatedVideoReceipt: result.generatedVideoReceipt } : {}),
          projectDelivery,
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
    return NextResponse.json({
      success: true,
      jobId,
      videoUrl: result.videoUrl,
      hasNativeAudio: result.hasNativeAudio || false,
      generatedVideoReceipt: result.generatedVideoReceipt,
      projectDelivery,
    });
  } catch (error: any) {
    console.error('[VideoWorker] Error:', error.message);

    // Try to mark job as failed
    try {
      const payload = payloadForFailure;
      if (payload.jobId) {
        if (!providerCostRecorded) {
          await recordPipelineVideoProviderCost({
            payload,
            status: 'failed',
            error,
            creditTransactionId: payload.creditTransactionId,
            chargedCredits: payload.chargedCredits,
          });
        }

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

async function recordPipelineVideoProviderCost({
  payload,
  status,
  result,
  error,
  creditTransactionId,
  chargedCredits,
}: {
  payload: Partial<VideoWorkerPayload>;
  status: 'success' | 'failed';
  result?: Awaited<ReturnType<typeof generateVideoClip>>;
  error?: unknown;
  creditTransactionId?: string;
  chargedCredits?: number;
}): Promise<void> {
  if (!payload.jobId) return;

  const requestedMediaSeconds =
    typeof payload.durationSeconds === 'number' && Number.isFinite(payload.durationSeconds)
      ? payload.durationSeconds
      : undefined;
  const actualMediaSeconds =
    typeof result?.durationMs === 'number' && Number.isFinite(result.durationMs)
      ? Math.round((result.durationMs / 1000) * 100) / 100
      : undefined;

  await recordProviderCostEvent({
    eventId: `pce_pipeline_video_${payload.jobId}_${status}`,
    idempotencyKey: `pipeline:video:${payload.jobId}:${status}`,
    status,
    userId: payload.userId,
    taskId: payload.jobId,
    assetId: result?.assetId,
    creditTransactionId,
    service: 'pipeline',
    action: 'video_generation',
    route: '/api/internal/workers/pipeline/video',
    provider: result?.provider ?? 'fal-ai',
    model: result?.modelUsed ?? payload.videoModel,
    operation: 'video_generation',
    chargedCredits,
    providerJobId: result?.providerJobId,
    units: {
      mediaSeconds: actualMediaSeconds ?? requestedMediaSeconds,
      requestCount: 1,
    },
    metadata: {
      batchId: payload.batchId,
      storyboardId: payload.storyboardId,
      sceneIndex: payload.sceneIndex,
      subShotIndex: payload.subShotIndex,
      requestedDurationSeconds: requestedMediaSeconds,
      actualDurationMs: result?.durationMs,
      errorClass: error instanceof Error ? error.name : undefined,
    },
  });
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

  // ─── Prepare + dispatch Director Agent when ALL videos are done ──────────
  // ProjectService retains the finalize signal until the signed Director worker
  // has atomically claimed it. The batch only records delivery observations;
  // it never owns or clears project dispatch state.
  const resolvedProjectId = batch.projectId
    || (batch.storyboardId ? (await db.collection('storyboards').findOne({ storyboardId: batch.storyboardId }) as any)?.projectId : null);

  // Refresh derived project status whenever a batch finishes
  if (done >= batch.totalScenes && resolvedProjectId) {
    try {
      const { projectService } = await import('@/lib/editron/services/project-service');
      await projectService.refreshProjectStatus(resolvedProjectId);
    } catch (statusErr: any) {
      console.warn(`[VideoWorker] Failed to refresh project status for ${resolvedProjectId}:`, statusErr.message);
    }

    const recordDirectorDispatch = async (
      disposition: string,
      details: Record<string, unknown> = {},
    ) => {
      const observedAt = new Date();
      await db.collection('pipeline_video_batches').updateOne(
        { _id: batchId } as any,
        {
          $set: {
            directorDispatch: {
              schemaVersion: 1,
              disposition,
              observedAt: observedAt.toISOString(),
              ...details,
            },
            updatedAt: observedAt,
          },
        },
      );
    };
    const userId = typeof batch.userId === 'string' && batch.userId.trim()
      ? batch.userId.trim()
      : null;
    const qstashToken = process.env.QSTASH_TOKEN?.trim();
    const directorBaseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL?.trim();

    if (!userId) {
      await recordDirectorDispatch('NOT_DISPATCHED_MISSING_BATCH_OWNER');
      console.error(`[VideoWorker] Batch ${batchId} cannot dispatch Director: batch userId is missing.`);
      return;
    }
    if (!qstashToken || !isInternalQStashWorkerAuthConfigured()) {
      await recordDirectorDispatch('NOT_DISPATCHED_WORKER_AUTH_CONFIGURATION', {
        missingQStashToken: !qstashToken,
        missingSigningKeys: !isInternalQStashWorkerAuthConfigured(),
      });
      console.error(`[VideoWorker] Batch ${batchId} cannot dispatch Director: signed QStash delivery is not configured.`);
      return;
    }
    if (!directorBaseUrl) {
      await recordDirectorDispatch('NOT_DISPATCHED_DIRECTOR_WORKER_URL');
      console.error(`[VideoWorker] Batch ${batchId} cannot dispatch Director: no deployed worker URL is configured.`);
      return;
    }

    try {
      const { projectService } = await import('@/lib/editron/services/project-service');
      const snapshot = await projectService.loadProjectForMutation(userId, resolvedProjectId);
      const prepared = await projectService.preparePipelineDirectorDispatchV1(
        userId,
        resolvedProjectId,
        {
          expectedRevision: snapshot.revision,
          batchId,
        },
      );
      if (prepared.disposition !== 'PREPARED' && prepared.disposition !== 'ALREADY_PREPARED') {
        await recordDirectorDispatch(`NOT_DISPATCHED_${prepared.disposition}`);
        console.warn(`[VideoWorker] Batch ${batchId} Director handoff was not eligible: ${prepared.disposition}.`);
        return;
      }

      const { Client } = await import('@upstash/qstash');
      const publication = await new Client({
        token: qstashToken,
        baseUrl: process.env.QSTASH_URL || undefined,
      }).publishJSON({
        url: `${directorBaseUrl}/api/internal/workers/director`,
        body: {
          projectId: resolvedProjectId,
          userId,
          profileId: prepared.dispatch.profileId,
          pipelineDirectorDispatchToken: prepared.dispatch.dispatchToken,
        },
        retries: 1,
      });
      const messageId = typeof (publication as { messageId?: unknown }).messageId === 'string'
        ? (publication as { messageId: string }).messageId
        : null;
      await recordDirectorDispatch('PUBLISHED_SIGNED_DIRECTOR_WORKER', {
        messageId,
        prepareDisposition: prepared.disposition,
      });
      console.log(
        `[VideoWorker] Batch ${batchId} complete (${status}) — signed Director handoff published for ${resolvedProjectId}.`,
      );
    } catch (dirErr: unknown) {
      try {
        await recordDirectorDispatch('PUBLISH_FAILED_RETRYABLE');
      } catch (recordErr: unknown) {
        console.error(
          `[VideoWorker] Batch ${batchId} failed to record Director dispatch failure:`,
          recordErr instanceof Error ? recordErr.message : recordErr,
        );
      }
      console.error(
        `[VideoWorker] Director dispatch failed after batch ${batchId} complete:`,
        dirErr instanceof Error ? dirErr.message : dirErr,
      );
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
