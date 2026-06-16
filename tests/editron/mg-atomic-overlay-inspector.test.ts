import { describe, expect, it } from 'vitest';
import { resolveMotionTokens } from '../../lib/editron/data/motion-theme-resolver';
import { planComposition, type MgOverlayScores } from '../../lib/editron/motion-graphics/engine/composition-planner';
import { buildAtomicOverlayPlan } from '../../lib/editron/motion-graphics/engine/atomic-overlay-plan';
import {
  formatAtomicOverlayReport,
  getAtomicOverlayPlan,
  listAtomicOverlayPlans,
  summarizeAtomicOverlayPlans,
} from '../../lib/editron/motion-graphics/engine/atomic-overlay-inspector';

const signals = {
  formality: 0.2,
  enthusiasm: 0.95,
  warmth: 0.35,
  emotional_arousal: 0.85,
  pacing_velocity: 0.8,
  humor: 0.15,
  visceral_impact: 0.75,
  visual_dependency: 0.85,
  cinematic_moment: 0.8,
};

const scores: MgOverlayScores = {
  'mg.animation.entrance_slide': { score: 0.9, values: {} },
  'mg.animation.hold_pulse': { score: 0.9, values: {} },
  'mg.typography.font_size': { score: 0.8, values: { fontSize: 96 } },
  'mg.typography.line_height': { score: 0.6, values: { lineHeight: 1.08 } },
  'mg.emphasis.scale_contrast': { score: 0.7, values: { scaleContrast: 2.1 } },
};

function makeAtomicPlan(content: Record<string, unknown>) {
  const tokens = resolveMotionTokens(signals, { accentColor: '#00ff00' });
  const recipe = planComposition({ content }, tokens, signals, scores);
  return buildAtomicOverlayPlan(recipe, tokens, content, signals, scores);
}

describe('atomic overlay inspector', () => {
  it('extracts atomic plans from project-style overlay metadata', () => {
    const numericPlan = makeAtomicPlan({ value: '47%', label: 'conversion lift' });
    const overlay = {
      id: 101,
      type: 'motion-graphic',
      from: 120,
      durationInFrames: 90,
      metadata: {
        atomicOverlayPlan: numericPlan,
        atomicPlanObserveMode: true,
      },
    };

    expect(getAtomicOverlayPlan(overlay)).toBe(numericPlan);
    expect(getAtomicOverlayPlan({ type: 'motion-graphic', metadata: {} })).toBeNull();
  });

  it('lists atomic overlays in timeline order with roles, primitives, shapes, and motion channels', () => {
    const numericPlan = makeAtomicPlan({ value: '47%', label: 'conversion lift' });
    const barPlan = makeAtomicPlan({ values: [12, 19, 31, 47], labels: ['Q1', 'Q2', 'Q3', 'Q4'] });
    const overlays = [
      { id: 1, type: 'video', from: 0, durationInFrames: 300 },
      { id: 3, type: 'motion-graphic', from: 120, durationInFrames: 90, metadata: { atomicOverlayPlan: numericPlan, atomicPlanObserveMode: true } },
      { id: 2, type: 'motion-graphic', from: 30, durationInFrames: 90, metadata: { atomicOverlayPlan: barPlan, atomicPlanObserveMode: true } },
      { id: 4, type: 'motion-graphic', from: 210, durationInFrames: 90, metadata: {} },
    ];

    const inspections = listAtomicOverlayPlans(overlays);

    expect(inspections.map((inspection) => inspection.overlayId)).toEqual([2, 3]);
    expect(inspections[0].recipeId).toBe('composed-data-series');
    expect(inspections[0].dataShapes).toEqual(['bar-chart']);
    expect(inspections[0].primitiveCounts['data-viz']).toBe(1);
    expect(inspections[1].recipeId).toBe('composed-numeric');
    expect(inspections[1].roles).toContain('counter');
    expect(inspections[1].primitiveCounts.text).toBeGreaterThan(0);
    expect(inspections[1].motionProperties).toEqual(expect.arrayContaining(['y', 'z', 'scaleX']));
  });

  it('summarizes atomic overlay coverage for project inspection and prompt context', () => {
    const numericPlan = makeAtomicPlan({ value: '47%', label: 'conversion lift' });
    const barPlan = makeAtomicPlan({ values: [12, 19, 31, 47], labels: ['Q1', 'Q2', 'Q3', 'Q4'] });
    const overlays = [
      { id: 1, type: 'video', from: 0, durationInFrames: 300 },
      { id: 2, type: 'motion-graphic', from: 30, durationInFrames: 90, metadata: { atomicOverlayPlan: barPlan, atomicPlanObserveMode: true } },
      { id: 3, type: 'motion-graphic', from: 120, durationInFrames: 90, metadata: { atomicOverlayPlan: numericPlan, atomicPlanObserveMode: true } },
      { id: 4, type: 'motion-graphic', from: 210, durationInFrames: 90, metadata: {} },
    ];

    const report = summarizeAtomicOverlayPlans(overlays);
    const formatted = formatAtomicOverlayReport(report);

    expect(report.totalOverlays).toBe(4);
    expect(report.atomicOverlayCount).toBe(2);
    expect(report.missingAtomicPlanCount).toBe(1);
    expect(report.recipeCounts).toEqual({ 'composed-data-series': 1, 'composed-numeric': 1 });
    expect(report.dataShapeCounts['bar-chart']).toBe(1);
    expect(report.motionPropertyCounts.z).toBe(2);
    expect(report.averageIntensity.signal).toBeGreaterThan(0.7);
    expect(report.maxOverallIntensity).toBeGreaterThan(0.3);
    expect(formatted).toContain('Atomic overlays: 2/4 inspected');
    expect(formatted).toContain('motion graphics missing plans');
    expect(formatted).toContain('composed-numeric:1');
  });
});
