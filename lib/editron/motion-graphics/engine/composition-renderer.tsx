import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { CompositionRendererProps } from './recipe-types';
import type { ResolvedElement, ComputedChoreography, DepthLayer } from './recipe-types';
import { resolveElements } from './property-resolver';
import { computeChoreography, type SyncData } from './choreography-computer';
import { computeAnimationState, buildShapeStyle, buildTextStyle, buildTransformStyle, deriveSpatialConfig, applyAudioReactiveModulation, type SpatialConfig, type SignalCurves, type AnimationState } from './primitive-renderers';
import type { MGKeyframe, MGKeyframeTrack, MGSpeedRamp } from './recipe-types';
import { BarChart, PercentageRing, Sparkline } from './data-viz-renderers';

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
  const { fps } = useVideoConfig();

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
}

const PrimitiveElement: React.FC<PrimitiveElementProps> = ({
  element,
  timing,
  frame,
  spatial,
  signalCurves,
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
    case 'gradient':
      return <ShapeElement element={element} anim={anim} />;
    case 'pattern':
      return <PatternElement element={element} anim={anim} />;
    case 'text':
      return <TextElement element={element} anim={anim} frame={frame} timing={timing} />;
    case 'image':
    case 'video-clip':
      return <ImageElement element={element} anim={anim} />;
    case 'data-viz':
      return <DataVizElement element={element} anim={anim} frame={frame} timing={timing} />;
    default:
      console.warn(`[MG-Render] Unknown primitive type: ${element.primitive}`);
      return null;
  }
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

const TextElement: React.FC<{
  element: ResolvedElement;
  anim: ReturnType<typeof computeAnimationState>;
  frame: number;
  timing: ComputedChoreography;
}> = ({ element, anim, frame, timing }) => {
  const style = buildTextStyle(element, anim);
  const p = element.resolvedProps;

  if (element.animation === 'count-up') {
    return <CountUpText element={element} style={style} frame={frame} timing={timing} />;
  }

  return <div style={style}>{String(p.text || '')}</div>;
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
  const formatted = current >= 1000
    ? Math.round(current).toLocaleString('en-US')
    : isDecimal
      ? current.toFixed(1)
      : String(Math.round(current));
  return `${prefix}${formatted}${suffix}`;
}

const ImageElement: React.FC<{ element: ResolvedElement; anim: ReturnType<typeof computeAnimationState> }> = ({
  element,
  anim,
}) => {
  const style = buildTransformStyle(anim);
  const src = String(element.resolvedProps.src || '');
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" style={{ ...style, maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />;
};

function resolveLayout(layout: CompositionRendererProps['recipe']['layout']): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  };

  switch (layout.position) {
    case 'bottom-left':
      return { ...base, bottom: '12%', left: '4%', maxWidth: '45%' };
    case 'bottom-right':
      return { ...base, bottom: '12%', right: '4%', maxWidth: '45%', alignItems: 'flex-end' };
    case 'top-left':
      return { ...base, top: '8%', left: '4%', maxWidth: '45%' };
    case 'top-right':
      return { ...base, top: '8%', right: '4%', maxWidth: '45%', alignItems: 'flex-end' };
    case 'center':
      return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', alignItems: 'center', textAlign: 'center', maxWidth: '70%' };
    case 'full-width-bottom':
      return { ...base, bottom: '15%', left: '5%', right: '5%', alignItems: 'center' };
    case 'full-width-top':
      return { ...base, top: '8%', left: '5%', right: '5%', alignItems: 'center' };
    default:
      return { ...base, bottom: '12%', left: '4%', maxWidth: '45%' };
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
