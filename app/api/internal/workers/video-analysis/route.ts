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
export const maxDuration = 800; // Vercel Pro max — 20min videos need: VU ~5min + transcription ~1min + silence removal + Director + 5-Track

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

    // ─── Step 1: Visual Setup + Transcription IN PARALLEL ──────────
    // Per creative doc v3: Stage 1 (transcribe) and Stage 3 (visual setup) are
    // independent. VU watches video (visual), raw footage processes audio (transcript).
    // Running sequentially wasted 4.75 min blocking on VU before transcription started.
    let syntheticStoryboard: any = null;
    let rawFootageAnalysis: any = null;

    console.log(`[VideoAnalysisWorker] Analyzing ${Math.round(durationSec)}s video (${assetId}) — VU + transcription in parallel...`);

    const [vuResult, rawResult] = await Promise.allSettled([
      // Stage 3: Visual setup analysis (Gemini Vision — watches video)
      (async () => {
        const { analyzeVideo } = await import('@/lib/editron/services/video-understanding-service');
        return analyzeVideo(videoUrl, durationSec, userIntent || title);
      })(),
      // Stage 1: Transcribe + silence detect + best-take + classify (audio processing)
      (async () => {
        await db.collection('projects').updateOne(
          { projectId },
          { $set: { autoEditStatus: 'transcribing' } },
        );
        const { processRawFootage } = await import('@/lib/editron/services/raw-footage-processor');
        return processRawFootage(assetId, userId, durationSec, platform, userIntent);
      })(),
    ]);

    // Handle VU result
    if (vuResult.status === 'fulfilled' && vuResult.value) {
      syntheticStoryboard = vuResult.value;
      const setup = syntheticStoryboard.visualSetup;
      console.log(`[VideoAnalysisWorker] VU: type=${syntheticStoryboard.contentType}, setup=${setup?.environment || 'unknown'}/${setup?.dominantShotScale || 'unknown'}/${setup?.productionQuality || 'unknown'}`);
    } else {
      const msg = vuResult.status === 'rejected' ? vuResult.reason?.message || String(vuResult.reason) : 'returned null';
      console.warn(`[VideoAnalysisWorker] VU failed: ${msg}. Continuing without visual setup.`);
    }

    // Handle raw footage result
    if (rawResult.status === 'fulfilled' && rawResult.value) {
      rawFootageAnalysis = rawResult.value;
      console.log(`[VideoAnalysisWorker] Raw footage: ${rawFootageAnalysis.contentTypeDetection.contentType} (${rawFootageAnalysis.silenceRemovalPlan.length} removals, clean=${Math.round(rawFootageAnalysis.estimatedCleanDurationMs / 1000)}s)`);
    } else {
      const err = rawResult.status === 'rejected' ? rawResult.reason : null;
      const msg = err instanceof Error ? err.message : String(err || 'returned null');
      const stack = err instanceof Error ? err.stack : '';
      console.error(`[VideoAnalysisWorker] Raw footage processing FAILED: ${msg}`);
      if (stack) console.error(`[VideoAnalysisWorker] Stack: ${stack}`);
    }

    // Platform override
    if (platform && syntheticStoryboard) {
      syntheticStoryboard.platform = platform;
    }

    // ─── Reference style transfer (if provided) ───────────────────
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

    // ─── Step 1.55: Fix video duration + register asset if missing ──
    // The from-asset route uses asset.duration which may be missing (defaults to 30s).
    // Transcription timestamps reveal the REAL video length.
    // Also: multipart upload may have failed to register the asset in media_assets.
    // If asset is missing from DB, register it here (fixes "video disappears on refresh"
    // and ensures future lookups find the correct duration).
    if (rawFootageAnalysis?.transcription?.words?.length > 0) {
      const lastWord = rawFootageAnalysis.transcription.words[rawFootageAnalysis.transcription.words.length - 1];
      const actualDurationMs = lastWord.endMs;
      const actualDurationSec = actualDurationMs / 1000;
      const reportedDuration = durationSec;

      // Fix duration if transcript reveals different length (guard: actualDuration must be > 10s)
      if (actualDurationSec > 10 && Math.abs(actualDurationSec - reportedDuration) > 5) {
        const actualFrames = Math.round(actualDurationSec * 30);
        console.log(`[VideoAnalysisWorker] Duration mismatch: reported=${reportedDuration}s, actual=${actualDurationSec.toFixed(1)}s. Correcting.`);

        await db.collection('projects').updateOne(
          { projectId },
          {
            $set: {
              durationInFrames: actualFrames,
              'overlays.$[vid].durationInFrames': actualFrames,
            },
          },
          { arrayFilters: [{ 'vid.type': 'video' }] },
        );

        // Also fix rawFootageAnalysis.originalDurationMs so silence removal math works
        rawFootageAnalysis.originalDurationMs = actualDurationMs;
        rawFootageAnalysis.estimatedCleanDurationMs = actualDurationMs -
          (rawFootageAnalysis.silenceRemovalPlan || []).reduce((sum: number, a: any) => {
            if (a.action === 'remove') return sum + (a.endMs - a.startMs);
            if (a.action === 'shorten') return sum + (a.endMs - a.startMs) - (a.shortenToMs || 0);
            return sum;
          }, 0);
        console.log(`[VideoAnalysisWorker] Fixed originalDurationMs=${actualDurationMs}, cleanDuration=${rawFootageAnalysis.estimatedCleanDurationMs}ms`);
      }

      // Register asset in media_assets if missing (multipart upload may have failed to register)
      try {
        const existingAsset = await db.collection('media_assets').findOne({ assetId });
        if (!existingAsset) {
          await db.collection('media_assets').insertOne({
            assetId,
            userId,
            type: 'video',
            source: 'user-upload',
            filename: `${assetId}.mp4`,
            cachedUrl: videoUrl,
            duration: actualDurationSec,
            uploadedAt: new Date(),
          });
          console.log(`[VideoAnalysisWorker] Registered missing asset ${assetId} in media_assets (duration=${actualDurationSec.toFixed(1)}s)`);
        } else if (!existingAsset.duration && actualDurationSec > 0) {
          // Asset exists but duration missing — update it
          await db.collection('media_assets').updateOne(
            { assetId },
            { $set: { duration: actualDurationSec } },
          );
          console.log(`[VideoAnalysisWorker] Updated asset ${assetId} duration to ${actualDurationSec.toFixed(1)}s`);
        }
      } catch (assetErr: unknown) {
        const msg = assetErr instanceof Error ? assetErr.message : String(assetErr);
        console.warn(`[VideoAnalysisWorker] Asset registration failed (non-fatal): ${msg}`);
      }
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

    // ─── Step 3: Compute Genre Parameters (signal-driven, no profiles) ──
    let genreParameters: any = null;
    let genreParametersSignalComputed: any = null;  // Pre-bandit value for reward feedback
    if (rawFootageAnalysis) {
      try {
        await db.collection('projects').updateOne(
          { projectId },
          { $set: { autoEditStatus: 'computing_params' } },
        );
        const { computeGenreParameters } = await import('@/lib/editron/services/genre-parameter-computer');
        const genreOutput = computeGenreParameters({
          rawFootage: rawFootageAnalysis,
          analyses: [],
          videoDurationSec: durationSec,
          userPlatform: platform,
          userIntent: userIntent,
        });
        genreParameters = genreOutput.genreParams;
        genreParametersSignalComputed = { ...genreOutput.genreParams };  // Snapshot before bandit
        console.log(`[VideoAnalysisWorker] Genre params: pacing=${genreOutput.genreParams.pacing_tolerance.toFixed(1)}, formality=${genreOutput.genreParams.formality.toFixed(2)}, zoom_budget=${genreOutput.genreParams.zoom_budget} (${genreOutput.confidence})`);

        // ─── Step 3.1: Apply Thompson Sampling bandit adjustments ────
        // Load per-user bandit state from MongoDB. If the user has enough
        // project history (>=5), sample learned adjustments to genre dials.
        // Store BOTH signal-computed and adjusted params so reward feedback
        // can compute the actual adjustment that was applied.
        try {
          const {
            loadBanditState, sampleAdjustments, applyAdjustments,
            buildDurationBucket, buildSpeechCoverageBucket, buildContextKey,
          } = await import('@/lib/editron/services/genre-parameter-bandit');
          const banditState = await loadBanditState(userId);

          if (banditState && banditState.totalProjects >= 5) {
            // Compute speech coverage for context
            const totalSpeechMs = rawFootageAnalysis.segments?.reduce(
              (sum: number, s: any) => sum + (s.endMs - s.startMs), 0
            ) ?? 0;
            const speechCoverage = rawFootageAnalysis.originalDurationMs
              ? totalSpeechMs / rawFootageAnalysis.originalDurationMs
              : 0;

            const context = {
              contentType: rawFootageAnalysis.contentTypeDetection?.contentType || 'unknown',
              speechCoverageBucket: buildSpeechCoverageBucket(speechCoverage),
              durationBucket: buildDurationBucket(durationSec),
              platform: platform || 'youtube',
            };

            const banditResult = sampleAdjustments(banditState, context);
            if (banditResult.usedBandit && Object.keys(banditResult.adjustments).length > 0) {
              genreParameters = applyAdjustments(genreParameters, banditResult.adjustments);
              console.log(`[VideoAnalysisWorker] Bandit: ${Object.keys(banditResult.adjustments).length} adjustments applied (confidence=${banditResult.confidence}, obs=${banditResult.observationCount}, ctx=${buildContextKey(context)})`);
            } else {
              console.log(`[VideoAnalysisWorker] Bandit: active but no significant adjustments for this context`);
            }
          } else {
            console.log(`[VideoAnalysisWorker] Bandit: ${banditState ? `${banditState.totalProjects}/5 projects` : 'no state'} — using pure signal computation`);
          }
        } catch (banditErr: unknown) {
          const msg = banditErr instanceof Error ? banditErr.message : String(banditErr);
          console.warn(`[VideoAnalysisWorker] Bandit adjustment failed (non-fatal): ${msg}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[VideoAnalysisWorker] Genre param computation failed (non-fatal): ${msg}`);
      }
    }

    // ─── Step 3.5: V-JEPA + Wav2Vec GPU analysis (TRIBE Phase 2) ──
    // Run visual significance (V-JEPA) and vocal emotion (Wav2Vec) in parallel.
    // Both are non-fatal — pipeline falls back to Phase 0 (Gemini-only) weights.
    // Results stored on project doc so Director Agent can build Phase 2 weight map.
    let vjepaAnalysis: any = null;
    let wav2vecAnalysis: any = null;

    if (rawFootageAnalysis?.segments?.length > 0) {
      try {
        await db.collection('projects').updateOne(
          { projectId },
          { $set: { autoEditStatus: 'analyzing_deep' } },
        );

        // Build segment inputs from rawFootageAnalysis transcript segments
        const segmentInputs = rawFootageAnalysis.segments.map((seg: any) => ({
          startMs: seg.startMs,
          endMs: seg.endMs,
        }));

        console.log(`[VideoAnalysisWorker] TRIBE Phase 2: Dispatching V-JEPA + Wav2Vec for ${segmentInputs.length} segments...`);

        const [vjepaResult, wav2vecResult] = await Promise.allSettled([
          (async () => {
            const { analyzeVideoWithVjepa } = await import('@/lib/editron/services/vjepa-service');
            return analyzeVideoWithVjepa(videoUrl, segmentInputs);
          })(),
          (async () => {
            const { analyzeAudioWithWav2Vec } = await import('@/lib/editron/services/wav2vec-service');
            // Wav2Vec uses same URL — Modal endpoint extracts audio from video
            return analyzeAudioWithWav2Vec(videoUrl, segmentInputs);
          })(),
        ]);

        // Handle V-JEPA result
        if (vjepaResult.status === 'fulfilled' && vjepaResult.value) {
          vjepaAnalysis = vjepaResult.value;
          const avgSig = vjepaAnalysis.segments.reduce((s: number, r: any) => s + r.visualSignificance, 0) / vjepaAnalysis.segments.length;
          console.log(`[VideoAnalysisWorker] V-JEPA: ${vjepaAnalysis.segments.length} segments analyzed (avg significance=${avgSig.toFixed(2)}, ${vjepaAnalysis.processingTimeMs}ms)`);
        } else {
          const msg = vjepaResult.status === 'rejected' ? (vjepaResult.reason?.message || String(vjepaResult.reason)) : 'returned null';
          console.warn(`[VideoAnalysisWorker] V-JEPA skipped: ${msg}`);
        }

        // Handle Wav2Vec result
        if (wav2vecResult.status === 'fulfilled' && wav2vecResult.value) {
          wav2vecAnalysis = wav2vecResult.value;
          const avgEmo = wav2vecAnalysis.segments.reduce((s: number, r: any) => s + r.emotionIntensity, 0) / wav2vecAnalysis.segments.length;
          console.log(`[VideoAnalysisWorker] Wav2Vec: ${wav2vecAnalysis.segments.length} segments analyzed (avg emotion=${avgEmo.toFixed(2)}, ${wav2vecAnalysis.processingTimeMs}ms)`);
        } else {
          const msg = wav2vecResult.status === 'rejected' ? (wav2vecResult.reason?.message || String(wav2vecResult.reason)) : 'returned null';
          console.warn(`[VideoAnalysisWorker] Wav2Vec skipped: ${msg}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[VideoAnalysisWorker] TRIBE Phase 2 analysis failed (non-fatal): ${msg}`);
      }
    }

    // ─── Step 3.6: Build enriched moment weight map (TRIBE Phase 2) ──
    // If V-JEPA/Wav2Vec data is available, build Phase 2 weights:
    //   50% gemini + 30% vjepa + 20% wav2vec + thompson_adjustment
    // Otherwise falls back to Phase 0 flat weights.
    let momentWeightMap: any = null;
    if (vjepaAnalysis || wav2vecAnalysis) {
      try {
        const { buildMomentWeightMap, integrateVjepaScores, integrateWav2vecScores } =
          await import('@/lib/editron/services/moment-weight-service');
        const { toVjepaWeightFormat } = await import('@/lib/editron/services/vjepa-service');
        const { toWav2VecWeightFormat } = await import('@/lib/editron/services/wav2vec-service');

        // Start with flat weights (Phase 0)
        let weightMap = buildMomentWeightMap(null, rawFootageAnalysis);

        // Integrate V-JEPA visual significance (30% weight)
        if (vjepaAnalysis) {
          const vjepaWeights = toVjepaWeightFormat(vjepaAnalysis);
          weightMap = integrateVjepaScores(weightMap, vjepaWeights);
        }

        // Integrate Wav2Vec vocal emotion (20% weight)
        if (wav2vecAnalysis) {
          const wav2vecWeights = toWav2VecWeightFormat(wav2vecAnalysis);
          weightMap = integrateWav2vecScores(weightMap, wav2vecWeights);
        }

        momentWeightMap = weightMap;
        console.log(`[VideoAnalysisWorker] Moment weights: Phase ${weightMap.computation_phase}, ${weightMap.weights.length} segments, avg=${(weightMap.weights.reduce((s: number, w: any) => s + w.final_weight, 0) / Math.max(weightMap.weights.length, 1)).toFixed(2)}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[VideoAnalysisWorker] Moment weight computation failed (non-fatal): ${msg}`);
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
          ...(genreParameters && { genreParameters }),
          ...(genreParametersSignalComputed && { genreParametersSignalComputed }),
          ...(vjepaAnalysis && { vjepaAnalysis }),
          ...(wav2vecAnalysis && { wav2vecAnalysis }),
          ...(momentWeightMap && { momentWeightMap }),
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

    // ─── Step 7.1: Record bandit outcome (reward feedback loop) ───
    // Read quality score from project doc (Director writes it during quality_review).
    // Record outcome so bandit learns from this project's results.
    // Non-fatal — learning is an enhancement, not critical path.
    try {
      const projectAfterDirector = await db.collection('projects').findOne(
        { projectId },
        { projection: { 'qualityReview.overallScore': 1 } },
      );
      const qualityScore = projectAfterDirector?.qualityReview?.overallScore ?? 50;

      const { recordProjectOutcome } = await import('@/lib/editron/services/genre-parameter-bandit');
      await recordProjectOutcome(userId, projectId, qualityScore, false, false);
    } catch (banditErr: unknown) {
      const msg = banditErr instanceof Error ? banditErr.message : String(banditErr);
      console.warn(`[VideoAnalysisWorker] Bandit outcome recording failed (non-fatal): ${msg}`);
    }

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
