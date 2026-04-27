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
  // Visual transitions (HTML overlay effects)
  | 'dip-to-black'
  | 'dip-to-white'
  | 'soft-cut'
  | 'zoom-punch'
  | 'whip-pan'
  | 'glitch'
  | 'dissolve'
  | 'flash'           // White flash burst (reveal/impact)
  | 'film-burn'       // Organic film burn overlay
  | 'wipe-left'       // Classic horizontal wipe
  | 'wipe-right'
  | 'iris-wipe'       // Circular iris closing/opening
  | 'blur-transition' // Motion blur bridge between shots
  | 'slide-up'        // Push transition — next scene slides up
  | 'slide-down'
  // Editorial cuts (no visual overlay — the CUT IS the transition)
  | 'hard-cut'        // Standard cut — no overlay
  | 'smash-cut'       // Abrupt cut for shock (hard-cut + possible audio spike)
  | 'match-cut'       // Cut where compositions match (editorial, no overlay)
  | 'jump-cut'        // Same angle, time skip (editorial)
  | 'cut-on-action';  // Cut timed to subject movement (editorial)

export interface TransitionOverlay {
  type: 'transition';
  from: number;
  durationInFrames: number;
  row: number;
  left: number;
  top: number;
  width: number;
  height: number;
  isDragging: boolean;
  rotation: number;
  content: string; // HTML content for visual effect
  styles: Record<string, any>;
  metadata?: {
    isTransition: boolean;
    transitionType: string;
    source?: string;
  };
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
    type: 'transition' as any,
    from: startFrame,
    durationInFrames: durationFrames,
    row: 2, // VIDEO row — transitions render inline between clips (DaVinci-style). NOTE: this function is currently unused (EDL executor creates transitions directly).
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
    metadata: {
      isTransition: true,
      transitionType: type,
      source: 'auto',
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

  // DEAD CODE: TRANSITION_FACTORIES are unused — EDL executor creates transitions directly,
  // Remotion renderer (transition-layer-content.tsx) handles visuals via switch/case.
  // Dissolve visual comes from clip opacity keyframes (createTrueDissolve in edl-executor).
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

  // ─── New transitions ────────────────────────────────────

  'flash': (frames, w, h) => `
<div style="position:absolute;inset:0;background:#fff;animation:flashBurst ${frames / 30}s ease-out forwards;">
</div>
<style>
@keyframes flashBurst { 0%{opacity:0} 15%{opacity:1} 100%{opacity:0} }
</style>`,

  'film-burn': (frames, w, h) => `
<div style="position:absolute;inset:0;pointer-events:none;">
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 60% 40%, rgba(255,120,0,0.7) 0%, rgba(255,60,0,0.4) 30%, transparent 70%);animation:burnGrow ${frames / 30}s ease-in-out forwards;mix-blend-mode:screen;"></div>
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 30% 70%, rgba(255,200,50,0.5) 0%, transparent 50%);animation:burnFade ${frames / 30}s ease-in forwards;mix-blend-mode:screen;"></div>
</div>
<style>
@keyframes burnGrow { 0%{opacity:0;transform:scale(0.5)} 40%{opacity:1;transform:scale(1.2)} 100%{opacity:0;transform:scale(1.5)} }
@keyframes burnFade { 0%{opacity:0} 30%{opacity:0.8} 100%{opacity:0} }
</style>`,

  'wipe-left': (frames, w, h) => `
<div style="position:absolute;inset:0;background:#000;animation:wipeL ${frames / 30}s ease-in-out forwards;">
</div>
<style>
@keyframes wipeL { 0%{clip-path:inset(0 100% 0 0)} 50%{clip-path:inset(0 0 0 0)} 100%{clip-path:inset(0 0 0 100%)} }
</style>`,

  'wipe-right': (frames, w, h) => `
<div style="position:absolute;inset:0;background:#000;animation:wipeR ${frames / 30}s ease-in-out forwards;">
</div>
<style>
@keyframes wipeR { 0%{clip-path:inset(0 0 0 100%)} 50%{clip-path:inset(0 0 0 0)} 100%{clip-path:inset(0 100% 0 0)} }
</style>`,

  'iris-wipe': (frames, w, h) => `
<div style="position:absolute;inset:0;background:#000;animation:iris ${frames / 30}s ease-in-out forwards;">
</div>
<style>
@keyframes iris { 0%{clip-path:circle(0% at 50% 50%)} 45%{clip-path:circle(75% at 50% 50%)} 55%{clip-path:circle(75% at 50% 50%)} 100%{clip-path:circle(0% at 50% 50%)} }
</style>`,

  'blur-transition': (frames, w, h) => `
<div style="position:absolute;inset:0;backdrop-filter:blur(0px);animation:blurBridge ${frames / 30}s ease-in-out forwards;">
</div>
<style>
@keyframes blurBridge { 0%{backdrop-filter:blur(0px);opacity:0} 40%{backdrop-filter:blur(20px);opacity:1} 60%{backdrop-filter:blur(20px);opacity:1} 100%{backdrop-filter:blur(0px);opacity:0} }
</style>`,

  'slide-up': (frames, w, h) => `
<div style="position:absolute;inset:0;background:#000;animation:slideU ${frames / 30}s ease-in-out forwards;">
</div>
<style>
@keyframes slideU { 0%{transform:translateY(100%)} 45%{transform:translateY(0)} 55%{transform:translateY(0)} 100%{transform:translateY(-100%)} }
</style>`,

  'slide-down': (frames, w, h) => `
<div style="position:absolute;inset:0;background:#000;animation:slideD ${frames / 30}s ease-in-out forwards;">
</div>
<style>
@keyframes slideD { 0%{transform:translateY(-100%)} 45%{transform:translateY(0)} 55%{transform:translateY(0)} 100%{transform:translateY(100%)} }
</style>`,

  // ─── Original transitions ──────────────────────────────

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
  // No overlay (editorial cuts)
  'hard-cut': 0,
  'smash-cut': 0,
  'match-cut': 0,
  'jump-cut': 0,
  'cut-on-action': 0,
  // Short transitions (snappy)
  'zoom-punch': 8,        // 0.27s
  'flash': 8,             // 0.27s
  'whip-pan': 10,         // 0.33s
  'glitch': 10,           // 0.33s
  // Medium transitions
  'dip-to-black': 12,     // 0.4s
  'dip-to-white': 12,     // 0.4s
  'wipe-left': 12,        // 0.4s
  'wipe-right': 12,       // 0.4s
  'iris-wipe': 15,        // 0.5s
  'blur-transition': 15,  // 0.5s
  // Long transitions (smooth)
  'soft-cut': 24,         // 0.8s (was 0.6s — too abrupt per user feedback)
  'dissolve': 36,         // 1.2s (real cross-dissolve needs more time to feel natural)
  'film-burn': 20,        // 0.67s
  'slide-up': 15,         // 0.5s
  'slide-down': 15,       // 0.5s
};

/** Human-readable names and categories for transition browser UI */
export const TRANSITION_INFO: Record<TransitionType, { name: string; category: string; description: string }> = {
  'hard-cut': { name: 'Hard Cut', category: 'Editorial', description: 'Instant cut — the standard' },
  'smash-cut': { name: 'Smash Cut', category: 'Editorial', description: 'Abrupt cut for shock or comedy' },
  'match-cut': { name: 'Match Cut', category: 'Editorial', description: 'Compositions match across the cut' },
  'jump-cut': { name: 'Jump Cut', category: 'Editorial', description: 'Same angle, time skip forward' },
  'cut-on-action': { name: 'Cut on Action', category: 'Editorial', description: 'Cut timed to subject movement' },
  'dip-to-black': { name: 'Dip to Black', category: 'Fade', description: 'Fade through black between scenes' },
  'dip-to-white': { name: 'Dip to White', category: 'Fade', description: 'Fade through white — reveals, dreams' },
  'soft-cut': { name: 'Soft Cut', category: 'Fade', description: 'Gentle semi-transparent dip' },
  'dissolve': { name: 'Dissolve', category: 'Fade', description: 'Cross-fade between scenes' },
  'flash': { name: 'Flash', category: 'Impact', description: 'White flash burst — reveals, impacts' },
  'film-burn': { name: 'Film Burn', category: 'Stylized', description: 'Organic film burn overlay' },
  'zoom-punch': { name: 'Zoom Punch', category: 'Impact', description: 'Quick zoom + flash on beats' },
  'whip-pan': { name: 'Whip Pan', category: 'Motion', description: 'Fast horizontal blur between shots' },
  'glitch': { name: 'Glitch', category: 'Stylized', description: 'RGB split + noise for tech content' },
  'wipe-left': { name: 'Wipe Left', category: 'Wipe', description: 'Classic horizontal wipe left' },
  'wipe-right': { name: 'Wipe Right', category: 'Wipe', description: 'Classic horizontal wipe right' },
  'iris-wipe': { name: 'Iris Wipe', category: 'Wipe', description: 'Circular iris closing/opening' },
  'blur-transition': { name: 'Blur Bridge', category: 'Motion', description: 'Motion blur between shots' },
  'slide-up': { name: 'Slide Up', category: 'Motion', description: 'Next scene pushes up' },
  'slide-down': { name: 'Slide Down', category: 'Motion', description: 'Next scene pushes down' },
};

// ─── True Dissolve (Keyframe-Based) ─────────────────────────────
// Uses the P7A keyframe system instead of HTML overlays.
// Creates a crossfade by animating opacity on two overlapping clips.

/**
 * Create a true dissolve transition between two overlays using keyframes.
 * Requires the keyframe system (P7A) to be active.
 *
 * @param outgoingOverlay - The clip that's fading out
 * @param incomingOverlay - The clip that's fading in
 * @param durationFrames - Duration of the crossfade (default 18 = 0.6s)
 * @returns Updated overlays with opacity keyframe tracks + adjusted timing
 */
export function createTrueDissolve(
  outgoingOverlay: any,
  incomingOverlay: any,
  durationFrames: number = 18,
): { outgoing: any; incoming: any } {
  // Extend outgoing clip to overlap with incoming by durationFrames
  const outgoing = { ...outgoingOverlay };
  const incoming = { ...incomingOverlay };

  // Outgoing: fade out over the last durationFrames
  const outDuration = outgoing.durationInFrames;
  if (!outgoing.keyframeTracks) outgoing.keyframeTracks = [];
  outgoing.keyframeTracks = outgoing.keyframeTracks.filter((t: any) => t.property !== 'opacity');
  outgoing.keyframeTracks.push({
    property: 'opacity',
    keyframes: [
      { frame: outDuration - durationFrames, value: 1, easing: 'ease-in-out' },
      { frame: outDuration, value: 0, easing: 'linear' },
    ],
  });

  // Incoming: shift start back by durationFrames (overlap), fade in
  incoming.from = Math.max(0, incoming.from - durationFrames);
  incoming.durationInFrames += durationFrames;
  if (!incoming.keyframeTracks) incoming.keyframeTracks = [];
  incoming.keyframeTracks = incoming.keyframeTracks.filter((t: any) => t.property !== 'opacity');
  incoming.keyframeTracks.push({
    property: 'opacity',
    keyframes: [
      { frame: 0, value: 0, easing: 'ease-in-out' },
      { frame: durationFrames, value: 1, easing: 'linear' },
    ],
  });

  return { outgoing, incoming };
}

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
