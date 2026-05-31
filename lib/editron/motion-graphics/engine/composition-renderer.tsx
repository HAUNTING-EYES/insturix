import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { CompositionRendererProps } from './recipe-types';
import type { ResolvedElement, ComputedChoreography, DepthLayer } from './recipe-types';
import { resolveElements } from './property-resolver';
import { computeChoreography, type SyncData } from './choreography-computer';
import { computeAnimationState, buildShapeStyle, buildTextStyle, fitFontSize, buildTransformStyle, deriveSpatialConfig, applyAudioReactiveModulation, type SpatialConfig, type SignalCurves, type AnimationState } from './primitive-renderers';
import type { MGKeyframe, MGKeyframeTrack, MGSpeedRamp } from './recipe-types';
import { BarChart, PercentageRing, Sparkline } from './data-viz-renderers';
import { useGSAPTimeline, buildScrambleEntrance, buildScrambleExit, buildDrawSVGEntrance, buildDrawSVGExit, buildMorphHold, areTimelinePluginsAvailable } from './gsap-timeline';
import { noise2D } from '@remotion/noise';

// Z-ordering: background renders first (behind), foreground last (on top)
const DEPTH_ORDER: Record<DepthLayer, number> = {
  background: 0,
  midground: 1,
  foreground: 2,
};

interface CompositionRendererInternalProps extends CompositionRendererProps {
  syncData?: SyncData;
  signalCurves?: SignalCurves;
}

export const CompositionRenderer: React.FC<CompositionRendererInternalProps> = ({
  recipe,
  language,
  content,
  durationInFrames,
  syncData,
  signalCurves,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const resolvedElements = resolveElements(recipe.elements, language, content);
  const spatial = deriveSpatialConfig(language);

  const choreographyMap = computeChoreography({
    elements: resolvedElements,
    tokens: language,
    durationInFrames,
    fps,
    exitStyle: recipe.exitStyle,
    recipeChoreography: recipe.choreography,
    syncData,
  });

  // Z-order: sort by depth layer so background renders first, foreground last
  const sorted = [...resolvedElements].sort((a, b) => {
    const aDepth = DEPTH_ORDER[a.layer || 'foreground'];
    const bDepth = DEPTH_ORDER[b.layer || 'foreground'];
    return aDepth - bDepth;
  });

  const layoutStyle = resolveLayout(recipe.layout);
  // G-1: px box width for text fit = canvas width × the layout's max-width fraction.
  const boxWidthPx = width * layoutMaxWidthFraction(recipe.layout.position);

  return (
    <div style={layoutStyle}>
      {sorted.map((el, idx) => {
        const timing = choreographyMap.get(el.role);
        if (!timing) return null;

        return (
          <PrimitiveElement
            key={`${el.role}-${idx}`}
            element={el}
            timing={timing}
            frame={frame}
            fps={fps}
            content={content}
            spatial={spatial}
            signalCurves={signalCurves}
            boxWidthPx={boxWidthPx}
            canvasHeight={height}
          />
        );
      })}
    </div>
  );
};

interface PrimitiveElementProps {
  element: ResolvedElement;
  timing: ComputedChoreography;
  frame: number;
  fps: number;
  content: Record<string, unknown>;
  spatial: SpatialConfig;
  signalCurves?: SignalCurves;
  boxWidthPx: number;
  canvasHeight: number;
}

const PrimitiveElement: React.FC<PrimitiveElementProps> = ({
  element,
  timing,
  frame,
  fps,
  spatial,
  signalCurves,
  boxWidthPx,
  canvasHeight,
}) => {
  // D8: Speed ramp — remap frame through speed curve before computing animation
  const effectiveFrame = element.speedRamp
    ? remapFrameBySpeed(frame, element.speedRamp, timing)
    : frame;

  const baseAnim = computeAnimationState(effectiveFrame, timing, element.entrancePattern, element.exitPattern, spatial, element.holdAnimation);

  // D8: Keyframe overrides — per-property animation curves on top of phase animation
  const keyframedAnim = element.keyframeTracks?.length
    ? applyMGKeyframes(baseAnim, effectiveFrame, timing, element.keyframeTracks)
    : baseAnim;

  // Audio-reactive modulation: beat pulse, energy breathing, emotion scale (hold phase only)
  const anim = applyAudioReactiveModulation(keyframedAnim, frame, timing, signalCurves);

  if (anim.opacity <= 0.001) return null;

  switch (element.primitive) {
    case 'shape':
    case 'container':
    case 'decoration':
    case 'gradient': {
      const needsGSAPSVG = element.shape === 'path' && areTimelinePluginsAvailable()
        && (element.entrancePattern === 'draw' || element.holdAnimation === 'morph');
      if (needsGSAPSVG) {
        return <GSAPSVGPathElement element={element} anim={anim} frame={frame} fps={fps} timing={timing} />;
      }
      return <ShapeElement element={element} anim={anim} />;
    }
    case 'pattern':
      return <PatternElement element={element} anim={anim} />;
    case 'text': {
      if (element.entrancePattern === 'scramble' && areTimelinePluginsAvailable()) {
        return <GSAPScrambleTextElement element={element} anim={anim} frame={frame} fps={fps} timing={timing} />;
      }
      return <TextElement element={element} anim={anim} frame={frame} timing={timing} spatial={spatial} signalCurves={signalCurves} boxWidthPx={boxWidthPx} canvasHeight={canvasHeight} />;
    }
    case 'image':
    case 'video-clip':
      return <ImageElement element={element} anim={anim} />;
    case 'data-viz':
      return <DataVizElement element={element} anim={anim} frame={frame} timing={timing} />;
    case 'particle':
      return <ParticleElement element={element} anim={anim} frame={frame} timing={timing} />;
    case 'mask':
      return <MaskElement element={element} anim={anim} frame={frame} timing={timing} />;
    case 'group':
      return <GroupElement element={element} anim={anim} />;
    default:
      console.warn(`[MG-Render] Unknown primitive type: ${element.primitive}`);
      return null;
  }
};

// Neutral animation for group CHILDREN — the group animates as one unit, so its children
// render statically inside it (their visual arrangement is fixed; only the group moves).
const GROUP_CHILD_NEUTRAL: AnimationState = {
  opacity: 1, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0,
  clipProgress: 1, filterBlur: 0, filterBrightness: 1, filterContrast: 1, filterSaturate: 1,
  letterSpacing: 0, fontSize: 1, textShadowBlur: 0, strokeDashoffset: 0,
};

/** Render one group child with optional explicit box positioning (static sub-structure). */
function renderGroupChild(child: ResolvedElement, key: number): React.ReactNode {
  const cp = child.resolvedProps;
  const base = child.primitive === 'text'
    ? buildTextStyle(child, GROUP_CHILD_NEUTRAL)
    : buildShapeStyle(child, GROUP_CHILD_NEUTRAL);
  const style: React.CSSProperties = { ...base };
  if (cp.width != null) style.width = `${Number(cp.width)}px`;
  if (cp.height != null) style.height = `${Number(cp.height)}px`;
  if (cp.top != null) { style.position = 'absolute'; style.top = `${Number(cp.top)}px`; }
  if (cp.left != null) { style.position = 'absolute'; style.left = `${Number(cp.left)}px`; }
  if (cp.right != null) { style.position = 'absolute'; style.right = `${Number(cp.right)}px`; }
  if (cp.bottom != null) { style.position = 'absolute'; style.bottom = `${Number(cp.bottom)}px`; }
  return child.primitive === 'text'
    ? <div key={key} style={style}>{String(cp.text ?? '')}</div>
    : <div key={key} style={style} />;
}

/**
 * Group: a sub-composition. Children are positioned relative to the group box (a positioning
 * context) via flex (default centering), anchor (block-fill/edge), or explicit coords. The
 * WHOLE group animates as one cohesive unit — see GROUP_CHILD_NEUTRAL.
 */
const GroupElement: React.FC<{ element: ResolvedElement; anim: AnimationState }> = ({ element, anim }) => {
  const p = element.resolvedProps;
  const style: React.CSSProperties = {
    ...buildTransformStyle(anim),
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  if (p.width != null) style.width = `${Number(p.width)}px`;
  if (p.height != null) style.height = `${Number(p.height)}px`;
  if (p.top != null) style.top = `${Number(p.top)}px`;
  if (p.left != null) style.left = `${Number(p.left)}px`;
  if (p.right != null) style.right = `${Number(p.right)}px`;
  if (p.bottom != null) style.bottom = `${Number(p.bottom)}px`;
  if (p.gap != null) style.gap = `${Number(p.gap)}px`;
  if (p.justify != null) style.justifyContent = String(p.justify);

  return <div style={style}>{element.children?.map((c, i) => renderGroupChild(c, i))}</div>;
};

const ShapeElement: React.FC<{ element: ResolvedElement; anim: ReturnType<typeof computeAnimationState> }> = ({
  element,
  anim,
}) => {
  const style = buildShapeStyle(element, anim);
  return <div style={style} />;
};

/** Pattern element: renders brand background patterns via CSS background-image (SVG data URIs). */
const PatternElement: React.FC<{ element: ResolvedElement; anim: ReturnType<typeof computeAnimationState> }> = ({
  element,
  anim,
}) => {
  const base = buildShapeStyle(element, anim);
  const p = element.resolvedProps;

  const patternStyle: React.CSSProperties = {
    ...base,
    backgroundImage: p.backgroundImage ? String(p.backgroundImage) : undefined,
    backgroundRepeat: 'repeat',
    backgroundSize: 'auto',
    // Pattern opacity from generator (layered on top of shape opacity)
    opacity: p.patternOpacity != null ? Number(p.patternOpacity) * (base.opacity ?? 1) : base.opacity,
  };

  return <div style={patternStyle} />;
};

/** Data-viz element: dispatches to BarChart, PercentageRing, or Sparkline based on role. */
const DataVizElement: React.FC<{
  element: ResolvedElement;
  anim: ReturnType<typeof computeAnimationState>;
  frame: number;
  timing: ComputedChoreography;
}> = ({ element, anim, frame, timing }) => {
  const transformStyle = buildTransformStyle(anim);
  const p = element.resolvedProps;

  // Compute animation progress (0-1) during hold phase for chart animation
  const holdStart = timing.holdStartFrame;
  const holdDuration = Math.max(1, timing.holdEndFrame - timing.holdStartFrame);
  const progress = Math.min(1, Math.max(0, (frame - holdStart) / Math.min(45, holdDuration)));

  const values: number[] = Array.isArray(p.values)
    ? (p.values as unknown as number[])
    : String(p.values || '').split(',').map(Number).filter(isFinite);
  const labels: string[] | undefined = p.labels
    ? String(p.labels).split(',').map(s => s.trim())
    : undefined;

  const chartProps = {
    values,
    labels,
    color: String(p.color || '#10B981'),
    textColor: String(p.textColor || '#FFFFFF'),
    font: String(p.font || 'Inter'),
    progress,
    width: 400,
    height: 200,
  };

  // Dispatch by role — role is set by composition-planner based on content shape
  const role = element.role;
  const ChartComponent = role.includes('ring') || role.includes('percentage')
    ? PercentageRing
    : role.includes('sparkline') || role.includes('line')
      ? Sparkline
      : BarChart;

  return (
    <div style={transformStyle}>
      <ChartComponent {...chartProps} />
    </div>
  );
};

// G-1: focal-size cap as a fraction of frame height, by role — keeps the "13% of frame" oversize in
// check. INVENTED (industry hero text ~6-10% of frame height); owned by G-7 calibration.
const FOCAL_FRAC: Record<string, number> = { primary: 0.09, counter: 0.09, secondary: 0.055, label: 0.055 };

// G-1b: exact text width via the render's own canvas (no extra dependency). Measures the
// ACTUALLY-rendered glyphs, so the estimator's wide-glyph (W/M) under-count can't spill the card.
// Returns NaN outside a browser (Node scripts/tests) → fitFontSize uses its deterministic estimator.
let _measureCanvas: HTMLCanvasElement | null = null;
function measureWordWidthPx(word: string, fontPx: number, fontFamily: string, weight: number): number {
  if (typeof document === 'undefined' || fontPx <= 0) return NaN;
  _measureCanvas = _measureCanvas || document.createElement('canvas');
  const ctx = _measureCanvas.getContext('2d');
  if (!ctx) return NaN;
  ctx.font = `${weight} ${fontPx}px ${fontFamily}`;
  return ctx.measureText(word).width;
}

/** Render-time fitted font size for a text element, or undefined to fall back to the legacy floor. */
function computeFittedSize(el: ResolvedElement, text: string, boxWidthPx: number, canvasHeight: number): number | undefined {
  const p = el.resolvedProps;
  if (p.minSize == null || !text || boxWidthPx <= 0) return undefined;
  // desired = the signal-driven loudness (planner value), capped to a sane fraction of frame height.
  const desiredRaw = Math.max(Number(p.minSize), 64 * (Number(p.sizeScale) || 1));
  const capPx = canvasHeight * (FOCAL_FRAC[el.role] ?? 0.07);
  const desired = Math.min(desiredRaw, capPx);
  const minReadable = Math.min(desired, 36 * (canvasHeight / 1080)); // CRG type-min floor, resolution-scaled
  const uppercase = /upper/i.test(String(p.transform || ''));
  const bold = Number(p.weight || 400) >= 600;
  const fontFamily = String(p.font || 'sans-serif');
  const weight = Number(p.weight || 400);
  // Exact glyph measurement when rendering in the browser (uppercased to match textTransform);
  // NaN in Node → fitFontSize falls back to its estimator.
  const measure = (t: string, px: number) => measureWordWidthPx(uppercase ? t.toUpperCase() : t, px, fontFamily, weight);
  return fitFontSize(text, boxWidthPx, desired, minReadable, { uppercase, bold }, measure);
}

const TextElement: React.FC<{
  element: ResolvedElement;
  anim: ReturnType<typeof computeAnimationState>;
  frame: number;
  timing: ComputedChoreography;
  spatial: SpatialConfig;
  signalCurves?: SignalCurves;
  boxWidthPx: number;
  canvasHeight: number;
}> = ({ element, anim, frame, timing, spatial, signalCurves, boxWidthPx, canvasHeight }) => {
  const p = element.resolvedProps;
  const text = String(p.text || '');
  // G-1: shrink text to fit its title-safe box (and cap focal size). undefined → legacy floor.
  const fittedSizePx = computeFittedSize(element, text, boxWidthPx, canvasHeight);
  const style = buildTextStyle(element, anim, fittedSizePx);

  if (element.animation === 'count-up') {
    return <CountUpText element={element} style={style} frame={frame} timing={timing} />;
  }

  const splitMode = element.textSplit;
  if (splitMode && splitMode !== 'none' && text.length > 1) {
    return (
      <SplitTextElement
        element={element}
        text={text}
        splitMode={splitMode}
        frame={frame}
        timing={timing}
        spatial={spatial}
        signalCurves={signalCurves}
        containerStyle={style}
        fittedSizePx={fittedSizePx}
      />
    );
  }

  return <div style={style}>{text}</div>;
};

const SplitTextElement: React.FC<{
  element: ResolvedElement;
  text: string;
  splitMode: 'chars' | 'words';
  frame: number;
  timing: ComputedChoreography;
  spatial: SpatialConfig;
  signalCurves?: SignalCurves;
  containerStyle: React.CSSProperties;
  fittedSizePx?: number; // G-1: render-time fit-to-box size (threaded by TextElement)
}> = ({ element, text, splitMode, frame, timing, spatial, signalCurves, containerStyle, fittedSizePx }) => {
  // ROOT FIX for the "SUPERHER/O" mid-word break: split into WORDS first; each word is a
  // white-space:nowrap inline-block, so a word can NEVER break across lines mid-glyph. The flex
  // container wraps only BETWEEN words (multi-line is fine). Chars animate individually inside a word.
  const words = text.split(/(\s+)/); // keeps whitespace tokens as wrap opportunities
  const totalAtoms = splitMode === 'chars'
    ? text.replace(/\s+/g, '').length
    : words.filter(w => w.trim().length > 0).length;
  const entranceDuration = timing.enterEndFrame - timing.enterStartFrame;
  // stagger ratio 0.6 INVENTED — 60% of entrance for stagger spread, 40% overlap
  const staggerTotal = Math.round(entranceDuration * 0.6);
  const perAtomDelay = totalAtoms > 1 ? staggerTotal / (totalAtoms - 1) : 0;

  let atomIdx = 0;
  const renderAtom = (str: string, key: string) => {
    const delay = Math.round(atomIdx * perAtomDelay);
    atomIdx++;
    const offsetTiming: ComputedChoreography = {
      ...timing,
      enterStartFrame: timing.enterStartFrame + delay,
      enterEndFrame: timing.enterEndFrame + delay,
    };
    const unitAnim = computeAnimationState(
      frame, offsetTiming, element.entrancePattern, element.exitPattern, spatial, element.holdAnimation,
    );
    const modulatedAnim = signalCurves
      ? applyAudioReactiveModulation(unitAnim, frame, offsetTiming, signalCurves)
      : unitAnim;
    const unitStyle = buildTextStyle(element, modulatedAnim, fittedSizePx);
    return <span key={key} style={{ ...unitStyle, display: 'inline-block' }}>{str}</span>;
  };

  return (
    <div style={{ ...containerStyle, display: 'flex', flexWrap: 'wrap' }}>
      {words.map((word, wi) => {
        if (word.trim().length === 0) {
          return <span key={`ws-${wi}`} style={{ whiteSpace: 'pre' }}>{word}</span>;
        }
        if (splitMode === 'words') {
          return renderAtom(word, `w-${wi}`);
        }
        // chars mode: the word is a non-breaking group; its chars animate individually.
        return (
          <span key={`w-${wi}`} style={{ whiteSpace: 'nowrap', display: 'inline-block' }}>
            {word.split('').map((ch, ci) => renderAtom(ch, `w-${wi}-c-${ci}`))}
          </span>
        );
      })}
    </div>
  );
};

const CountUpText: React.FC<{
  element: ResolvedElement;
  style: React.CSSProperties;
  frame: number;
  timing: ComputedChoreography;
}> = ({ element, style, frame, timing }) => {
  const p = element.resolvedProps;
  const targetValue = parseFloat(String(p.text || '0'));

  const counterStart = timing.enterEndFrame;
  const counterDuration = Math.min(45, timing.holdEndFrame - timing.holdStartFrame);
  const counterEnd = counterStart + counterDuration;

  let displayValue: number;
  if (frame <= counterStart) {
    displayValue = 0;
  } else if (frame >= counterEnd) {
    displayValue = targetValue;
  } else {
    const raw = (frame - counterStart) / counterDuration;
    const progress = timing.enterEasing(Math.min(1, Math.max(0, raw)));
    displayValue = targetValue * progress;
  }

  const formatted = formatCounterValue(displayValue, targetValue, String(p.prefix || ''), String(p.suffix || ''));

  return <div style={style}>{formatted}</div>;
};

function formatCounterValue(current: number, target: number, prefix: string, suffix: string): string {
  const isDecimal = target % 1 !== 0;
  // Preserve the original value's decimal precision (0.02 → 2 decimals, 3.5 → 1 decimal)
  const targetDecimals = isDecimal ? Math.max(1, (String(target).split('.')[1] || '').length) : 0;
  const formatted = current >= 1000
    ? Math.round(current).toLocaleString('en-US')
    : isDecimal
      ? current.toFixed(targetDecimals)
      : String(Math.round(current));
  return `${prefix}${formatted}${suffix}`;
}

const ImageElement: React.FC<{ element: ResolvedElement; anim: ReturnType<typeof computeAnimationState> }> = ({
  element,
  anim,
}) => {
  const style = buildTransformStyle(anim);
  const p = element.resolvedProps;
  const src = String(p.src || '');
  if (!src) return null;
  const imgStyle: React.CSSProperties = { ...style };
  // Explicit dimensions (avatar headshot, brand logo) → fixed box, cover-cropped.
  // No dimensions → scale to container, contain (original behavior).
  if (p.width != null) imgStyle.width = `${Number(p.width)}px`;
  if (p.height != null) imgStyle.height = `${Number(p.height)}px`;
  if (p.radius != null) imgStyle.borderRadius = `${Number(p.radius)}px`;
  if (p.width != null || p.height != null) {
    imgStyle.objectFit = 'cover';
  } else {
    imgStyle.maxWidth = '100%';
    imgStyle.maxHeight = '100%';
    imgStyle.objectFit = 'contain';
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" style={imgStyle} />;
};

// ─── GSAP-Powered Elements ─────────────────────────────
// These use GSAP timelines for effects CSS cannot handle.
// When GSAP plugins are unavailable, the switch in PrimitiveElement
// falls back to CSS-only TextElement/ShapeElement automatically.

const GSAPScrambleTextElement: React.FC<{
  element: ResolvedElement;
  anim: AnimationState;
  frame: number;
  fps: number;
  timing: ComputedChoreography;
}> = ({ element, anim, frame, fps, timing }) => {
  const p = element.resolvedProps;
  const text = String(p.text || '');
  const scrambleChars = element.scrambleChars;
  const entranceDur = (timing.enterEndFrame - timing.enterStartFrame) / fps;
  const exitDur = (timing.exitEndFrame - timing.exitStartFrame) / fps;

  const containerRef = useGSAPTimeline(frame, fps, (tl, container) => {
    const target = container.querySelector('[data-scramble-target]');
    if (!target) return;

    buildScrambleEntrance(tl, target, text, entranceDur, scrambleChars);

    if (element.exitPattern === 'scramble-out') {
      const exitStartSec = (timing.exitStartFrame - timing.enterStartFrame) / fps;
      tl.to(target, {
        duration: exitDur,
        opacity: 0,
        scrambleText: {
          text: '',
          chars: scrambleChars || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*',
          revealDelay: 0,
          speed: 0.6,
        },
      }, exitStartSec);
    }
  }, timing.enterStartFrame);

  const style = buildTextStyle(element, anim);

  return (
    <div ref={containerRef} style={style}>
      <span data-scramble-target />
    </div>
  );
};

const GSAPSVGPathElement: React.FC<{
  element: ResolvedElement;
  anim: AnimationState;
  frame: number;
  fps: number;
  timing: ComputedChoreography;
}> = ({ element, anim, frame, fps, timing }) => {
  const p = element.resolvedProps;
  const pathData = String(p.pathData || p.d || '');
  const morphTarget = element.morphTarget || String(p.morphTarget || '');
  const strokeColor = String(p.strokeColor || p.color || '#FFFFFF');
  // ⚠️ strokeWidth default 2 ← CRG constant:animation.accent_line_weight 2-3px
  const strokeWidth = Number(p.strokeWidth || 2);
  const fillColor = String(p.fill || 'none');
  const entranceDur = (timing.enterEndFrame - timing.enterStartFrame) / fps;
  const holdDur = (timing.holdEndFrame - timing.holdStartFrame) / fps;
  const exitDur = (timing.exitEndFrame - timing.exitStartFrame) / fps;

  const containerRef = useGSAPTimeline(frame, fps, (tl, container) => {
    const path = container.querySelector('path');
    if (!path) return;

    if (element.entrancePattern === 'draw') {
      buildDrawSVGEntrance(tl, path, entranceDur);
    }

    if (element.holdAnimation === 'morph' && morphTarget) {
      buildMorphHold(tl, path, morphTarget, holdDur, entranceDur);
    }

    if (element.exitPattern === 'draw-reverse') {
      const exitStartSec = (timing.exitStartFrame - timing.enterStartFrame) / fps;
      buildDrawSVGExit(tl, path, exitDur, exitStartSec);
    }
  }, timing.enterStartFrame);

  const baseStyle = buildTransformStyle(anim);
  // SVG viewBox from resolvedProps or default 100×100
  const viewBox = String(p.viewBox || '0 0 100 100');

  return (
    <div ref={containerRef} style={{ ...baseStyle, lineHeight: 0 }}>
      <svg viewBox={viewBox} style={{ width: '100%', height: '100%' }} xmlns="http://www.w3.org/2000/svg">
        <path
          d={pathData}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

// ─── Math-Driven Particles (Remotion-native, deterministic) ──────
// Position = f(frame, seed). No simulation, no rAF. Seekable, O(1) per frame.
// @tsparticles is incompatible with Remotion (forward-only, rAF-dependent).

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

interface ParticlePreset {
  gravity: number;
  drift: number;
  speed: number;
  rotSpeed: number;
  lifetime: number;
  shape: 'circle' | 'rect';
  spawnSpread: number;
  startYRange: [number, number];
}

// ⚠️ ALL preset values INVENTED — no CRG nodes exist for particles. Thompson Sampling calibration target.
const PARTICLE_PRESETS: Record<string, ParticlePreset> = {
  confetti: { gravity: 0.012, drift: 12, speed: 0.03, rotSpeed: 8, lifetime: 90, shape: 'rect', spawnSpread: 15, startYRange: [-10, 10] },
  bokeh:    { gravity: 0, drift: 6, speed: 0.008, rotSpeed: 0, lifetime: 150, shape: 'circle', spawnSpread: 30, startYRange: [10, 90] },
  dust:     { gravity: -0.002, drift: 5, speed: 0.012, rotSpeed: 1, lifetime: 180, shape: 'circle', spawnSpread: 45, startYRange: [20, 80] },
  sparks:   { gravity: -0.02, drift: 8, speed: 0.05, rotSpeed: 12, lifetime: 45, shape: 'circle', spawnSpread: 8, startYRange: [70, 100] },
};

const ParticleElement: React.FC<{
  element: ResolvedElement;
  anim: AnimationState;
  frame: number;
  timing: ComputedChoreography;
}> = ({ element, anim, frame, timing }) => {
  const p = element.resolvedProps;
  const presetName = String(p.particlePreset || 'confetti');
  const preset = PARTICLE_PRESETS[presetName] || PARTICLE_PRESETS.confetti;
  // ⚠️ INVENTED — max 100 (DOM perf ceiling), default 40 (moderate density)
  const count = Math.min(100, Math.max(1, Number(p.particleCount || 40)));
  const baseColor = String(p.color || '#FFFFFF');
  const altColor = String(p.secondaryColor || '#FFD700');
  // ⚠️ INVENTED — 6px base, typical MG overlay particle size
  const baseSize = Number(p.size || 6);

  const seed = hashString(element.role);
  const containerStyle = buildTransformStyle(anim);
  const localFrame = frame - timing.enterStartFrame;
  if (localFrame < 0) return null;

  const particles: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const rng = mulberry32(seed + i * 7919);
    const startX = rng() * 100;
    const startY = preset.startYRange[0] + rng() * (preset.startYRange[1] - preset.startYRange[0]);
    const size = baseSize * (0.5 + rng() * 1.0);
    const startRot = rng() * 360;
    const delay = rng() * preset.spawnSpread;
    const dir = rng() > 0.5 ? 1 : -1;

    const t = localFrame - delay;
    if (t <= 0) continue;

    const x = startX + noise2D(i, t * preset.speed, 0) * preset.drift;
    const y = startY + preset.gravity * t * t + noise2D(i, 0, t * preset.speed) * preset.drift * 0.5;
    const rot = startRot + t * preset.rotSpeed * dir;
    // ⚠️ INVENTED — 5-frame fade-in, lifetime-based fade-out
    const fadeIn = Math.min(1, t / 5);
    const fadeOut = Math.max(0, 1 - t / preset.lifetime);
    const alpha = fadeIn * fadeOut * anim.opacity;

    if (alpha <= 0.01 || x < -10 || x > 110 || y < -10 || y > 110) continue;

    particles.push(
      <div key={i} style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: preset.shape === 'circle' ? size : size * 0.6,
        borderRadius: preset.shape === 'circle' ? '50%' : '2px',
        backgroundColor: i % 3 === 0 ? altColor : baseColor,
        opacity: alpha,
        transform: `translate(-50%, -50%) rotate(${rot}deg)`,
      }} />,
    );
  }

  return (
    <div style={{ ...containerStyle, position: 'relative', width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none' }}>
      {particles}
    </div>
  );
};

// ─── Mask Element (clip-path reveals) ────────────────────────────

const MaskElement: React.FC<{
  element: ResolvedElement;
  anim: AnimationState;
  frame: number;
  timing: ComputedChoreography;
}> = ({ element, anim, frame, timing }) => {
  const p = element.resolvedProps;
  const maskShape = element.shape || 'rect';
  const direction = String(p.direction || 'left');

  const enterDur = Math.max(1, timing.enterEndFrame - timing.enterStartFrame);
  const exitDur = Math.max(1, timing.exitEndFrame - timing.exitStartFrame);
  const enterProgress = frame <= timing.enterStartFrame ? 0
    : frame >= timing.enterEndFrame ? 1
    : timing.enterEasing((frame - timing.enterStartFrame) / enterDur);
  const exitProgress = frame < timing.exitStartFrame ? 1
    : frame >= timing.exitEndFrame ? 0
    : 1 - timing.exitEasing((frame - timing.exitStartFrame) / exitDur);
  const progress = Math.min(enterProgress, exitProgress);

  const clipPath = computeMaskClipPath(maskShape, progress, direction);
  const baseStyle = buildShapeStyle(element, anim);

  return (
    <div style={{
      ...baseStyle,
      clipPath,
      WebkitClipPath: clipPath,
    }} />
  );
};

function computeMaskClipPath(shape: string, progress: number, direction: string): string {
  switch (shape) {
    case 'circle':
      // ⚠️ INVENTED — 70% max radius covers element without corner clipping
      return `circle(${progress * 70}% at 50% 50%)`;
    case 'pill':
      return `inset(${(1 - progress) * 50}% ${(1 - progress) * 10}% round 999px)`;
    case 'rect':
    default:
      switch (direction) {
        case 'right': return `inset(0 0 0 ${(1 - progress) * 100}%)`;
        case 'top': return `inset(0 0 ${(1 - progress) * 100}% 0)`;
        case 'bottom': return `inset(${(1 - progress) * 100}% 0 0 0)`;
        case 'left':
        default: return `inset(0 ${(1 - progress) * 100}% 0 0)`;
      }
  }
}

// G-1: box-width fraction per layout position (mirrors resolveLayout's maxWidth) — used by the text
// fit to size text against its container in px.
function layoutMaxWidthFraction(position: string): number {
  switch (position) {
    case 'center': return 0.70;
    case 'full-width-bottom':
    case 'full-width-top': return 0.90;
    default: return 0.45; // corners
  }
}

function resolveLayout(layout: CompositionRendererProps['recipe']['layout']): React.CSSProperties {
  // Arrangement is SIGNAL-SCORED (mg.arrangement.*), not hardcoded per form — horizontal = a
  // dynamic side-by-side row, vertical/default = a stacked column. The form's elements flow into
  // whichever direction the engine scored for THIS moment (set in composition-planner).
  const isHorizontal = layout.arrangement === 'horizontal-distributed';
  const base: React.CSSProperties = {
    position: 'absolute',
    display: 'flex',
    flexDirection: isHorizontal ? 'row' : 'column',
    gap: isHorizontal ? '28px' : '4px',
    alignItems: isHorizontal ? 'center' : undefined,
    // Force a stacking context so block-fill backdrops (z-index:-1) stay contained
    // behind this composition's content and don't bleed below the video layer.
    isolation: 'isolate',
  };

  // captionZoneAware: shift bottom-positioned graphics above caption zone
  // ⚠️ 22% bottom offset INVENTED — typical captions occupy bottom 15-20%
  const bottomOffset = layout.captionZoneAware ? '22%' : '12%';

  // G-1: insets >=5% keep the block inside the title-safe zone (center 90% / 5% margin, SMPTE ST 2046-1).
  switch (layout.position) {
    case 'bottom-left':
      return { ...base, bottom: bottomOffset, left: '5%', maxWidth: '45%' };
    case 'bottom-right':
      return { ...base, bottom: bottomOffset, right: '5%', maxWidth: '45%', alignItems: 'flex-end' };
    case 'top-left':
      return { ...base, top: '8%', left: '5%', maxWidth: '45%' };
    case 'top-right':
      return { ...base, top: '8%', right: '5%', maxWidth: '45%', alignItems: 'flex-end' };
    case 'center':
      return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', alignItems: 'center', textAlign: 'center', maxWidth: '70%' };
    case 'full-width-bottom':
      return { ...base, bottom: '15%', left: '5%', right: '5%', alignItems: 'center' };
    case 'full-width-top':
      return { ...base, top: '8%', left: '5%', right: '5%', alignItems: 'center' };
    default:
      return { ...base, bottom: '12%', left: '5%', maxWidth: '45%' };
  }
}

class CompositionErrorBoundary extends React.Component<
  { children: React.ReactNode; recipeId: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; recipeId: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error(`[MG-Render] Recipe "${this.props.recipeId}" render failed:`, error.message);
  }

  render(): React.ReactNode {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export const SafeCompositionRenderer: React.FC<CompositionRendererInternalProps> = (props) => (
  <CompositionErrorBoundary recipeId={props.recipe.id}>
    <CompositionRenderer {...props} />
  </CompositionErrorBoundary>
);

// ─── D8: MG Keyframe Interpolation ─────────────────────────────

function applyMGKeyframes(
  anim: AnimationState,
  frame: number,
  timing: import('./recipe-types').ComputedChoreography,
  tracks: MGKeyframeTrack[],
): AnimationState {
  const localFrame = frame - timing.enterStartFrame;
  const result = { ...anim };
  for (const track of tracks) {
    if (track.keyframes.length === 0) continue;
    const value = interpolateMGKeyframes(track.keyframes, localFrame);
    if (value !== undefined) {
      (result as Record<string, unknown>)[track.property] = value;
    }
  }
  return result;
}

function interpolateMGKeyframes(keyframes: MGKeyframe[], frame: number): number | undefined {
  if (keyframes.length === 0) return undefined;
  if (frame <= keyframes[0].frame) return keyframes[0].value;
  if (frame >= keyframes[keyframes.length - 1].frame) return keyframes[keyframes.length - 1].value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (frame >= a.frame && frame <= b.frame) {
      const t = (frame - a.frame) / Math.max(1, b.frame - a.frame);
      const eased = applyMGEasing(t, b.easing);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return undefined;
}

function applyMGEasing(t: number, easing: MGKeyframe['easing']): number {
  switch (easing) {
    case 'ease-in': return t * t;
    case 'ease-out': return 1 - (1 - t) * (1 - t);
    case 'ease-in-out': return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    case 'linear':
    default: return t;
  }
}

// ─── D8: Speed Ramp — Frame Time Remapping ─────────────────────

function remapFrameBySpeed(
  frame: number,
  speedRamp: MGSpeedRamp,
  timing: import('./recipe-types').ComputedChoreography,
): number {
  if (speedRamp.speedCurve.length === 0) return frame;
  const localFrame = frame - timing.enterStartFrame;
  if (localFrame <= 0) return frame;

  let accumulated = 0;
  for (let f = 0; f < localFrame; f++) {
    const speed = interpolateMGKeyframes(speedRamp.speedCurve, f) ?? 1;
    accumulated += Math.max(0.1, Math.min(4, speed));
  }
  return timing.enterStartFrame + accumulated;
}
