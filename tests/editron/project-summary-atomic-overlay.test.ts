import { describe, expect, it } from 'vitest';
import {
  formatSummaryForPrompt,
  generateProjectSummary,
} from '../../lib/editron/utils/project-summary';
import type { AtomicOverlayPlan } from '../../lib/editron/motion-graphics/engine/atomic-overlay-plan';

function atomicPlan(recipeId: string): AtomicOverlayPlan {
  return {
    recipeId,
    layout: { position: 'center' },
    exitStyle: 'hold-then-fade',
    intensity: {
      motion: 0.2,
      scale: 0.4,
      opacity: 1,
      blur: 0,
      typography: 0.8,
      structure: 0.3,
      signal: 0.9,
      overlayScore: 0.7,
      overall: 0.52,
    },
    elements: [{
      id: 'counter-0',
      role: 'counter',
      primitive: 'text',
      structure: {
        primitive: 'text',
        role: 'counter',
        layer: 'foreground',
        parts: [{ kind: 'glyph-run', semantic: 'counter' }],
      },
      typography: { family: 'Inter', weight: 700, sizePx: 96 },
      color: { text: '#ffffff', accent: '#00ff00' },
      motion: {
        coordinateSystem: 'screen-xyz',
        neutralPosition: { x: 0, y: 0, z: 0 },
        tracks: [{
          property: 'z',
          phase: 'entrance',
          source: 'test',
          keyframes: [
            { t: 0, value: 0, easing: 'linear' },
            { t: 1, value: 0, easing: 'linear' },
          ],
        }],
      },
      sourceBindings: ['text'],
    }],
  };
}

describe('project summary atomic overlay context', () => {
  it('includes atomic overlay coverage and report text in prompt context', () => {
    const summary = generateProjectSummary({
      name: 'Atomic Demo',
      fps: 30,
      overlays: [
        { id: 1, type: 'video', row: 0, from: 0, durationInFrames: 300, assetId: 'source-video' },
        {
          id: 2,
          type: 'motion-graphic',
          row: 10,
          from: 30,
          durationInFrames: 90,
          metadata: {
            atomicOverlayPlan: atomicPlan('composed-numeric'),
            atomicPlanObserveMode: true,
          },
        },
        { id: 3, type: 'motion-graphic', row: 10, from: 150, durationInFrames: 90, metadata: {} },
      ],
    });
    const prompt = formatSummaryForPrompt(summary);

    expect(summary.atomicOverlayReport.atomicOverlayCount).toBe(1);
    expect(summary.atomicOverlayReport.missingAtomicPlanCount).toBe(1);
    expect(summary.atomicOverlayReport.recipeCounts).toEqual({ 'composed-numeric': 1 });
    expect(summary.atomicOverlayText).toContain('Atomic overlays: 1/3 inspected');
    expect(prompt).toContain('**Atomic Overlay Plans:**');
    expect(prompt).toContain('composed-numeric:1');
    expect(prompt).toContain('Motion properties: z:1');
  });

  it('reports zero atomic overlays without breaking empty project summaries', () => {
    const summary = generateProjectSummary({ name: 'Empty Project', overlays: [] });
    const prompt = formatSummaryForPrompt(summary);

    expect(summary.atomicOverlayReport.atomicOverlayCount).toBe(0);
    expect(summary.atomicOverlayText).toBe('Atomic overlays: 0/0 overlays inspected.');
    expect(prompt).toContain('Timeline is empty');
    expect(prompt).toContain('Atomic overlays: 0/0 overlays inspected.');
  });
});
