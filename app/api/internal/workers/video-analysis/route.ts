/**
 * POST /api/internal/workers/video-analysis
 *
 * QStash worker for Mode 2 video processing.
 * Architecture: cuts FIRST, analyze SECOND.
 *
 * Stage 1 of two-stage QStash pipeline (Stage 2: /api/internal/workers/director).
 *
 * Flow:
 * 1.   Transcribe + classify + build cut plan (processRawFootage)
 * 1.55 Fix duration from transcript timestamps
 * 1.6  Execute silence removal (apply cuts to timeline)
 * 2.   Visual Understanding — segment-aware (Gemini Vision → SyntheticStoryboard)
 * 3.   Genre parameters + Thompson Sampling bandit
 * 3.5  V-JEPA + Wav2Vec GPU analysis (parallel, Modal)
 * 3.6  Moment weight map
 * 4.   Store all results on project doc
 * 5.   Dispatch Director worker via QStash (or run inline in dev)
 *
 * VU runs AFTER cuts and receives kept-segment context so Gemini
 * focuses on what the viewer will actually see.
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
  // Creative Brief preferences (Director's Cut architecture)
  captionStyle?: string;
  transitionPreference?: string;
  zoomBehavior?: string;
  motionGraphics?: string;
  pacingFeel?: string;
  musicPreference?: string;
}

async function handler(request: NextRequest) {
  const startMs = Date.now();
  console.log('[VideoAnalysisWorker] Started');
  let trackedProjectId: string | undefined;
  let directorDispatched = false;

  try {
    const payload: VideoAnalysisPayload = await request.json();
    const {
      projectId, userId, assetId, videoUrl, durationSec,
      title, profileId: initialProfileId,
      userIntent, referenceAssetId, script, platform,
      captionStyle, transitionPreference, zoomBehavior, motionGraphics, pacingFeel, musicPreference,
    } = payload;
    trackedProjectId = projectId;

    let effectiveDurationSec = durationSec;

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

    // ─── Step 1: Transcription + Cuts FIRST ────────────────────────
    // Architecture: cuts FIRST, analyze SECOND.
    // processRawFootage runs Deepgram transcription (~10-30s, NOT Gemini) then
    // Gemini transcript editor (~10-30s). After cuts are decided, VU runs at
    // Step 2 with segment context so it analyzes what the viewer will see.
    let syntheticStoryboard: any = null;
    let rawFootageAnalysis: any = null;

    console.log(`[VideoAnalysisWorker] Step 1: Transcribing + cutting ${Math.round(durationSec)}s video (${assetId})...`);

    try {
      await db.collection('projects').updateOne(
        { projectId },
        { $set: { autoEditStatus: 'transcribing' } },
      );
      const { processRawFootage } = await import('@/lib/editron/services/raw-footage-processor');
      rawFootageAnalysis = await processRawFootage(assetId, userId, durationSec, platform, userIntent);
      console.log(`[VideoAnalysisWorker] Raw footage: ${rawFootageAnalysis.contentTypeDetection.contentType} (${rawFootageAnalysis.silenceRemovalPlan.length} removals, clean=${Math.round(rawFootageAnalysis.estimatedCleanDurationMs / 1000)}s)`);
    } catch (rawErr: unknown) {
      const msg = rawErr instanceof Error ? rawErr.message : String(rawErr);
      const stack = rawErr instanceof Error ? rawErr.stack : '';
      console.error(`[VideoAnalysisWorker] Raw footage processing FAILED: ${msg}`);
      if (stack) console.error(`[VideoAnalysisWorker] Stack: ${stack}`);
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
        effectiveDurationSec = actualDurationSec;
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

        // Belt-and-suspenders: ensure durationInFrames matches the post-cut timeline.
        // saveProject inside executeSilenceRemoval should handle this, but the save
        // pipeline (overlay merging, URL stripping, worker overlay preservation) can
        // lose the durationInFrames field. Direct $set guarantees it.
        if (removalResult.newDurationInFrames > 0) {
          await db.collection('projects').updateOne(
            { projectId },
            { $set: { durationInFrames: removalResult.newDurationInFrames } },
          );
          console.log(`[VideoAnalysisWorker] Duration updated: ${removalResult.newDurationInFrames} frames (${Math.round(removalResult.newDurationInFrames / 30)}s)`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : '';
        console.error(`[VideoAnalysisWorker] Silence removal FAILED: ${msg}`);
        console.error(`[VideoAnalysisWorker] Stack: ${stack}`);
      }
    }

    // ─── Step 2: Visual Understanding (AFTER cuts, segment-aware) ──
    // VU runs after cuts so it doesn't compete with transcription for Gemini quota,
    // and receives segment context so Gemini focuses on what the viewer will see.
    // Uses effectiveDurationSec (corrected by Step 1.55).
    // Non-fatal: pipeline continues without syntheticStoryboard if VU fails.
    try {
      const segmentContext = rawFootageAnalysis ? {
        keptCount: rawFootageAnalysis.segments?.length ?? 0,
        totalKeptSec: Math.max(0, Math.round((rawFootageAnalysis.estimatedCleanDurationMs ?? 0) / 1000)),
        contentType: rawFootageAnalysis.contentTypeDetection?.contentType ?? 'unknown',
        keptRanges: (rawFootageAnalysis.segments || []).slice(0, 15).map((s: any) => ({
          startSec: Math.round((s.startMs ?? 0) / 100) / 10,
          endSec: Math.round((s.endMs ?? 0) / 100) / 10,
        })),
      } : undefined;

      console.log(`[VideoAnalysisWorker] Step 2: Running Visual Understanding on ${Math.round(effectiveDurationSec)}s video${segmentContext ? ` (${segmentContext.keptCount} kept segments, ${segmentContext.totalKeptSec}s clean)` : ''}...`);

      const { analyzeVideo } = await import('@/lib/editron/services/video-understanding-service');
      syntheticStoryboard = await analyzeVideo(videoUrl, effectiveDurationSec, userIntent || title, segmentContext);
      if (syntheticStoryboard) {
        const setup = syntheticStoryboard.visualSetup;
        console.log(`[VideoAnalysisWorker] VU: type=${syntheticStoryboard.contentType}, setup=${setup?.environment || 'unknown'}/${setup?.dominantShotScale || 'unknown'}/${setup?.productionQuality || 'unknown'}`);
      } else {
        console.warn(`[VideoAnalysisWorker] VU returned null. Continuing without visual setup.`);
      }
    } catch (vuErr: unknown) {
      const msg = vuErr instanceof Error ? vuErr.message : String(vuErr);
      console.warn(`[VideoAnalysisWorker] VU failed: ${msg}. Continuing without visual setup.`);
    }

    // Platform override
    if (platform && syntheticStoryboard) {
      syntheticStoryboard.platform = platform;
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
          videoDurationSec: effectiveDurationSec,
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
              durationBucket: buildDurationBucket(effectiveDurationSec),
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

        const [vjepaResult, wav2vecResult, musicResult] = await Promise.allSettled([
          (async () => {
            const { analyzeVideoWithVjepa } = await import('@/lib/editron/services/vjepa-service');
            return analyzeVideoWithVjepa(videoUrl, segmentInputs);
          })(),
          (async () => {
            const { analyzeAudioWithWav2Vec } = await import('@/lib/editron/services/wav2vec-service');
            return analyzeAudioWithWav2Vec(videoUrl, segmentInputs);
          })(),
          (async () => {
            const { analyzeMusicContent } = await import('@/lib/editron/services/music-analysis-service');
            return analyzeMusicContent(videoUrl);
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

        // Handle Music Analysis result
        let musicAnalysis: any = null;
        if (musicResult.status === 'fulfilled' && musicResult.value) {
          musicAnalysis = musicResult.value;
          console.log(`[VideoAnalysisWorker] Music: BPM=${musicAnalysis.bpm}, ${musicAnalysis.beats.length} beats, presence=${musicAnalysis.musicPresence.toFixed(2)}, ${musicAnalysis.processingTimeMs}ms`);
        } else {
          const msg = musicResult.status === 'rejected' ? (musicResult.reason?.message || String(musicResult.reason)) : 'returned null';
          console.warn(`[VideoAnalysisWorker] Music analysis skipped: ${msg}`);
        }

        // Store music analysis on project for Director to read
        if (musicAnalysis) {
          try {
            await db.collection('projects').updateOne(
              { projectId },
              { $set: { musicAnalysis } },
            );
          } catch { /* non-fatal */ }
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

    // ─── Step 3.7: Build unified SegmentAnalysis ───────────────────
    // One source of truth merging all 5 analysis sources per segment.
    // Stored alongside the original fields for backward compatibility.
    let segmentAnalysis: any = null;
    if (rawFootageAnalysis?.segments?.length > 0) {
      try {
        const { buildSegmentAnalysis } = await import('@/lib/editron/services/segment-analysis-builder');
        segmentAnalysis = buildSegmentAnalysis(
          rawFootageAnalysis, syntheticStoryboard,
          vjepaAnalysis, wav2vecAnalysis, momentWeightMap,
        );
        if (segmentAnalysis) {
          console.log(`[VideoAnalysisWorker] SegmentAnalysis: ${segmentAnalysis.meta.segmentCount} segments, vjepa=${segmentAnalysis.meta.hasVjepa}, wav2vec=${segmentAnalysis.meta.hasWav2vec}, phase=${segmentAnalysis.meta.momentWeightPhase}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[VideoAnalysisWorker] SegmentAnalysis build failed (non-fatal): ${msg}`);
      }
    }

    // ─── Step 4: Store results on project ─────────────────────────
    await db.collection('projects').updateOne(
      { projectId },
      {
        $set: {
          autoEditStatus: 'analysis_complete',
          ...(syntheticStoryboard && { syntheticStoryboard }),
          ...(syntheticStoryboard?.geminiFileUri && { geminiFileUri: syntheticStoryboard.geminiFileUri }),
          ...(editDNA && { referenceEditDNA: editDNA }),
          ...(rawFootageAnalysis && { rawFootageAnalysis }),
          ...(genreParameters && { genreParameters }),
          ...(genreParametersSignalComputed && { genreParametersSignalComputed }),
          ...(vjepaAnalysis && { vjepaAnalysis }),
          ...(wav2vecAnalysis && { wav2vecAnalysis }),
          ...(momentWeightMap && { momentWeightMap }),
          ...(segmentAnalysis && { segmentAnalysis }),
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

    // ─── Step 5: Dispatch Director to separate worker ─────────────
    // Analysis complete. Director runs in a SEPARATE Vercel function
    // to stay under the 800s timeout. 20-min videos timed out with the
    // single-function approach (proj_YH4AyxeGMWvY: 31 transitions placed,
    // then killed at 800s — captions, zooms, quality review never ran).
    const directorPayload = {
      projectId, userId,
      profileId: initialProfileId,
      title, platform, userIntent,
      captionStyle, transitionPreference, zoomBehavior,
      motionGraphics, pacingFeel, musicPreference,
    };

    if (process.env.QSTASH_TOKEN) {
      await db.collection('projects').updateOne(
        { projectId },
        { $set: { autoEditStatus: 'directing_queued' } },
      );

      const qstashBaseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
      const directorUrl = `${qstashBaseUrl}/api/internal/workers/director`;
      const qstashUrl = `${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${directorUrl}`;

      const dispatchRes = await fetch(qstashUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`,
          'Content-Type': 'application/json',
          'Upstash-Retries': '0',
          'Upstash-Delay': '3s',
        },
        body: JSON.stringify(directorPayload),
      });

      if (!dispatchRes.ok) {
        const errBody = await dispatchRes.text().catch(() => 'no body');
        throw new Error(`Director QStash dispatch failed: HTTP ${dispatchRes.status} — ${errBody}`);
      }

      directorDispatched = true;
      const dispatchData = await dispatchRes.json().catch(() => ({}));
      const totalMs = Date.now() - startMs;
      console.log(`[VideoAnalysisWorker] Analysis complete: ${projectId} in ${totalMs}ms. Director dispatched (messageId=${dispatchData.messageId || 'unknown'}).`);
      return NextResponse.json({ success: true, totalMs, stage: 'analysis' });
    }

    // ─── Dev fallback: no QStash → run Director inline ────────────
    console.warn(`[VideoAnalysisWorker] No QSTASH_TOKEN — running Director inline`);
    await db.collection('projects').updateOne(
      { projectId },
      { $set: { autoEditStatus: 'directing' } },
    );

    let profileId = initialProfileId;
    if (rawFootageAnalysis?.contentTypeDetection?.confidence >= 0.5) {
      profileId = rawFootageAnalysis.contentTypeDetection.profileId;
      console.log(`[VideoAnalysisWorker] Profile: ${profileId} (${rawFootageAnalysis.contentTypeDetection.contentType})`);
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
      } catch {
        console.warn(`[VideoAnalysisWorker] Profile detection failed, using ${profileId}`);
      }
    }

    let brief: any = undefined;
    const userPrefs = {
      ...(captionStyle && { captionStyle }),
      ...(transitionPreference && { transitionPreference }),
      ...(zoomBehavior && { zoomBehavior }),
      ...(motionGraphics && { motionGraphics }),
      ...(pacingFeel && { pacingFeel }),
      ...(musicPreference && { musicPreference }),
      ...(platform && { platform }),
      ...(userIntent && { intent: userIntent }),
    };
    if (editDNA) {
      brief = {
        ...userPrefs,
        overrides: {
          ...(editDNA.pacing?.overall && { pacing: editDNA.pacing.overall }),
          ...(editDNA.cutRhythm?.avgCutsPerMinute && { cutsPerMinute: editDNA.cutRhythm.avgCutsPerMinute }),
          ...(editDNA.transitions?.dominant && { defaultTransition: editDNA.transitions.dominant }),
          ...(editDNA.graphicsDensity && { graphicsDensity: editDNA.graphicsDensity }),
        },
      };
    } else if (Object.keys(userPrefs).length > 0) {
      brief = { ...userPrefs, modifiers: [] };
    }

    const { executeDirectorPlan } = await import('@/lib/editron/agent/director-agent');
    const directorResult = await executeDirectorPlan(
      projectId, userId, profileId, brief,
      (step, total, desc) => console.log(`[VideoAnalysisWorker] Director ${step}/${total}: ${desc}`),
    );

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

    console.log(`[VideoAnalysisWorker] Complete (inline): ${projectId} in ${totalMs}ms (${directorResult.actionsExecuted} actions)`);

    try {
      const projectAfterDirector = await db.collection('projects').findOne(
        { projectId },
        { projection: { 'qualityReview.overallScore': 1, 'qualityReview.criticalCount': 1 } },
      );
      const qualityScore = projectAfterDirector?.qualityReview?.overallScore ?? 50;
      const criticalCount = projectAfterDirector?.qualityReview?.criticalCount ?? 0;
      if (criticalCount <= 5) {
        const { recordProjectOutcome } = await import('@/lib/editron/services/genre-parameter-bandit');
        await recordProjectOutcome(userId, projectId, qualityScore, false, false);
      }
    } catch { /* non-fatal */ }

    return NextResponse.json({ success: true, totalMs });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[VideoAnalysisWorker] Failed: ${msg}`);

    // Mark project as failed — but only if Director hasn't already been dispatched
    // (if dispatched, the Director worker owns the final status)
    if (trackedProjectId && !directorDispatched) {
      try {
        const { getDatabase } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        await db.collection('projects').updateOne(
          { projectId: trackedProjectId },
          { $set: { autoEditStatus: 'failed', autoEditError: msg } },
        );
      } catch { /* best-effort status update */ }
    }

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// QStash signature verification — skip in dev if signing keys not set
export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler;
