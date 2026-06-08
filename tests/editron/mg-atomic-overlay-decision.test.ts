import { describe, expect, it } from 'vitest';
import { resolveMotionTokens } from '../../lib/editron/data/motion-theme-resolver';
import { planComposition, type MgOverlayScores } from '../../lib/editron/motion-graphics/engine/composition-planner';
import { buildAtomicOverlayPlan } from '../../lib/editron/motion-graphics/engine/atomic-overlay-plan';
import { decideAtomicOverlay } from '../../lib/editron/motion-graphics/engine/atomic-overlay-decision';

const energeticSignals = {
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

const calmSignals = {
  formality: 0.8,
  enthusiasm: 0.1,
  warmth: 0.55,
  emotional_arousal: 0.1,
  pacing_velocity: 0.15,
  humor: 0.05,
  visceral_impact: 0.1,
  visual_dependency: 0.15,
  cinematic_moment: 0.05,
};

const energeticScores: MgOverlayScores = {
  'mg.animation.entrance_slide': { score: 0.9, values: {} },
  'mg.animation.hold_pulse': { score: 0.9, values: {} },
  'mg.typography.font_size': { score: 0.8, values: { fontSize: 96 } },
  'mg.typography.line_height': { score: 0.6, values: { lineHeight: 1.08 } },
  'mg.emphasis.scale_contrast': { score: 0.7, values: { scaleContrast: 2.1 } },
};

const calmScores: MgOverlayScores = {
  'mg.animation.entrance_fade': { score: 0.12, values: {} },
  'mg.typography.font_size': { score: 0.1, values: { fontSize: 64 } },
  'mg.emphasis.scale_contrast': { score: 0.1, values: { scaleContrast: 1.1 } },
};

type TestSignals = Record<string, number>;

function tokens(signals: TestSignals) {
  return resolveMotionTokens(signals as never, {
    accentColor: '#00ff00',
    primaryColor: '#f8f8f8',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    monoFont: 'JetBrains Mono',
  });
}

function atomicDecision(
  content: Record<string, unknown>,
  signals: TestSignals,
  scores: MgOverlayScores,
) {
  const language = tokens(signals);
  const recipe = planComposition({ content }, language, signals, scores);
  const plan = buildAtomicOverlayPlan(recipe, language, content, signals, scores);
  return decideAtomicOverlay(plan);
}

describe('atomic overlay decision', () => {
  it('turns atomic intensity curves into deterministic overlay licenses', () => {
    const energetic = atomicDecision(
      { value: '47%', label: 'conversion lift' },
      energeticSignals,
      energeticScores,
    );
    const calm = atomicDecision(
      { value: '47%', label: 'conversion lift' },
      calmSignals,
      calmScores,
    );

    expect(energetic.version).toBe('atomic-decision-v1');
    expect(energetic.score).toBeGreaterThan(calm.score);
    expect(energetic.licenses.allowOverlay).toBe(true);
    expect(energetic.licenses.allowKineticEntrance).toBe(true);
    expect(energetic.licenses.allowHoldMotion).toBe(true);
    expect(energetic.multipliers.motionAmplitude).toBeGreaterThan(calm.multipliers.motionAmplitude);
    expect(energetic.rationale.some((reason) => reason.startsWith('signal:'))).toBe(true);
  });

  it('licenses data-viz from structure atoms instead of a chart preset switch', () => {
    const decision = atomicDecision(
      { values: [12, 19, 31, 47], labels: ['Q1', 'Q2', 'Q3', 'Q4'] },
      energeticSignals,
      energeticScores,
    );

    expect(decision.licenses.allowDataViz).toBe(true);
    expect(decision.licenses.allowDenseStructure).toBe(true);
    expect(decision.dominantPrimitives).toContain('data-viz');
    expect(decision.rationale).toContain('recipe:composed-data-series');
  });

  it('licenses real depth motion when atomic z tracks have nonzero time dependence', () => {
    const decision = atomicDecision(
      { value: '47%', label: 'conversion lift' },
      energeticSignals,
      energeticScores,
    );

    expect(decision.dominantMotionProperties).toContain('z');
    expect(decision.licenses.allowDepthMotion).toBe(true);
    expect(decision.multipliers.depthParallax).toBeGreaterThan(0);
  });

  it('restrains motion and density when visual frame signals are busy', () => {
    const content = { values: [12, 19, 31, 47], labels: ['Q1', 'Q2', 'Q3', 'Q4'] };
    const openFrame = atomicDecision(content, {
      ...energeticSignals,
      visual_significance: 0.1,
      motion_intensity: 0.1,
      visual_complexity: 0.1,
      text_on_screen: 0,
    }, energeticScores);
    const busyFrame = atomicDecision(content, {
      ...energeticSignals,
      visual_significance: 0.95,
      motion_intensity: 0.9,
      visual_complexity: 0.85,
      text_on_screen: 1,
    }, energeticScores);

    expect(busyFrame.licenses.allowDenseStructure).toBe(false);
    expect(busyFrame.licenses.maxElementCount).toBeLessThanOrEqual(openFrame.licenses.maxElementCount);
    expect(busyFrame.licenses.maxMotionChannels).toBeLessThanOrEqual(openFrame.licenses.maxMotionChannels);
    expect(busyFrame.multipliers.motionAmplitude).toBeLessThan(openFrame.multipliers.motionAmplitude);
    expect(busyFrame.multipliers.structureDensity).toBeLessThan(openFrame.multipliers.structureDensity);
    expect(busyFrame.rationale).toContain('visual-density:restrained');
    expect(busyFrame.rationale.some((reason) => reason.startsWith('visual-risk:'))).toBe(true);
  });
});
