/**
 * Director Agent — Deterministic Profile Executor
 *
 * NOT an LLM agent. Executes edit profile action sequences directly
 * by calling tool functions. Fast, cheap, predictable, auditable.
 *
 * LLM is only invoked for tools that inherently need generation
 * (add_captions, add_fancy_captions, generate_html_scene).
 *
 * Execution order (from profiles doc):
 * 1. checkpoint() — always first
 * 2. validate project state
 * 3. apply filters
 * 4. apply pacing
 * 5. insert transitions
 * 6. audio ducking
 * 7. add captions (after pacing is set)
 * 8. add motion graphics (last visual layer)
 * 9. BGM fade-out check
 * 10. quality review (deterministic)
 * 11. quality review (AI vision, if profile requires)
 */

import type { EditProfile, EditProfileAction, DirectorResult, ProjectBrief, ProfileId } from '@/lib/editron/data/edit-profile-types';
import type { GateResult } from '@/lib/editron/services/quality-gate';
import { getProfileById } from '@/lib/editron/data/edit-profiles';
import { projectService } from '@/lib/editron/services/project-service';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { DEFAULT_CONFIG } from '@/lib/editron/config/editron-config';
import { getFilterPresetById } from '@/lib/editron/data/filter-presets';

/**
 * Execute a Director Agent plan on a project.
 *
 * @param projectId - Editron project to edit
 * @param userId - Owner
 * @param profileId - Edit profile to execute
 * @param brief - Optional project brief with overrides
 * @param onProgress - Progress callback for SSE streaming
 */
export async function executeDirectorPlan(
  projectId: string,
  userId: string,
  profileId: string,
  brief?: ProjectBrief,
  onProgress?: (step: number, total: number, description: string) => void,
): Promise<DirectorResult> {
  const startTime = Date.now();
  const profile = getProfileById(profileId);

  // C6 FIX: Validate profile exists before proceeding
  if (!profile) {
    return {
      success: false, profileId: profileId as ProfileId,
      actionsExecuted: 0, actionsSkipped: [{ action: 'all', reason: `Profile "${profileId}" not found` }],
      overlaysModified: 0, checkpointId: '', executionMs: 0,
      warnings: [`Edit profile "${profileId}" not found. Available profiles can be seen in the export dialog.`],
    };
  }

  // Apply brief overrides
  const effectiveProfile = applyBriefOverrides(profile, brief);

  // Pipeline warning collector for structured error visibility
  const { createPipelineWarnings } = await import('@/lib/editron/services/pipeline-warnings');
  const pipelineWarnings = createPipelineWarnings();

  const result: DirectorResult = {
    success: false,
    profileId: effectiveProfile.profileId,
    actionsExecuted: 0,
    actionsSkipped: [],
    overlaysModified: 0,
    checkpointId: '',
    executionMs: 0,
    warnings: [],
  };

  try {
    // E2 FIX: Lock project during Director execution.
    // Prevents browser autosave from clobbering Director changes.
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const lockDb = await getDatabase();
    await lockDb.collection('projects').updateOne(
      { projectId },
      { $set: { directorLock: true, directorLockAt: new Date() } },
    );

    // ─── Step 1: Load project state ──────────────────────────
    const project = await projectService.loadProject(userId, projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const overlays = project.overlays || [];
    result.checkpointId = `director_${Date.now()}`;

    // ─── Step 1.5: Run 5-Track Analysis → EDL → Execute ──────
    // Intelligence layer with PER-ASSET error isolation.
    // If one asset fails analysis, others still contribute to the EDL.
    // storyboardScenes MUST be in function scope (not block scope) because
    // executeAction at step 3 references it for captions, filters, transitions, quality review.
    // Previously declared inside the { } block below → caused "storyboardScenes is not defined"
    // which silently killed captions, filters, transitions, and quality review.
    let storyboardScenes: any[] = [];
    // Fix 24: Hoist per-asset analysis data to function scope so continuity scoring
    // can use real 5-Track visual data (dominant colors, energy) instead of empty arrays.
    const perAssetAnalysis = new Map<string, any>();
    let projectDoc: any = null;
    // Path D: hoisted constraint violations + genre params for quality review step 11
    let pathDConstraintViolations: any[] | undefined;
    let pathDGenreParams: any | undefined;

    const edlSummary: { totalDecisions: number; executed: number; skipped: number; byType: Record<string, number>; cinematicMoments: number; assetsAnalyzed: number; assetsFailed: number; failedAssets: string[] } = {
      totalDecisions: 0, executed: 0, skipped: 0, byType: {}, cinematicMoments: 0,
      assetsAnalyzed: 0, assetsFailed: 0, failedAssets: [],
    };
    {
      const { runFullAnalysis, getAnalysis } = await import('@/lib/editron/services/five-track-analysis');
      const { generateEditDecisionList } = await import('@/lib/editron/services/reactive-edit-engine');
      const { executeEDL } = await import('@/lib/editron/services/edl-executor');
      const { detectCinematicMoments } = await import('@/lib/editron/services/cinematic-moment-detector');

      const videoOverlays = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
      const voiceoverOverlays = overlays.filter(o => o.type === 'sound' && o.row === ROW.VOICEOVER).sort((a, b) => a.from - b.from);
      const analyses: any[] = [];
      try {
        const db = await (await import('@/lib/editron/db/mongodb')).getDatabase();
        projectDoc = await db.collection('projects').findOne({ projectId }) as any;
        const storyboardId = projectDoc?.sourceStoryboardId;
        if (storyboardId) {
          // Path A: ThinkForge storyboard (Mode 1: script → AI video)
          const { getStoryboard } = await import('@/lib/pipeline/storyboard-db');
          const sb = await getStoryboard(storyboardId, userId);
          if (sb) {
            storyboardScenes = sb.scenes.map(s => ({
              sceneIndex: s.sceneIndex,
              sceneType: (s as any).sceneType || 'continuous',
              narration: s.descriptor.narration,
              visualDescription: s.descriptor.visualDescription,
              mood: s.descriptor.mood,
              audioDescription: s.descriptor.audioDescription,
              cameraDirection: s.descriptor.cameraDirection,
              editDirections: s.descriptor.editDirections,
            }));
            console.log(`[Director] Found storyboard with ${storyboardScenes.length} scenes`);
          }
        } else if (projectDoc?.rawFootageAnalysis?.segments?.length > 0) {
          // Path C: Raw Footage Analysis (Mode 2 with transcript intelligence)
          // Built by raw-footage-processor.ts from real transcript data.
          // Preferred over SyntheticStoryboard when available — transcript segments
          // are real topical boundaries, not Gemini Vision's guessed scene breaks.
          const rfa = projectDoc.rawFootageAnalysis;
          storyboardScenes = rfa.segments.map((seg: any, idx: number) => ({
            sceneIndex: idx,
            sceneType: 'talking-head',
            narration: seg.text || '',
            visualDescription: `Transcript segment ${idx + 1}: ${(seg.text || '').substring(0, 80)}`,
            mood: 'neutral',
            audioDescription: seg.fillerCount > 0 ? `speech with ${seg.fillerCount} fillers` : 'clean speech',
            cameraDirection: 'static',
            editDirections: {
              transition: undefined,
              pacing: rfa.contentTypeDetection?.contentType === 'vlog' ? 'fast' : 'medium',
              onScreenText: [],
            },
          }));
          // Carry Gemini file URI from VU (if VU ran in parallel and produced one)
          // so 5-Track can skip redundant CDN download + Gemini upload (saves ~30s).
          if (projectDoc.syntheticStoryboard?.geminiFileUri) {
            (projectDoc as any)._vuGeminiFileUri = projectDoc.syntheticStoryboard.geminiFileUri;
          }
          console.log(`[Director] Found rawFootageAnalysis with ${storyboardScenes.length} transcript segments (Mode 2 — transcript-driven, vuUri=${!!(projectDoc as any)._vuGeminiFileUri})`);
        } else if (projectDoc?.syntheticStoryboard) {
          // Path B: SyntheticStoryboard (Mode 2 fallback: no transcript available)
          const ssb = projectDoc.syntheticStoryboard;
          storyboardScenes = (ssb.scenes || []).map((s: any) => ({
            sceneIndex: s.sceneIndex ?? 0,
            sceneType: s.sceneType || 'continuous',
            narration: s.descriptor?.narration || '',
            visualDescription: s.descriptor?.visualDescription || '',
            mood: s.descriptor?.mood || 'neutral',
            audioDescription: s.descriptor?.audioDescription || '',
            cameraDirection: s.descriptor?.cameraDirection || 'static',
            editDirections: s.descriptor?.editDirections,
          }));
          // Carry Gemini file URI from VideoUnderstanding so 5-Track can skip redundant CDN download
          if (ssb.geminiFileUri) {
            (projectDoc as any)._vuGeminiFileUri = ssb.geminiFileUri;
          }
          console.log(`[Director] Found SyntheticStoryboard with ${storyboardScenes.length} scenes (Mode 2 — vision-based fallback)`);
        }
      } catch (sbErr: any) {
        console.warn(`[Director] Storyboard load failed (non-fatal): ${sbErr.message}`);
      }

      const isAIProject = storyboardScenes.length > 0;

      // ── Per-asset analysis with INDIVIDUAL error isolation ──
      // SKIP when Creative Brief is active — Path E watches the video directly via
      // geminiFileUri. Running 43 per-asset Gemini calls exhausts quota before
      // the Creative Brief can make its ONE call. This was the root cause of
      // proj_FGHYdAd7VkhU producing zero editing decisions.
      const skipPerAssetAnalysis = process.env.USE_CREATIVE_BRIEF === 'true';
      if (skipPerAssetAnalysis) {
        console.log(`[Director] Skipping per-asset 5-Track analysis (USE_CREATIVE_BRIEF=true, ${videoOverlays.length} assets). Creative Brief uses geminiFileUri directly.`);
      } else {
        onProgress?.(0, 0, `Analyzing ${videoOverlays.length} video assets (5-track)...`);
      }

      for (let i = 0; i < videoOverlays.length && !skipPerAssetAnalysis; i++) {
        const vo = videoOverlays[i];
        const assetId = (vo as any).assetId;
        if (!assetId) {
          console.warn(`[Director] Scene ${i}: no assetId, skipping analysis`);
          edlSummary.assetsFailed++;
          edlSummary.failedAssets.push(`scene_${i}:no_assetId`);
          continue;
        }

        try {
          // ── Step 0: Check user's media library for matching footage ──
          // Surfaces existing footage that matches the scene description.
          // Informational only (no auto-replacement) — future: offer swap in AI chat.
          const sceneDescForSearch = storyboardScenes.find((s: any) => s.sceneIndex === (vo as any).metadata?.sceneIndex)?.visualDescription;
          if (sceneDescForSearch) {
            try {
              const { findMatchingFootage } = await import('@/lib/editron/services/asset-search-service');
              const match = await findMatchingFootage(userId, sceneDescForSearch, 0.75);
              if (match) {
                console.log(`[Director] Scene ${i}: matching footage found in library — ${match.assetId} (score=${match.score.toFixed(2)})`);
                result.warnings.push(`Scene ${i}: user footage "${match.filename}" matches this scene (score=${match.score.toFixed(2)}) — consider reusing`);
              }
            } catch { /* non-fatal: no media assets or no Gemini key */ }
          }

          // Check cache first
          let analysis = await getAnalysis(assetId);
          if (analysis) {
            console.log(`[Director] Scene ${i} (${assetId}): analysis CACHED`);
            analyses.push(analysis);
            edlSummary.assetsAnalyzed++;
            continue;
          }

          const videoUrl = (vo as any).src || (vo as any).content;
          if (!videoUrl) {
            console.warn(`[Director] Scene ${i} (${assetId}): no video URL, skipping`);
            edlSummary.assetsFailed++;
            edlSummary.failedAssets.push(`${assetId}:no_url`);
            continue;
          }

          const durationMs = (vo.durationInFrames / 30) * 1000;
          const storyboardScene = isAIProject ? storyboardScenes[i] : undefined;
          const narrationText = storyboardScene?.narration || '';

          // Try to get real word timestamps from voiceover TTS (if available).
          // Falls back to proportional estimate (equal time per word), which drifts on long scenes.
          let words: Array<{ word: string; startMs: number; endMs: number }> | undefined;
          if (narrationText) {
            // Check if matching voiceover has Deepgram/Kokoro word timing stored
            const matchingVo = voiceoverOverlays[i];
            const voAssetId = (matchingVo as any)?.assetId;
            if (voAssetId) {
              try {
                const db = await (await import('@/lib/editron/db/mongodb')).getDatabase();
                const voAsset = await db.collection('media_assets').findOne({ assetId: voAssetId });
                if (voAsset?.wordTimestamps && Array.isArray(voAsset.wordTimestamps)) {
                  words = voAsset.wordTimestamps;
                  console.log(`[Director] Scene ${i}: using REAL word timestamps (${words.length} words)`);
                }
              } catch { /* non-fatal */ }
            }

            // Fallback: proportional estimate with variable word-length weighting
            if (!words) {
              const rawWords = narrationText.split(/\s+/).filter(Boolean);
              const totalChars = rawWords.reduce((sum: number, w: string) => sum + w.length, 0);
              let cursor = 0;
              words = rawWords.map((w: string) => {
                // Weight by character count — longer words take more time
                const wordPortion = (w.length / totalChars) * durationMs;
                const startMs = cursor;
                cursor += wordPortion;
                return { word: w, startMs, endMs: cursor };
              });
            }
          }

          onProgress?.(0, 0, `Analyzing scene ${i + 1}/${videoOverlays.length}...`);

          analysis = await runFullAnalysis(assetId, userId, {
            videoUrl,
            durationMs,
            transcript: narrationText || undefined,
            words,
            storyboardScene,
            sourceType: isAIProject ? 'ai-generated' : 'real-footage',
            geminiFileUri: (projectDoc as any)?._vuGeminiFileUri,
          });

          // Inter-clip delay to avoid Gemini 429 rate limits.
          // 7 back-to-back Gemini Vision calls with zero delay hits the RPM limit by clip 3-4.
          // 2.5s between clips keeps us under the limit. ⚠️ INVENTED delay value.
          if (i < videoOverlays.length - 1) {
            await new Promise(r => setTimeout(r, 2500));
          }

          if (analysis) {
            // Attach timeline offset so Reactive Engine places decisions at correct absolute frames.
            // Without this, all assets' decisions land at frames 0-N (relative to clip start),
            // causing them to overlap and get deduplicated — only first scene's decisions survive.
            (analysis as any)._timelineOffsetFrames = videoOverlays[i].from || 0;
            analyses.push(analysis);
            edlSummary.assetsAnalyzed++;
            console.log(`[Director] Scene ${i} (${assetId}): analysis SUCCESS (offset: ${videoOverlays[i].from})`);
          } else {
            edlSummary.assetsFailed++;
            edlSummary.failedAssets.push(`${assetId}:null_result`);
            console.warn(`[Director] Scene ${i} (${assetId}): analysis returned null`);
          }
        } catch (assetErr: any) {
          edlSummary.assetsFailed++;
          edlSummary.failedAssets.push(`${assetId}:${assetErr.message?.slice(0, 60)}`);
          console.error(`[Director] Scene ${i} (${assetId}): analysis FAILED: ${assetErr.message}`);
          // Continue to next asset — don't abort the whole intelligence layer
        }
      }

      // ── PATH E: Creative Brief (Director's Cut Architecture) ──────────
      // Feature-flagged new path. Gemini produces a holistic Creative Brief
      // (all editing decisions as structured JSON), then the Brief Executor
      // resolves word indices to exact frames deterministically.
      // Enable via env: USE_CREATIVE_BRIEF=true
      let pathDHandled = false;
      if (process.env.USE_CREATIVE_BRIEF === 'true' && projectDoc?.rawFootageAnalysis?.segments?.length > 0) {
        try {
          onProgress?.(0, 0, 'Creative Brief: generating holistic edit plan...');
          console.log('[Director] Path E: Creative Brief architecture (USE_CREATIVE_BRIEF=true)');

          const { generateCreativeBrief } = await import('@/lib/editron/services/creative-brief');
          const { executeBrief } = await import('@/lib/editron/services/brief-executor');
          const { humanizeEdl } = await import('@/lib/editron/services/humanize-pass');
          const { enforceConstraints } = await import('@/lib/editron/services/constraint-enforcer');
          const { executeEDL: executeEDLPathE } = await import('@/lib/editron/services/edl-executor');

          const pathEFps = project.fps || 30;
          const rfa = projectDoc.rawFootageAnalysis;

          // Build transcription from rawFootageAnalysis segments
          const transcription: { word: string; startMs: number; endMs: number }[] = [];
          for (const seg of rfa.segments || []) {
            if (seg.words && Array.isArray(seg.words)) {
              for (const w of seg.words) {
                transcription.push({ word: w.word || w.text || '', startMs: w.startMs ?? w.start ?? 0, endMs: w.endMs ?? w.end ?? 0 });
              }
            }
          }

          // Build audio energy curve from segments (if available)
          const audioEnergyCurve: number[] = (rfa.segments || []).map((s: any) => s.energy ?? 0.5);

          // Collect user preferences (from brief or defaults)
          const userPrefs = {
            captionStyle: brief?.captionStyle as any,
            transitionPreference: brief?.transitionPreference as any,
            zoomBehavior: brief?.zoomBehavior as any,
            motionGraphics: brief?.motionGraphics as any,
            pacingFeel: brief?.pacingFeel as any,
            musicPreference: brief?.musicPreference as any,
          };

          // Gemini file URI for video watching (from VU if available)
          const geminiFileUri = (projectDoc as any)?._vuGeminiFileUri
            || projectDoc?.geminiFileUri
            || projectDoc?.syntheticStoryboard?.geminiFileUri
            || undefined;

          // Use estimated clean duration (post-transcript-editor), not durationInFrames
          // which may reflect a buggy silence-removal output.
          const cleanDurationSec = (rfa.estimatedCleanDurationMs || rfa.originalDurationMs || (project.durationInFrames || 900) / pathEFps * 1000) / 1000;

          // Build video context for Creative Brief
          const videoContext = {
            transcription,
            totalDurationSec: cleanDurationSec,
            segmentCount: rfa.segments?.length || 0,
            audioFeatures: audioEnergyCurve.length > 0 ? {
              rmsEnergyCurve: audioEnergyCurve,
              silenceGaps: (rfa.silenceGaps || []).map((g: any) => ({ startMs: g.startMs || g.start || 0, endMs: g.endMs || g.end || 0 })),
            } : undefined,
            vjepaFeatures: projectDoc.vjepaAnalysis?.segments?.length > 0 ? { segments: projectDoc.vjepaAnalysis.segments } : undefined,
            wav2vecFeatures: projectDoc.wav2vecAnalysis?.segments?.length > 0 ? { segments: projectDoc.wav2vecAnalysis.segments } : undefined,
          };

          // Compute per-video genre parameters from signals (no profiles)
          let pathEGenreParams: import('@/lib/editron/services/graph-query').GenreParameters | undefined;
          try {
            const { computeGenreParameters } = await import('@/lib/editron/services/genre-parameter-computer');
            const genreResult = computeGenreParameters({
              rawFootage: rfa,
              analyses,
              videoDurationSec: cleanDurationSec,
            });
            pathEGenreParams = genreResult.genreParams;
            console.log(`[Director] Path E: Genre params computed (confidence: ${genreResult.confidence}, zoom_budget=${pathEGenreParams.zoom_budget}, transition_density=${pathEGenreParams.transition_density})`);
          } catch (gpErr: any) {
            console.warn(`[Director] Path E: Genre param computation failed (non-fatal): ${gpErr.message}`);
          }

          // Generate Creative Brief (Gemini call — context-cached creative doc + decision registry)
          const creativeBrief = await generateCreativeBrief(videoContext, userPrefs, geminiFileUri, pathEGenreParams);

          if (creativeBrief && creativeBrief.decisions.length > 0) {
            console.log(`[Director] Path E: Creative Brief generated — ${creativeBrief.decisions.length} decisions, pacing=${creativeBrief.overallPacing}`);

            // Brief Executor: resolve word indices → frame numbers
            // Use ORIGINAL video duration, not post-cut durationInFrames. Word timestamps
            // reference the original video (up to 1172s). Using clean duration (527s) kills
            // every decision targeting the second half of the video as "out of range."
            const totalDurationMs = rfa.originalDurationMs || (project.durationInFrames || 900) / pathEFps * 1000;
            const briefResult = executeBrief({
              brief: creativeBrief,
              transcription,
              fps: pathEFps,
              audioEnergyCurve: audioEnergyCurve.length > 0 ? audioEnergyCurve : undefined,
              totalDurationMs,
              // Pass overlays for original-to-cut timeline frame mapping.
              // Word timestamps reference the original video; overlays are on the cut timeline.
              overlays: overlays.filter((o: any) => o.type === 'video').map((o: any) => ({
                from: o.from, durationInFrames: o.durationInFrames,
                sourceStartFrame: o.sourceStartFrame ?? o.videoStartTime, type: 'video',
              })),
            });

            console.log(`[Director] Path E: Brief Executor — ${briefResult.stats.resolvedToFrame} resolved, ${briefResult.stats.snappedToEnergy} snapped to energy`);

            // Humanize pass (organic imperfection)
            const humanizedEdl = humanizeEdl(briefResult.edl, projectId, rfa, pathEFps);

            // Constraint enforcement (8-pass safety net)
            const overlayInfos = overlays.map((o: any) => ({
              id: o.id, type: o.type, from: o.from,
              durationInFrames: o.durationInFrames, row: o.row, assetId: o.assetId,
            }));

            let graphIndex: any = null;
            try {
              const { loadGraph } = await import('@/lib/editron/services/graph-query');
              graphIndex = loadGraph();
            } catch { /* constraint enforcement optional if graph unavailable */ }

            if (graphIndex) {
              const constraintResult = enforceConstraints(
                humanizedEdl.decisions, overlayInfos, graphIndex, rfa, pathEFps
              );
              if (constraintResult.totalViolations > 0) {
                console.log(`[Director] Path E: ${constraintResult.totalViolations} constraint violations (${constraintResult.totalAutoCorrected} auto-corrected)`);
              }
              pathDConstraintViolations = constraintResult.violations;
            }

            // Execute EDL (apply to overlays)
            const canvas = project.playerDimensions || { width: 1920, height: 1080 };
            const analysesMap = new Map<string, any>();
            for (const a of analyses) { if (a.assetId) analysesMap.set(a.assetId, a); }
            await executeEDLPathE(briefResult.edl, projectId, userId, overlays, canvas, analysesMap, effectiveProfile.graphicsDensity);

            // Update summary for downstream quality review
            edlSummary.totalDecisions = humanizedEdl.decisions.length;
            edlSummary.executed = briefResult.stats.resolvedToFrame;
            edlSummary.skipped = briefResult.stats.skippedOutOfRange;
            for (const d of humanizedEdl.decisions) {
              edlSummary.byType[d.type] = (edlSummary.byType[d.type] || 0) + 1;
            }

            pathDHandled = true;
            console.log(`[Director] Path E: Creative Brief execution COMPLETE — ${humanizedEdl.decisions.length} decisions applied`);
          } else {
            console.warn('[Director] Path E: Creative Brief returned null or empty — falling through to Path D');
          }
        } catch (pathEErr: any) {
          console.error(`[Director] Path E failed (${pathEErr.message}), falling through to Path D`);
        }
      }

      // ── PATH D: Signal-Driven Execution (Mode 2 + v3 Knowledge Graph) ──
      // Signal executor evaluates 95 mappings from the graph against detected
      // signals to produce EDL decisions. Uses rawFootageAnalysis + segmentAnalysis
      // (transcription, wav2vec, moment weights) — does NOT need 5-Track per-asset
      // analysis. The old `analyses.length > 0` gate caused a dead zone: when
      // USE_CREATIVE_BRIEF=true skipped 5-Track and Path E failed, Path D was
      // also blocked, leaving zero intelligence. Fixed: Mode 2 projects (with
      // rawFootageAnalysis) can run Path D without 5-Track.
      const hasRawFootage = projectDoc?.rawFootageAnalysis?.segments?.length > 0;
      const canRunPathD = hasRawFootage && (analyses.length > 0 || projectDoc?.segmentAnalysis?.version === 1);
      if (canRunPathD && !pathDHandled) {
        try {
          const { loadGraph } = await import('@/lib/editron/services/graph-query');
          const graphIndex = loadGraph();

          if (graphIndex) {
            onProgress?.(0, 0, 'Signal-driven editing (v3 knowledge graph)...');
            console.log(`[Director] Path D: Signal-driven execution (${graphIndex.mappings.size} mappings, ${graphIndex.constraints.size} constraints)`);

            const { buildSignalTimeline } = await import('@/lib/editron/services/signal-registry');
            const { computeGenreParameters } = await import('@/lib/editron/services/genre-parameter-computer');
            const { buildMomentWeightMap, integrateVjepaScores, integrateWav2vecScores, applyBanditAdjustments } = await import('@/lib/editron/services/moment-weight-service');
            const { executeSignalDrivenEdit } = await import('@/lib/editron/services/signal-executor');
            const { humanizeEdl } = await import('@/lib/editron/services/humanize-pass');
            const { enforceConstraints } = await import('@/lib/editron/services/constraint-enforcer');

            // Use project fps (not hardcoded 30 — real footage may be 24/29.97/60)
            const pathDFps = project.fps || 30;

            // Step D.1: Compute genre parameters from signals
            const genreOutput = computeGenreParameters({
              rawFootage: projectDoc.rawFootageAnalysis,
              analyses,
              videoDurationSec: (project.durationInFrames || 900) / pathDFps,
              userPlatform: brief?.platform,
              userIntent: brief?.intent,
            });
            console.log(`[Director] Path D: Genre params computed (confidence: ${genreOutput.confidence}, fps: ${pathDFps})`);

            // Step D.2 + D.3: Moment weights + signal timeline
            const overlayInfos = overlays.map((o: any) => ({
              id: o.id, type: o.type, from: o.from,
              durationInFrames: o.durationInFrames, row: o.row, assetId: o.assetId,
            }));

            let weightMap: any;
            let signalTimeline: any;
            const sa = projectDoc.segmentAnalysis;

            if (sa?.version === 1 && sa.segments?.length > 0) {
              // ── Unified path: read from SegmentAnalysis (one source of truth) ──
              console.log(`[Director] Path D: Using unified SegmentAnalysis (${sa.meta.segmentCount} segments, vjepa=${sa.meta.hasVjepa}, wav2vec=${sa.meta.hasWav2vec}, phase=${sa.meta.momentWeightPhase})`);

              // D.2: Use pre-computed moment weights from worker
              if (projectDoc.momentWeightMap?.computation_phase >= 1) {
                weightMap = projectDoc.momentWeightMap;
              } else {
                weightMap = buildMomentWeightMap(null, projectDoc.rawFootageAnalysis);
              }

              // D.3: Build signal timeline from unified analysis
              const { buildSignalTimelineFromAnalysis } = await import('@/lib/editron/services/signal-registry');
              signalTimeline = buildSignalTimelineFromAnalysis(
                sa, analyses, projectDoc.rawFootageAnalysis, overlayInfos, pathDFps,
              );
            } else {
              // ── Legacy path: read from 5 separate fields (backward compat) ──
              console.log(`[Director] Path D: Using legacy 5-field path (no segmentAnalysis)`);

              weightMap = buildMomentWeightMap(null, projectDoc.rawFootageAnalysis);

              if (projectDoc.vjepaAnalysis?.segments?.length > 0) {
                const { toVjepaWeightFormat } = await import('@/lib/editron/services/vjepa-service');
                const vjepaWeights = toVjepaWeightFormat(projectDoc.vjepaAnalysis);
                weightMap = integrateVjepaScores(weightMap, vjepaWeights);
                console.log(`[Director] Path D: V-JEPA weights integrated (${projectDoc.vjepaAnalysis.segments.length} segments)`);
              }

              if (projectDoc.wav2vecAnalysis?.segments?.length > 0) {
                const { toWav2VecWeightFormat } = await import('@/lib/editron/services/wav2vec-service');
                const wav2vecWeights = toWav2VecWeightFormat(projectDoc.wav2vecAnalysis);
                weightMap = integrateWav2vecScores(weightMap, wav2vecWeights);
                console.log(`[Director] Path D: Wav2Vec weights integrated (${projectDoc.wav2vecAnalysis.segments.length} segments)`);
              }

              if (projectDoc.momentWeightMap?.computation_phase >= 1) {
                weightMap = { ...weightMap, ...projectDoc.momentWeightMap };
                console.log(`[Director] Path D: Using pre-computed Phase ${projectDoc.momentWeightMap.computation_phase} weight map`);
              }

              signalTimeline = buildSignalTimeline(
                analyses, projectDoc.rawFootageAnalysis, overlayInfos, pathDFps,
                projectDoc.vjepaAnalysis ?? null,
                projectDoc.wav2vecAnalysis ?? null,
              );
            }

            console.log(`[Director] Path D: Moment weights Phase ${weightMap.computation_phase}, ${weightMap.weights.length} segments, avg=${(weightMap.weights.reduce((s: number, w: any) => s + w.final_weight, 0) / Math.max(weightMap.weights.length, 1)).toFixed(2)}`);

            // Step D.4: Execute signal-driven edit (evaluate 95 mappings)
            const signalEdl = executeSignalDrivenEdit(
              signalTimeline, genreOutput.genreParams, weightMap, graphIndex, overlayInfos
            );
            console.log(`[Director] Path D: ${signalEdl.metadata.totalMappingsFired} mappings fired → ${signalEdl.metadata.totalDecisionsGenerated} decisions (${signalEdl.metadata.totalDecisionsSuppressed} suppressed) in ${signalEdl.metadata.executionTimeMs}ms`);

            // Step D.5: Humanize pass (organic imperfection injection)
            const humanizedEdl = humanizeEdl(signalEdl, projectId, projectDoc.rawFootageAnalysis, pathDFps);

            // Step D.6: Constraint enforcement (8-pass ordered)
            const constraintResult = enforceConstraints(
              humanizedEdl.decisions, overlayInfos, graphIndex, projectDoc.rawFootageAnalysis, pathDFps
            );
            if (constraintResult.totalViolations > 0) {
              console.log(`[Director] Path D: ${constraintResult.totalViolations} constraint violations (${constraintResult.totalAutoCorrected} auto-corrected, ${constraintResult.totalUncorrectable} uncorrectable)`);
            }
            // Hoist for quality review step 11
            pathDConstraintViolations = constraintResult.violations;
            pathDGenreParams = genreOutput.genreParams;

            // Convert to standard EDL format for executeEDL (backward compatible)
            edlSummary.totalDecisions = humanizedEdl.decisions.length;
            const edl = {
              projectId,
              generatedAt: new Date(),
              totalDecisions: humanizedEdl.decisions.length,
              decisions: humanizedEdl.decisions.map(d => ({
                type: d.type,
                frame: d.frame,
                durationFrames: Number(d.params['duration_frames'] ?? (d.params['duration_s'] ? Number(d.params['duration_s']) * pathDFps : pathDFps)),
                priority: d.confidence > 0.8 ? 2 : d.confidence > 0.6 ? 3 : 4,
                source: d.source,
                signal: d.type,
                reason: d.reason ?? '',
                params: d.params,
                confidence: d.confidence,
              })),
              stats: {
                cutsPerMinute: 0,
                transitionCount: humanizedEdl.decisions.filter(d => d.type === 'transition').length,
                graphicCount: humanizedEdl.decisions.filter(d => d.type === 'graphic').length,
                zoomCount: humanizedEdl.decisions.filter(d => d.type === 'zoom').length,
                speedChangeCount: humanizedEdl.decisions.filter(d => d.type === 'speed-change').length,
                averageConfidence: humanizedEdl.decisions.length > 0
                  ? humanizedEdl.decisions.reduce((s, d) => s + d.confidence, 0) / humanizedEdl.decisions.length
                  : 0,
              },
            };

            // Execute EDL (same as other paths)
            const { executeEDL: executeEDLPathD } = await import('@/lib/editron/services/edl-executor');
            const canvas = project.playerDimensions || { width: 1920, height: 1080 };
            const analysesMap = new Map<string, any>();
            for (const a of analyses) { if (a.assetId) analysesMap.set(a.assetId, a); }
            await executeEDLPathD(edl, projectId, userId, overlays, canvas, analysesMap, effectiveProfile.graphicsDensity);

            for (const d of edl.decisions) {
              edlSummary.byType[d.type] = (edlSummary.byType[d.type] || 0) + 1;
            }

            pathDHandled = true;
            console.log(`[Director] Path D: Signal-driven execution COMPLETE — ${edl.totalDecisions} decisions applied`);
          }
        } catch (pathDErr: any) {
          console.warn(`[Director] Path D failed (${pathDErr.message}), falling through to Unified Intelligence`);
          // Fall through to existing paths below
        }
      }

      // ── Generate Edit Plan — prefer Unified Intelligence, fallback to old EDL ──
      if (!pathDHandled && analyses.length > 0) {
        try {
          onProgress?.(0, 0, `Generating intelligent edit plan from ${analyses.length} assets + script context...`);

          // Build analyses map BEFORE the intelligence call — needed by both
          // the creative intent translator and the EDL executor.
          const analysesMap = new Map<string, any>();
          for (const a of analyses) {
            if (a.assetId) {
              analysesMap.set(a.assetId, a);
              perAssetAnalysis.set(a.assetId, a); // Fix 24: hoist to function scope
            }
          }

          // TRY: Creative Intent Intelligence (3-layer architecture)
          // Layer 1 (LLM): Creative decisions — WHAT + WHY, no frame numbers
          // Layer 2 (Code): Frame resolution — maps intent to exact frames using 5-Track
          // Layer 3 (EDL Executor): Execution — applies decisions to overlays
          let edl: any;
          try {
            const { assembleUnifiedContext, generateCreativeIntentPlan } = await import('@/lib/editron/services/unified-edit-intelligence');
            const { compressAllAnalyses } = await import('@/lib/editron/services/asset-briefing');
            const { translateCreativeIntentToEDL } = await import('@/lib/editron/services/intent-translator');

            const context = await assembleUnifiedContext(projectId, userId);

            // Layer 1a: Compress 5-Track data into ~200-token briefings per clip
            const assetBriefings = compressAllAnalyses(analysesMap);
            const briefingsForPrompt = new Map<string, { promptText: string; slopFlags: Array<{ startFrame: number; endFrame: number; description: string }> }>();
            for (const [id, briefing] of assetBriefings) {
              briefingsForPrompt.set(id, { promptText: briefing.promptText, slopFlags: briefing.slopFlags });
            }

            // ─── Brand context for creative intent ─────────────────
            let brandBlock = '';
            if (project.brandId && userId) {
              try {
                const { getUnifiedBrand } = await import('@/lib/shared/brand-registry');
                const { buildBrandContextBlock } = await import('@/lib/shared/brand-context-block');
                const brand = await getUnifiedBrand(userId, project.brandId);
                brandBlock = buildBrandContextBlock(brand);
                if (brandBlock) {
                  console.log(`[Director] Brand context: ${brand?.name} (${project.brandId})`);
                }
              } catch (err) {
                console.warn('[Director] Brand lookup failed (non-fatal):', err);
              }
            }

            // Layer 1b: LLM generates creative intent (WHAT + WHY, no frame numbers)
            const intentPlan = await generateCreativeIntentPlan(context, {
              editProfileName: effectiveProfile.name,
              targetCutsPerMinute: effectiveProfile.cutsPerMinRange
                ? (effectiveProfile.cutsPerMinRange[0] + effectiveProfile.cutsPerMinRange[1]) / 2
                : 6,
              graphicDensity: effectiveProfile.graphicsDensity || 'moderate',
              assetBriefings: briefingsForPrompt,
              brandBlock,
            });

            // Layer 2: Translate creative intent → frame-accurate EDL decisions.
            // onScreenText passed through so the translator's safety-net can
            // guarantee every script-authored on-screen text line emits a
            // graphic decision even if the LLM's graphicIntents drops some
            // (see intent-translator.ts for the enforcement logic).
            const sceneContexts = context.scenes.map(s => {
              const sbScene = storyboardScenes.find(sb => sb.sceneIndex === s.sceneIndex);
              const onScreenText = sbScene?.editDirections?.onScreenText;
              return {
                sceneIndex: s.sceneIndex,
                fromFrame: s.fromFrame,
                durationFrames: s.durationFrames,
                voiceoverWords: s.voiceoverWords,
                motionPeaks: s.naturalCutPoints, // These are the frame-level cut points
                onScreenText: Array.isArray(onScreenText) ? onScreenText : undefined,
              };
            });

            const translation = translateCreativeIntentToEDL(
              intentPlan,
              sceneContexts,
              analysesMap,
              overlays,
              context.fps,
              effectiveProfile.graphicsDensity,
            );

            if (translation.warnings.length > 0) {
              console.warn(`[Director] Intent translation warnings: ${translation.warnings.join('; ')}`);
            }

            // Convert to EDL format for executeEDL (backward compatible)
            edl = {
              projectId,
              generatedAt: intentPlan.generatedAt,
              totalDecisions: translation.decisions.length,
              decisions: translation.decisions.map(d => ({
                type: d.type,
                frame: d.frame,
                durationFrames: d.durationFrames,
                priority: d.confidence > 0.8 ? 2 : d.confidence > 0.6 ? 3 : 4,
                source: d.sources.join('+'),
                signal: d.type,
                reason: d.reason,
                params: d.params,
                confidence: d.confidence,
              })),
              stats: {
                totalDecisions: translation.stats.decisionsGenerated,
                cutsPerMinute: 0, // Computed downstream
                transitionCount: translation.decisions.filter(d => d.type === 'transition').length,
                graphicCount: translation.decisions.filter(d => d.type === 'graphic').length,
                zoomCount: translation.decisions.filter(d => d.type === 'zoom').length,
                averageConfidence: translation.decisions.length > 0
                  ? translation.decisions.reduce((s, d) => s + d.confidence, 0) / translation.decisions.length
                  : 0,
              },
            };

            edlSummary.totalDecisions = translation.stats.decisionsGenerated;
            console.log(`[Director] Creative Intent: ${intentPlan.stats.totalScenes} scenes → ${translation.stats.decisionsGenerated} decisions (${translation.stats.momentsResolved} resolved, ${translation.stats.momentsFallback} fallback)`);
          } catch (unifiedErr: any) {
            // FALLBACK: Old Reactive Edit Engine (video analysis only)
            console.warn(`[Director] Unified Intelligence failed (${unifiedErr.message}), falling back to Reactive Engine`);
            const totalDurationMs = (project.durationInFrames || 900) / 30 * 1000;
            edl = generateEditDecisionList(analyses, totalDurationMs, {
              targetCutsPerMinute: effectiveProfile.cutsPerMinRange
                ? (effectiveProfile.cutsPerMinRange[0] + effectiveProfile.cutsPerMinRange[1]) / 2
                : 6,
              transitionStyle: effectiveProfile.defaultTransition?.includes('dissolve') ? 'dissolve'
                : effectiveProfile.defaultTransition?.includes('hard-cut') ? 'hard-cut'
                : 'mixed',
              graphicDensity: effectiveProfile.graphicsDensity || 'moderate',
              pacing: (effectiveProfile.pacing === 'variable' || effectiveProfile.pacing === 'beat-synced' ? 'medium' : effectiveProfile.pacing) || 'medium',
            });
          }

          const moments = analyses.flatMap(a => detectCinematicMoments(a));
          const canvas = project.playerDimensions || { width: 1920, height: 1080 };
          const edlResult = await executeEDL(edl, projectId, userId, overlays, canvas, analysesMap, effectiveProfile.graphicsDensity);

          // Build summary by decision type
          for (const d of edl.decisions) {
            edlSummary.byType[d.type] = (edlSummary.byType[d.type] || 0) + 1;
          }
          edlSummary.totalDecisions = edl.totalDecisions;
          edlSummary.executed = edlResult.decisionsExecuted;
          edlSummary.skipped = edlResult.decisionsSkipped;
          edlSummary.cinematicMoments = moments.length;

          result.overlaysModified += edlResult.overlaysModified + edlResult.overlaysCreated;

          if (edlResult.errors.length > 0) {
            result.warnings.push(...edlResult.errors.slice(0, 3));
          }

          // ── Post-processing: auto-behaviors from Knowledge Base ──
          try {
            const { runPostProcessing } = await import('@/lib/editron/services/auto-post-processing');
            const analysisMap = new Map<string, any>();
            for (const a of analyses) {
              analysisMap.set(a.assetId, a);
            }
            // Pass both budget-rejected AND already-zoomed assetIds to prevent drift-zoom conflicts.
            // If EDL already applied a zoom to an asset, drift-zoom should NOT add another.
            const allSkipZoomIds = new Set([
              ...edlResult.budgetRejectedZoomAssetIds,
              ...edlResult.zoomedAssetIds,
            ]);
            const ppResult = runPostProcessing(overlays, canvas, analysisMap, allSkipZoomIds);
            result.overlaysModified += ppResult.totalModified;
            if (ppResult.driftZoomApplied > 0) {
              console.log(`[Director] Post-process: ${ppResult.driftZoomApplied} drift-zooms applied (Z-030)`);
            }
          } catch (ppErr: any) {
            console.warn(`[Director] Post-processing failed (non-fatal): ${ppErr.message}`);
          }

          console.log(`[Director] 5-Track complete: ${edlSummary.assetsAnalyzed}/${videoOverlays.length} analyzed, ${edlSummary.totalDecisions} decisions (${edlSummary.executed} executed), ${moments.length} cinematic moments`);

          // Store intelligence status on project for UI
          try {
            const db2 = await (await import('@/lib/editron/db/mongodb')).getDatabase();
            await db2.collection('projects').updateOne(
              { projectId },
              { $set: {
                'intelligence.status': edlSummary.assetsFailed > 0 ? 'partial' : 'complete',
                'intelligence.assetsAnalyzed': edlSummary.assetsAnalyzed,
                'intelligence.assetsFailed': edlSummary.assetsFailed,
                'intelligence.failedAssets': edlSummary.failedAssets,
                'intelligence.decisionsGenerated': edlSummary.totalDecisions,
                'intelligence.decisionsExecuted': edlSummary.executed,
                'intelligence.cinematicMoments': moments.length,
                'intelligence.lastRun': new Date(),
              }},
            );
          } catch { /* non-fatal */ }
        } catch (edlErr: any) {
          console.error(`[Director] EDL generation/execution failed: ${edlErr.message}`);
          result.warnings.push(`EDL: ${edlErr.message}`);
          pipelineWarnings.errorSwallowed('director', edlErr, 'EDL generation/execution');
        }
      } else if (!pathDHandled) {
        // C6 FIX: Zero assets analyzed AND Path D didn't run — skip EDL but STILL
        // run profile-based steps (filters, transitions, captions, motion graphics).
        const failMsg = `Intelligence: 0/${videoOverlays.length} video assets analyzed (${edlSummary.failedAssets.join(', ')}). EDL skipped — profile-based steps (filters, transitions, captions) will still run.`;
        console.warn(`[Director] ${failMsg}`);
        result.warnings.push(failMsg);

        // Store partial state on project for UI to display
        try {
          const db = await (await import('@/lib/editron/db/mongodb')).getDatabase();
          await db.collection('projects').updateOne(
            { projectId },
            { $set: {
              'intelligence.status': 'skipped_edl',
              'intelligence.failedAssets': edlSummary.failedAssets,
              'intelligence.lastAttempt': new Date(),
              'intelligence.message': failMsg,
            }},
          );
        } catch { /* non-fatal */ }
      }
    }

    // Attach EDL summary to result for frontend inspection
    (result as any).edlSummary = edlSummary;

    // ─── Step 2: Check conditions and filter actions ──────────
    // Caption injection: The user picks caption style in the export dialog.
    // That choice flows through brief.overrides.captionStyle → effectiveProfile.captionStyle.
    // But some profiles (B-07 Automotive, B-06 Real Estate, etc.) don't include
    // addCaptions() in their actions array, so the user's choice gets ignored.
    // Fix: If the user chose a caption style AND the profile lacks a caption action, inject one.
    // If the user chose "none" or profile says "none" with no user override, respect that.
    const profileActions = [...effectiveProfile.actions];
    const hasCaptionAction = profileActions.some(a => a.tool === 'add_captions' || a.tool === 'add_fancy_captions');
    const resolvedCaptionStyle = effectiveProfile.captionStyle; // Already merged with user override by applyBriefOverrides

    if (!hasCaptionAction && resolvedCaptionStyle && resolvedCaptionStyle !== 'none') {
      // User chose a caption style (or profile default is not 'none') but profile has no caption action
      const style = resolvedCaptionStyle === 'fancy' ? 'kinetic' : resolvedCaptionStyle;
      const tool = resolvedCaptionStyle === 'fancy' ? 'add_fancy_captions' : 'add_captions';
      profileActions.push({
        tool,
        params: { style },
        condition: 'hasVoiceover' as any,
        description: `Add ${style} captions (from user selection)`,
        order: 5,
        failBehavior: 'warn' as any,
      });
      console.log(`[Director] Profile ${effectiveProfile.profileId} missing caption action — injecting ${tool}(${style}) from user/profile captionStyle`);
    } else if (!hasCaptionAction) {
      console.log(`[Director] Profile ${effectiveProfile.profileId}: no captions (captionStyle=${resolvedCaptionStyle || 'unset'})`);
    }

    const actions = profileActions
      .filter(action => checkCondition(action.condition, overlays, projectDoc))
      .sort((a, b) => a.order - b.order);

    // ─── Step 2.5: Continuity analysis (pure, zero-cost) ─────
    // Scores adjacent scene pairs to inform transition selection.
    // Priority: script transition > KB M-002 > continuity > profile default.
    let scenePairAnalysis: Array<{ sceneA: number; sceneB: number; score: { overall: number; visualSimilarity: number; energyMatch?: number }; recommendedTransition: string; flagForReview: boolean }> = [];
    const videoOverlaysForContinuity = overlays.filter((o: any) => o.type === 'video').sort((a: any, b: any) => a.from - b.from);
    if (videoOverlaysForContinuity.length > 1 && storyboardScenes.length > 0) {
      try {
        const { analyzeAllScenePairs } = await import('@/lib/editron/services/continuity-service');
        // Fix 24: Wire 5-Track visual data into continuity scoring.
        // OLD: colorPalette was always [] (empty), mood from text-only storyboard.
        // NEW: extract dominantColors + energyLevel from actual 5-Track keyframe analysis.
        const scenesForContinuity = videoOverlaysForContinuity.map((vo: any, idx: number) => {
          const sbScene = storyboardScenes.find((s: any) => s.sceneIndex === (vo.metadata?.sceneIndex ?? idx));
          const assetAnalysis = vo.assetId ? perAssetAnalysis.get(vo.assetId) : null;
          const allKfAnalyses = assetAnalysis?.keyframeAnalyses || [];

          // Filter keyframes to THIS segment's source time range.
          // For Mode 2: all overlays share one assetId but cover different time
          // ranges of the source video. Without filtering, every segment gets the
          // full video's colors → colorMatch = 1.0 for all pairs → continuity
          // can't distinguish a kitchen scene from an outdoor scene in a vlog.
          // For Mode 1: each overlay has a unique assetId, so all keyframes
          // already belong to that overlay — the filter is a harmless no-op.
          const fps = 30;
          const voStartSec = ((vo as any).videoStartTime ?? 0) / fps;
          const voEndSec = voStartSec + ((vo.durationInFrames || 150) / fps);
          let kfForSegment = allKfAnalyses.filter((kf: any) => {
            const kfSec = (kf.timestampMs ?? 0) / 1000;
            return kfSec >= voStartSec && kfSec < voEndSec;
          });
          // Short segments may have zero keyframes in range — use nearest neighbor
          if (kfForSegment.length === 0 && allKfAnalyses.length > 0) {
            const midSec = (voStartSec + voEndSec) / 2;
            kfForSegment = [allKfAnalyses.reduce((best: any, kf: any) => {
              const bestDist = Math.abs(((best.timestampMs ?? 0) / 1000) - midSec);
              const kfDist = Math.abs(((kf.timestampMs ?? 0) / 1000) - midSec);
              return kfDist < bestDist ? kf : best;
            })];
          }

          const dominantColors = [...new Set(
            kfForSegment.flatMap((kf: any) => kf.dominantColors || []).filter(Boolean)
          )] as string[];
          const analysisEnergy = kfForSegment.length > 0
            ? kfForSegment.reduce((sum: number, kf: any) => sum + (kf.energyLevel ?? 0.5), 0) / kfForSegment.length
            : null;

          // Derive mood from per-segment energy when storyboard mood is generic.
          // Mode 2 hardcodes mood='neutral' for all segments (director-agent Path C).
          // With real energy data, we can differentiate calm vs energetic sections
          // so continuity scoring produces meaningful per-boundary variation.
          let effectiveMood = sbScene?.mood;
          if ((!effectiveMood || effectiveMood === 'neutral') && analysisEnergy !== null) {
            if (analysisEnergy > 0.75) effectiveMood = 'energetic';
            else if (analysisEnergy > 0.6) effectiveMood = 'dramatic';
            else if (analysisEnergy > 0.45) effectiveMood = 'neutral';
            else if (analysisEnergy > 0.25) effectiveMood = 'mysterious';
            else effectiveMood = 'calm';
          }

          return {
            sceneIndex: vo.metadata?.sceneIndex ?? idx,
            visualDescription: sbScene?.visualDescription || kfForSegment.map((kf: any) => kf.description || '').join(' '),
            mood: effectiveMood || 'neutral',
            colorPalette: dominantColors,
            durationSeconds: (vo.durationInFrames || 150) / fps,
          };
        });
        scenePairAnalysis = analyzeAllScenePairs(scenesForContinuity);
        const flagged = scenePairAnalysis.filter(p => p.flagForReview).length;
        console.log(`[Director] Continuity: ${scenePairAnalysis.length} pairs analyzed${flagged ? `, ${flagged} flagged for review` : ''}`);
        if (flagged) result.warnings.push(`Continuity: ${flagged} scene pair(s) have low continuity (overall < 0.40)`);
      } catch (contErr: any) {
        console.warn(`[Director] Continuity analysis failed (non-fatal): ${contErr.message}`);
      }
    }

    // Unify captions: ALL caption paths go through add_captions (editable, word-timed).
    // The standard caption system now supports instagram/hormozi display modes with spring
    // animation — no need for separate add_fancy_captions html-scene overlays.
    let filteredActions = actions.map(a => {
      if (a.tool === 'add_fancy_captions') {
        console.log(`[Director] Unified captions: fancy → add_captions (editable + animated)`);
        return { ...a, tool: 'add_captions' as const, description: 'Add captions (unified, animated)' };
      }
      return a;
    });

    // Path D: skip profile actions that the signal executor already handled.
    // Signal executor placed transitions via 95 graph mappings + EDL execution.
    // Running add_transition from the profile creates duplicates / overrides.
    // Keep everything else: filter (only color grade path), captions, audio ducking,
    // motion graphics (LottieFiles templates ≠ signal keyword graphics), beat sync,
    // quality review.
    if (pathDConstraintViolations) {
      const pathDSkipTools = new Set(['add_transition']);
      const beforeCount = filteredActions.length;
      filteredActions = filteredActions.filter(a => {
        if (pathDSkipTools.has(a.tool)) {
          console.log(`[Director] Path D: Skipping profile action '${a.tool}' — signal executor already placed transitions via EDL`);
          return false;
        }
        return true;
      });
      if (beforeCount !== filteredActions.length) {
        console.log(`[Director] Path D: ${beforeCount - filteredActions.length} profile action(s) skipped (handled by signal-driven EDL)`);
      }
    }

    const totalSteps = filteredActions.length;
    onProgress?.(0, totalSteps, 'Starting Director Agent execution...');

    // ─── QualityGate: per-action measurement (TRIBE Phase 1) ──
    const { takeSnapshot, compareSnapshots, summarizeGateSession } = await import('@/lib/editron/services/quality-gate');
    const gateResults: GateResult[] = [];
    const fps = project.fps || 30;

    // ─── Step 3: Execute actions sequentially ────────────────
    for (let i = 0; i < filteredActions.length; i++) {
      const action = filteredActions[i];
      onProgress?.(i + 1, totalSteps, action.description);

      try {
        const beforeSnapshot = takeSnapshot(overlays, fps);
        const modified = await executeAction(action, overlays, userId, projectId, effectiveProfile, storyboardScenes, scenePairAnalysis, pathDConstraintViolations, pathDGenreParams);
        const afterSnapshot = takeSnapshot(overlays, fps);
        const gateResult = compareSnapshots(beforeSnapshot, afterSnapshot, action.description);
        gateResults.push(gateResult);

        result.overlaysModified += modified;
        result.actionsExecuted++;

        if (!gateResult.passed) {
          console.warn(`[Director] Action ${i + 1}/${totalSteps}: ${action.description} — ${modified} modified, GATE DEGRADATION (${gateResult.degradations.length} issues)`);
          for (const d of gateResult.degradations) {
            result.warnings.push(`[QualityGate] ${d.message}`);
          }
        } else {
          console.log(`[Director] Action ${i + 1}/${totalSteps}: ${action.description} — ${modified} overlays modified`);
        }
      } catch (err: any) {
        const errMsg = err?.message || 'Unknown error';
        console.error(`[Director] Action failed: ${action.description}:`, errMsg);

        if (action.failBehavior === 'abort') {
          throw new Error(`Critical action failed: ${action.description} — ${errMsg}`);
        }

        result.actionsSkipped.push({ action: action.description, reason: errMsg });
        if (action.failBehavior === 'warn') {
          result.warnings.push(`${action.description}: ${errMsg}`);
        }
      }
    }

    // ─── QualityGate session summary ──────────────────────────
    if (gateResults.length > 0) {
      const gateSummary = summarizeGateSession(gateResults);
      console.log(
        `[Director] QualityGate summary: ${gateSummary.passedActions}/${gateSummary.totalActions} passed, ` +
        `${gateSummary.criticalDegradations} critical, trend: ${gateSummary.overallTrend}`,
      );
      result.qualityGate = {
        totalActions: gateSummary.totalActions,
        passedActions: gateSummary.passedActions,
        failedActions: gateSummary.failedActions,
        totalDegradations: gateSummary.totalDegradations,
        criticalDegradations: gateSummary.criticalDegradations,
        overallTrend: gateSummary.overallTrend,
      };
    }

    // ─── Step 3.4: Transition dedup safety net (B3) ──────────────
    // All transition-creating steps are done: edit-direction-applier (disabled),
    // EDL executor (step 3), Director add_transition tool (step 3). Before
    // step 3.5 (beat-sync) and step 3.6 (SFX placer) see the transition set,
    // guarantee at most one transition per (clipAId, clipBId) pair and strip
    // any ghost markers (no source + no transitionStyle) that slipped through.
    // This is the safety net for Root Cause B of the 2026-04-18 regression —
    // see pipeline_investigations.md and dedupTransitionsByClipPair below.
    try {
      const dedupResult = dedupTransitionsByClipPair(overlays);
      if (dedupResult.duplicatesRemoved > 0 || dedupResult.ghostsStripped > 0) {
        console.log(
          `[Director] Step 3.4: transition dedup — removed ${dedupResult.duplicatesRemoved} duplicate(s), ` +
          `stripped ${dedupResult.ghostsStripped} ghost(s)`,
        );
        result.overlaysModified += dedupResult.duplicatesRemoved + dedupResult.ghostsStripped;
      }
    } catch (dedupErr: any) {
      const errMsg = dedupErr?.message || 'Unknown error';
      console.error('[Director] Step 3.4 transition dedup failed:', errMsg);
      result.warnings.push(`Transition dedup failed: ${errMsg}`);
      pipelineWarnings.errorSwallowed('director', dedupErr, 'transition dedup (dedupTransitionsByClipPair)');
      // Non-fatal — step 4's A1 marker filter still runs as a secondary net.
    }

    // ─── Step 3.5: Beat-sync cut alignment (beatSyncActive projects only) ──
    // If finalize sync-generated BGM with a beat grid, snap montage sub-shot cut
    // points to the nearest beats. Runs BEFORE transition SFX (step 3.6) so the
    // SFX overlays land on the FINAL (beat-aligned) cut frames, not their
    // creative-intent positions.
    //
    // Only activates when BGM overlay has metadata.beatGrid (i.e., finalize went
    // through the sync-beat-sync branch). Non-beat-sync projects have async BGM
    // without beat grid → this step is a silent no-op. See
    // pipeline_investigations.md "Beat-sync design doc (Option C)" 2026-04-17.
    //
    // Creative doc alignment: §11 "Cuts on downbeats (beat 1 of a measure)".
    // alignCutsToBeats() uses a 0.5s snap threshold — cuts further than 15
    // frames from any beat are left creative-intent-placed (no forced snap).
    try {
      const bgmOverlay: any = overlays.find(
        (o: any) => o?.type === 'sound' && o?.metadata?.beatGrid?.beats?.length > 0,
      );
      if (bgmOverlay?.metadata?.beatGrid) {
        const beatGrid = bgmOverlay.metadata.beatGrid;
        const fps = project.fps || 30;
        const { alignCutsToBeats } = await import('@/lib/pipeline/scene-to-editron');
        const snapped = alignCutsToBeats(overlays, beatGrid.beats, fps);
        console.log(
          `[Director] Beat-sync step 3.5: ${snapped} cut(s) snapped to beats ` +
          `(grid: ${beatGrid.bpm} BPM, ${beatGrid.beats.length} beats, ` +
          `${beatGrid.downbeats?.length || 0} downbeats, source=${beatGrid.source})`,
        );
        if (snapped > 0) result.overlaysModified += snapped;
      }
      // else: no beat grid on any sound overlay — not a beat-sync project. Silent no-op.
    } catch (beatAlignErr: any) {
      const errMsg = beatAlignErr?.message || 'Unknown error';
      console.error('[Director] Beat-sync alignment failed:', errMsg);
      result.warnings.push(`Beat-sync alignment failed: ${errMsg}`);
      pipelineWarnings.errorSwallowed('director', beatAlignErr, 'beat-sync alignment (alignCutsToBeats)');
      // Non-fatal — continue to step 3.6. Creative-intent cuts stay in place.
    }

    // ─── Step 3.6: Transition SFX placement ──────────────────
    // Rule-driven SFX placement per DIRECTOR_KNOWLEDGE_BASE.md Part 9
    // (A-001 whoosh on dissolve/wipe, A-002 impact on zoom-punch/flash).
    //
    // Runs AFTER the profile action loop so all transitions from
    // edit-direction-applier, EDL executor, and add_transition tool calls
    // are visible. Runs AFTER step 3.5 beat alignment so SFX overlays land
    // on the aligned (not creative-intent) cut frames. Runs BEFORE step 4
    // merge so SFX overlays are in the saved project state.
    //
    // Deterministic — no LLM dependency (Rule 18N). A sound designer's
    // workflow: look at the cut, place the sound. This mirrors that.
    try {
      const { placeTransitionSFX } = await import('@/lib/editron/services/transition-sfx-placer');
      const sfxResult = await placeTransitionSFX(overlays, userId, effectiveProfile, pipelineWarnings);
      if (sfxResult.placed > 0) {
        console.log(
          `[Director] Transition SFX: placed ${sfxResult.placed}, skipped ${sfxResult.skipped} ` +
          `(tokens: ${sfxResult.tokensUsed.join(',')})`
        );
        result.overlaysModified += sfxResult.placed;
      } else if (sfxResult.skipped > 0) {
        console.log(
          `[Director] Transition SFX: 0 placed, ${sfxResult.skipped} skipped ` +
          `(reasons: ${JSON.stringify(sfxResult.skipReasons)})`
        );
      }
    } catch (sfxErr: any) {
      const errMsg = sfxErr?.message || 'Unknown error';
      console.error('[Director] Transition SFX placement failed:', errMsg);
      result.warnings.push(`Transition SFX placement failed: ${errMsg}`);
      pipelineWarnings.errorSwallowed('sfx', sfxErr, 'transition SFX placer');
      // Non-fatal — continue to merge/save. Missing SFX is degradation, not failure.
    }

    // ─── Step 4: Merge and save ───────────────────────────────
    // Re-read the project to pick up any BGM/SFX overlays that async
    // audio workers pushed while the Director was executing (~75s).
    // Without this merge, saveProject() overwrites the array and
    // clobbers the audio overlays.
    const freshProject = await projectService.loadProject(userId, projectId);
    if (freshProject) {
      const directorOverlayIds = new Set(overlays.map(o => o.id));
      const asyncOverlays = (freshProject.overlays || []).filter(
        o => !directorOverlayIds.has(o.id),
      );
      if (asyncOverlays.length > 0) {
        console.log(`[Director] Merging ${asyncOverlays.length} async overlays (BGM/SFX from audio workers)`);
        overlays.push(...asyncOverlays);
      }

      // Merge keyframe tracks from DB into in-memory overlays.
      // The add_transition tool writes keyframeTracks directly to MongoDB
      // via updateOverlay(), but saveProject() at line ~690 overwrites the
      // entire overlays array from the in-memory copy which doesn't have them.
      // Without this merge, dissolve/transition keyframes are silently lost.
      const freshMap = new Map((freshProject.overlays || []).map((o: any) => [o.id, o]));
      let kfMerged = 0;
      for (const overlay of overlays) {
        const fresh = freshMap.get(overlay.id);
        if (fresh?.keyframeTracks?.length > 0 && !(overlay as any).keyframeTracks?.length) {
          (overlay as any).keyframeTracks = fresh.keyframeTracks;
          kfMerged++;
        }
      }
      if (kfMerged > 0) {
        console.log(`[Director] Merged keyframeTracks from DB for ${kfMerged} overlays (transition opacity/zoom)`);
      }
    }

    // ─── Step 4.5: Run BGM-dependent actions that were skipped ───
    // Audio ducking requires BGM. BGM arrives async via QStash worker
    // and is merged above in Step 4. Profile actions ran at Step 3 when
    // BGM wasn't present → hasBGM was false → audio_ducking skipped.
    const hasBGMNow = overlays.some((o: any) => o.type === 'sound' && (o.row === ROW.BGM || (o.assetId || '').startsWith('bgm_')));
    if (hasBGMNow) {
      const duckAction = profileActions.find(a => a.tool === 'audio_ducking');
      if (duckAction) {
        try {
          const modified = await executeAction(duckAction, overlays, userId, projectId, effectiveProfile, storyboardScenes, scenePairAnalysis);
          result.overlaysModified += modified;
          console.log(`[Director] Step 4.5: audio ducking applied post-merge (BGM arrived async) — ${modified} modified`);
        } catch (duckErr: any) {
          console.warn(`[Director] Step 4.5: audio ducking failed (non-fatal): ${duckErr.message}`);
        }
      }
    }

    // Strip in-memory dedup markers before persist. The add_transition loop
    // (line ~945) pushes lightweight sentinel objects with
    // `metadata.inMemoryMarker: true` so subsequent iterations see what the
    // previous one added (invokeAITool writes to MongoDB but doesn't update the
    // in-memory array). Those sentinels must NEVER reach MongoDB — they have
    // no transitionStyle, no source, no content, and would render as "ghost"
    // transitions. See pipeline_investigations.md 2026-04-18 for the regression
    // this protects against.
    const persistableOverlays = overlays.filter(
      (o: any) => !o?.metadata?.inMemoryMarker && (o.durationInFrames > 0),
    );
    const strippedCount = overlays.length - persistableOverlays.length;
    if (strippedCount > 0) {
      const zeroDur = overlays.filter((o: any) => o.durationInFrames <= 0 && !o?.metadata?.inMemoryMarker).length;
      const markers = strippedCount - zeroDur;
      console.log(`[Director] Stripped ${strippedCount} overlay(s) before save (${markers} dedup markers, ${zeroDur} zero-duration)`);
    }

    await projectService.saveProject(userId, projectId, {
      overlays: persistableOverlays,
      aspectRatio: project.aspectRatio,
      playerDimensions: project.playerDimensions,
      fps: project.fps,
      durationInFrames: project.durationInFrames,
    });

    result.success = true;
    onProgress?.(totalSteps, totalSteps, 'Director Agent execution complete');

    // ─── Brand Intelligence: emit director_completed + transition status ───
    try {
      const { emitBrandEvent } = await import('@/lib/shared/brand-events');
      const { transitionProjectStatus } = await import('@/lib/shared/project-status');

      await transitionProjectStatus(projectId, userId, 'editing', 'director_completed');

      // Read actual quality score from project doc (persisted by quality_review step above)
      const { getDatabase: getBrandDb } = await import('@/lib/editron/db/mongodb');
      const brandDb = await getBrandDb();
      const projectDoc = await brandDb.collection('projects').findOne({ projectId });
      const actualQualityScore = projectDoc?.qualityReview?.overallScore;

      emitBrandEvent({
        userId,
        projectId,
        service: 'editron',
        type: 'director_completed',
        payload: {
          profileId: effectiveProfile.profileId,
          actionsExecuted: result.actionsExecuted,
          actionsSkipped: result.actionsSkipped.length,
          sceneCount: storyboardScenes.length,
          durationSec: Math.round((project.durationInFrames || 0) / (project.fps || 30)),
          ...(typeof actualQualityScore === 'number' && { qualityScore: actualQualityScore }),
        },
      }).catch((e) => console.warn('[Director] Brand event failed:', e));
    } catch (brandErr: unknown) {
      const msg = brandErr instanceof Error ? brandErr.message : String(brandErr);
      console.warn(`[Director] Brand intelligence wiring failed: ${msg}`);
    }

    // ─── Project Graph Record: send outcome to Graphiti for learning ───
    try {
      const { dispatchProjectGraphRecord, buildProjectGraphRecord } = await import(
        '@/lib/editron/services/project-graph-writer'
      );
      const { getDatabase: getGraphDb } = await import('@/lib/editron/db/mongodb');
      const graphDb = await getGraphDb();
      const graphProjectDoc = await graphDb.collection('projects').findOne({ projectId });

      if (graphProjectDoc?.genreParameters) {
        const durationSec = Math.round((project.durationInFrames || 0) / (project.fps || 30));
        const graphRecord = buildProjectGraphRecord({
          projectId,
          userId,
          brandId: graphProjectDoc.brandId,
          profileId: effectiveProfile.profileId,
          videoDurationSec: durationSec,
          speechCoverage: 0, // AI-generated video — no speech coverage metric at Director time
          genreParameters: graphProjectDoc.genreParameters,
          momentWeights: [], // Not tracked during Director execution
          decisions: [], // Director actions are step-based, not decision-format
          qualityScore: graphProjectDoc.qualityReview?.overallScore ?? 0,
          constraintViolations: [], // Available in quality review but not threaded here
          captionMode: 'auto',
          segmentsRemoved: 0, // Mode 1 doesn't remove segments
          userRendered: false,
          userPublished: false,
        });
        await dispatchProjectGraphRecord(graphRecord);
        console.log(`[Director] Project graph record dispatched for ${projectId}`);
      }
    } catch (graphWriterErr: unknown) {
      const msg = graphWriterErr instanceof Error ? graphWriterErr.message : String(graphWriterErr);
      console.warn(`[Director] Project graph record dispatch failed: ${msg}`);
    }

    // ─── Graph sync: update Project + Scene nodes after Director ───
    try {
      const qstashToken = process.env.QSTASH_TOKEN;
      if (qstashToken) {
        const graphSyncUrl = (() => {
          const base = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
          return `${base}/api/internal/workers/graph-sync`;
        })();

        const { Client } = await import('@upstash/qstash');
        const qstash = new Client({ token: qstashToken, baseUrl: process.env.QSTASH_URL || undefined });

        const currentVersion = ((project as any).directorVersion || 0) + 1;

        await qstash.publishJSON({
          url: graphSyncUrl,
          body: {
            action: 'project_director_complete',
            data: {
              projectId,
              update: {
                profileUsed: effectiveProfile.profileId,
                profileOverridden: profile.profileId !== effectiveProfile.profileId,
                overriddenTo: profile.profileId !== effectiveProfile.profileId ? effectiveProfile.profileId : undefined,
                qualityScore: 0,
                sceneCount: storyboardScenes.length,
                durationSec: (project.durationInFrames || 0) / (project.fps || 30),
                currentVersion,
              },
            },
          },
          retries: 3,
        });

        console.log(`[Director] Graph sync dispatched: project_director_complete v${currentVersion}`);

        // Graphiti episode: project outcome for learning
        const { addGraphitiEpisode } = await import('@/lib/editron/services/graph-service');
        const sceneDescriptions = storyboardScenes
          .map((s: any, i: number) => `scene ${i}: ${s.mood || 'neutral'} ${s.sceneType || 'continuous'}`)
          .join(', ');

        await addGraphitiEpisode({
          type: 'project_outcome',
          name: `director_complete_${projectId}_v${currentVersion}`,
          body: `Director completed project ${projectId} using profile ${effectiveProfile.profileId} (${effectiveProfile.name}). `
            + `${result.actionsExecuted} actions executed, ${result.actionsSkipped.length} skipped. `
            + `${storyboardScenes.length} scenes: ${sceneDescriptions}. `
            + `Duration: ${Math.round((project.durationInFrames || 0) / (project.fps || 30))}s. `
            + `Profile was ${profile.profileId !== effectiveProfile.profileId ? `overridden from ${profile.profileId} to ${effectiveProfile.profileId}` : 'auto-detected'}.`,
          sourceDescription: 'director_completion',
          groupId: userId,
        });
      }
    } catch (graphErr: any) {
      console.warn(`[Director] Graph sync dispatch failed: ${graphErr.message}`);
    }
  } catch (err: any) {
    result.warnings.push(`Director Agent failed: ${err.message}`);
    console.error('[Director] Execution failed:', err.message);

    try {
      const { transitionProjectStatus } = await import('@/lib/shared/project-status');
      await transitionProjectStatus(
        projectId, userId, 'failed', 'director_error',
        { message: err.message, service: 'editron' },
      );
    } catch { /* best-effort */ }
  }

  // E2 FIX: Release project lock (always, even on error)
  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const unlockDb = await getDatabase();
    await unlockDb.collection('projects').updateOne(
      { projectId },
      { $unset: { directorLock: '', directorLockAt: '' } },
    );
  } catch {}

  result.executionMs = Date.now() - startTime;
  console.log(`[Director] Complete: ${result.actionsExecuted} actions, ${result.actionsSkipped.length} skipped, ${result.executionMs}ms`);

  return result;
}

// ─── Action Executor ─────────────────────────────────────────────

async function executeAction(
  action: EditProfileAction,
  overlays: any[],
  userId: string,
  projectId: string,
  profile: EditProfile,
  storyboardScenes: any[] = [],
  scenePairAnalysis: Array<{ sceneA: number; sceneB: number; score: { overall: number; visualSimilarity: number; energyMatch?: number }; recommendedTransition: string; flagForReview: boolean }> = [],
  /** Path D: constraint violations for quality review scoring */
  constraintViolations?: any[],
  /** Path D: computed genre params for pacing validation */
  genreParams?: any,
): Promise<number> {
  let modified = 0;

  // Explicit logging to confirm storyboardScenes is received
  console.log(`[Director] executeAction: "${action.tool}" — storyboardScenes=${Array.isArray(storyboardScenes) ? storyboardScenes.length : 'NOT_ARRAY'}, overlays=${overlays.length}`);

  switch (action.tool) {
    case 'batch_update_overlays': {
      // Apply filter to visual overlays.
      // GUARD: If edit-direction-applier (finalize) already set a filter from the script,
      // DON'T overwrite it — script intent > profile default.
      // Only apply profile filter to overlays that have NO filter set.
      const filterPresetId = action.params.filterPresetId || profile.filterPresetId;
      const preset = getFilterPresetById(filterPresetId);
      if (preset.id === 'none') break;

      // Apply profile filter to ALL visual overlays — profile is source of truth.
      // OLD: skipped overlays with existing filters (from edit-direction-applier or EDL).
      // This caused "filter schizophrenia" where different clips got different grades.
      // NEW: profile filter overwrites everything. Users can manually adjust per-clip
      // in the editor if they want variation.
      const targetTypes = action.params.targetTypes || ['image', 'video'];
      let overwritten = 0;
      for (const overlay of overlays) {
        if (targetTypes.includes(overlay.type)) {
          if ((overlay as any).styles?.filter && (overlay as any).styles.filter !== 'none') {
            overwritten++;
          }
          overlay.styles = { ...overlay.styles, filter: preset.filter };
          modified++;
        }
      }
      if (overwritten > 0) {
        console.log(`[Director] batch_update_overlays: applied ${preset.id} to ${modified} overlays (overwrote ${overwritten} pre-set filters — profile is source of truth)`);
      }
      break;
    }

    case 'audio_ducking': {
      // Configure ducking on BGM overlays (row 1)
      for (const overlay of overlays) {
        if (overlay.type === 'sound' && overlay.row === ROW.BGM) {
          overlay.styles = {
            ...overlay.styles,
            duckingConfig: {
              enabled: true,
              duckLevel: action.params.duckLevel ?? DEFAULT_CONFIG.audio.duckLevel,
              rampDownMs: action.params.rampDownMs ?? DEFAULT_CONFIG.audio.rampDownMs,
              rampUpMs: action.params.rampUpMs ?? DEFAULT_CONFIG.audio.rampUpMs,
              lookAheadMs: action.params.lookAheadMs ?? DEFAULT_CONFIG.audio.lookAheadMs,
            },
          };
          modified++;
        }
      }
      break;
    }

    case 'split_clips': {
      // Split video clips at anchor points (analysis-informed sub-cuts).
      // This allows the Director to restructure the timeline AFTER video generation.
      // Example: A single 5s clip can be split into 2x 2.5s clips with different treatments.
      //
      // GUARDRAILS (prevent going rogue like the zoom bounce incident):
      // - Max 3 splits per clip (no clip gets shredded into 10 micro-fragments)
      // - Max 8 total splits per project (not 50)
      // - Minimum resulting segment: 1.5s (45 frames at 30fps) — shorter = flicker
      // - Only split clips > 3s (90 frames) — short clips don't benefit from splitting
      // - Each split MUST have a reason string — no blind splitting

      const fps = 30;
      const MIN_SEGMENT_FRAMES = 45;  // 1.5s minimum
      const MIN_CLIP_TO_SPLIT_FRAMES = 90;  // Only split clips > 3s
      const MAX_SPLITS_PER_CLIP = 3;
      const MAX_TOTAL_SPLITS = 8;

      const videoOverlays = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
      const splitPoints = action.params.splitPoints as Array<{ overlayId: number; atFrame: number; reason: string }> | undefined;

      if (!splitPoints || splitPoints.length === 0) {
        console.log(`[Director] split_clips: no split points provided, skipping`);
        break;
      }

      // GUARDRAIL: Cap total splits
      if (splitPoints.length > MAX_TOTAL_SPLITS) {
        console.warn(`[Director] split_clips: ${splitPoints.length} splits requested, capping at ${MAX_TOTAL_SPLITS}`);
      }

      // GUARDRAIL: Filter out invalid split points BEFORE executing
      const splitsPerClip = new Map<number, number>();
      const validSplits = splitPoints
        .slice(0, MAX_TOTAL_SPLITS) // Hard cap
        .filter(sp => {
          // Must have a reason
          if (!sp.reason) {
            console.warn(`[Director] split_clips: rejected split at frame ${sp.atFrame} — no reason provided`);
            return false;
          }

          // Find the target overlay
          const overlay = videoOverlays.find(o => o.id === sp.overlayId);
          if (!overlay) return false;

          // Only split clips > 3s
          if (overlay.durationInFrames < MIN_CLIP_TO_SPLIT_FRAMES) {
            console.warn(`[Director] split_clips: rejected split on overlay ${sp.overlayId} — too short (${overlay.durationInFrames} frames < ${MIN_CLIP_TO_SPLIT_FRAMES})`);
            return false;
          }

          // Check resulting segments would be >= 1.5s each
          const localFrame = sp.atFrame - overlay.from;
          const firstSegment = localFrame;
          const secondSegment = overlay.durationInFrames - localFrame;
          if (firstSegment < MIN_SEGMENT_FRAMES || secondSegment < MIN_SEGMENT_FRAMES) {
            console.warn(`[Director] split_clips: rejected split on overlay ${sp.overlayId} at frame ${sp.atFrame} — would create segment < 1.5s (${firstSegment}f + ${secondSegment}f)`);
            return false;
          }

          // Max 3 splits per clip
          const count = splitsPerClip.get(sp.overlayId) || 0;
          if (count >= MAX_SPLITS_PER_CLIP) {
            console.warn(`[Director] split_clips: rejected split on overlay ${sp.overlayId} — already split ${MAX_SPLITS_PER_CLIP} times`);
            return false;
          }
          splitsPerClip.set(sp.overlayId, count + 1);

          return true;
        });

      if (validSplits.length === 0) {
        console.log(`[Director] split_clips: no valid split points after guardrails, skipping`);
        break;
      }

      console.log(`[Director] split_clips: ${validSplits.length} valid splits (from ${splitPoints.length} requested)`);

      // Use the existing split_overlay tool
      const { createTools } = await import('@/lib/editron/agent/tools');
      const tools = createTools(userId, projectId);
      const splitTool: any = tools.find((t: any) => t.name === 'split_overlay');
      if (!splitTool) {
        console.warn(`[Director] split_clips: split_overlay tool not found`);
        break;
      }

      // Sort by frame DESCENDING so later splits don't invalidate earlier frame positions
      const sortedSplits = [...validSplits].sort((a, b) => b.atFrame - a.atFrame);
      let splitCount = 0;

      for (const sp of sortedSplits) {
        try {
          const resultStr = await splitTool.invoke({ id: sp.overlayId, atFrame: sp.atFrame });
          const result = JSON.parse(resultStr);
          if (result.status === 'success') {
            splitCount++;
            console.log(`[Director] split_clips: overlay ${sp.overlayId} split at frame ${sp.atFrame} — ${sp.reason}`);
            // Refresh overlays since split_overlay modifies DB directly
            const refreshed = await projectService.loadProject(userId, projectId);
            if (refreshed) {
              overlays.length = 0;
              overlays.push(...(refreshed.overlays || []));
            }
          } else {
            console.warn(`[Director] split_clips: failed to split overlay ${sp.overlayId}: ${result.message}`);
          }
        } catch (err: any) {
          console.error(`[Director] split_clips: exception splitting overlay ${sp.overlayId}: ${err.message}`);
        }
      }

      console.log(`[Director] split_clips: ${splitCount}/${validSplits.length} splits applied`);
      modified = splitCount;
      break;
    }

    case 'add_captions':
    case 'add_fancy_captions':
    case 'sync_cuts_to_beats': {
      // Signal-driven caption style + display mode selection
      // Signals determine both the visual style AND the display mode (word grouping + animation)
      if (action.tool === 'add_captions' && genreParams && !action.params?.style) {
        const formality = genreParams.formality ?? 0.5;
        const energy = genreParams.energy_baseline ?? 0.5;
        const speakingRate = Math.max(100, 220 - (genreParams.pacing_tolerance * 10));
        const enthusiasm = energy; // energy_baseline is our best proxy for enthusiasm at this point

        let signalStyle = 'minimal';
        let displayMode = 'phrase';

        // CRG: formality 0.7+ → restrained, formal
        if (formality > 0.7 && speakingRate < 140) {
          signalStyle = 'subtitle';
          displayMode = 'subtitle';
        }
        // High energy + fast pace → hormozi (bold punch, spring pop)
        else if (enthusiasm > 0.7 && speakingRate > 160) {
          signalStyle = 'bold';
          displayMode = 'hormozi';
        }
        // Moderate casual → instagram (center block, spring scale)
        else if (formality < 0.4 && enthusiasm > 0.4) {
          signalStyle = 'bold';
          displayMode = 'instagram';
        }
        // Moderate formal → karaoke (all words visible, active highlighted)
        else if (formality > 0.5) {
          signalStyle = 'minimal';
          displayMode = 'karaoke';
        }
        // Low formality → phrase with bold
        else if (formality < 0.4) {
          signalStyle = 'bold';
          displayMode = 'phrase';
        }

        console.log(`[Director] Caption from signals: formality=${formality.toFixed(2)}, energy=${enthusiasm.toFixed(2)}, rate~${Math.round(speakingRate)}WPM → style="${signalStyle}", mode="${displayMode}"`);
        action = { ...action, params: { ...action.params, style: signalStyle, displayMode } };
      }
      // These are AI tools — delegate to invokeAITool which handles per-video iteration
      modified = await invokeAITool(action, userId, projectId, profile, overlays);
      break;
    }

    case 'add_transition': {
      // RULE: Script transitions ALWAYS win over profile transitions.
      // Finalize applies script transitions (from editDirections) BEFORE Director runs.
      // Director should only add transitions where none exist yet (gaps between scenes).
      //
      // Phase A3.5.1/A3.5.2 fix: previous check was
      //   `o.type === 'html-scene' && (o.row === 1 || metadata.isTransition)`
      // which missed real TransitionOverlay tiles (type === 'transition' on row 5)
      // that the EDL executor had already placed. Result: Director thought the timeline
      // had no transitions and spammed profile-default dip-to-black between every clip pair
      // (10 redundant overlays on top of the EDL's 4). See editron_master_remaining.md
      // Phase A3 for full disaster inventory from the 2026-04-08 McDonald's test.
      //
      // NEW check: any overlay of type 'transition' OR any overlay whose metadata flags it as
      // a transition (covers legacy html-scene transitions + EDL TransitionOverlays + tool transitions).
      const existingTransitions = overlays.filter(
        o => o.type === 'transition' || (o as any).metadata?.isTransition,
      );

      if (existingTransitions.length > 0) {
        console.log(`[Director] add_transition: ${existingTransitions.length} script transitions already exist, respecting user's script intent`);
        // Check if there are gaps (scenes without transitions between them)
        const videoOverlays = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
        let gapCount = 0;
        for (let i = 0; i < videoOverlays.length - 1; i++) {
          const clipA = videoOverlays[i];
          const clipB = videoOverlays[i + 1];
          const boundaryFrame = clipA.from + clipA.durationInFrames;
          // Authoritative: clipA/clipB identity match (single boundary per pair).
          // Fallback: frame proximity for legacy overlays without clipAId/clipBId.
          // See pipeline_investigations.md 2026-04-18 (Dual transition regression).
          const hasTransition = existingTransitions.some(t => {
            if ((t as any).clipAId === clipA.id && (t as any).clipBId === clipB.id) return true;
            if ((t as any).clipAId == null || (t as any).clipBId == null) {
              return Math.abs(t.from - boundaryFrame) < 30 || Math.abs((t.from + t.durationInFrames) - boundaryFrame) < 30;
            }
            return false;
          });
          if (!hasTransition) gapCount++;
        }
        if (gapCount === 0) {
          console.log('[Director] add_transition: all scene boundaries have transitions, skipping');
          break;
        }
        console.log(`[Director] add_transition: ${gapCount} gaps without transitions, filling with profile default`);
      }

      // Get transition type: script param → Graphiti brand preference → profile default
      let transType: string = action.params.type || profile.defaultTransition || 'soft-cut';

      if (!action.params.type) {
        try {
          const { searchGraphitiFacts } = await import('@/lib/editron/services/graph-service');
          const brandFacts = await searchGraphitiFacts(
            `What transitions work best for this content type and mood?`,
            userId,
            3,
          );
          if (brandFacts.length > 0) {
            const validTypes = ['dissolve', 'dip-to-black', 'dip-to-white', 'soft-cut', 'zoom-punch', 'whip-pan', 'glitch',
              'flash', 'film-burn', 'iris-wipe', 'blur-transition', 'wipe-left', 'wipe-right', 'slide-up', 'slide-down',
              'match-cut', 'smash-cut'];
            const preferred = validTypes.find(t => brandFacts.some(f => f.toLowerCase().includes(t)));
            if (preferred) {
              console.log(`[Director] Graphiti suggests transition: ${preferred} (from ${brandFacts.length} facts)`);
              transType = preferred;
            }
          }
        } catch { /* Graphiti unavailable — use profile default */ }
      }

      // 'hard-cut' means no transition overlay — skip entirely
      if (transType === 'hard-cut' || transType === 'none') {
        console.log('[Director] add_transition: hard-cut = no transition needed, skipping');
        break;
      }

      // Validate against the enum the tool accepts
      // Canonical TransitionStyle types (from types.ts). Ghost types removed 2026-05-15:
      // cutaway, iris (→iris-wipe), light-leak, slide-left (→wipe-left), slide-right (→wipe-right),
      // morph, pixelate, color-flash — had zero rendering, zero SFX mapping, zero system definition.
      const validTypes = ['dissolve', 'dip-to-black', 'dip-to-white', 'soft-cut', 'zoom-punch', 'whip-pan', 'glitch',
        'flash', 'film-burn', 'iris-wipe', 'blur-transition', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down',
        'slide-up', 'slide-down', 'match-cut', 'smash-cut'];
      if (!validTypes.includes(transType)) {
        console.warn(`[Director] add_transition: "${transType}" not in valid types, defaulting to soft-cut`);
        transType = 'soft-cut';
      }

      // ─── Per-scene transition from script editDirections ──────
      // The storyboard stores per-scene transition types (from script parsing).
      // Use those where specified, fall back to profile default otherwise.
      // This respects the script author's intent (e.g., "hard cut" vs "dissolve").
      const videoOverlaysForTrans = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
      let transModified = 0;

      for (let i = 0; i < videoOverlaysForTrans.length - 1; i++) {
        const clipA = videoOverlaysForTrans[i];
        const clipB = videoOverlaysForTrans[i + 1];

        // Check if a transition already exists for this clip pair.
        // Authoritative: clipA/clipB identity match. Fallback: frame proximity
        // for legacy overlays without clipAId/clipBId. This matches the EDL
        // executor's dedup logic so both systems can see each other's work
        // even when their frame references differ (EDL uses decision.frame,
        // Director uses boundaryFrame). See pipeline_investigations.md
        // 2026-04-18 (Dual transition regression) for the failure case.
        const boundaryFrame = clipA.from + clipA.durationInFrames;
        const existingTrans = overlays.find(o => {
          if (o.type !== 'transition' && !(o as any).metadata?.isTransition) return false;
          if ((o as any).clipAId === clipA.id && (o as any).clipBId === clipB.id) return true;
          if ((o as any).clipAId == null || (o as any).clipBId == null) {
            return Math.abs(o.from - boundaryFrame) < 30;
          }
          return false;
        });
        if (existingTrans) continue; // Already has a transition, skip

        // Check storyboard's per-scene transition for the NEXT scene (B).
        // Use clipB's metadata.sceneIndex — NOT the overlay array index (i+1).
        // Overlay index ≠ scene index because montage scenes produce multiple
        // sub-shot overlays. E.g. 6 scenes with 4 sub-shots each = 24 overlays
        // but only 6 scene indices. Using i+1 looked up sceneIndex 7+ which
        // doesn't exist → fell to profile default instead of script transition.
        const clipBSceneIndex = (clipB as any).metadata?.sceneIndex;
        const clipASceneIndex = (clipA as any).metadata?.sceneIndex;

        // ── KB M-002: Montage transition consistency ──────────────────
        // Same scene (montage sub-shots) → hard-cut, no overlay.
        // Montage entry/exit → dissolve or dip-to-black.
        // Different non-montage scenes → script transition or profile default.
        const sameScene = clipASceneIndex !== undefined
          && clipBSceneIndex !== undefined
          && clipASceneIndex === clipBSceneIndex;

        if (sameScene) {
          console.log(`[Director] add_transition: boundary ${i}→${i+1}: same scene ${clipASceneIndex}, hard-cut per KB M-002`);
          continue;
        }

        // Different scenes — look up both for montage detection
        const sceneAData = clipASceneIndex !== undefined
          ? storyboardScenes.find((s: any) => s.sceneIndex === clipASceneIndex)
          : undefined;
        const sceneBData = clipBSceneIndex !== undefined
          ? storyboardScenes.find((s: any) => s.sceneIndex === clipBSceneIndex)
          : undefined;

        const sceneAType = sceneAData?.sceneType || (clipA as any).metadata?.sceneType || 'continuous';
        const sceneBType = sceneBData?.sceneType || (clipB as any).metadata?.sceneType || 'continuous';
        const isMontageEdge = sceneAType === 'montage' || sceneBType === 'montage';

        // Use clipB's scene transition (entering that scene)
        let sceneTransType = sceneBData?.editDirections?.transition?.type;
        let sceneTransDuration = sceneBData?.editDirections?.transition?.durationMs;

        // Skip if script says "hard-cut" — no transition overlay needed
        if (sceneTransType === 'hard-cut' || sceneTransType === 'none') {
          console.log(`[Director] add_transition: boundary ${i}→${i+1}: script says ${sceneTransType}, skipping`);
          continue;
        }

        // KB M-002: montage entry/exit defaults to dissolve
        // KB T-022 (WEIGHT 10 override): NEVER dip-to-black in montage sequences
        let effectiveType: string;
        let effectiveDuration: number;
        if (isMontageEdge) {
          const montageTransType = sceneTransType || 'dissolve';
          // T-022 hard override: dip-to-black kills montage momentum → force dissolve
          effectiveType = montageTransType === 'dip-to-black' ? 'dissolve' : montageTransType;
          effectiveDuration = sceneTransDuration || 600;
          console.log(`[Director] add_transition: boundary ${i}→${i+1}: montage edge (${sceneAType}→${sceneBType}), ${effectiveType} per KB M-002/T-022`);
        } else {
          // Priority: script transition > continuity recommendation > profile default
          const pairAnalysis = scenePairAnalysis.find(
            p => p.sceneA === clipASceneIndex && p.sceneB === clipBSceneIndex
          );
          if (sceneTransType) {
            effectiveType = sceneTransType;
            effectiveDuration = sceneTransDuration || action.params.durationMs || 500;
          } else if (pairAnalysis) {
            let contType = pairAnalysis.recommendedTransition;
            // KB T-012 (WEIGHT 9): NEVER dissolve between contrasting moods.
            // soft-cut IS a dissolve variant. If energy match is low (<0.4),
            // moods are contrasting → force hard-cut instead of soft-cut/dissolve.
            const contrastingMoods = pairAnalysis.score.energyMatch !== undefined
              && pairAnalysis.score.energyMatch < 0.4;
            if (contrastingMoods && (contType === 'soft-cut' || contType === 'dissolve')) {
              contType = 'hard-cut';
              console.log(`[Director] add_transition: boundary ${i}→${i+1}: T-012 override, contrasting moods → hard-cut`);
            }
            effectiveType = contType;
            effectiveDuration = action.params.durationMs || 500;
            console.log(`[Director] add_transition: boundary ${i}→${i+1}: continuity-informed ${effectiveType} (score=${pairAnalysis.score.overall.toFixed(2)})`);
          } else {
            effectiveType = transType;
            effectiveDuration = action.params.durationMs || 500;
          }
        }

        try {
          // Target ONE specific pair (clipA → adjacent next clip, which is clipB).
          //
          // Passing `afterOverlayId` routes the add_transition tool to its
          // single-pair branch at tools.ts:3857-3864, which calls
          // `applyBetween(videoOverlays[targetIdx], videoOverlays[targetIdx+1])`
          // exactly once.
          //
          // ⚠️ DO NOT replace with `clipAId`/`clipBId` — those fields do NOT
          // exist in `addTransitionSchema` (tools.ts:3732-3744). Zod silently
          // strips them. The tool then sees no afterOverlayId and no
          // applyToAll flag, and at tools.ts:3852 falls through to the
          // applyToAll loop — iterating EVERY pair and, for each, running
          // the delete-existing logic at tools.ts:3802-3808 that obliterates
          // pre-existing EDL transitions on OTHER pairs.
          //
          // Witnessed regression 2026-04-19 in proj_L7c43ghg7Rt3:
          // EDL placed 5 transitions (dissolve, film-burn, dip-to-white,
          // 2 dissolves); Director identified 5 gap boundaries and called
          // add_transition 5 times intending to fill only those gaps; each
          // call silently ran applyToAll and left the project with 10 dissolves
          // (all 5 EDL styles wiped). proj_3jE3Q8mx5fB5 was "fine" only
          // because its EDL saturated all 10 boundaries — Director's gap
          // check broke out of this loop before ever invoking the tool.
          //
          // See pipeline_investigations.md entry 2026-04-19 for the full
          // investigation and the confirmed single-caller blast radius
          // (Director-layer params are the only broken call site; profile
          // action params with `applyToAll: true` and UI panel calls are
          // correct).
          const singleTransAction = {
            ...action,
            params: {
              type: effectiveType,
              durationMs: effectiveDuration,
              afterOverlayId: clipA.id,
            },
          };
          const result = await invokeAITool(singleTransAction, userId, projectId, profile, overlays);
          transModified += result;
          // Push marker to in-memory overlays so the dedup check at line 821 sees
          // transitions added by PREVIOUS iterations of this loop. invokeAITool
          // writes to MongoDB but doesn't update the in-memory array — without this
          // marker, subsequent iterations create duplicates at adjacent boundaries.
          //
          // ⚠️ IN-MEMORY ONLY — must NOT reach MongoDB. The `inMemoryMarker: true`
          // flag is the signal for the step-4 save to strip these before persist.
          // Witnessed regression: proj_3ETiKQF69nRd had 3 ghost transitions (no
          // source, no transitionStyle) at frames 250/404/678 because step-4
          // `saveProject(overlays)` persisted the in-memory array including these
          // markers. See pipeline_investigations.md 2026-04-18 "Dual transition
          // system regression (A3.5.1/A3.5.2 returned)".
          if (result > 0) {
            const transDurFrames = Math.max(1, Math.round((effectiveDuration / 1000) * 30));
            overlays.push({
              id: Date.now() + i,
              type: 'transition',
              from: boundaryFrame - Math.floor(transDurFrames / 2),
              durationInFrames: transDurFrames,
              row: ROW.VIDEO,
              metadata: { isTransition: true, inMemoryMarker: true },
            } as any);
          }
          console.log(`[Director] add_transition: ${i}→${i+1}: ${effectiveType} (${sceneTransType ? 'script' : 'profile default'})`);
        } catch (err: any) {
          console.warn(`[Director] add_transition: boundary ${i}→${i+1} failed: ${err.message}`);
        }
      }
      modified = transModified;
      break;
    }

    case 'add_motion_graphic':
    case 'generate_html_scene': {
      // Invoke the actual tool via createTools — these are fully functional
      modified = await invokeAITool(action, userId, projectId, profile, overlays);
      break;
    }

    case 'quality_review': {
      // Run deterministic quality checks (zero AI cost)
      try {
        const { runQualityReview } = await import('@/lib/editron/services/quality-review-service');
        const fps = 30; // Standard
        const report = runQualityReview(overlays, fps, undefined, undefined, constraintViolations, genreParams);
        console.log(`[Director] Quality review: score=${report.overallScore}/100, issues=${report.issues.length}`);
        if (report.issues.length > 0) {
          const criticalCount = report.issues.filter(i => i.severity === 'critical').length;
          const warnCount = report.issues.filter(i => i.severity === 'warning').length;
          console.log(`[Director] Quality: ${criticalCount} critical, ${warnCount} warnings, ${report.autoFixable.length} auto-fixable`);
        }
        if (report.suggestions.length > 0) {
          report.suggestions.forEach(s => console.log(`[Director] Suggestion: ${s}`));
        }

        // Persist quality review to project doc — consumed by bandit reward feedback
        // (video-analysis worker Step 7.1 reads qualityReview.overallScore)
        try {
          const qrDb = await (await import('@/lib/editron/db/mongodb')).getDatabase();
          await qrDb.collection('projects').updateOne(
            { projectId },
            {
              $set: {
                qualityReview: {
                  overallScore: report.overallScore,
                  issueCount: report.issues.length,
                  criticalCount: report.issues.filter(i => i.severity === 'critical').length,
                  reviewedAt: new Date(),
                },
              },
            },
          );
        } catch {
          // Non-fatal — quality review storage is best-effort
        }
      } catch (qrErr: any) {
        console.error(`[Director] Quality review failed: ${qrErr.message}`);
      }
      break;
    }

    default:
      console.warn(`[Director] Unknown tool: ${action.tool}`);
      break;
  }

  return modified;
}

// ─── AI Tool Invocation ──────────────────────────────────────────
// Calls functional LangChain tools from tools.ts directly with profile params.
// Each tool handles its own project loading/saving.

async function invokeAITool(
  action: EditProfileAction,
  userId: string,
  projectId: string,
  profile: EditProfile,
  overlays: any[],
): Promise<number> {
  const { createTools } = await import('@/lib/editron/agent/tools');
  const tools = createTools(userId, projectId);

  // Find the matching tool by name
  const toolName = action.tool;
  const tool: any = tools.find((t: any) => t.name === toolName);
  if (!tool) {
    console.warn(`[Director] Tool not found: ${toolName}`);
    return 0;
  }

  // Build params from profile + action params
  const params: Record<string, any> = { ...action.params };

  // Tool-specific param mapping from profile
  switch (toolName) {
    case 'add_captions': {
      // GUARD: If finalize already created captions WITH CONTENT, don't duplicate them.
      // Finalize creates basic captions from narration text. Director's job is to
      // ENHANCE existing captions (styling, emphasis), not create duplicates.
      // BUT: finalize sometimes creates empty placeholder captions (captions: [] or
      // no words). In that case, let Director replace them with real captions.
      const existingCaptions = overlays.filter(o => o.type === 'caption');
      const populatedCaptions = existingCaptions.filter(o =>
        (o as any).captions?.length > 0 || (o as any).content?.length > 10
      );
      if (populatedCaptions.length > 0) {
        console.log(`[Director] add_captions: ${populatedCaptions.length} populated captions already exist (from finalize). Skipping to avoid duplicates.`);
        return 0;
      }
      // Remove empty placeholder captions so Director can create real ones
      if (existingCaptions.length > 0 && populatedCaptions.length === 0) {
        console.log(`[Director] add_captions: ${existingCaptions.length} empty caption placeholders found — removing so Director can create real captions`);
        for (let i = overlays.length - 1; i >= 0; i--) {
          if (overlays[i].type === 'caption') overlays.splice(i, 1);
        }
      }

      // Caption ALL video overlays sequentially
      const videoOverlays = overlays.filter(o => o.type === 'video');
      if (videoOverlays.length === 0) {
        console.log(`[Director] add_captions: no video overlays found, skipping`);
        return 0;
      }
      // Caption style: already computed by executeAction from signals (if Path D active)
      // or from profile mapping. params.style is set upstream. Map any remaining invalid values.
      const CAPTION_STYLE_MAP: Record<string, string> = {
        'creator': 'bold', 'fancy': 'bold', 'word-by-word': 'bold',
        'kinetic': 'bold', 'none': 'subtitle',
      };
      const rawCaptionStyle = params.style || profile.captionStyle || 'subtitle';
      const captionStyle = CAPTION_STYLE_MAP[rawCaptionStyle] || rawCaptionStyle;

      // ── Mode 2 FIX: Seed transcription cache from rawFootageAnalysis ──
      // In Mode 2, Grok STT transcription is stored on the PROJECT doc
      // (rawFootageAnalysis.transcription) but the add_captions tool looks for
      // it in MEDIA_ASSETS (per-asset cache). Without seeding, the tool tries
      // on-demand re-transcription of the full video → times out on long videos.
      // Fix: copy the existing transcription to the asset's cache before captioning.
      try {
        const captionDb = await (await import('@/lib/editron/db/mongodb')).getDatabase();
        const projDoc = await captionDb.collection('projects').findOne(
          { projectId },
          { projection: { 'rawFootageAnalysis.transcription': 1 } },
        );
        const rfaTranscription = projDoc?.rawFootageAnalysis?.transcription;
        if (rfaTranscription?.words?.length > 0) {
          const videoAssetIds = [...new Set(videoOverlays.map((v: any) => v.assetId).filter(Boolean))];
          for (const vid of videoAssetIds) {
            const existing = await captionDb.collection('media_assets').findOne(
              { assetId: vid },
              { projection: { 'transcription.words': { $slice: 1 } } },
            );
            if (!existing?.transcription?.words?.length) {
              await captionDb.collection('media_assets').updateOne(
                { assetId: vid },
                { $set: { transcription: rfaTranscription } },
              );
              console.log(`[Director] add_captions: seeded transcription cache for ${vid} from rawFootageAnalysis (${rfaTranscription.words.length} words)`);
            } else {
              console.log(`[Director] add_captions: transcription already cached for ${vid}`);
            }
          }
        }
      } catch (seedErr: any) {
        console.warn(`[Director] add_captions: transcription seed failed (non-fatal): ${seedErr.message}`);
      }

      // Pre-warm transcription cache for voiceover assets (Mode 1 path).
      // In Mode 2, there are no voiceover overlays — this block is a no-op.
      try {
        const { getTranscription } = await import('@/lib/editron/services/media/transcription-service');
        const voiceoverOverlays = overlays.filter(o =>
          o.type === 'sound' && ((o.assetId || '').startsWith('voiceover_') || o.row === ROW.VOICEOVER)
        );
        if (voiceoverOverlays.length > 0) {
          console.log(`[Director] add_captions: pre-warming transcriptions for ${voiceoverOverlays.length} voiceovers`);
          for (const vo of voiceoverOverlays) {
            if (!vo.assetId) continue;
            try {
              await getTranscription(vo.assetId, userId);
              console.log(`[Director] add_captions: transcription ready for ${vo.assetId}`);
            } catch (tErr: any) {
              console.warn(`[Director] add_captions: transcription warm-up failed for ${vo.assetId}: ${tErr.message}`);
            }
          }
        }
      } catch (warmErr: any) {
        console.warn(`[Director] add_captions: transcription warm-up error: ${warmErr.message}`);
      }
      console.log(`[Director] add_captions: ${videoOverlays.length} videos, style=${captionStyle}`);

      // Caption each video sequentially — tool.invoke handles transcription + caption creation.
      // Track which voiceover assetIds already produced captions → prevent duplicates.
      // Without this, 3 videos overlapping the same VO → 3 identical caption blocks.
      let captionCount = 0;
      const captionedVoiceoverIds = new Set<string>();
      for (const vo of videoOverlays) {
        try {
          // Dedup: check if this video's overlapping voiceover was already captioned
          const voFrom = vo.from;
          const voEnd = voFrom + (vo.durationInFrames || 0);
          const overlappingVO = overlays.find((o: any) => {
            if (o.type !== 'sound') return false;
            const isVO = o.row === ROW.VOICEOVER || (o.assetId || '').startsWith('voiceover_');
            if (!isVO) return false;
            const oEnd = o.from + (o.durationInFrames || 0);
            return !(oEnd <= voFrom || o.from >= voEnd);
          });
          if (overlappingVO?.assetId && captionedVoiceoverIds.has(overlappingVO.assetId)) {
            console.log(`[Director] add_captions: video ${vo.id} skipped — voiceover ${overlappingVO.assetId} already captioned`);
            continue;
          }

          const captionParams = { videoOverlayId: vo.id, style: captionStyle, position: 'bottom', overwrite: true };
          console.log(`[Director] add_captions: video ${vo.id} (${captionCount + 1}/${videoOverlays.length}), type=${vo.type}, assetId=${vo.assetId}, from=${vo.from}`);
          const resultStr = await tool.invoke(captionParams);
          const result = JSON.parse(resultStr);
          if (result.status === 'success') {
            captionCount++;
            // Mark VO as captioned → prevent duplicate captions from other videos overlapping same VO
            if (overlappingVO?.assetId) captionedVoiceoverIds.add(overlappingVO.assetId);
            console.log(`[Director] add_captions: video ${vo.id} SUCCESS — ${result.captionCount || 0} segments, row=${result.row || '?'}`);
          } else if (result.status === 'skipped') {
            // Expected: AI-gen video with no voiceover in range — not an error
            console.log(`[Director] add_captions: video ${vo.id} skipped — ${result.message || 'no voiceover overlap'}`);
          } else {
            console.error(`[Director] add_captions: video ${vo.id} FAILED — ${result.message || JSON.stringify(result)}`);
          }
        } catch (err: any) {
          console.error(`[Director] add_captions: video ${vo.id} EXCEPTION — ${err.message}\n${err.stack?.split('\n').slice(0, 3).join('\n')}`);
        }
      }
      console.log(`[Director] add_captions: ${captionCount}/${videoOverlays.length} videos captioned`);
      return captionCount;
    }
    case 'add_fancy_captions': {
      const videoOverlays = overlays.filter(o => o.type === 'video');
      if (videoOverlays.length === 0) return 0;
      // Map profile caption styles to valid fancy_captions enum values
      // Valid: bento | scattered | minimal | static | kinetic
      const FANCY_STYLE_MAP: Record<string, string> = {
        'creator': 'kinetic', 'word-by-word': 'kinetic', 'fancy': 'kinetic',
        'hormozi': 'bento', 'mrbeast': 'scattered', 'corporate': 'minimal',
      };
      const rawStyle = params.style || 'kinetic';
      const fancyStyle = FANCY_STYLE_MAP[rawStyle] || rawStyle;
      console.log(`[Director] add_fancy_captions: ${videoOverlays.length} videos, style=${fancyStyle}${rawStyle !== fancyStyle ? ` (mapped from "${rawStyle}")` : ''}`);

      let fancyCaptionCount = 0;
      for (const vo of videoOverlays) {
        try {
          const fancyParams = { videoOverlayId: vo.id, style: fancyStyle, intensity: params.intensity || 'medium', overwrite: true };
          console.log(`[Director] add_fancy_captions: video ${vo.id} (${fancyCaptionCount + 1}/${videoOverlays.length})`);
          const resultStr = await tool.invoke(fancyParams);
          const result = JSON.parse(resultStr);
          if (result.status === 'success') fancyCaptionCount++;
          else console.warn(`[Director] add_fancy_captions video ${vo.id}: ${result.error?.message}`);
        } catch (err: any) {
          console.warn(`[Director] add_fancy_captions failed for video ${vo.id}: ${err.message}`);
        }
      }
      return fancyCaptionCount;
    }
    case 'sync_cuts_to_beats': {
      // Find audio (BGM) and video overlays
      const bgmOverlay = overlays.find(o => o.type === 'sound' && o.row === ROW.BGM);
      const videoOverlay = overlays.find(o => o.type === 'video');
      if (!bgmOverlay || !videoOverlay) {
        console.log(`[Director] sync_cuts_to_beats: missing BGM or video overlay`);
        return 0;
      }
      params.audioOverlayId = params.audioOverlayId || bgmOverlay.id;
      params.videoOverlayId = params.videoOverlayId || videoOverlay.id;
      params.beatFilter = params.beatFilter || 'downbeats';
      break;
    }
    case 'add_motion_graphic': {
      // Template search uses description to match against template tags/names.
      // Templates are named: "Clean Minimal Lower Third", "Stat Counter", "Subscribe Button" etc.
      // Description must match template vocabulary, not be generic filler.
      params.category = params.category || 'lower-third';
      params.start = params.start || 0;
      params.duration = params.duration || 90;
      params.row = params.row || 1;

      // Map category to template-searchable descriptions
      const CATEGORY_DESCRIPTIONS: Record<string, string> = {
        'lower-third': 'clean lower third with name and title',
        'lower_third': 'clean lower third with name and title',
        'callout': 'callout box with accent',
        'title-card': 'title card centered',
        'title_card': 'title card centered',
        'stat-counter': 'animated stat counter',
        'stat_counter': 'animated stat counter',
        'subscribe': 'subscribe button animated',
        'quote': 'quote card',
        'list': 'step by step list',
        'comparison': 'comparison layout',
        'notification': 'notification popup',
      };
      const categoryDesc = CATEGORY_DESCRIPTIONS[params.category] || 'lower third';
      params.description = params.description && params.description.length > 10
        ? params.description
        : categoryDesc;

      // Dedup: skip if EDL or another system already placed a graphic at this frame.
      // Without this, EDL creates a graphic and then Director's profile action creates
      // a duplicate at the same position.
      const existingAtFrame = overlays.find((o: any) =>
        (o.type === 'html-scene' || o.type === 'sticker') &&
        Math.abs(o.from - (params.start || 0)) <= 30 // within 1 second
      );
      if (existingAtFrame) {
        console.log(`[Director] add_motion_graphic: SKIPPED — existing graphic at frame ${existingAtFrame.from} (within 30 frames of ${params.start})`);
        return 0;
      }

      console.log(`[Director] add_motion_graphic: category="${params.category}", desc="${(params.description as string).substring(0, 60)}" at frame ${params.start}`);
      break;
    }
    case 'generate_html_scene': {
      params.start = params.start || 0;
      params.duration = params.duration || 90;
      params.row = params.row || 1;

      // Validate description quality — reject placeholder/filler text.
      // The description drives Gemini HTML generation: garbage in = garbage out.
      // A motion designer given "minimal text here" would ask for clarification.
      const rawDesc = (params.description || '').trim();
      const PLACEHOLDER_PATTERNS = /^(minimal|sample|placeholder|default|test|example|some|basic|simple)\b.{0,20}$/i;
      const isPlaceholder = !rawDesc || rawDesc.length < 20 || PLACEHOLDER_PATTERNS.test(rawDesc);

      if (isPlaceholder) {
        // Enrich with profile context instead of passing garbage to Gemini
        const category = profile.category || 'general';
        const density = profile.graphicsDensity || 'moderate';
        const style = density === 'heavy' ? 'bold animated'
          : density === 'moderate' ? 'clean professional'
          : 'minimal elegant';
        const contextualDesc = rawDesc && rawDesc.length >= 10
          ? `${style} ${rawDesc} for ${category} content`
          : `${style} title card with subtle gradient animation for ${category} video`;
        params.description = contextualDesc;
        console.warn(`[Director] generate_html_scene: description too vague ("${rawDesc.substring(0, 30)}") — enriched to: "${contextualDesc.substring(0, 60)}"`);
      } else {
        params.description = rawDesc;
      }
      break;
    }
  }

  console.log(`[Director] Invoking tool: ${toolName} with params:`, Object.keys(params).join(', '));

  try {
    const resultStr = await tool.invoke(params);
    const result = JSON.parse(resultStr);

    if (result.status === 'success') {
      console.log(`[Director] Tool ${toolName} succeeded`);
      return result.data?.overlaysModified || result.data?.overlaysCreated || 1;
    } else {
      console.error(`[Director] Tool ${toolName} failed: ${result.error?.message}`);
      return 0;
    }
  } catch (err: any) {
    console.error(`[Director] Tool ${toolName} threw: ${err.message}`);
    throw err; // Let the outer handler decide (skip/abort/warn)
  }
}

// ─── Condition Checker ───────────────────────────────────────────

function checkCondition(condition: string | undefined, overlays: any[], projectDoc?: any): boolean {
  if (!condition) return true;

  // Mode 2: raw footage has speech IN the video, not as separate voiceover overlay
  const isRawFootage = !!(projectDoc?.rawFootageAnalysis?.segments?.length > 0);

  switch (condition) {
    case 'hasVideoOverlays':
      return overlays.some(o => o.type === 'video');
    case 'hasSpeech':
    case 'hasVoiceover':
      // Mode 2: video itself contains speech — treat as having voiceover
      if (isRawFootage) return true;
      return overlays.some(o => o.type === 'sound' && (o.row === ROW.VOICEOVER || (o.assetId || '').startsWith('voiceover_')));
    case 'hasMultipleScenes':
      // Mode 2: transcript segments count as multiple scenes even with 1 video clip
      if (isRawFootage && (projectDoc.rawFootageAnalysis.segments.length > 1)) return true;
      return overlays.filter(o => o.type === 'image' || o.type === 'video').length > 1;
    case 'hasBGM':
      return overlays.some(o => o.type === 'sound' && (o.row === ROW.BGM || (o.assetId || '').startsWith('bgm_')));
    default:
      return true;
  }
}

// ─── Brief Override Application ──────────────────────────────────

function applyBriefOverrides(profile: EditProfile, brief?: ProjectBrief): EditProfile {
  if (!brief?.overrides) return profile;

  return {
    ...profile,
    filterPresetId: brief.overrides.filterPresetId ?? profile.filterPresetId,
    pacing: brief.overrides.pacing ?? profile.pacing,
    captionStyle: brief.overrides.captionStyle ?? profile.captionStyle,
    bgmDuckLevel: brief.overrides.bgmDuckLevel ?? profile.bgmDuckLevel,
    graphicsDensity: brief.overrides.graphicsDensity ?? profile.graphicsDensity,
    defaultTransition: brief.overrides.defaultTransition ?? profile.defaultTransition,
  };
}

// ─── Transition Dedup Safety Net (B3) ────────────────────────────
//
// Post-composition sweep that guarantees at most ONE transition per (clipAId,
// clipBId) pair in the project, regardless of which code path produced them.
// Runs at the end of the profile action loop, BEFORE step 3.5 (beat-sync) and
// step 3.6 (SFX placer) — so those downstream steps see a clean set.
//
// WHY THIS EXISTS
// Root Cause B of the dual-transition regression (pipeline_investigations.md
// 2026-04-18): the EDL executor and the Director's add_transition tool each
// have their own dedup check, but they use different reference frames to
// measure proximity. When the numbers drift, one system doesn't see the
// other's work. The per-site B1 fixes (clip-pair identity in both dedup
// checks) prevent most cases. THIS function is the safety net that also
// catches:
//   - Future code paths that add transitions without going through the
//     checked sites
//   - Pre-existing project state from before the B1 fixes landed
//   - Legacy overlays without clipAId/clipBId (treated as ghosts)
//
// PRIORITY ORDER (higher = keep)
//   edl                       100  — LLM creative intent, authoritative
//   tool                       80  — Director/AI-chat add_transition tool
//   unknown with transitionStyle 10 — something legitimate we don't recognize
//   ghost (inMemoryMarker OR no source AND no style)  -1 — always lose
//
// INVARIANTS
//   - Only operates on overlays where type === 'transition' OR
//     metadata.isTransition is true. All other overlays pass through untouched.
//   - Stable sort within a group: ties broken by original array index (first
//     wins), so behavior is deterministic across runs.
//   - Mutates the overlays array in place via length=0 + push, matching the
//     convention used by split_clips at line ~797.
//   - Idempotent: running twice on the same clean array removes nothing.
//   - Returns counts for logging and result.overlaysModified tracking.
//
// FAILURE MODES GUARDED AGAINST
//   - clipAId === 0 or '' as valid IDs → use `== null` (catches null+undefined
//     only, not 0 or '').
//   - Ghost transitions without clipAId/clipBId → go to the "unknown pair"
//     bucket and get stripped if they have no source AND no transitionStyle.
//   - A legit transition with no source but a real transitionStyle → kept as
//     last-resort priority 10, not stripped.
//   - Mutation-during-iteration → collect removal indices into a Set first,
//     then filter once.
const TRANSITION_SOURCE_PRIORITY: Record<string, number> = {
  edl: 100,
  tool: 80,
  // 'transition-sfx-placer' produces type:'sound' overlays, not transitions,
  // so it should never appear in this dedup. Included defensively anyway.
  'transition-sfx-placer': 60,
};

function transitionPriority(o: any): number {
  // Tagged in-memory sentinel → always lose (A1 filter should already strip
  // these before save; this is belt-and-suspenders for step-3.5/3.6 consumers).
  if (o?.metadata?.inMemoryMarker) return -1;
  const src = o?.metadata?.source;
  if (src && TRANSITION_SOURCE_PRIORITY[src] !== undefined) {
    return TRANSITION_SOURCE_PRIORITY[src];
  }
  // No recognized source but has a real transitionStyle → legit but unknown
  // (e.g., an external tool added a transition). Keep as last-resort winner.
  if (o?.transitionStyle) return 10;
  // No source, no style → shaped like a ghost. Strip.
  return -1;
}

function dedupTransitionsByClipPair(
  overlays: any[],
): { ghostsStripped: number; duplicatesRemoved: number } {
  if (overlays.length === 0) return { ghostsStripped: 0, duplicatesRemoved: 0 };

  // Collect transition indices with their overlays
  const transitionEntries: Array<{ idx: number; overlay: any }> = [];
  for (let i = 0; i < overlays.length; i++) {
    const o = overlays[i];
    if (o?.type === 'transition' || o?.metadata?.isTransition) {
      transitionEntries.push({ idx: i, overlay: o });
    }
  }
  if (transitionEntries.length === 0) {
    return { ghostsStripped: 0, duplicatesRemoved: 0 };
  }

  // Group by clip-pair identity. Entries missing clipAId/clipBId go to the
  // "unknown pair" bucket for ghost detection.
  const pairGroups = new Map<string, Array<{ idx: number; overlay: any }>>();
  const unknownPair: Array<{ idx: number; overlay: any }> = [];

  for (const entry of transitionEntries) {
    const a = entry.overlay.clipAId;
    const b = entry.overlay.clipBId;
    if (a == null || b == null) {
      unknownPair.push(entry);
    } else {
      const key = `${a}_${b}`;
      const arr = pairGroups.get(key);
      if (arr) arr.push(entry);
      else pairGroups.set(key, [entry]);
    }
  }

  const toRemove = new Set<number>();
  let duplicatesRemoved = 0;
  let ghostsStripped = 0;

  // Per-pair: keep highest-priority winner, remove rest
  for (const [key, members] of pairGroups) {
    if (members.length <= 1) continue;
    // Sort descending by priority; original array index as tiebreaker (stable)
    const sorted = [...members].sort((a, b) => {
      const diff = transitionPriority(b.overlay) - transitionPriority(a.overlay);
      return diff !== 0 ? diff : a.idx - b.idx;
    });
    const winner = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      toRemove.add(sorted[i].idx);
      duplicatesRemoved++;
    }
    const winnerSrc = winner.overlay?.metadata?.source || 'unknown';
    const winnerStyle = winner.overlay?.transitionStyle || 'unknown';
    console.log(
      `[Director] Transition dedup: pair ${key} had ${members.length} entries, ` +
      `kept ${winnerSrc}/${winnerStyle} @ frame ${winner.overlay.from}, ` +
      `removed ${members.length - 1} duplicate(s)`,
    );
  }

  // Unknown-pair bucket: strip ghosts only. Keep legit transitions even
  // without clipIds (e.g., legacy overlays) — those still have a transitionStyle.
  for (const entry of unknownPair) {
    const o = entry.overlay;
    const isGhost = o?.metadata?.inMemoryMarker ||
      (!o?.metadata?.source && !o?.transitionStyle);
    if (isGhost) {
      toRemove.add(entry.idx);
      ghostsStripped++;
    }
  }
  if (ghostsStripped > 0) {
    console.log(`[Director] Transition dedup: stripped ${ghostsStripped} ghost transition(s) (no source + no transitionStyle)`);
  }

  if (toRemove.size > 0) {
    const kept = overlays.filter((_, idx) => !toRemove.has(idx));
    overlays.length = 0;
    overlays.push(...kept);
  }

  return { ghostsStripped, duplicatesRemoved };
}
