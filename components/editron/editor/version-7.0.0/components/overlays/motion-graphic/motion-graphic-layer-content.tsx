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
import { planComposition, type PlannerSignals } from '@/lib/editron/motion-graphics/engine/composition-planner';
import { resolveMotionTokens } from '@/lib/editron/data/motion-theme-resolver';
import type { MotionTokens } from '@/lib/editron/motion-graphics/types';
import type { Recipe } from '@/lib/editron/motion-graphics/engine/recipe-types';
import type { AtomicOverlayPlan } from '@/lib/editron/motion-graphics/engine/atomic-overlay-plan';
import type { AtomicOverlayDecision } from '@/lib/editron/motion-graphics/engine/atomic-overlay-decision';
import type { SignalCurves } from '@/lib/editron/motion-graphics/engine/primitive-renderers';
// Phase 0.1: load the MG default font families at module-eval (side-effect import). Without this,
// the render path loaded ZERO fonts and every graphic fell back to Chromium default — corrupting
// both the visible type AND G-1b's canvas measureText fit (composition-renderer.tsx:297). This is
// the single shared entry for the harness (scripts/mg-still/root.tsx) and production
// (core/layer-content.tsx), so importing here loads fonts on both paths. See mg-fonts.ts.
import '@/lib/editron/motion-graphics/mg-fonts';

interface MotionGraphicLayerContentProps {
  overlay: MotionGraphicOverlay;
}

export const MotionGraphicLayerContent: React.FC<MotionGraphicLayerContentProps> = ({
  overlay,
}) => {
  const signals = sanitizeSignals(overlay.contentSignals);
  const tokens = isMotionTokens(overlay.resolvedTokens)
    ? overlay.resolvedTokens as MotionTokens
    : resolveMotionTokens(signals);
  const content = sanitizeMotionGraphicContent(overlay.content);

  // Composition engine path: recipe pre-computed at pipeline time.
  // Use it directly -- don't re-plan at render time.
  const preComputedRecipe = (overlay as Record<string, unknown>).recipe as Recipe | undefined;
  if (preComputedRecipe && preComputedRecipe.elements?.length > 0) {
    const atomicPlan = (overlay as any).metadata?.atomicOverlayPlan as AtomicOverlayPlan | undefined;
    const atomicDecision = (overlay as any).metadata?.atomicOverlayDecision as AtomicOverlayDecision | undefined;
    // Production path: EDL stamps real per-frame curves from timeline/audio analysis.
    // Fallback exists only for old overlays that predate serialized curves.
    const signalCurves = sanitizeSignalCurves((overlay as Record<string, unknown>).signalCurves, overlay.durationInFrames)
      ?? synthesizeSignalCurves(signals, overlay.durationInFrames);

    return (
      <MotionThemeProvider tokens={tokens}>
        <SafeCompositionRenderer
          recipe={preComputedRecipe}
          language={tokens}
          content={content}
          durationInFrames={overlay.durationInFrames}
          signalCurves={signalCurves}
          atomicPlan={atomicPlan}
          atomicDecision={atomicDecision}
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
  content: Record<string, unknown>;
  durationInFrames: number;
  tokens: MotionTokens;
  signals?: Record<string, number | string>;
}

const LEGACY_STAT_COUNTER = 'stat-counter-legacy';

function synthesizeSignalCurves(
  signals: Record<string, unknown> | undefined,
  durationInFrames: number,
): SignalCurves {
  const curves: SignalCurves = {};
  if (!signals || durationInFrames <= 0) return curves;

  // Pass 1: constant-fill all numeric signals
  for (const [key, value] of Object.entries(signals)) {
    if (typeof value === 'number' && isFinite(value)) {
      curves[key] = new Array(durationInFrames).fill(value);
    }
  }

  // Legacy fallback: BPM-derived beat grid when old overlays have no serialized timeline curves.
  // D6 beat hierarchy: tatum=0.1, tactus=0.25, bar=0.4, downbeat=0.6
  const bpm = typeof signals.bpm === 'number' ? signals.bpm : 0;
  if (bpm > 0) {
    const fps = 30;
    const beatLevel = new Array(durationInFrames).fill(0);
    const framesPerBeat = (60 / bpm) * fps;
    const framesPerTatum = framesPerBeat / 4;

    for (let f = 0; f < durationInFrames; f++) {
      const beatIndex = Math.round(f / framesPerBeat);
      const tatumIndex = Math.round(f / framesPerTatum);

      const distToBeat = Math.abs(f - beatIndex * framesPerBeat);
      const distToTatum = Math.abs(f - tatumIndex * framesPerTatum);

      if (distToBeat < 1) {
        // On a beat — check if downbeat (every 4 beats) or regular
        beatLevel[f] = beatIndex % 4 === 0 ? 0.6 : 0.25;
      } else if (distToTatum < 1) {
        beatLevel[f] = 0.1; // tatum subdivision
      }
    }

    curves['beat_level'] = beatLevel;
    // Override constant music_beat with deterministic legacy beat pulses.
    curves['music_beat'] = beatLevel.map(v => v >= 0.25 ? 1 : 0);
  }

  return curves;
}

function sanitizeSignalCurves(value: unknown, durationInFrames: number): SignalCurves | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || durationInFrames <= 0) return undefined;
  const curves: SignalCurves = {};

  for (const [key, curve] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(curve)) continue;
    const sanitized = new Array(durationInFrames).fill(0);
    const max = Math.min(durationInFrames, curve.length);
    for (let i = 0; i < max; i++) {
      const sample = curve[i];
      sanitized[i] = typeof sample === 'number' && isFinite(sample) ? sample : 0;
    }
    curves[key] = sanitized;
  }

  return Object.keys(curves).length > 0 ? curves : undefined;
}

function sanitizeSignals(signals: unknown): Record<string, number | string> | undefined {
  if (!signals || typeof signals !== 'object') return undefined;
  const safe: Record<string, number | string> = {};

  for (const [key, value] of Object.entries(signals as Record<string, unknown>)) {
    if (typeof value === 'number' && isFinite(value)) {
      safe[key] = value;
    } else if (typeof value === 'boolean') {
      safe[key] = value ? 1 : 0;
    } else if (typeof value === 'string' && value.trim()) {
      safe[key] = value;
    }
  }

  return Object.keys(safe).length > 0 ? safe : undefined;
}

type MotionGraphicContentPrimitive = string | number | boolean;

export function sanitizeMotionGraphicContent(content: unknown): Record<string, MotionGraphicContentPrimitive | MotionGraphicContentPrimitive[]> {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return {};
  const safe: Record<string, MotionGraphicContentPrimitive | MotionGraphicContentPrimitive[]> = {};

  for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
    if (value == null) continue;
    if (isContentPrimitive(value)) {
      safe[key] = value;
    } else if (Array.isArray(value) && value.length > 0 && value.every(isContentPrimitive)) {
      safe[key] = [...value];
    }
  }

  return safe;
}

function isContentPrimitive(value: unknown): value is MotionGraphicContentPrimitive {
  return typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value))
    || typeof value === 'boolean';
}

function contentString(value: unknown): string | undefined {
  if (value == null || Array.isArray(value) || typeof value === 'object') return undefined;
  return String(value);
}

function isMotionTokens(value: unknown): value is MotionTokens {
  if (!value || typeof value !== 'object') return false;
  const tokens = value as Partial<Record<keyof MotionTokens, unknown>>;
  return !!tokens.animation
    && !!tokens.typography
    && !!tokens.color
    && !!tokens.surface
    && !!tokens.layout;
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
          value: contentString(content.value) || '0',
          prefix: contentString(content.prefix),
          suffix: contentString(content.suffix),
          label: contentString(content.label) || '',
        }}
        durationInFrames={durationInFrames}
      />
    );
  }

  // Fallback: plan at render time for overlays without pre-computed recipe
  const recipe = planComposition(
    { kind: undefined, content },
    tokens,
    plannerSignalsFromSignals(signals),
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

function plannerSignalsFromSignals(signals: Record<string, number | string> | undefined): Partial<PlannerSignals> | undefined {
  if (!signals) return undefined;
  const numericSignals: Record<string, number> = {};

  for (const [key, value] of Object.entries(signals)) {
    if (typeof value === 'number' && isFinite(value)) numericSignals[key] = value;
  }

  return Object.keys(numericSignals).length > 0 ? numericSignals : undefined;
}
