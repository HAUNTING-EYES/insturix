import type { MotionTokens } from '../types';
import type { ResolvedElement, ComputedChoreography, EntrancePattern, ExitPattern, HoldPattern } from './recipe-types';

// Spatial animation parameters derived from visual language tokens.
// Base values sourced from StatCounter.tsx (production verified):
//   verticalSlidePx: 20 ← StatCounter.tsx:84
//   scaleFrom: 0.92 ← StatCounter.tsx:90
//   horizontalSlidePx: 30 ← vertical × 1.5 (horizontal motion perceived faster, standard AE practice)
export interface SpatialConfig {
  verticalSlidePx: number;
  horizontalSlidePx: number;
  scaleFrom: number;
}

export function deriveSpatialConfig(tokens: MotionTokens): SpatialConfig {
  const paddingScale = tokens.layout.paddingScale;
  const hasOvershoot = tokens.animation.overshoot;
  return {
    verticalSlidePx: Math.round(20 * paddingScale),
    horizontalSlidePx: Math.round(30 * paddingScale),
    scaleFrom: hasOvershoot ? 0.85 : 0.92,
  };
}

// 20 new animatable properties (11→31 total, matching After Effects).
// Organized: transform (7) + filter (4) + typography (2) + shadow (1) + stroke (1) + clip (1) = 16 AnimationState fields.
// Remaining 4 (anchorPoint, strokeColor, mixBlendMode, gradientPosition, lineHeight) are resolvedProps.
export interface AnimationState {
  opacity: number;
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  skewX: number;
  clipProgress: number;
  filterBlur: number;
  filterBrightness: number;
  filterContrast: number;
  filterSaturate: number;
  letterSpacing: number;
  fontSize: number;
  textShadowBlur: number;
  strokeDashoffset: number;
}

const NEUTRAL: AnimationState = {
  opacity: 1,
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  skewX: 0,
  clipProgress: 1,
  filterBlur: 0,
  filterBrightness: 1,
  filterContrast: 1,
  filterSaturate: 1,
  letterSpacing: 0,
  fontSize: 1,
  textShadowBlur: 0,
  strokeDashoffset: 0,
};

export function computeAnimationState(
  frame: number,
  timing: ComputedChoreography,
  entrancePattern: EntrancePattern,
  exitPattern: ExitPattern,
  spatial: SpatialConfig,
  holdPattern?: HoldPattern,
): AnimationState {
  // Disney #2 — Anticipation: brief reverse movement before entrance
  if (timing.anticipateStartFrame != null && timing.anticipateEndFrame != null
    && frame >= timing.anticipateStartFrame && frame < timing.anticipateEndFrame) {
    const raw = (frame - timing.anticipateStartFrame) / Math.max(1, timing.anticipateEndFrame - timing.anticipateStartFrame);
    const progress = Math.min(1, Math.max(0, raw));
    return applyAnticipationState(progress, entrancePattern, spatial);
  }
  if (frame < timing.enterStartFrame) {
    return applyEntranceState(0, entrancePattern, spatial);
  }
  if (frame <= timing.enterEndFrame) {
    const raw = (frame - timing.enterStartFrame) / Math.max(1, timing.enterEndFrame - timing.enterStartFrame);
    const progress = timing.enterEasing(Math.min(1, Math.max(0, raw)));
    return applyEntranceState(progress, entrancePattern, spatial);
  }
  // Disney #5 — Follow Through: damped oscillation after entrance lands.
  // Different patterns settle at different rates (overlapping action).
  const settleFrames = getSettleFrames(entrancePattern);
  if (settleFrames > 0 && frame > timing.enterEndFrame
    && frame <= timing.enterEndFrame + settleFrames && frame < timing.exitStartFrame) {
    const settleProgress = (frame - timing.enterEndFrame) / settleFrames;
    return applyFollowThrough(settleProgress, entrancePattern);
  }
  if (frame >= timing.exitStartFrame && frame <= timing.exitEndFrame) {
    const raw = (frame - timing.exitStartFrame) / Math.max(1, timing.exitEndFrame - timing.exitStartFrame);
    const progress = timing.exitEasing(Math.min(1, Math.max(0, raw)));
    return applyExitState(progress, exitPattern, spatial);
  }
  if (frame > timing.exitEndFrame) {
    return applyExitState(1, exitPattern, spatial);
  }
  if (holdPattern && holdPattern !== 'static') {
    return applyHoldAnimation(frame, timing, holdPattern);
  }
  return { ...NEUTRAL };
}

function applyEntranceState(progress: number, pattern: EntrancePattern, s: SpatialConfig): AnimationState {
  // Disney #7 — Arc: perpendicular sine offset peaks at motion midpoint, returns to 0
  // ⚠️ 0.2 arc magnitude INVENTED — AE practice: 10-25% of perpendicular axis for subtle arcs
  const arc = Math.sin(progress * Math.PI) * 0.2;

  switch (pattern) {
    case 'fade':
      return { ...NEUTRAL, opacity: progress };
    case 'slide-left':
      return { ...NEUTRAL, opacity: progress,
        translateX: (1 - progress) * -s.horizontalSlidePx,
        translateY: -arc * s.verticalSlidePx,
      };
    case 'slide-right':
      return { ...NEUTRAL, opacity: progress,
        translateX: (1 - progress) * s.horizontalSlidePx,
        translateY: -arc * s.verticalSlidePx,
      };
    case 'slide-up':
      return { ...NEUTRAL, opacity: progress,
        translateY: (1 - progress) * s.verticalSlidePx,
        translateX: arc * s.horizontalSlidePx,
      };
    case 'slide-down':
      return { ...NEUTRAL, opacity: progress,
        translateY: (1 - progress) * -s.verticalSlidePx,
        translateX: -arc * s.horizontalSlidePx,
      };
    case 'scale-up': {
      const v = s.scaleFrom + progress * (1 - s.scaleFrom);
      // Disney #1 — Squash & Stretch: damped sine diverges scaleX/Y, preserving volume
      // ⚠️ 0.08 factor INVENTED — AE practice: 5-10% divergence for subtle squash
      const squash = Math.sin(progress * Math.PI * 1.5) * 0.08 * (1 - progress);
      return { ...NEUTRAL, opacity: progress, scaleX: v * (1 - squash * 0.5), scaleY: v * (1 + squash) };
    }
    case 'pop': {
      // Disney #1 — Squash & Stretch: stronger for pop (emphasis text, keyword highlights)
      // ⚠️ 0.12 factor INVENTED — pop is more energetic than scale-up (10-15% range)
      const squash = Math.sin(progress * Math.PI * 1.5) * 0.12 * (1 - progress);
      return { ...NEUTRAL, opacity: progress, scaleX: progress * (1 - squash * 0.5), scaleY: progress * (1 + squash) };
    }
    case 'blur-in':
      // filterBlur 20→0px ← AE standard Gaussian blur for MG reveals (16-24px range)
      return { ...NEUTRAL, opacity: progress, filterBlur: (1 - progress) * 20 };
    case 'draw':
      return { ...NEUTRAL, clipProgress: progress };
    case 'rotate-in':
      // ⚠️ 15deg INVENTED — AE practice: 10-20deg for subtle rotation reveals
      return { ...NEUTRAL, opacity: progress, rotation: (1 - progress) * 15, scaleX: s.scaleFrom + progress * (1 - s.scaleFrom), scaleY: s.scaleFrom + progress * (1 - s.scaleFrom) };
    case 'skew-in':
      // ⚠️ 10deg INVENTED — AE practice: 8-15deg for dynamic slide feel (broadcast news style)
      return { ...NEUTRAL, opacity: progress,
        skewX: (1 - progress) * 10,
        translateX: (1 - progress) * -s.horizontalSlidePx * 0.5,
      };
    case 'zoom-blur':
      // Dramatic impact reveal: element starts large + blurred, settles to normal
      // ⚠️ scale 2.0, blur 30px INVENTED — AE practice for dramatic MG reveals
      return { ...NEUTRAL, opacity: progress,
        scaleX: 1 + (1 - progress) * 1.0,
        scaleY: 1 + (1 - progress) * 1.0,
        filterBlur: (1 - progress) * 30,
      };
    case 'scramble':
      // CSS fallback for GSAP ScrambleTextPlugin — opacity fade only.
      // Actual text scramble handled by GSAP timeline in composition-renderer.
      return { ...NEUTRAL, opacity: progress };
    default:
      return { ...NEUTRAL, opacity: progress };
  }
}

// Disney #2 — Anticipation: pattern-specific reverse movement before entrance.
// Scale/pop: ghost appears (low opacity) with slight shrink — "something is about to happen."
// Slide/fade/blur/draw: invisible delay — creates breathing room before entrance.
// ⚠️ Ghost opacity 0.15, shrink 0.1 INVENTED — AE practice: 10-20% ghost, 5-15% reverse scale
function applyAnticipationState(progress: number, pattern: EntrancePattern, s: SpatialConfig): AnimationState {
  switch (pattern) {
    case 'scale-up': {
      const ghostOpacity = progress * 0.15;
      const shrink = s.scaleFrom * (1 - progress * 0.1);
      return { ...NEUTRAL, opacity: ghostOpacity, scaleX: shrink, scaleY: shrink };
    }
    case 'pop': {
      const ghostOpacity = progress * 0.1;
      return { ...NEUTRAL, opacity: ghostOpacity, scaleX: progress * 0.05, scaleY: progress * 0.05 };
    }
    default:
      return { ...NEUTRAL, opacity: 0 };
  }
}

// Disney #5 — Follow Through: settle duration varies by entrance pattern (overlapping action).
// Scale patterns settle longer than slides — heavier visual elements have more inertia.
// Fade/blur/draw have no visible overshoot.
function getSettleFrames(pattern: EntrancePattern): number {
  switch (pattern) {
    case 'scale-up':
    case 'pop':
      // CRG technique:animation.pop_in settle 0.1s ≈ 3 frames; extended for full oscillation
      // ⚠️ 8 frames INVENTED — AE practice: 4-12 frames for scale settle
      return 8;
    case 'slide-left':
    case 'slide-right':
    case 'slide-up':
    case 'slide-down':
      // ⚠️ 6 frames INVENTED — position overshoots less visibly than scale
      return 6;
    case 'rotate-in':
      // ⚠️ 6 frames INVENTED — rotational inertia similar to translational (same class as slide)
      return 6;
    case 'skew-in':
      // ⚠️ 4 frames INVENTED — lighter visual weight than rotation
      return 4;
    case 'zoom-blur':
      // ⚠️ 8 frames INVENTED — heavy visual element, same class as scale
      return 8;
    case 'fade':
    case 'blur-in':
    case 'draw':
    case 'scramble':
    default:
      return 0;
  }
}

// Disney #5 — Follow Through: damped cosine oscillation after entrance.
// Peak overshoot at progress=0, decays quadratically to NEUTRAL at progress=1.
// One full oscillation: overshoot → zero-cross → undershoot → settle.
function applyFollowThrough(progress: number, pattern: EntrancePattern): AnimationState {
  const decay = (1 - progress) * (1 - progress);
  const wave = Math.cos(progress * Math.PI * 2) * decay;

  switch (pattern) {
    case 'scale-up':
    case 'pop':
      // CRG technique:animation.pop_in — overshoot 3-5% past target
      // ⚠️ 0.04 (4%) amplitude ← CRG midpoint of 3-5% range
      return { ...NEUTRAL, scaleX: 1 + wave * 0.04, scaleY: 1 + wave * 0.04 };
    case 'slide-left':
      // ⚠️ 3px position overshoot ← CRG technique:animation.bounce_drop 2-5px range
      return { ...NEUTRAL, translateX: wave * 3 };
    case 'slide-right':
      return { ...NEUTRAL, translateX: wave * -3 };
    case 'slide-up':
      return { ...NEUTRAL, translateY: wave * -3 };
    case 'slide-down':
      return { ...NEUTRAL, translateY: wave * 3 };
    case 'rotate-in':
      // ⚠️ 1.5deg overshoot INVENTED — 10% of 15deg entrance rotation
      return { ...NEUTRAL, rotation: wave * -1.5 };
    case 'skew-in':
      // ⚠️ 1deg overshoot INVENTED — 10% of 10deg entrance skew
      return { ...NEUTRAL, skewX: wave * -1 };
    case 'zoom-blur':
      // ⚠️ 0.04 (4%) scale overshoot — same range as scale-up/pop
      return { ...NEUTRAL, scaleX: 1 + wave * 0.04, scaleY: 1 + wave * 0.04 };
    default:
      return { ...NEUTRAL };
  }
}

// Hold-phase ambient animation — subtle looping motion during the hold phase.
// 90-frame cycle (~3s at 30fps) ⚠️ INVENTED — AE practice: 2-4s ambient cycles
const HOLD_CYCLE_FRAMES = 90;

function applyHoldAnimation(frame: number, timing: ComputedChoreography, pattern: HoldPattern): AnimationState {
  const elapsed = frame - timing.holdStartFrame;
  const phase = (elapsed % HOLD_CYCLE_FRAMES) / HOLD_CYCLE_FRAMES;

  switch (pattern) {
    case 'pulse': {
      // ⚠️ 0.02 amplitude INVENTED — AE practice: 1-3% scale for subtle ambient pulse
      const wave = Math.sin(phase * Math.PI * 2);
      return { ...NEUTRAL, scaleX: 1 + wave * 0.02, scaleY: 1 + wave * 0.02 };
    }
    case 'breathe': {
      // ⚠️ 0.15 range INVENTED — AE practice: 10-20% opacity variance for breathing
      const wave = (1 + Math.cos(phase * Math.PI * 2)) * 0.5;
      return { ...NEUTRAL, opacity: 0.85 + wave * 0.15 };
    }
    case 'gentle-float': {
      // ⚠️ 3px amplitude INVENTED — AE practice: 2-5px for subtle floating at MG scale
      const wave = Math.sin(phase * Math.PI * 2);
      return { ...NEUTRAL, translateY: wave * 3 };
    }
    case 'glow': {
      // Pulsing text shadow + brightness for neon/emphasis effect
      // ⚠️ 8px shadow, 1.1 brightness INVENTED — AE practice: 6-12px glow, 105-115% brightness for neon pulse
      const wave = (1 + Math.sin(phase * Math.PI * 2)) * 0.5;
      return { ...NEUTRAL, textShadowBlur: wave * 8, filterBrightness: 1 + wave * 0.1 };
    }
    case 'morph':
      // CSS fallback for GSAP MorphSVGPlugin — subtle scale oscillation.
      // Actual SVG path morphing handled by GSAP timeline in composition-renderer.
      // ⚠️ 0.015 amplitude INVENTED — weaker than pulse (0.02), morph is subtle shape change
      return { ...NEUTRAL, scaleX: 1 + Math.sin(phase * Math.PI * 2) * 0.015, scaleY: 1 + Math.cos(phase * Math.PI * 2) * 0.015 };
    case 'static':
    default:
      return { ...NEUTRAL };
  }
}

function applyExitState(progress: number, pattern: ExitPattern, s: SpatialConfig): AnimationState {
  const inv = 1 - progress;
  // Disney #7 — Arc: mirrors entrance arc curve
  const arc = Math.sin(progress * Math.PI) * 0.2;

  switch (pattern) {
    case 'fade':
      return { ...NEUTRAL, opacity: inv };
    case 'slide-left':
      return { ...NEUTRAL, opacity: inv,
        translateX: progress * -s.horizontalSlidePx,
        translateY: -arc * s.verticalSlidePx,
      };
    case 'slide-right':
      return { ...NEUTRAL, opacity: inv,
        translateX: progress * s.horizontalSlidePx,
        translateY: -arc * s.verticalSlidePx,
      };
    case 'slide-up':
      return { ...NEUTRAL, opacity: inv,
        translateY: progress * -s.verticalSlidePx,
        translateX: arc * s.horizontalSlidePx,
      };
    case 'slide-down':
      return { ...NEUTRAL, opacity: inv,
        translateY: progress * s.verticalSlidePx,
        translateX: -arc * s.horizontalSlidePx,
      };
    case 'scale-down': {
      // Disney #1 — Squash & Stretch: compress before shrinking away
      // ⚠️ 0.08 factor INVENTED — mirrors entrance scale-up squash
      const squash = Math.sin(progress * Math.PI * 1.5) * 0.08 * (1 - progress);
      return { ...NEUTRAL, opacity: inv, scaleX: inv * (1 + squash * 0.5), scaleY: inv * (1 - squash) };
    }
    case 'blur-out':
      // filterBlur 0→20px ← mirrors blur-in entrance
      return { ...NEUTRAL, opacity: inv, filterBlur: progress * 20 };
    case 'draw-reverse':
      return { ...NEUTRAL, clipProgress: inv };
    case 'rotate-out':
      return { ...NEUTRAL, opacity: inv, rotation: progress * -15, scaleX: inv, scaleY: inv };
    case 'skew-out':
      return { ...NEUTRAL, opacity: inv,
        skewX: progress * -10,
        translateX: progress * s.horizontalSlidePx * 0.5,
      };
    case 'zoom-blur-out':
      return { ...NEUTRAL, opacity: inv,
        scaleX: 1 + progress * 1.0,
        scaleY: 1 + progress * 1.0,
        filterBlur: progress * 30,
      };
    case 'scramble-out':
      // CSS fallback — opacity fade. Actual text un-scramble handled by GSAP.
      return { ...NEUTRAL, opacity: inv };
    default:
      return { ...NEUTRAL, opacity: inv };
  }
}

export function buildTransformStyle(anim: AnimationState): React.CSSProperties {
  const transforms: string[] = [];
  if (anim.translateX !== 0) transforms.push(`translateX(${anim.translateX}px)`);
  if (anim.translateY !== 0) transforms.push(`translateY(${anim.translateY}px)`);
  if (anim.scaleX !== 1 || anim.scaleY !== 1) {
    transforms.push(anim.scaleX === anim.scaleY
      ? `scale(${anim.scaleX})`
      : `scale(${anim.scaleX}, ${anim.scaleY})`);
  }
  if (anim.rotation !== 0) transforms.push(`rotate(${anim.rotation}deg)`);
  if (anim.skewX !== 0) transforms.push(`skewX(${anim.skewX}deg)`);

  const filters: string[] = [];
  if (anim.filterBlur > 0) filters.push(`blur(${anim.filterBlur}px)`);
  if (anim.filterBrightness !== 1) filters.push(`brightness(${anim.filterBrightness})`);
  if (anim.filterContrast !== 1) filters.push(`contrast(${anim.filterContrast})`);
  if (anim.filterSaturate !== 1) filters.push(`saturate(${anim.filterSaturate})`);

  return {
    opacity: anim.opacity,
    transform: transforms.length > 0 ? transforms.join(' ') : undefined,
    filter: filters.length > 0 ? filters.join(' ') : undefined,
    willChange: 'transform, opacity',
  };
}

export function buildShapeStyle(
  el: ResolvedElement,
  anim: AnimationState,
): React.CSSProperties {
  const base = buildTransformStyle(anim);
  const p = el.resolvedProps;

  const style: React.CSSProperties = {
    ...base,
    backgroundColor: p.fill as string || 'transparent',
    borderRadius: p.radius != null ? `${p.radius}px` : undefined,
    border: p.borderWeight ? `${p.borderWeight}px solid rgba(255,255,255,${p.borderOpacity || 0.1})` : undefined,
    boxShadow: p.shadow as string || undefined,
  };

  if (p.opacity != null) {
    style.backgroundColor = applyOpacity(p.fill as string, p.opacity as number);
  }
  if (p.blur) {
    style.backdropFilter = `blur(${p.blur}px)`;
    style.WebkitBackdropFilter = `blur(${p.blur}px)`;
  }

  if (p.anchorX != null || p.anchorY != null) {
    const ax = p.anchorX != null ? `${Number(p.anchorX) * 100}%` : '50%';
    const ay = p.anchorY != null ? `${Number(p.anchorY) * 100}%` : '50%';
    style.transformOrigin = `${ax} ${ay}`;
  }

  if (p.strokeColor) {
    style.borderColor = p.strokeColor as string;
  }

  if (p.mixBlendMode) {
    style.mixBlendMode = p.mixBlendMode as React.CSSProperties['mixBlendMode'];
  }

  if (p.gradientPosition != null) {
    style.backgroundPosition = String(p.gradientPosition);
  }

  if (el.shape === 'line') {
    style.height = `${p.width || 3}px`;
    style.backgroundColor = p.color as string || '#FFFFFF';
    style.borderRadius = undefined;
    if (anim.clipProgress < 1) {
      style.clipPath = `inset(0 ${(1 - anim.clipProgress) * 100}% 0 0)`;
    }
  }

  if (el.shape === 'pill') {
    style.borderRadius = '999px';
  }

  if (el.shape === 'circle') {
    style.borderRadius = '50%';
  }

  // Structural-move anchoring: position relative to the content block via CSS.
  // Deterministic (no DOM measurement) — Remotion-safe. The content flex container
  // is the positioning context (see resolveLayout: position absolute + isolation).
  if (el.anchor && el.anchor.mode !== 'flow') {
    const a = el.anchor;
    if (a.mode === 'flow-span') {
      // Stays in the flex flow (between elements) but stretches to full column width.
      // For rules (divider/underline): thickness sets the line height.
      style.alignSelf = 'stretch';
      style.width = '100%';
      if (a.thickness != null) style.height = `${a.thickness}px`;
    } else {
      style.position = 'absolute';
      if (a.mode === 'block-fill') {
        const ins = a.inset ?? 0;
        style.top = `${ins}px`;
        style.right = `${ins}px`;
        style.bottom = `${ins}px`;
        style.left = `${ins}px`;
        // Backdrop sits BEHIND static-flow content. z-index:-1 + wrapper isolation
        // keeps it contained below the text without touching every text element.
        if (el.layer === 'background') style.zIndex = -1;
      } else if (a.mode === 'block-edge') {
        const t = a.thickness ?? 4;
        const side = a.side ?? 'bottom';
        if (side === 'left') { style.left = 0; style.top = 0; style.bottom = 0; style.width = `${t}px`; style.height = undefined; }
        else if (side === 'right') { style.right = 0; style.top = 0; style.bottom = 0; style.width = `${t}px`; style.height = undefined; }
        else if (side === 'top') { style.top = 0; style.left = 0; style.right = 0; style.height = `${t}px`; }
        else { style.bottom = 0; style.left = 0; style.right = 0; style.height = `${t}px`; }
      }
    }
  }

  return style;
}

export function buildTextStyle(
  el: ResolvedElement,
  anim: AnimationState,
): React.CSSProperties {
  const base = buildTransformStyle(anim);
  const p = el.resolvedProps;

  const baseFontSize = p.minSize
    ? Math.max(Number(p.minSize), 64 * (Number(p.sizeScale) || 1))
    : undefined;

  const computedFontSize = baseFontSize && anim.fontSize !== 1
    ? baseFontSize * anim.fontSize
    : baseFontSize;

  const baseLetterSpacing = p.tracking as string || undefined;
  const computedLetterSpacing = anim.letterSpacing !== 0
    ? (baseLetterSpacing ? `calc(${baseLetterSpacing} + ${anim.letterSpacing}px)` : `${anim.letterSpacing}px`)
    : baseLetterSpacing;

  const style: React.CSSProperties = {
    ...base,
    fontFamily: p.font as string || undefined,
    fontWeight: p.weight as number || undefined,
    fontSize: computedFontSize ? `${computedFontSize}px` : undefined,
    color: p.color as string || '#FFFFFF',
    letterSpacing: computedLetterSpacing,
    textTransform: p.transform as React.CSSProperties['textTransform'] || undefined,
    lineHeight: p.lineHeight != null ? Number(p.lineHeight) : 1.2,
  };

  if (p.anchorX != null || p.anchorY != null) {
    const ax = p.anchorX != null ? `${Number(p.anchorX) * 100}%` : '50%';
    const ay = p.anchorY != null ? `${Number(p.anchorY) * 100}%` : '50%';
    style.transformOrigin = `${ax} ${ay}`;
  }

  if (anim.textShadowBlur > 0) {
    const shadowColor = p.color as string || '#FFFFFF';
    style.textShadow = `0 0 ${anim.textShadowBlur}px ${shadowColor}`;
  }

  return style;
}

function applyOpacity(color: string | undefined, opacity: number): string {
  if (!color) return `rgba(0,0,0,${opacity})`;
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${opacity})`;
  }
  return color;
}

// ─── Audio-Reactive Modulation ──────────────────────────
// Modulates AnimationState based on per-frame signal values during HOLD phase.
// Entrance and exit phases use easing-driven animation (not reactive).
//
// Signal curves are pre-computed at pipeline time and serialized into overlay props.
// At render time, this function reads signalCurves[frame] — O(1) array index, no I/O.
//
// Sources:
//   creative_production_knowledge_v3:1638 "synchresis: visual + audio at same frame = viewer FEELS it"
//   creative_production_knowledge_v3:2382 "synchresis breaks at ~40ms" — per-frame (33ms) is within window
//   CRG signal:audio.music_beat — "timestamps + beat_type (downbeat|upbeat|offbeat)"
//
// D6: 7 Beat Hierarchy Levels (continuous 0-1):
//   0.0       = no beat
//   0.0-0.15  = tatum    (16th note subdivision — micro-flutter)
//   0.15-0.3  = tactus   (quarter note — perceived beat, foot-tap)
//   0.3-0.5   = bar      (bar boundary — moderate emphasis)
//   0.5-0.7   = downbeat (first beat of bar — strongest metric position)
//   0.7-0.85  = phrase   (4-8 bar boundary — structural)
//   0.85-1.0  = section  (verse/chorus/bridge — major transition)
//   onset (separate curve) = audio transient — sharp spike independent of metric position
//
// Response scales quadratically: tatum gets micro-pulse, section gets full emphasis.
// ⚠️ ALL amplitudes INVENTED — need calibration against reference videos

export interface SignalCurves {
  [signalName: string]: number[];
}

export function applyAudioReactiveModulation(
  anim: AnimationState,
  frame: number,
  timing: ComputedChoreography,
  curves?: SignalCurves,
): AnimationState {
  if (!curves || Object.keys(curves).length === 0) return anim;

  const isHoldPhase = frame > timing.enterEndFrame && frame < timing.exitStartFrame;
  if (!isHoldPhase) return anim;

  let { opacity, scaleX, scaleY, filterBrightness, rotation } = anim;

  // D6: 7-level beat hierarchy. Primary path uses continuous beat_level (0-1).
  // Fallback: legacy binary music_beat (0/1) mapped to tactus level (0.25).
  let beatLevel = readCurve(curves, 'beat_level', frame);
  if (beatLevel <= 0) {
    const legacyBeat = readCurve(curves, 'music_beat', frame);
    if (legacyBeat > 0.5) beatLevel = 0.25;
  }
  if (beatLevel > 0) {
    const response = computeBeatResponse(beatLevel);
    scaleX *= 1 + response.scaleX;
    scaleY *= 1 + response.scaleY;
    filterBrightness = Math.min(1.3, filterBrightness * (1 + response.brightness));
    if (response.rotation !== 0) {
      rotation += response.rotation;
    }
  }

  // Onset: audio transient (percussive hit, syllable attack). Separate from metric beat.
  // Sharp brightness spike only — transients are visual "pops" not sustained pulses.
  // ⚠️ 0.08 (8%) brightness spike INVENTED — AE practice: transient response is sharper than beat
  const onsetValue = readCurve(curves, 'onset', frame);
  if (onsetValue > 0.5) {
    filterBrightness = Math.min(1.3, filterBrightness * 1.08);
  }

  const energyValue = readCurve(curves, 'energy', frame);
  if (isFinite(energyValue)) {
    opacity = Math.max(0.5, Math.min(1, opacity + (energyValue - 0.5) * 0.1));
  }

  const emotionValue = readCurve(curves, 'emotion_intensity', frame);
  if (isFinite(emotionValue) && emotionValue > 0.3) {
    const boost = 1 + (emotionValue - 0.3) * 0.03;
    scaleX *= boost;
    scaleY *= boost;
  }

  return { ...anim, opacity, scaleX, scaleY, filterBrightness, rotation };
}

// D6: Compute visual response from beat hierarchy level.
// Quadratic scaling — higher metric levels get disproportionately stronger response.
// Disney #1 S&S preserved: scaleX > scaleY (wider + shorter for physical impact).
interface BeatResponse { scaleX: number; scaleY: number; brightness: number; rotation: number }

function computeBeatResponse(level: number): BeatResponse {
  const intensity = level * level; // quadratic — emphasizes structural levels
  // ⚠️ 0.05 max scale INVENTED — CRG overshoot 102-105% maps to 2-5% range
  const scaleAmount = intensity * 0.05;
  return {
    scaleX: scaleAmount,
    scaleY: scaleAmount * 0.5, // S&S: vertical gets half to approximate area preservation
    // ⚠️ 0.06 max brightness INVENTED — needs calibration
    brightness: intensity * 0.06,
    // ⚠️ 0.5° max rotation INVENTED — phrase/section levels add dimensional interest
    rotation: level > 0.7 ? (level - 0.7) * 1.667 * 0.5 : 0,
  };
}

function readCurve(curves: SignalCurves, name: string, frame: number): number {
  const curve = curves[name];
  if (!curve || frame < 0 || frame >= curve.length) return 0;
  const value = curve[frame];
  return typeof value === 'number' && isFinite(value) ? value : 0;
}
