/**
 * EDL Executor
 *
 * Converts Edit Decision List entries into concrete tool calls
 * that modify the Editron project. This bridges the gap between
 * "the AI decided to put a transition here" and "the transition
 * actually exists on the timeline."
 *
 * Called by the Director Agent after 5-track analysis generates
 * the EDL. Each decision becomes one or more overlay mutations.
 */

import type { EditDecision, EditDecisionList } from './reactive-edit-engine';
import type { Overlay, KeyframeTrack } from '../../editron/editor/version-7.0.0/types';
import { buildTransitionOverlay, type TransitionType, DEFAULT_TRANSITION_FRAMES } from '@/lib/editron/data/transition-templates';
import { projectService } from '@/lib/editron/services/project-service';

// ─── Types ───────────────────────────────────────────────────────

export interface ExecutionResult {
  decisionsExecuted: number;
  decisionsSkipped: number;
  overlaysCreated: number;
  overlaysModified: number;
  errors: string[];
}

// ─── Executor ────────────────────────────────────────────────────

/**
 * Execute an Edit Decision List on a project.
 *
 * @param edl - The Edit Decision List from the Reactive Edit Engine
 * @param projectId - Project to modify
 * @param userId - Owner
 * @param overlays - Current overlay state (mutated in place)
 * @param canvasDimensions - { width, height } for overlay positioning
 */
export async function executeEDL(
  edl: EditDecisionList,
  projectId: string,
  userId: string,
  overlays: Overlay[],
  canvasDimensions: { width: number; height: number },
): Promise<ExecutionResult> {
  const result: ExecutionResult = {
    decisionsExecuted: 0,
    decisionsSkipped: 0,
    overlaysCreated: 0,
    overlaysModified: 0,
    errors: [],
  };

  // Only execute high-confidence decisions (>0.5)
  const actionable = edl.decisions.filter(d => d.confidence > 0.5);
  console.log(`[EDL-Exec] Executing ${actionable.length}/${edl.totalDecisions} decisions (confidence > 0.5)`);

  for (const decision of actionable) {
    try {
      const applied = await applyDecision(decision, overlays, projectId, userId, canvasDimensions);
      if (applied) {
        result.decisionsExecuted++;
        if (applied.created) result.overlaysCreated += applied.created;
        if (applied.modified) result.overlaysModified += applied.modified;
      } else {
        result.decisionsSkipped++;
      }
    } catch (err: any) {
      result.decisionsSkipped++;
      result.errors.push(`${decision.type} at frame ${decision.frame}: ${err.message}`);
    }
  }

  console.log(`[EDL-Exec] Complete: ${result.decisionsExecuted} executed, ${result.decisionsSkipped} skipped, ${result.overlaysCreated} created, ${result.overlaysModified} modified`);
  return result;
}

// ─── Per-Decision Handlers ───────────────────────────────────────

async function applyDecision(
  decision: EditDecision,
  overlays: Overlay[],
  projectId: string,
  userId: string,
  canvas: { width: number; height: number },
): Promise<{ created: number; modified: number } | null> {

  switch (decision.type) {
    case 'transition':
      return applyTransition(decision, overlays, projectId, userId, canvas);

    case 'zoom':
      return applyZoom(decision, overlays);

    case 'speed-change':
      return applySpeedChange(decision, overlays);

    case 'fade':
      return applyFade(decision, overlays);

    case 'graphic':
      return applyGraphic(decision, overlays, projectId, userId, canvas);

    case 'audio-duck':
      return applyAudioDuck(decision, overlays);

    case 'cut':
      // Cuts are informational — they indicate where scene boundaries SHOULD be
      // but don't create new overlays (the scenes already exist from ThinkForge)
      return null;

    case 'filter-change':
      return applyFilterChange(decision, overlays);

    case 'caption-emphasis':
      // Caption emphasis requires the caption system — handled by Director's add_captions
      return null;

    default:
      return null;
  }
}

function applyTransition(
  decision: EditDecision,
  overlays: Overlay[],
  projectId: string,
  userId: string,
  canvas: { width: number; height: number },
): { created: number; modified: number } | null {
  const transType = (decision.params.transitionType || 'soft-cut') as TransitionType;
  const durationFrames = decision.durationFrames || DEFAULT_TRANSITION_FRAMES[transType] || 15;

  // Check if a transition already exists near this frame
  const existingTransition = overlays.find(o =>
    o.type === 'html-scene' && Math.abs(o.from - decision.frame) < 15,
  );
  if (existingTransition) return null; // Don't double-insert

  const transOverlay = buildTransitionOverlay(transType, {
    startFrame: decision.frame - Math.floor(durationFrames / 2),
    durationFrames,
    width: canvas.width,
    height: canvas.height,
  }, Date.now() + Math.random() * 10000);

  if (transOverlay) {
    overlays.push({ ...transOverlay, id: Date.now() + Math.floor(Math.random() * 10000) } as any);
    return { created: 1, modified: 0 };
  }
  return null;
}

function applyZoom(
  decision: EditDecision,
  overlays: Overlay[],
): { created: number; modified: number } | null {
  // Find the video overlay active at this frame
  const videoOverlay = overlays.find(o =>
    o.type === 'video' &&
    o.from <= decision.frame &&
    o.from + o.durationInFrames > decision.frame,
  );
  if (!videoOverlay) return null;

  const localFrame = decision.frame - videoOverlay.from;
  const duration = decision.durationFrames || 20;
  const scaleFrom = decision.params.scaleFrom || 1.0;
  const scaleTo = decision.params.scaleTo || 1.1;

  // Add scale keyframe track
  if (!videoOverlay.keyframeTracks) videoOverlay.keyframeTracks = [];

  // Remove existing scale track if any
  videoOverlay.keyframeTracks = videoOverlay.keyframeTracks.filter(
    (t: KeyframeTrack) => t.property !== 'scale',
  );

  videoOverlay.keyframeTracks.push({
    property: 'scale',
    keyframes: [
      { frame: Math.max(0, localFrame - 5), value: scaleFrom, easing: 'ease-in-out' },
      { frame: localFrame + Math.floor(duration / 2), value: scaleTo, easing: 'ease-in-out' },
      { frame: localFrame + duration, value: scaleFrom, easing: 'ease-out' },
    ],
  });

  return { created: 0, modified: 1 };
}

function applySpeedChange(
  decision: EditDecision,
  overlays: Overlay[],
): { created: number; modified: number } | null {
  const videoOverlay = overlays.find(o =>
    o.type === 'video' &&
    o.from <= decision.frame &&
    o.from + o.durationInFrames > decision.frame,
  ) as any;
  if (!videoOverlay) return null;

  const localFrame = decision.frame - videoOverlay.from;
  const duration = decision.durationFrames || 30;
  const { speedFrom = 1.0, speedTo = 0.5, speedBack = 1.0 } = decision.params;

  videoOverlay.speedCurve = [
    { frame: Math.max(0, localFrame - 5), value: speedFrom, easing: 'ease-in' },
    { frame: localFrame + Math.floor(duration / 3), value: speedTo, easing: 'ease-in-out' },
    { frame: localFrame + duration, value: speedBack, easing: 'ease-out' },
  ];

  return { created: 0, modified: 1 };
}

function applyFade(
  decision: EditDecision,
  overlays: Overlay[],
): { created: number; modified: number } | null {
  const overlay = overlays.find(o =>
    (o.type === 'video' || o.type === 'image') &&
    o.from <= decision.frame &&
    o.from + o.durationInFrames > decision.frame,
  );
  if (!overlay) return null;

  const localFrame = decision.frame - overlay.from;
  const duration = decision.durationFrames || 20;
  const { fromOpacity = 1, toOpacity = 0 } = decision.params;

  if (!overlay.keyframeTracks) overlay.keyframeTracks = [];
  overlay.keyframeTracks = overlay.keyframeTracks.filter(
    (t: KeyframeTrack) => t.property !== 'opacity',
  );

  overlay.keyframeTracks.push({
    property: 'opacity',
    keyframes: [
      { frame: localFrame, value: fromOpacity, easing: 'ease-in-out' },
      { frame: localFrame + duration, value: toOpacity, easing: 'linear' },
    ],
  });

  return { created: 0, modified: 1 };
}

function applyGraphic(
  decision: EditDecision,
  overlays: Overlay[],
  projectId: string,
  userId: string,
  canvas: { width: number; height: number },
): { created: number; modified: number } | null {
  const { graphicType, text, position } = decision.params;
  if (!text) return null;

  const duration = decision.durationFrames || 90;

  // Position the graphic
  let left = canvas.width * 0.05;
  let top = canvas.height * 0.8;
  let width = canvas.width * 0.4;
  let height = 60;

  if (graphicType === 'callout' && position) {
    // Position near the detected subject
    left = (position.x || 0.5) * canvas.width;
    top = Math.max(0, ((position.y || 0.5) * canvas.height) - 80);
    width = Math.min(canvas.width * 0.4, 400);
  } else if (graphicType === 'stat-counter' || graphicType === 'quote-card') {
    left = canvas.width * 0.2;
    top = canvas.height * 0.35;
    width = canvas.width * 0.6;
    height = canvas.height * 0.3;
  }

  // Create text overlay for the graphic
  const graphicOverlay = {
    id: Date.now() + Math.floor(Math.random() * 10000),
    type: 'text' as const,
    from: decision.frame,
    durationInFrames: duration,
    row: 0,
    left,
    top,
    width,
    height,
    isDragging: false,
    rotation: 0,
    content: text,
    styles: {
      fontSize: graphicType === 'stat-counter' ? '48' : '24',
      fontFamily: 'font-sans',
      fontWeight: graphicType === 'stat-counter' ? '800' : '600',
      textAlign: 'center' as const,
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.7)',
      borderRadius: '8px',
      padding: '12px',
      animation: { enter: 'fade', exit: 'fade', duration: 10 },
    },
    metadata: {
      sourceType: 'edl-graphic',
      graphicType,
      edlSource: decision.source,
      edlReason: decision.reason,
    },
  };

  overlays.push(graphicOverlay as any);
  return { created: 1, modified: 0 };
}

function applyAudioDuck(
  decision: EditDecision,
  overlays: Overlay[],
): { created: number; modified: number } | null {
  // Find BGM overlay (row 5 sound)
  const bgm = overlays.find(o => o.type === 'sound' && o.row === 5) as any;
  if (!bgm) return null;

  // Already has ducking? Skip.
  if (bgm.styles?.duckingConfig?.enabled) return null;

  const { duckLevel = 0.20, rampDownMs = 300, rampUpMs = 600 } = decision.params;

  if (!bgm.styles) bgm.styles = {};
  bgm.styles.duckingConfig = {
    enabled: true,
    duckLevel,
    rampDownMs,
    rampUpMs,
    lookAheadMs: 200,
  };

  return { created: 0, modified: 1 };
}

function applyFilterChange(
  decision: EditDecision,
  overlays: Overlay[],
): { created: number; modified: number } | null {
  const { filterId, filterCss } = decision.params;
  if (!filterId && !filterCss) return null;

  let modified = 0;
  const videoOverlays = overlays.filter(o =>
    (o.type === 'video' || o.type === 'image') &&
    o.from <= decision.frame &&
    o.from + o.durationInFrames > decision.frame,
  );

  for (const overlay of videoOverlays) {
    if (!(overlay as any).styles) (overlay as any).styles = {};
    if (filterCss) {
      (overlay as any).styles.filter = filterCss;
    }
    modified++;
  }

  return modified > 0 ? { created: 0, modified } : null;
}
