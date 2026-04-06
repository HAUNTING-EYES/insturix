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
      const voiceoverOverlays = overlays.filter(o => o.type === 'sound' && o.row === 3).sort((a, b) => a.from - b.from);
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

          // TRY: Unified Intelligence Engine (sees everything — script, video, audio, storyboard)
          let edl: any;
          try {
            const { assembleUnifiedContext, generateUnifiedEditPlan } = await import('@/lib/editron/services/unified-edit-intelligence');
            const context = await assembleUnifiedContext(projectId, userId);
            const plan = await generateUnifiedEditPlan(context, {
              editProfileName: effectiveProfile.name,
              targetCutsPerMinute: effectiveProfile.cutsPerMinRange
                ? (effectiveProfile.cutsPerMinRange[0] + effectiveProfile.cutsPerMinRange[1]) / 2
                : 6,
              graphicDensity: effectiveProfile.graphicsDensity || 'moderate',
            });

            // Convert unified plan to EDL format for backward compatibility with executeEDL
            edl = {
              projectId,
              generatedAt: plan.generatedAt,
              totalDecisions: plan.stats.totalDecisions,
              decisions: plan.decisions.map(d => ({
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
              stats: plan.stats,
            };

            edlSummary.totalDecisions = plan.stats.totalDecisions;
            console.log(`[Director] Unified Intelligence: ${plan.stats.totalDecisions} decisions (avg confidence ${plan.stats.averageConfidence.toFixed(2)})`);
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
          // Build analyses map for EDL executor zoom validation
          const analysesMap = new Map<string, any>();
          for (const a of analyses) {
            if (a.assetId) analysesMap.set(a.assetId, a);
          }
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

    const totalSteps = actions.length;
    onProgress?.(0, totalSteps, 'Starting Director Agent execution...');

    // ─── Step 3: Execute actions sequentially ────────────────
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      onProgress?.(i + 1, totalSteps, action.description);

      try {
        const modified = await executeAction(action, overlays, userId, projectId, effectiveProfile, storyboardScenes);
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
    }

    await projectService.saveProject(userId, projectId, {
      overlays,
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

      const targetTypes = action.params.targetTypes || ['image', 'video'];
      let skippedScriptFilter = 0;
      for (const overlay of overlays) {
        if (targetTypes.includes(overlay.type)) {
          if ((overlay as any).styles?.filter) {
            // Script already set a filter via edit-direction-applier — respect it
            skippedScriptFilter++;
            continue;
          }
          overlay.styles = { ...overlay.styles, filter: preset.filter };
          modified++;
        }
      }
      if (skippedScriptFilter > 0) {
        console.log(`[Director] batch_update_overlays: applied filter to ${modified}, skipped ${skippedScriptFilter} (script-set filter preserved)`);
      }
      break;
    }

    case 'audio_ducking': {
      // Configure ducking on BGM overlays (row 1)
      for (const overlay of overlays) {
        if (overlay.type === 'sound' && overlay.row === 1) {
          overlay.styles = {
            ...overlay.styles,
            duckingConfig: {
              enabled: true,
              duckLevel: action.params.duckLevel ?? 0.20,
              rampDownMs: action.params.rampDownMs ?? 300,
              rampUpMs: action.params.rampUpMs ?? 600,
              lookAheadMs: action.params.lookAheadMs ?? 200,
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
      // Detect transitions by: metadata tag OR html-scene on row 1 (transition layer)
      const existingTransitions = overlays.filter(
        o => o.type === 'html-scene' && (o.row === 1 || (o as any).metadata?.isTransition),
      );

      if (existingTransitions.length > 0) {
        console.log(`[Director] add_transition: ${existingTransitions.length} script transitions already exist, respecting user's script intent`);
        // Check if there are gaps (scenes without transitions between them)
        const videoOverlays = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
        const transitionFrames = new Set(existingTransitions.map(t => t.from));
        let gapCount = 0;
        for (let i = 0; i < videoOverlays.length - 1; i++) {
          const boundaryFrame = videoOverlays[i].from + videoOverlays[i].durationInFrames;
          // Check if any transition exists near this boundary (±15 frames)
          const hasTransition = existingTransitions.some(
            t => Math.abs(t.from - boundaryFrame) < 30 || Math.abs((t.from + t.durationInFrames) - boundaryFrame) < 30,
          );
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

        // Check if a transition already exists near this boundary
        const boundaryFrame = clipA.from + clipA.durationInFrames;
        const existingTrans = overlays.find(o =>
          (o.type === 'transition' || (o as any).metadata?.isTransition) &&
          Math.abs(o.from - boundaryFrame) < 30
        );
        if (existingTrans) continue; // Already has a transition, skip

        // Check storyboard's per-scene transition for the NEXT scene (B)
        const sceneData = storyboardScenes.find((s: any) => {
          // Match by approximate frame position (scenes may not align perfectly)
          return s.sceneIndex === i + 1 || (s.editDirections?.transition);
        });
        let sceneTransType = sceneData?.editDirections?.transition?.type;
        let sceneTransDuration = sceneData?.editDirections?.transition?.durationMs;

        // Skip if script says "hard-cut" — no transition overlay needed
        if (sceneTransType === 'hard-cut' || sceneTransType === 'none') {
          console.log(`[Director] add_transition: boundary ${i}→${i+1}: script says ${sceneTransType}, skipping`);
          continue;
        }

        // Use script transition, fall back to profile default
        const effectiveType = sceneTransType || transType;
        const effectiveDuration = sceneTransDuration || action.params.durationMs || 500;

        try {
          const singleTransAction = {
            ...action,
            params: {
              type: effectiveType,
              durationMs: effectiveDuration,
              clipAId: clipA.id,
              clipBId: clipB.id,
            },
          };
          const result = await invokeAITool(singleTransAction, userId, projectId, profile, overlays);
          transModified += result;
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
          o.type === 'sound' && ((o.assetId || '').startsWith('voiceover_') || o.row === 3)
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
      const bgmOverlay = overlays.find(o => o.type === 'sound' && o.row === 1);
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
      return overlays.some(o => o.type === 'sound' && (o.row === 3 || (o.assetId || '').startsWith('voiceover_')));
    case 'hasVoiceover':
      // ROW.VOICEOVER = 3 (not 4). Also check by assetId prefix as fallback.
      return overlays.some(o => o.type === 'sound' && (o.row === 3 || (o.assetId || '').startsWith('voiceover_')));
    case 'hasMultipleScenes':
      return overlays.filter(o => o.type === 'image' || o.type === 'video').length > 1;
    case 'hasBGM':
      // ROW.BGM = 1. Also check by assetId prefix.
      return overlays.some(o => o.type === 'sound' && (o.row === 1 || (o.assetId || '').startsWith('bgm_')));
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
