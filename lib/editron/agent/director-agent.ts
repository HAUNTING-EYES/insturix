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

import type { EditProfile, EditProfileAction, DirectorResult, ProjectBrief } from '@/lib/editron/data/edit-profile-types';
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
      success: false, profileId,
      actionsExecuted: 0, actionsSkipped: [{ action: 'all', reason: `Profile "${profileId}" not found` }],
      overlaysModified: 0, checkpointId: '', executionMs: 0,
      warnings: [`Edit profile "${profileId}" not found. Available profiles can be seen in the export dialog.`],
    };
  }

  // Apply brief overrides
  const effectiveProfile = applyBriefOverrides(profile, brief);

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
    // This is the intelligence layer. Analyze video assets, generate
    // edit decisions, and apply them to the timeline BEFORE profile actions.
    try {
      onProgress?.(0, 0, 'Analyzing video assets (5-track)...');
      const { runFullAnalysis, getAnalysis } = await import('@/lib/editron/services/five-track-analysis');
      const { generateEditDecisionList } = await import('@/lib/editron/services/reactive-edit-engine');
      const { executeEDL } = await import('@/lib/editron/services/edl-executor');
      const { detectCinematicMoments } = await import('@/lib/editron/services/cinematic-moment-detector');

      // Analyze each video asset (cached — fast if already analyzed)
      const videoOverlays = overlays.filter(o => o.type === 'video').sort((a, b) => a.from - b.from);
      const voiceoverOverlays = overlays.filter(o => o.type === 'sound' && o.row === 4).sort((a, b) => a.from - b.from);
      const analyses: any[] = [];

      // Detect if this is an AI-generated project (has storyboard link)
      const db = await (await import('@/lib/editron/db/mongodb')).getDatabase();
      const projectDoc = await db.collection('projects').findOne({ projectId }) as any;
      const storyboardId = projectDoc?.sourceStoryboardId;
      let storyboardScenes: any[] = [];

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
          console.log(`[Director] Found storyboard ${storyboardId} with ${storyboardScenes.length} scenes`);
        }
      }

      const isAIProject = storyboardScenes.length > 0;

      for (let i = 0; i < videoOverlays.length; i++) {
        const vo = videoOverlays[i];
        const assetId = (vo as any).assetId;
        if (!assetId) continue;

        // Check cache first
        let analysis = await getAnalysis(assetId);
        if (!analysis) {
          const videoUrl = (vo as any).src || (vo as any).content;
          if (videoUrl) {
            const durationMs = (vo.durationInFrames / 30) * 1000;

            // Get voiceover text for this scene (word timestamps from TTS)
            const matchingVO = voiceoverOverlays[i];
            const storyboardScene = isAIProject ? storyboardScenes[i] : undefined;
            const narrationText = storyboardScene?.narration || '';

            // Build synthetic word timestamps from narration if no real transcription
            const words = narrationText ? narrationText.split(/\s+/).map((w: string, idx: number, arr: string[]) => {
              const wordDurationMs = durationMs / arr.length;
              return { word: w, startMs: idx * wordDurationMs, endMs: (idx + 1) * wordDurationMs };
            }) : undefined;

            analysis = await runFullAnalysis(assetId, userId, {
              videoUrl,
              durationMs,
              transcript: narrationText || undefined,
              words,
              storyboardScene,
              sourceType: isAIProject ? 'ai-generated' : 'real-footage',
            });
          }
        }
        if (analysis) analyses.push(analysis);
      }

      if (analyses.length > 0) {
        // Generate Edit Decision List
        const totalDurationMs = (project.durationInFrames || 900) / 30 * 1000;
        const edl = generateEditDecisionList(analyses, totalDurationMs, {
          targetCutsPerMinute: effectiveProfile.cutFrequencyTarget
            ? 60 / effectiveProfile.cutFrequencyTarget
            : 6,
          transitionStyle: effectiveProfile.defaultTransition?.type === 'dissolve' ? 'dissolve'
            : effectiveProfile.defaultTransition?.type === 'hard-cut' ? 'hard-cut'
            : 'mixed',
          graphicDensity: effectiveProfile.graphicsDensity || 'moderate',
          pacing: effectiveProfile.pacing || 'medium',
        });

        // Detect cinematic moments
        const moments = analyses.flatMap(a => detectCinematicMoments(a));

        // Execute EDL decisions on the overlay array
        const canvas = project.playerDimensions || { width: 1920, height: 1080 };
        const edlResult = await executeEDL(edl, projectId, userId, overlays, canvas);

        console.log(`[Director] 5-Track: ${analyses.length} assets analyzed, ${edl.totalDecisions} decisions, ${edlResult.decisionsExecuted} executed, ${moments.length} cinematic moments`);
        result.overlaysModified += edlResult.overlaysModified + edlResult.overlaysCreated;

        if (edlResult.errors.length > 0) {
          result.warnings.push(...edlResult.errors.slice(0, 3));
        }
      } else {
        console.log('[Director] No video assets to analyze, skipping 5-track');
      }
    } catch (analysisErr: any) {
      console.warn('[Director] 5-Track analysis failed (non-fatal):', analysisErr.message);
      result.warnings.push(`Analysis: ${analysisErr.message}`);
    }

    // ─── Step 2: Check conditions and filter actions ──────────
    const actions = effectiveProfile.actions
      .filter(action => checkCondition(action.condition, overlays))
      .sort((a, b) => a.order - b.order);

    const totalSteps = actions.length;
    onProgress?.(0, totalSteps, 'Starting Director Agent execution...');

    // ─── Step 3: Execute actions sequentially ────────────────
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      onProgress?.(i + 1, totalSteps, action.description);

      try {
        const modified = await executeAction(action, overlays, userId, projectId, effectiveProfile);
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
): Promise<number> {
  let modified = 0;

  switch (action.tool) {
    case 'batch_update_overlays': {
      // Apply filter to all visual overlays
      const filterPresetId = action.params.filterPresetId || profile.filterPresetId;
      const preset = getFilterPresetById(filterPresetId);
      if (preset.id === 'none') break;

      const targetTypes = action.params.targetTypes || ['image', 'video'];
      for (const overlay of overlays) {
        if (targetTypes.includes(overlay.type)) {
          overlay.styles = { ...overlay.styles, filter: preset.filter };
          modified++;
        }
      }
      break;
    }

    case 'audio_ducking': {
      // Configure ducking on BGM overlays (row 5)
      for (const overlay of overlays) {
        if (overlay.type === 'sound' && overlay.row === 5) {
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
      let transType = action.params.type || profile.defaultTransition?.type || profile.defaultTransition || 'soft-cut';
      if (typeof transType === 'object') transType = transType.type || 'soft-cut';

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

      const transAction = {
        ...action,
        params: {
          type: transType,
          durationMs: action.params.durationMs || 500,
          applyToAll: true,
        },
      };
      modified = await invokeAITool(transAction, userId, projectId, profile, overlays);
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
        console.warn(`[Director] Quality review failed: ${qrErr.message}`);
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
  const tool = tools.find((t: any) => t.name === toolName);
  if (!tool) {
    console.warn(`[Director] Tool not found: ${toolName}`);
    return 0;
  }

  // Build params from profile + action params
  const params: Record<string, any> = { ...action.params };

  // Tool-specific param mapping from profile
  switch (toolName) {
    case 'add_captions': {
      // Caption ALL video overlays sequentially
      const videoOverlays = overlays.filter(o => o.type === 'video');
      if (videoOverlays.length === 0) {
        console.log(`[Director] add_captions: no video overlays found, skipping`);
        return 0;
      }
      const captionStyle = params.style || profile.captionStyle || 'subtitle';
      console.log(`[Director] add_captions: ${videoOverlays.length} videos, style=${captionStyle}`);

      // Caption each video sequentially — tool.invoke handles transcription + caption creation
      let captionCount = 0;
      for (const vo of videoOverlays) {
        try {
          const captionParams = { videoOverlayId: vo.id, style: captionStyle, position: 'bottom', overwrite: true };
          console.log(`[Director] add_captions: video ${vo.id} (${captionCount + 1}/${videoOverlays.length})`);
          const resultStr = await tool.invoke(captionParams);
          const result = JSON.parse(resultStr);
          if (result.status === 'success') captionCount++;
          else console.warn(`[Director] add_captions video ${vo.id}: ${result.error?.message}`);
        } catch (err: any) {
          console.warn(`[Director] add_captions failed for video ${vo.id}: ${err.message}`);
        }
      }
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
      const bgmOverlay = overlays.find(o => o.type === 'sound' && o.row === 5);
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
      console.warn(`[Director] Tool ${toolName} failed: ${result.error?.message}`);
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
      return overlays.some(o => o.type === 'sound' && o.row === 4);
    case 'hasVoiceover':
      return overlays.some(o => o.type === 'sound' && o.row === 4);
    case 'hasMultipleScenes':
      return overlays.filter(o => o.type === 'image' || o.type === 'video').length > 1;
    case 'hasBGM':
      return overlays.some(o => o.type === 'sound' && o.row === 5);
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
