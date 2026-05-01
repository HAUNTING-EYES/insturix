/**
 * POST /api/internal/workers/video-analysis
 *
 * QStash worker for Mode 2 heavy video processing:
 * 1. Download video from R2 CDN
 * 2. Upload to Gemini Files API (up to 2GB)
 * 3. Gemini Vision → SyntheticStoryboard
 * 4. Store on project doc
 * 5. Run profile detection with real scene data
 * 6. Execute Director Agent
 *
 * Runs async via QStash — doesn't block the from-asset response.
 * Same pattern as pipeline/video and pipeline/audio workers.
 *
 * Memory: handles large videos (100MB+) without pressuring the
 * main from-asset route's serverless function.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — large video analysis can be slow

interface VideoAnalysisPayload {
  projectId: string;
  userId: string;
  assetId: string;
  videoUrl: string;
  durationSec: number;
  title: string;
  profileId: string;
  // Optional multi-path inputs
  userIntent?: string;
  referenceAssetId?: string;
  script?: string;
  platform?: string;
}

async function handler(request: NextRequest) {
  const startMs = Date.now();
  console.log('[VideoAnalysisWorker] Started');

  try {
    const payload: VideoAnalysisPayload = await request.json();
    const {
      projectId, userId, assetId, videoUrl, durationSec,
      title, profileId: initialProfileId,
      userIntent, referenceAssetId, script, platform,
    } = payload;

    if (!projectId || !userId || !videoUrl) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();

    // Mark project as analyzing
    await db.collection('projects').updateOne(
      { projectId },
      { $set: { autoEditStatus: 'analyzing', autoEditStartedAt: new Date() } },
    );

    // ─── Step 1: Video Understanding → SyntheticStoryboard ────────
    let syntheticStoryboard: any = null;
    try {
      const { analyzeVideo } = await import('@/lib/editron/services/video-understanding-service');
      console.log(`[VideoAnalysisWorker] Analyzing ${Math.round(durationSec)}s video (${assetId})...`);
      syntheticStoryboard = await analyzeVideo(videoUrl, durationSec, userIntent || title);
      if (syntheticStoryboard) {
        console.log(`[VideoAnalysisWorker] SyntheticStoryboard: ${syntheticStoryboard.scenes.length} scenes, type=${syntheticStoryboard.contentType}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[VideoAnalysisWorker] Video understanding failed: ${msg}. Director runs without scene context.`);
    }

    // ─── Step 2: Script override (if provided) ────────────────────
    if (script && syntheticStoryboard?.scenes?.length) {
      const sentences = script
        .split(/(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])$/)
        .filter((s: string) => s.trim().length > 5);
      for (let i = 0; i < syntheticStoryboard.scenes.length; i++) {
        if (sentences[i]) {
          syntheticStoryboard.scenes[i].descriptor.narration = sentences[i].trim();
        }
      }
    }

    // Platform override
    if (platform && syntheticStoryboard) {
      syntheticStoryboard.platform = platform;
    }

    // ─── Step 3: Reference style transfer (if provided) ───────────
    let editDNA: any = null;
    if (referenceAssetId) {
      try {
        const { assetResolver } = await import('@/lib/editron/services/asset-resolver');
        const refUrl = await assetResolver.resolveAssetUrl(referenceAssetId, userId);
        if (refUrl) {
          const { extractEditDNA } = await import('@/lib/editron/services/style-transfer-service');
          editDNA = await extractEditDNA({ videoUrl: refUrl, userId, projectId });
          console.log(`[VideoAnalysisWorker] EditDNA extracted from reference`);
        }
      } catch (refErr: unknown) {
        const msg = refErr instanceof Error ? refErr.message : String(refErr);
        console.warn(`[VideoAnalysisWorker] Reference extraction failed: ${msg}`);
      }
    }

    // ─── Step 1.5: Raw Footage Processing (transcribe → silence detect → best-take → classify) ──
    let rawFootageAnalysis: any = null;
    try {
      await db.collection('projects').updateOne(
        { projectId },
        { $set: { autoEditStatus: 'transcribing' } },
      );

      const { processRawFootage } = await import('@/lib/editron/services/raw-footage-processor');
      console.log(`[VideoAnalysisWorker] Processing raw footage (transcribe + silence detect + classify)...`);
      rawFootageAnalysis = await processRawFootage(assetId, userId, durationSec, platform, userIntent);
      console.log(`[VideoAnalysisWorker] Raw footage: ${rawFootageAnalysis.contentTypeDetection.contentType} (${rawFootageAnalysis.silenceRemovalPlan.length} removals, clean=${Math.round(rawFootageAnalysis.estimatedCleanDurationMs / 1000)}s)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : '';
      console.error(`[VideoAnalysisWorker] Raw footage processing FAILED: ${msg}`);
      console.error(`[VideoAnalysisWorker] Stack: ${stack}`);
    }

    // ─── Step 1.6: Execute Silence Removal (BEFORE Director) ─────
    if (rawFootageAnalysis?.silenceRemovalPlan?.length > 0) {
      try {
        await db.collection('projects').updateOne(
          { projectId },
          { $set: { autoEditStatus: 'cleaning' } },
        );

        const { executeSilenceRemoval } = await import('@/lib/editron/services/silence-removal-executor');
        const removalResult = await executeSilenceRemoval(projectId, userId, rawFootageAnalysis.silenceRemovalPlan);
        console.log(`[VideoAnalysisWorker] Silence removed: ${removalResult.totalFramesRemoved} frames (${removalResult.actionsExecuted} actions, ${removalResult.overlaysDeleted} deleted)`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : '';
        console.error(`[VideoAnalysisWorker] Silence removal FAILED: ${msg}`);
        console.error(`[VideoAnalysisWorker] Stack: ${stack}`);
      }
    }

    // ─── Step 4: Store results on project ─────────────────────────
    await db.collection('projects').updateOne(
      { projectId },
      {
        $set: {
          autoEditStatus: 'editing',
          ...(syntheticStoryboard && { syntheticStoryboard }),
          ...(editDNA && { referenceEditDNA: editDNA }),
          ...(rawFootageAnalysis && { rawFootageAnalysis }),
          updatedAt: new Date(),
        },
      },
    );

    // ─── Step 1.7: Dispatch graph-sync with transcript data ──────
    if (rawFootageAnalysis) {
      try {
        const qstashToken = process.env.QSTASH_TOKEN;
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
        if (qstashToken) {
          await fetch(`${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${baseUrl}/api/internal/workers/graph-sync`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${qstashToken}`,
              'Content-Type': 'application/json',
              'Upstash-Retries': '2',
            },
            body: JSON.stringify({
              action: 'raw_footage_analyzed',
              data: {
                assetId,
                userId,
                contentType: rawFootageAnalysis.contentTypeDetection.contentType,
                fillerRate: rawFootageAnalysis.fillerWords.length / Math.max(rawFootageAnalysis.transcription.words.length, 1),
                silenceRatio: 1 - (rawFootageAnalysis.estimatedCleanDurationMs / rawFootageAnalysis.originalDurationMs),
                segmentCount: rawFootageAnalysis.segments.length,
                bestTakeCount: rawFootageAnalysis.bestTakeSelections.length,
              },
            }),
          });
        }
      } catch {
        // Non-fatal — graph enrichment is best-effort
      }
    }

    // ─── Step 5: Profile detection ─────────────────────────────────
    // Use content-type detector's profile (transcript-based, higher confidence)
    // if available. Fall back to SyntheticStoryboard-based detection.
    let profileId = initialProfileId;
    if (rawFootageAnalysis?.contentTypeDetection?.confidence >= 0.5) {
      profileId = rawFootageAnalysis.contentTypeDetection.profileId;
      console.log(`[VideoAnalysisWorker] Profile from content-type detector: ${profileId} (${rawFootageAnalysis.contentTypeDetection.contentType}, confidence=${rawFootageAnalysis.contentTypeDetection.confidence.toFixed(2)})`);
    } else {
      try {
        const { getAutoSelectedProfile } = await import('@/lib/editron/services/profile-detection-service');
        const { profile } = getAutoSelectedProfile({
          title: syntheticStoryboard?.title || title,
          contentType: syntheticStoryboard?.contentType || 'video',
          platform: syntheticStoryboard?.platform || 'youtube',
          scenes: syntheticStoryboard?.scenes?.map((s: any) => ({
            narration: s.descriptor?.narration,
            visualDescription: s.descriptor?.visualDescription,
            mood: s.descriptor?.mood,
            editDirections: s.descriptor?.editDirections,
          })) || [],
          globalEditDirections: syntheticStoryboard?.globalEditDirections,
          overallMusicPrompt: syntheticStoryboard?.overallMusicPrompt,
        });
        if (profile?.profileId) profileId = profile.profileId;
        console.log(`[VideoAnalysisWorker] Profile from SyntheticStoryboard: ${profileId}`);
      } catch {
        console.warn(`[VideoAnalysisWorker] Profile detection failed, using ${profileId}`);
      }
    }

    // ─── Step 6: Run Director ─────────────────────────────────────
    let brief: any = undefined;
    if (editDNA) {
      brief = {
        overrides: {
          ...(editDNA.pacing?.overall && { pacing: editDNA.pacing.overall }),
          ...(editDNA.cutRhythm?.avgCutsPerMinute && { cutsPerMinute: editDNA.cutRhythm.avgCutsPerMinute }),
          ...(editDNA.transitions?.dominant && { defaultTransition: editDNA.transitions.dominant }),
          ...(editDNA.graphicsDensity && { graphicsDensity: editDNA.graphicsDensity }),
        },
      };
    }

    const { executeDirectorPlan } = await import('@/lib/editron/agent/director-agent');
    const directorResult = await executeDirectorPlan(
      projectId, userId, profileId, brief,
      (step, total, desc) => console.log(`[VideoAnalysisWorker] Director ${step}/${total}: ${desc}`),
    );

    // ─── Step 7: Mark complete ────────────────────────────────────
    const totalMs = Date.now() - startMs;
    await db.collection('projects').updateOne(
      { projectId },
      {
        $set: {
          autoEditStatus: 'complete',
          autoEditCompletedAt: new Date(),
          autoEditDurationMs: totalMs,
          directorProfileUsed: profileId,
        },
      },
    );

    console.log(`[VideoAnalysisWorker] Complete: ${projectId} in ${totalMs}ms (${directorResult.actionsExecuted} actions)`);
    return NextResponse.json({ success: true, totalMs });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[VideoAnalysisWorker] Failed: ${msg}`);

    // Mark project as failed
    try {
      const payload = await request.clone().json().catch(() => null);
      if (payload?.projectId) {
        const { getDatabase } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        await db.collection('projects').updateOne(
          { projectId: payload.projectId },
          { $set: { autoEditStatus: 'failed', autoEditError: msg } },
        );
      }
    } catch {}

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// QStash signature verification — skip in dev if signing keys not set
export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler;
