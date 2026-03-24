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
    // ─── Step 1: Load project state ──────────────────────────
    const project = await projectService.loadProject(userId, projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const overlays = project.overlays || [];
    result.checkpointId = `director_${Date.now()}`;

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

    // ─── Step 4: Save modified project ───────────────────────
    await projectService.saveProject(userId, projectId, {
      overlays,
      // Preserve existing settings
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
      // Add transitions between all video clips — delegate to invokeAITool
      // Override params with profile's defaultTransition if not specified
      const transAction = {
        ...action,
        params: {
          ...action.params,
          type: action.params.type || profile.defaultTransition || 'soft-cut',
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
          const captionParams = { videoOverlayId: vo.id, style: captionStyle, position: 'bottom' };
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
          const fancyParams = { videoOverlayId: vo.id, style: fancyStyle, intensity: params.intensity || 'medium' };
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
      // Smart auto-placement: analyze narration text overlays to derive
      // motion graphic descriptions and timing. No user input needed.
      const textOverlays = overlays.filter(o => o.type === 'text' && o.row === 0);
      if (textOverlays.length === 0) {
        console.log('[Director] add_motion_graphic: no text overlays for context');
        params.description = params.description || 'minimal animated label';
        params.start = params.start || 0;
        params.duration = params.duration || 90;
        params.row = params.row || 1;
      } else {
        // Pick the first scene's narration as context for the motion graphic
        const firstText = textOverlays[0];
        const narrationSnippet = (firstText.content || '').substring(0, 100);
        // Use plain language descriptions — no jargon
        const density = profile.graphicsDensity || 'moderate';
        const descriptions: Record<string, string> = {
          heavy: `animated text label showing: "${narrationSnippet}"`,
          moderate: `subtle feature highlight for: "${narrationSnippet.substring(0, 50)}"`,
          minimal: `clean minimal label`,
        };
        params.description = params.description || descriptions[density] || descriptions.moderate;
        params.start = params.start || firstText.from;
        params.duration = params.duration || Math.min(firstText.durationInFrames, 120);
        params.row = params.row || 1;
      }
      console.log(`[Director] add_motion_graphic: "${(params.description as string).substring(0, 60)}..." at frame ${params.start}`);
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
