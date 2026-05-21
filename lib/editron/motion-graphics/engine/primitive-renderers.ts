import type { MotionTokens } from '../types';
import type { ResolvedElement, ComputedChoreography, EntrancePattern, ExitPattern } from './recipe-types';

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
    verticalSlidePx: Math.round(20 * paddingScale),   // 20px base ← StatCounter.tsx:84
    horizontalSlidePx: Math.round(30 * paddingScale),  // 30px base ← 20 × 1.5 (AE convention)
    scaleFrom: hasOvershoot ? 0.85 : 0.92,             // 0.92 base ← StatCounter.tsx:90, 0.85 for overshoot
  };
}

export interface AnimationState {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  clipProgress: number;
}

export function computeAnimationState(
  frame: number,
  timing: ComputedChoreography,
  entrancePattern: EntrancePattern,
  exitPattern: ExitPattern,
  spatial: SpatialConfig,
): AnimationState {
  const state: AnimationState = { opacity: 1, translateX: 0, translateY: 0, scale: 1, clipProgress: 1 };

  if (frame < timing.enterStartFrame) {
    return applyEntranceState(0, entrancePattern, spatial);
  }

  if (frame <= timing.enterEndFrame) {
    const raw = (frame - timing.enterStartFrame) / Math.max(1, timing.enterEndFrame - timing.enterStartFrame);
    const progress = timing.enterEasing(Math.min(1, Math.max(0, raw)));
    return applyEntranceState(progress, entrancePattern, spatial);
  }

  if (frame >= timing.exitStartFrame && frame <= timing.exitEndFrame) {
    const raw = (frame - timing.exitStartFrame) / Math.max(1, timing.exitEndFrame - timing.exitStartFrame);
    const progress = timing.exitEasing(Math.min(1, Math.max(0, raw)));
    return applyExitState(progress, exitPattern, spatial);
  }

  if (frame > timing.exitEndFrame) {
    return applyExitState(1, exitPattern, spatial);
  }

  return state;
}

function applyEntranceState(progress: number, pattern: EntrancePattern, s: SpatialConfig): AnimationState {
  switch (pattern) {
    case 'fade':
      return { opacity: progress, translateX: 0, translateY: 0, scale: 1, clipProgress: 1 };
    case 'slide-left':
      return { opacity: progress, translateX: (1 - progress) * -s.horizontalSlidePx, translateY: 0, scale: 1, clipProgress: 1 };
    case 'slide-right':
      return { opacity: progress, translateX: (1 - progress) * s.horizontalSlidePx, translateY: 0, scale: 1, clipProgress: 1 };
    case 'slide-up':
      return { opacity: progress, translateX: 0, translateY: (1 - progress) * s.verticalSlidePx, scale: 1, clipProgress: 1 };
    case 'slide-down':
      return { opacity: progress, translateX: 0, translateY: (1 - progress) * -s.verticalSlidePx, scale: 1, clipProgress: 1 };
    case 'scale-up':
      return { opacity: progress, translateX: 0, translateY: 0, scale: s.scaleFrom + progress * (1 - s.scaleFrom), clipProgress: 1 };
    case 'pop':
      return { opacity: progress, translateX: 0, translateY: 0, scale: progress, clipProgress: 1 };
    case 'blur-in':
      return { opacity: progress, translateX: 0, translateY: 0, scale: 1, clipProgress: 1 };
    case 'draw':
      return { opacity: 1, translateX: 0, translateY: 0, scale: 1, clipProgress: progress };
    default:
      return { opacity: progress, translateX: 0, translateY: 0, scale: 1, clipProgress: 1 };
  }
}

function applyExitState(progress: number, pattern: ExitPattern, s: SpatialConfig): AnimationState {
  const inv = 1 - progress;
  switch (pattern) {
    case 'fade':
      return { opacity: inv, translateX: 0, translateY: 0, scale: 1, clipProgress: 1 };
    case 'slide-left':
      return { opacity: inv, translateX: progress * -s.horizontalSlidePx, translateY: 0, scale: 1, clipProgress: 1 };
    case 'slide-right':
      return { opacity: inv, translateX: progress * s.horizontalSlidePx, translateY: 0, scale: 1, clipProgress: 1 };
    case 'slide-up':
      return { opacity: inv, translateX: 0, translateY: progress * -s.verticalSlidePx, scale: 1, clipProgress: 1 };
    case 'slide-down':
      return { opacity: inv, translateX: 0, translateY: progress * s.verticalSlidePx, scale: 1, clipProgress: 1 };
    case 'scale-down':
      return { opacity: inv, translateX: 0, translateY: 0, scale: inv, clipProgress: 1 };
    case 'blur-out':
      return { opacity: inv, translateX: 0, translateY: 0, scale: 1, clipProgress: 1 };
    case 'draw-reverse':
      return { opacity: 1, translateX: 0, translateY: 0, scale: 1, clipProgress: inv };
    default:
      return { opacity: inv, translateX: 0, translateY: 0, scale: 1, clipProgress: 1 };
  }
}

export function buildTransformStyle(anim: AnimationState): React.CSSProperties {
  const transforms: string[] = [];
  if (anim.translateX !== 0) transforms.push(`translateX(${anim.translateX}px)`);
  if (anim.translateY !== 0) transforms.push(`translateY(${anim.translateY}px)`);
  if (anim.scale !== 1) transforms.push(`scale(${anim.scale})`);

  return {
    opacity: anim.opacity,
    transform: transforms.length > 0 ? transforms.join(' ') : undefined,
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

  const fontSize = p.minSize
    ? Math.max(Number(p.minSize), 64 * (Number(p.sizeScale) || 1))
    : undefined;

  return {
    ...base,
    fontFamily: p.font as string || undefined,
    fontWeight: p.weight as number || undefined,
    fontSize: fontSize ? `${fontSize}px` : undefined,
    color: p.color as string || '#FFFFFF',
    letterSpacing: p.tracking as string || undefined,
    textTransform: p.transform as React.CSSProperties['textTransform'] || undefined,
    lineHeight: 1.2,
  };
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
// Beat accent width: 1.3x multiplier ← ⚠️ INVENTED, needs calibration

export interface SignalCurves {
  [signalName: string]: number[];
}

/**
 * Apply audio-reactive modulation to an AnimationState during the HOLD phase.
 * Returns the original state unmodified during entrance/exit.
 *
 * @param anim - Base animation state from computeAnimationState()
 * @param frame - Current frame number
 * @param timing - Choreography timing for this element
 * @param curves - Pre-computed signal curves (key = signal name, value = per-frame values)
 * @returns Modulated AnimationState
 */
export function applyAudioReactiveModulation(
  anim: AnimationState,
  frame: number,
  timing: ComputedChoreography,
  curves?: SignalCurves,
): AnimationState {
  if (!curves || Object.keys(curves).length === 0) return anim;

  // Only modulate during HOLD phase (graphic fully visible)
  const isHoldPhase = frame > timing.enterEndFrame && frame < timing.exitStartFrame;
  if (!isHoldPhase) return anim;

  let { opacity, scale } = anim;
  const { translateX, translateY, clipProgress } = anim;

  // Beat pulse: scale bump on music beats
  // ← signal:audio.music_beat = 0 or 1 per frame
  // ← creative_production_knowledge_v3:3496 overshoot 102-105%: using 1.03 (3%)
  const beatValue = readCurve(curves, 'music_beat', frame);
  if (beatValue > 0.5) {
    scale *= 1.03; // 3% scale pulse on beat ← creative doc overshoot range
  }

  // Energy breathing: subtle opacity modulation from speech energy
  // ← signal:speech.energy = 0-1 continuous
  // ⚠️ INVENTED magnitude (±0.05, 5% opacity). Needs calibration.
  const energyValue = readCurve(curves, 'energy', frame);
  if (isFinite(energyValue)) {
    opacity = Math.max(0.5, Math.min(1, opacity + (energyValue - 0.5) * 0.1));
  }

  // Emotion intensity: scale breathing
  // ← signal:speech.emotion_intensity (Wav2Vec) = 0-1 continuous
  // ⚠️ INVENTED magnitude (±0.02, 2% scale). Needs calibration.
  const emotionValue = readCurve(curves, 'emotion_intensity', frame);
  if (isFinite(emotionValue) && emotionValue > 0.3) {
    scale *= 1 + (emotionValue - 0.3) * 0.03; // max ~2% at emotion_intensity=1.0
  }

  return { opacity, scale, translateX, translateY, clipProgress };
}

/**
 * Read a signal curve value at a specific frame.
 * Returns 0 if the curve doesn't exist or the frame is out of range.
 */
function readCurve(curves: SignalCurves, name: string, frame: number): number {
  const curve = curves[name];
  if (!curve || frame < 0 || frame >= curve.length) return 0;
  const value = curve[frame];
  return typeof value === 'number' && isFinite(value) ? value : 0;
}
