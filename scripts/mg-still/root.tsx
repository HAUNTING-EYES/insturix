// Untracked G-1 verification harness. Registers a MINIMAL Remotion composition that renders the
// REAL production component (MotionGraphicLayerContent -> MotionThemeProvider -> SafeCompositionRenderer)
// from a persisted overlay, so computeFittedSize/fitFontSize/SplitTextElement (the G-1 brushwork)
// actually execute. No replica logic. Stays UNTRACKED. Bundled by scripts/render-mg-stills.ts.
import React from 'react';
import { Composition, AbsoluteFill } from 'remotion';
import { MotionGraphicLayerContent } from '@/components/editron/editor/version-7.0.0/components/overlays/motion-graphic/motion-graphic-layer-content';
import type { MotionGraphicOverlay } from '@/components/editron/editor/version-7.0.0/types';

interface MgStillProps {
  overlay: Record<string, unknown>;
  bg: string;
  width: number;
  height: number;
  guide: boolean;
}

const MgStill: React.FC<MgStillProps> = ({ overlay, bg, guide }) => (
  <AbsoluteFill style={{ backgroundColor: bg }}>
    <MotionGraphicLayerContent overlay={overlay as unknown as MotionGraphicOverlay} />
    {guide && (
      // Title-safe boundary: center 90% (5% margins) <- CRG constant:safe_zone.title_safe, SMPTE ST 2046-1.
      // Critical text should stay INSIDE this dashed box. Drawn on top, faint, non-interactive.
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: '5%', top: '5%', width: '90%', height: '90%', border: '2px dashed rgba(0, 220, 255, 0.30)' }} />
      </AbsoluteFill>
    )}
  </AbsoluteFill>
);

export const MgStillRoot: React.FC = () => (
  <Composition
    id="MgStill"
    component={MgStill}
    durationInFrames={150}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{ overlay: {}, bg: '#12151b', width: 1920, height: 1080, guide: true }}
    calculateMetadata={async ({ props }) => ({
      durationInFrames: Math.max(1, Number((props.overlay as Record<string, unknown>)?.durationInFrames) || 150),
      width: props.width || 1920,
      height: props.height || 1080,
    })}
  />
);
