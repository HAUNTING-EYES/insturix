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
    case 'fade':
    case 'blur-in':
    case 'draw':
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
//   signal:audio.music_beat (CRG line 2293): binary 0/1 per frame
//
// Beat pulse: 1.03x scale on beat ← creative_production_knowledge_v3:3496 (overshoot 102-105%)
// Energy opacity: ±0.1 modulation ← ⚠️ INVENTED, needs calibration
// Beat brightness: 1.05x on beat ← ⚠️ INVENTED, needs calibration

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

  let { opacity, scaleX, scaleY, filterBrightness } = anim;

  const beatValue = readCurve(curves, 'music_beat', frame);
  if (beatValue > 0.5) {
    // Disney #1 — Squash & Stretch on beat: wider + shorter for physical impact
    // Area-preserved: 1.04 × 1.02 = 1.0608 ≈ old 1.03 × 1.03 = 1.0609
    // ⚠️ 1.04/1.02 divergence INVENTED — needs calibration
    scaleX *= 1.04;
    scaleY *= 1.02;
    filterBrightness = Math.min(1.3, filterBrightness * 1.05);
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

  return { ...anim, opacity, scaleX, scaleY, filterBrightness };
}

function readCurve(curves: SignalCurves, name: string, frame: number): number {
  const curve = curves[name];
  if (!curve || frame < 0 || frame >= curve.length) return 0;
  const value = curve[frame];
  return typeof value === 'number' && isFinite(value) ? value : 0;
}
