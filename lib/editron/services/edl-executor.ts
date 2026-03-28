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
  const safeText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Position + dimensions per graphic type
  let left = canvas.width * 0.05;
  let top = canvas.height * 0.8;
  let width = canvas.width * 0.4;
  let height = 80;

  // ── Build HTML per graphic type (5 distinct templates) ──
  let html = '';

  switch (graphicType) {
    case 'stat-counter': {
      // Big number center-screen with accent bar — for statistics, percentages
      left = canvas.width * 0.2;
      top = canvas.height * 0.3;
      width = canvas.width * 0.6;
      height = canvas.height * 0.35;
      html = `
<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;padding:24px;">
  <div style="background:linear-gradient(135deg,rgba(0,0,0,0.85),rgba(20,20,40,0.9));backdrop-filter:blur(16px);border-radius:16px;padding:32px 48px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 20px 60px rgba(0,0,0,0.5);animation:statIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards;opacity:0;">
    <div style="width:40px;height:3px;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:2px;margin-bottom:16px;"></div>
    <div style="color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:48px;font-weight:900;text-align:center;letter-spacing:-0.02em;line-height:1.1;">
      ${safeText}
    </div>
    <div style="width:40px;height:3px;background:linear-gradient(90deg,#8b5cf6,#6366f1);border-radius:2px;margin-top:16px;"></div>
  </div>
</div>
<style>
@keyframes statIn { 0% { opacity:0; transform:scale(0.8) translateY(20px); } 100% { opacity:1; transform:scale(1) translateY(0); } }
</style>`;
      break;
    }

    case 'callout': {
      // Positioned near subject with arrow indicator — for product/feature callouts
      if (position) {
        left = Math.min(Math.max((position.x || 0.5) * canvas.width - 150, 20), canvas.width - 340);
        top = Math.max(20, ((position.y || 0.5) * canvas.height) - 60);
      }
      width = 320;
      height = 70;
      html = `
<div style="display:flex;align-items:center;gap:10px;width:100%;height:100%;padding:8px;">
  <div style="width:4px;height:36px;background:#f59e0b;border-radius:2px;flex-shrink:0;animation:barIn 0.3s ease-out forwards;"></div>
  <div style="background:rgba(0,0,0,0.8);backdrop-filter:blur(12px);border-radius:10px;padding:10px 18px;border:1px solid rgba(245,158,11,0.3);animation:callIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards;opacity:0;">
    <div style="color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:17px;font-weight:600;letter-spacing:0.01em;">
      ${safeText}
    </div>
  </div>
</div>
<style>
@keyframes callIn { 0% { opacity:0; transform:translateX(-12px); } 100% { opacity:1; transform:translateX(0); } }
@keyframes barIn { 0% { height:0; } 100% { height:36px; } }
</style>`;
      break;
    }

    case 'lower-third': {
      // Bottom-left name/title bar — for person introductions
      left = canvas.width * 0.04;
      top = canvas.height * 0.78;
      width = canvas.width * 0.45;
      height = 80;
      html = `
<div style="display:flex;align-items:flex-end;width:100%;height:100%;padding:8px 0;">
  <div style="position:relative;animation:ltIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards;opacity:0;">
    <div style="background:rgba(255,255,255,0.95);padding:8px 24px 8px 16px;border-radius:0 8px 8px 0;">
      <div style="color:#111;font-family:system-ui,-apple-system,sans-serif;font-size:18px;font-weight:700;letter-spacing:0.01em;">
        ${safeText}
      </div>
    </div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:#ef4444;border-radius:2px 0 0 2px;"></div>
  </div>
</div>
<style>
@keyframes ltIn { 0% { opacity:0; transform:translateX(-30px); } 100% { opacity:1; transform:translateX(0); } }
</style>`;
      break;
    }

    case 'quote-card': {
      // Centered quote with quotation marks — for direct quotes, testimonials
      left = canvas.width * 0.15;
      top = canvas.height * 0.3;
      width = canvas.width * 0.7;
      height = canvas.height * 0.35;
      html = `
<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:24px;">
  <div style="background:rgba(0,0,0,0.8);backdrop-filter:blur(20px);border-radius:16px;padding:28px 36px;border:1px solid rgba(255,255,255,0.06);max-width:600px;animation:quoteIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards;opacity:0;">
    <div style="color:rgba(255,255,255,0.3);font-size:40px;font-family:Georgia,serif;line-height:1;margin-bottom:-8px;">\u201C</div>
    <div style="color:#fff;font-family:Georgia,serif;font-size:22px;font-weight:400;font-style:italic;text-align:center;line-height:1.5;letter-spacing:0.01em;">
      ${safeText}
    </div>
    <div style="color:rgba(255,255,255,0.3);font-size:40px;font-family:Georgia,serif;line-height:1;text-align:right;margin-top:-8px;">\u201D</div>
  </div>
</div>
<style>
@keyframes quoteIn { 0% { opacity:0; transform:scale(0.95); } 100% { opacity:1; transform:scale(1); } }
</style>`;
      break;
    }

    case 'keyword-highlight':
    default: {
      // Compact pop-up keyword — for emphasis words, topic labels, highlights
      left = canvas.width * 0.05;
      top = canvas.height * 0.82;
      width = Math.min(canvas.width * 0.5, Math.max(200, safeText.length * 14 + 60));
      height = 56;
      html = `
<div style="display:flex;align-items:center;width:100%;height:100%;padding:6px;">
  <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(0,0,0,0.85);backdrop-filter:blur(12px);border-radius:8px;padding:8px 18px;border:1px solid rgba(255,255,255,0.1);animation:kwIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards;opacity:0;transform-origin:left center;">
    <div style="width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0;"></div>
    <div style="color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:16px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;">
      ${safeText}
    </div>
  </div>
</div>
<style>
@keyframes kwIn { 0% { opacity:0; transform:scale(0.7); } 100% { opacity:1; transform:scale(1); } }
</style>`;
      break;
    }
  }

  const graphicOverlay = {
    id: Date.now() + Math.floor(Math.random() * 10000),
    type: 'html-scene' as const,
    from: decision.frame,
    durationInFrames: duration,
    row: 1, // Row 1 (above video on row 2, below captions on row 0)
    left,
    top,
    width,
    height,
    isDragging: false,
    rotation: 0,
    content: html,
    styles: {
      opacity: 1,
      backgroundColor: 'transparent',
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
