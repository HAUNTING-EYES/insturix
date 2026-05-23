/**
 * MotionGraphicLayerContent
 *
 * Renderer for MOTION_GRAPHIC overlay type. Dispatches to the appropriate
 * structure component (StatCounter, LowerThird, etc.) based on structureType.
 * Wraps in MotionThemeProvider so all children read from the same visual identity.
 *
 * Rendering: Remotion native APIs only (interpolate, Easing, useCurrentFrame).
 * No Shadow DOM. No useEffect for animation. Lambda-safe by construction.
 */

import React from 'react';
import type { MotionGraphicOverlay } from '../../../types';
import { MotionThemeProvider } from '@/lib/editron/motion-graphics/context/MotionThemeContext';
import { StatCounter } from '@/lib/editron/motion-graphics/structures/StatCounter';
import { SafeCompositionRenderer } from '@/lib/editron/motion-graphics/engine/composition-renderer';
import { planComposition } from '@/lib/editron/motion-graphics/engine/composition-planner';
import type { MotionTokens } from '@/lib/editron/motion-graphics/types';
import type { Recipe } from '@/lib/editron/motion-graphics/engine/recipe-types';
import type { SignalCurves } from '@/lib/editron/motion-graphics/engine/primitive-renderers';

interface MotionGraphicLayerContentProps {
  overlay: MotionGraphicOverlay;
}

export const MotionGraphicLayerContent: React.FC<MotionGraphicLayerContentProps> = ({
  overlay,
}) => {
  const tokens = overlay.resolvedTokens as MotionTokens;
  const content = (overlay.content || {}) as Record<string, string>;
  const signals = overlay.contentSignals;

  // Composition engine path: recipe pre-computed at pipeline time.
  // Use it directly -- don't re-plan at render time.
  const preComputedRecipe = (overlay as Record<string, unknown>).recipe as Recipe | undefined;
  if (preComputedRecipe && preComputedRecipe.elements?.length > 0) {
    // Synthesize per-frame SignalCurves from scalar contentSignals snapshot.
    // This enables audio-reactive modulation (beat pulse, energy, emotion) at render time.
    // Scalar→constant array: each signal value is replicated for every frame of the composition.
    // Beat pulsation requires BPM-derived per-frame curves (future work — needs BPM on overlay).
    const signalCurves = synthesizeSignalCurves(signals, overlay.durationInFrames);

    return (
      <MotionThemeProvider tokens={tokens}>
        <SafeCompositionRenderer
          recipe={preComputedRecipe}
          language={tokens}
          content={content}
          durationInFrames={overlay.durationInFrames}
          signalCurves={signalCurves}
        />
      </MotionThemeProvider>
    );
  }

  // Legacy path: re-plan at render time (flag=false or old overlays without recipe)
  return (
    <MotionThemeProvider tokens={tokens}>
      <StructureDispatch
        structureType={(overlay as Record<string, unknown>).structureType as string}
        content={content}
        durationInFrames={overlay.durationInFrames}
        tokens={tokens}
        signals={signals}
      />
    </MotionThemeProvider>
  );
};

interface StructureDispatchProps {
  structureType: string;
  content: Record<string, string>;
  durationInFrames: number;
  tokens: MotionTokens;
  signals?: MotionGraphicOverlay['contentSignals'];
}

const LEGACY_STAT_COUNTER = 'stat-counter-legacy';

function synthesizeSignalCurves(
  signals: Record<string, unknown> | undefined,
  durationInFrames: number,
): SignalCurves {
  const curves: SignalCurves = {};
  if (!signals || durationInFrames <= 0) return curves;
  for (const [key, value] of Object.entries(signals)) {
    if (typeof value === 'number' && isFinite(value)) {
      curves[key] = new Array(durationInFrames).fill(value);
    }
  }
  return curves;
}

const StructureDispatch: React.FC<StructureDispatchProps> = ({
  structureType,
  content,
  durationInFrames,
  tokens,
  signals,
}) => {
  if (structureType === LEGACY_STAT_COUNTER) {
    return (
      <StatCounter
        content={{
          value: content.value || '0',
          prefix: content.prefix,
          suffix: content.suffix,
          label: content.label || '',
        }}
        durationInFrames={durationInFrames}
      />
    );
  }

  // Fallback: plan at render time for overlays without pre-computed recipe
  const recipe = planComposition(
    { kind: undefined, content },
    tokens,
    signals,
  );

  return (
    <SafeCompositionRenderer
      recipe={recipe}
      language={tokens}
      content={content}
      durationInFrames={durationInFrames}
    />
  );
};
