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
import type { GraphicPurpose } from '@/lib/editron/motion-graphics/engine/recipe-types';

interface MotionGraphicLayerContentProps {
  overlay: MotionGraphicOverlay;
}

export const MotionGraphicLayerContent: React.FC<MotionGraphicLayerContentProps> = ({
  overlay,
}) => {
  const tokens = overlay.resolvedTokens as MotionTokens;
  const { structureType, content, contentSignals } = overlay;

  return (
    <MotionThemeProvider tokens={tokens}>
      <StructureDispatch
        structureType={structureType}
        content={content}
        durationInFrames={overlay.durationInFrames}
        tokens={tokens}
        signals={contentSignals}
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

  const recipe = planComposition(
    { purpose: structureType as GraphicPurpose, content },
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
