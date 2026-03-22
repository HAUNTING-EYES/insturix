/**
 * Transition Templates
 *
 * All transitions are implemented as HTML_SCENE overlays that render
 * at scene boundaries. No new rendering infrastructure needed — they
 * use the existing HTML overlay system in Remotion.
 *
 * Each transition is a factory function that returns overlay properties
 * ready to be inserted into the overlays array.
 */

export type TransitionType =
  | 'dip-to-black'
  | 'dip-to-white'
  | 'soft-cut'
  | 'zoom-punch'
  | 'whip-pan'
  | 'glitch'
  | 'dissolve'  // alias for soft-cut until keyframe system is built
  | 'hard-cut'; // no overlay inserted — just a marker

export interface TransitionOverlay {
  type: 'html-scene';
  from: number;
  durationInFrames: number;
  row: number;
  left: number;
  top: number;
  width: number;
  height: number;
  isDragging: boolean;
  rotation: number;
  content: string; // HTML content
  styles: Record<string, any>;
}

interface TransitionConfig {
  /** Frame where the transition starts (typically endFrame - half_duration) */
  startFrame: number;
  /** Duration of the transition in frames */
  durationFrames: number;
  /** Canvas dimensions */
  width: number;
  height: number;
}

/**
 * Build a transition overlay for insertion into the project.
 */
export function buildTransitionOverlay(
  type: TransitionType,
  config: TransitionConfig,
  overlayId: number,
): TransitionOverlay | null {
  const { startFrame, durationFrames, width, height } = config;
  const factory = TRANSITION_FACTORIES[type];
  if (!factory) return null; // hard-cut = no overlay

  const html = factory(durationFrames, width, height);

  return {
    type: 'html-scene',
    from: startFrame,
    durationInFrames: durationFrames,
    row: 1, // Transition layer — in front of video (row 2) and image (row 3)
    left: 0,
    top: 0,
    width,
    height,
    isDragging: false,
    rotation: 0,
    content: html,
    styles: {
      opacity: 1,
      backgroundColor: 'transparent',
    },
  };
}

// ─── Transition Factories ────────────────────────────────────────

const TRANSITION_FACTORIES: Record<string, (frames: number, w: number, h: number) => string> = {
  'dip-to-black': (frames, w, h) => `
<div style="position:absolute;inset:0;background:#000;animation:dip ${frames / 30}s ease-in-out forwards;">
</div>
<style>
@keyframes dip { 0%,100%{opacity:0} 50%{opacity:1} }
</style>`,

  'dip-to-white': (frames, w, h) => `
<div style="position:absolute;inset:0;background:#fff;animation:dip ${frames / 30}s ease-in-out forwards;">
</div>
<style>
@keyframes dip { 0%,100%{opacity:0} 50%{opacity:1} }
</style>`,

  'soft-cut': (frames, w, h) => `
<div style="position:absolute;inset:0;background:#000;animation:softDip ${frames / 30}s ease-in-out forwards;">
</div>
<style>
@keyframes softDip { 0%,100%{opacity:0} 40%{opacity:0.7} 60%{opacity:0.7} }
</style>`,

  // Alias dissolve to soft-cut until keyframe system enables true dissolve
  'dissolve': (frames, w, h) => `
<div style="position:absolute;inset:0;background:#000;animation:softDip ${frames / 30}s ease-in-out forwards;">
</div>
<style>
@keyframes softDip { 0%,100%{opacity:0} 40%{opacity:0.6} 60%{opacity:0.6} }
</style>`,

  'zoom-punch': (frames, w, h) => `
<div style="position:absolute;inset:0;animation:zoomPunch ${frames / 30}s ease-out forwards;pointer-events:none;">
  <div style="width:100%;height:100%;background:rgba(255,255,255,0.15);filter:blur(8px);animation:flashFade ${frames / 30}s ease-out forwards;">
  </div>
</div>
<style>
@keyframes zoomPunch {
  0% { transform: scale(1); opacity: 1; }
  30% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 0; }
}
@keyframes flashFade {
  0% { opacity: 0.6; }
  100% { opacity: 0; }
}
</style>`,

  'whip-pan': (frames, w, h) => `
<div style="position:absolute;inset:0;overflow:hidden;">
  <div style="width:100%;height:100%;background:linear-gradient(90deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.3) 70%, rgba(0,0,0,0.8) 100%);animation:whipBlur ${frames / 30}s ease-in-out forwards;filter:blur(12px);">
  </div>
</div>
<style>
@keyframes whipBlur {
  0% { transform: translateX(0); opacity: 0; }
  20% { transform: translateX(-30%); opacity: 1; }
  80% { transform: translateX(30%); opacity: 1; }
  100% { transform: translateX(0); opacity: 0; }
}
</style>`,

  'glitch': (frames, w, h) => `
<div style="position:absolute;inset:0;pointer-events:none;">
  <div style="position:absolute;inset:0;background:rgba(255,0,0,0.15);animation:glitchR ${frames / 30}s steps(8) forwards;mix-blend-mode:screen;"></div>
  <div style="position:absolute;inset:0;background:rgba(0,255,0,0.1);animation:glitchG ${frames / 30}s steps(6) forwards;mix-blend-mode:screen;"></div>
  <div style="position:absolute;inset:0;background:rgba(0,0,255,0.15);animation:glitchB ${frames / 30}s steps(10) forwards;mix-blend-mode:screen;"></div>
  <div style="position:absolute;inset:0;animation:noise ${frames / 30}s steps(4) forwards;">
    <div style="width:100%;height:100%;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.15) 2px,rgba(0,0,0,0.15) 4px);"></div>
  </div>
</div>
<style>
@keyframes glitchR {
  0%,100% { transform: translateX(0); opacity: 0; }
  10% { transform: translateX(-3px); opacity: 1; }
  30% { transform: translateX(2px); opacity: 0.8; }
  50% { transform: translateX(-1px); opacity: 1; }
  70% { transform: translateX(4px); opacity: 0.6; }
  90% { transform: translateX(0); opacity: 0; }
}
@keyframes glitchG {
  0%,100% { transform: translateX(0); opacity: 0; }
  15% { transform: translateX(3px); opacity: 0.8; }
  45% { transform: translateX(-2px); opacity: 1; }
  75% { transform: translateX(1px); opacity: 0.7; }
}
@keyframes glitchB {
  0%,100% { transform: translateY(0); opacity: 0; }
  20% { transform: translateY(-2px); opacity: 1; }
  60% { transform: translateY(3px); opacity: 0.8; }
  80% { transform: translateY(-1px); opacity: 0; }
}
@keyframes noise {
  0%,100% { opacity: 0; }
  20% { opacity: 0.4; }
  50% { opacity: 0.2; }
  80% { opacity: 0.3; }
}
</style>`,
};

/** Default transition duration in frames at 30fps */
export const DEFAULT_TRANSITION_FRAMES: Record<TransitionType, number> = {
  'hard-cut': 0,
  'dip-to-black': 12,    // 0.4s
  'dip-to-white': 12,
  'soft-cut': 18,         // 0.6s
  'dissolve': 18,
  'zoom-punch': 8,        // 0.27s (snappy)
  'whip-pan': 10,         // 0.33s
  'glitch': 10,
};

/** Convert transition type from editDirections to TransitionType */
export function normalizeTransitionType(type: string): TransitionType {
  const map: Record<string, TransitionType> = {
    'dissolve': 'dissolve',
    'dip-to-black': 'dip-to-black',
    'dip-to-white': 'dip-to-white',
    'hard-cut': 'hard-cut',
    'zoom-punch': 'zoom-punch',
    'whip-pan': 'whip-pan',
    'wipe-left': 'whip-pan', // closest available
    'glitch': 'glitch',
    'soft-cut': 'soft-cut',
    'fade': 'dip-to-black',
  };
  return map[type] || 'hard-cut';
}
