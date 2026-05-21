import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { CompositionRendererProps } from './recipe-types';
import type { ResolvedElement, ComputedChoreography } from './recipe-types';
import { resolveElements } from './property-resolver';
import { computeChoreography, type SyncData } from './choreography-computer';
import { computeAnimationState, buildShapeStyle, buildTextStyle, buildTransformStyle, deriveSpatialConfig, type SpatialConfig } from './primitive-renderers';

interface CompositionRendererInternalProps extends CompositionRendererProps {
  syncData?: SyncData;
}

export const CompositionRenderer: React.FC<CompositionRendererInternalProps> = ({
  recipe,
  language,
  content,
  durationInFrames,
  syncData,
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

  const layoutStyle = resolveLayout(recipe.layout);

  return (
    <div style={layoutStyle}>
      {resolvedElements.map((el, idx) => {
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
}

const PrimitiveElement: React.FC<PrimitiveElementProps> = ({
  element,
  timing,
  frame,
  spatial,
}) => {
  const anim = computeAnimationState(frame, timing, element.entrancePattern, element.exitPattern, spatial);

  if (anim.opacity <= 0.001) return null;

  switch (element.primitive) {
    case 'shape':
      return <ShapeElement element={element} anim={anim} />;
    case 'text':
      return <TextElement element={element} anim={anim} frame={frame} timing={timing} />;
    case 'image':
      return <ImageElement element={element} anim={anim} />;
    default:
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
  return <img src={src} style={{ ...style, maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />;
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
