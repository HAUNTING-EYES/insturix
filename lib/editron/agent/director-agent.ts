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
        const projectDoc = await db.collection('projects').findOne({ projectId }) as any;
        const storyboardId = projectDoc?.sourceStoryboardId;
        if (storyboardId) {
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
        }
      } catch (sbErr: any) {
        console.warn(`[Director] Storyboard load failed (non-fatal): ${sbErr.message}`);
      }

      const isAIProject = storyboardScenes.length > 0;

      // ── Per-asset analysis with INDIVIDUAL error isolation ──
      onProgress?.(0, 0, `Analyzing ${videoOverlays.length} video assets (5-track)...`);

      for (let i = 0; i < videoOverlays.length; i++) {
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
          });

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

      // ── Generate Edit Plan — prefer Unified Intelligence, fallback to old EDL ──
      if (analyses.length > 0) {
        try {
          onProgress?.(0, 0, `Generating intelligent edit plan from ${analyses.length} assets + script context...`);

          // Build analyses map BEFORE the intelligence call — needed by both
          // the creative intent translator and the EDL executor.
          const analysesMap = new Map<string, any>();
          for (const a of analyses) {
            if (a.assetId) analysesMap.set(a.assetId, a);
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

            // Layer 1b: LLM generates creative intent (WHAT + WHY, no frame numbers)
            const intentPlan = await generateCreativeIntentPlan(context, {
              editProfileName: effectiveProfile.name,
              targetCutsPerMinute: effectiveProfile.cutsPerMinRange
                ? (effectiveProfile.cutsPerMinRange[0] + effectiveProfile.cutsPerMinRange[1]) / 2
                : 6,
              graphicDensity: effectiveProfile.graphicsDensity || 'moderate',
              assetBriefings: briefingsForPrompt,
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
          const edlResult = await executeEDL(edl, projectId, userId, overlays, canvas, analysesMap);

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
      } else {
        // C6 FIX: Zero assets analyzed — skip EDL but STILL run profile-based steps
        // (filters, transitions, captions, motion graphics). Don't skip the entire
        // intelligence block — profile actions are rule-based and don't need analyses.
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
      .filter(action => checkCondition(action.condition, overlays))
      .sort((a, b) => a.order - b.order);

    // ─── Step 2.5: Continuity analysis (pure, zero-cost) ─────
    // Scores adjacent scene pairs to inform transition selection.
    // Priority: script transition > KB M-002 > continuity > profile default.
    let scenePairAnalysis: Array<{ sceneA: number; sceneB: number; score: { overall: number; visualSimilarity: number; energyMatch?: number }; recommendedTransition: string; flagForReview: boolean }> = [];
    const videoOverlaysForContinuity = overlays.filter((o: any) => o.type === 'video').sort((a: any, b: any) => a.from - b.from);
    if (videoOverlaysForContinuity.length > 1 && storyboardScenes.length > 0) {
      try {
        const { analyzeAllScenePairs } = await import('@/lib/editron/services/continuity-service');
        const scenesForContinuity = videoOverlaysForContinuity.map((vo: any, idx: number) => {
          const sbScene = storyboardScenes.find((s: any) => s.sceneIndex === (vo.metadata?.sceneIndex ?? idx));
          return {
            sceneIndex: vo.metadata?.sceneIndex ?? idx,
            visualDescription: sbScene?.visualDescription || '',
            mood: sbScene?.mood || 'neutral',
            colorPalette: [] as string[],
            durationSeconds: (vo.durationInFrames || 150) / 30,
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

    const totalSteps = actions.length;
    onProgress?.(0, totalSteps, 'Starting Director Agent execution...');

    // ─── Step 3: Execute actions sequentially ────────────────
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      onProgress?.(i + 1, totalSteps, action.description);

      try {
        const modified = await executeAction(action, overlays, userId, projectId, effectiveProfile, storyboardScenes, scenePairAnalysis);
        result.overlaysModified += modified;
        result.actionsExecuted++;

        console.log(`[Director] Action ${i + 1}/${totalSteps}: ${action.description} — ${modified} overlays modified`);
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
      (o: any) => !o?.metadata?.inMemoryMarker,
    );
    const strippedCount = overlays.length - persistableOverlays.length;
    if (strippedCount > 0) {
      console.log(`[Director] Stripped ${strippedCount} in-memory dedup marker(s) before save`);
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
  } catch (err: any) {
    result.warnings.push(`Director Agent failed: ${err.message}`);
    console.error('[Director] Execution failed:', err.message);
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

      // Get transition type from params or profile default
      let transType: string = action.params.type || profile.defaultTransition || 'soft-cut';

      // 'hard-cut' means no transition overlay — skip entirely
      if (transType === 'hard-cut' || transType === 'none') {
        console.log('[Director] add_transition: hard-cut = no transition needed, skipping');
        break;
      }

      // Validate against the enum the tool accepts
      const validTypes = ['dissolve', 'dip-to-black', 'dip-to-white', 'soft-cut', 'zoom-punch', 'whip-pan', 'glitch',
        'match-cut', 'cutaway', 'smash-cut', 'iris', 'film-burn', 'light-leak', 'slide-left', 'slide-right',
        'slide-up', 'slide-down', 'morph', 'pixelate', 'blur-transition', 'color-flash'];
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
            const transDurFrames = Math.round((effectiveDuration / 1000) * 30);
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
        const report = runQualityReview(overlays, fps);
        console.log(`[Director] Quality review: score=${report.overallScore}/100, issues=${report.issues.length}`);
        if (report.issues.length > 0) {
          const criticalCount = report.issues.filter(i => i.severity === 'critical').length;
          const warnCount = report.issues.filter(i => i.severity === 'warning').length;
          console.log(`[Director] Quality: ${criticalCount} critical, ${warnCount} warnings, ${report.autoFixable.length} auto-fixable`);
        }
        if (report.suggestions.length > 0) {
          report.suggestions.forEach(s => console.log(`[Director] Suggestion: ${s}`));
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
      // GUARD: If finalize already created captions, don't duplicate them.
      // Finalize creates basic captions from narration text. Director's job is to
      // ENHANCE existing captions (styling, emphasis), not create duplicates.
      const existingCaptions = overlays.filter(o => o.type === 'caption');
      if (existingCaptions.length > 0) {
        console.log(`[Director] add_captions: ${existingCaptions.length} captions already exist (from finalize). Skipping to avoid duplicates.`);
        return 0;
      }

      // Caption ALL video overlays sequentially
      const videoOverlays = overlays.filter(o => o.type === 'video');
      if (videoOverlays.length === 0) {
        console.log(`[Director] add_captions: no video overlays found, skipping`);
        return 0;
      }
      const captionStyle = params.style || profile.captionStyle || 'subtitle';

      // Pre-warm transcription cache for all voiceover assets.
      // The add_captions tool needs word-level timing from voiceover audio.
      // If transcription isn't cached, the tool will try to generate it on-demand,
      // which can fail due to timeouts. Pre-warming ensures it's ready.
      try {
        const { getTranscription } = await import('@/lib/editron/services/media/transcription-service');
        const voiceoverOverlays = overlays.filter(o =>
          o.type === 'sound' && ((o.assetId || '').startsWith('voiceover_') || o.row === ROW.VOICEOVER)
        );
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
      } catch (warmErr: any) {
        console.warn(`[Director] add_captions: transcription warm-up error: ${warmErr.message}`);
      }
      console.log(`[Director] add_captions: ${videoOverlays.length} videos, style=${captionStyle}`);

      // Caption each video sequentially — tool.invoke handles transcription + caption creation
      let captionCount = 0;
      for (const vo of videoOverlays) {
        try {
          const captionParams = { videoOverlayId: vo.id, style: captionStyle, position: 'bottom', overwrite: true };
          console.log(`[Director] add_captions: video ${vo.id} (${captionCount + 1}/${videoOverlays.length}), type=${vo.type}, assetId=${vo.assetId}, from=${vo.from}`);
          const resultStr = await tool.invoke(captionParams);
          const result = JSON.parse(resultStr);
          if (result.status === 'success') {
            captionCount++;
            console.log(`[Director] add_captions: video ${vo.id} SUCCESS — ${result.captionCount || 0} segments, row=${result.row || '?'}`);
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
      const fancyStyle = params.style || 'kinetic';
      console.log(`[Director] add_fancy_captions: ${videoOverlays.length} videos, style=${fancyStyle}`);

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
      // Use GENERIC template categories that the template matcher can find.
      // The old approach passed narration text which never matched any template.
      // Templates are named: "lower-third", "callout", "title-card", "stat-counter" etc.
      const density = profile.graphicsDensity || 'moderate';

      // Map density to template categories the matcher WILL find
      const templateCategory = density === 'heavy' ? 'title card with animated text'
        : density === 'moderate' ? 'lower third label'
        : 'minimal text label';

      params.category = params.category || 'lower-third';
      params.description = params.description || templateCategory;
      params.start = params.start || 0;
      params.duration = params.duration || 90;
      params.row = params.row || 1;

      console.log(`[Director] add_motion_graphic: category="${params.category}", desc="${(params.description as string).substring(0, 60)}" at frame ${params.start}`);
      break;
    }
    case 'generate_html_scene': {
      params.description = params.description || 'intro title card';
      params.start = params.start || 0;
      params.duration = params.duration || 90;
      params.row = params.row || 1;
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

function checkCondition(condition: string | undefined, overlays: any[]): boolean {
  if (!condition) return true;

  switch (condition) {
    case 'hasVideoOverlays':
      return overlays.some(o => o.type === 'video');
    case 'hasSpeech':
      return overlays.some(o => o.type === 'sound' && (o.row === ROW.VOICEOVER || (o.assetId || '').startsWith('voiceover_')));
    case 'hasVoiceover':
      return overlays.some(o => o.type === 'sound' && (o.row === ROW.VOICEOVER || (o.assetId || '').startsWith('voiceover_')));
    case 'hasMultipleScenes':
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
