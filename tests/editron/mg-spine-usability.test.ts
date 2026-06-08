import { describe, expect, it } from 'vitest';
import { getOverlayDefinitions } from '../../lib/editron/engine/overlay-definitions-loader';
import { scoreAllOverlays } from '../../lib/editron/engine/utility-scorer';
import { resolveMotionTokens } from '../../lib/editron/data/motion-theme-resolver';
import {
  brandInputsFromUnifiedBrand,
  brandInputsFromUnifiedBrandAtomic,
  deriveAtomicBrandProfile,
} from '../../lib/editron/motion-graphics/engine/brand-composition-rules';
import { planComposition, type MgOverlayScores } from '../../lib/editron/motion-graphics/engine/composition-planner';
import { buildAtomicOverlayPlan } from '../../lib/editron/motion-graphics/engine/atomic-overlay-plan';
import { analyzeContentShape } from '../../lib/editron/motion-graphics/engine/content-shape-analyzer';

const energeticSignals = {
  formality: 0.15,
  enthusiasm: 0.95,
  warmth: 0.35,
  emotional_arousal: 0.85,
  pacing_velocity: 0.8,
  humor: 0.25,
  visceral_impact: 0.75,
  visual_dependency: 0.85,
  cinematic_moment: 0.8,
  visual_significance: 0.3,
};

const calmSignals = {
  formality: 0.85,
  enthusiasm: 0.25,
  warmth: 0.55,
  emotional_arousal: 0.2,
  pacing_velocity: 0.25,
  humor: 0.05,
  visceral_impact: 0.15,
  visual_dependency: 0.2,
  cinematic_moment: 0.2,
  visual_significance: 0.2,
};

const SELECTION_IDS = new Set([
  'mg.animation.entrance_fade',
  'mg.animation.entrance_pop',
  'mg.animation.entrance_slide',
  'mg.animation.entrance_blur',
  'mg.animation.entrance_scale',
  'mg.animation.entrance_rotate',
  'mg.animation.entrance_skew',
  'mg.animation.entrance_zoom_blur',
  'mg.animation.hold_pulse',
  'mg.animation.hold_breathe',
  'mg.animation.hold_float',
  'mg.animation.hold_glow',
]);

function mgScoresFor(signals: Record<string, number>): MgOverlayScores {
  const allMgDefs = getOverlayDefinitions().filter((d) => d.category === 'mg-property');
  const propDefs = allMgDefs.filter((d) => !SELECTION_IDS.has(d.id));
  const selDefs = allMgDefs.filter((d) => SELECTION_IDS.has(d.id));
  const scores: MgOverlayScores = {};

  for (const r of [
    ...scoreAllOverlays(propDefs, signals, 'additive'),
    ...scoreAllOverlays(selDefs, signals, 'multiplicative'),
  ]) {
    scores[r.overlayId] = { score: r.totalScore, values: r.outputValues };
  }

  return scores;
}

describe('MG spine usability', () => {
  it('maps a usable brand palette to a legible accent token', () => {
    const brand = brandInputsFromUnifiedBrand({
      visual: { colors: ['#050505', '#808080', '#00ff00'] },
    } as never);

    expect(brand.accentColor).toBe('#00ff00');
  });

  it('atomizes brand vault typography and visual style without model judgment', () => {
    const brand = brandInputsFromUnifiedBrandAtomic({
      visual: {
        industry: 'Developer tools SaaS',
        colors: ['#050505', '#00ff00', '#888888'],
        visualStyle: 'minimal technical premium system, warm but precise',
        typography: 'Inter headings with JetBrains Mono for numbers and code',
      },
    } as never);
    const tokens = resolveMotionTokens(energeticSignals, brand);
    const profile = deriveAtomicBrandProfile(brand, tokens);

    expect(brand.accentColor).toBe('#00ff00');
    expect(brand.headingFont).toBe('Inter');
    expect(brand.bodyFont).toBe('Inter');
    expect(brand.monoFont).toBe('JetBrains Mono');
    expect(profile.source).toBe('brand-vault');
    expect(profile.colors.palette).toEqual(['#050505', '#00ff00', '#888888']);
    expect(profile.colors.vividCount).toBe(1);
    expect(profile.colors.neutralCount).toBe(2);
    expect(profile.typography.headingCategory).toBe('sans-serif');
    expect(profile.typography.contrastAxis).toBe('weight');
    expect(profile.styleSignals.minimal).toBeGreaterThan(0);
    expect(profile.styleSignals.technical).toBeGreaterThan(0);
    expect(profile.styleSignals.premium).toBeGreaterThan(0);
    expect(profile.styleSignals.warm).toBeGreaterThan(0);
  });

  it('varies motion tokens by signal profile while preserving brand accent', () => {
    const brand = { accentColor: '#00ff00' };
    const energetic = resolveMotionTokens(energeticSignals, brand);
    const calm = resolveMotionTokens(calmSignals, brand);

    expect(energetic.color.accent).toBe('#00ff00');
    expect(calm.color.accent).toBe('#00ff00');
    expect(energetic.animation.entranceDurationMs).toBeLessThan(calm.animation.entranceDurationMs);
    expect(energetic.layout.density).not.toBe(calm.layout.density);
    expect(energetic.typography.headingWeight).not.toBe(calm.typography.headingWeight);
  });

  it('lets content shape emerge without a graphic type menu', () => {
    const tokens = resolveMotionTokens(energeticSignals, { accentColor: '#00ff00' });
    const scores = mgScoresFor(energeticSignals);

    const numeric = planComposition(
      { content: { value: '47%', label: 'conversion lift' }, triggerMoment: 'scalar' },
      tokens,
      energeticSignals,
      scores,
    );
    const dataSeries = planComposition(
      { content: { values: [12, 19, 31, 47], labels: ['Q1', 'Q2', 'Q3', 'Q4'] }, triggerMoment: 'series' },
      tokens,
      energeticSignals,
      scores,
    );

    expect(numeric.id).toBe('composed-numeric');
    expect(numeric.elements.some((e) => e.primitive === 'text' && e.role === 'counter')).toBe(true);
    expect(dataSeries.id).toBe('composed-data-series');
    expect(dataSeries.elements.some((e) => e.primitive === 'data-viz')).toBe(true);
    expect(dataSeries.elements.find((e) => e.primitive === 'data-viz')?.role).toBe('bar-chart');
  });

  it('derives an atomic structural signature before projecting legacy shape kind', () => {
    const strategy = analyzeContentShape({
      value: '47%',
      label: 'conversion lift',
      badge: '1',
    });

    expect(strategy.structure.primaryChannel).toBe('scalar');
    expect(strategy.structure.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'primary-value', channel: 'scalar', sourceKey: 'value' }),
      expect.objectContaining({ role: 'supporting-label', channel: 'text', sourceKey: 'label' }),
    ]));
    expect(strategy.structure.relations).toContainEqual({
      type: 'label-of',
      fromRole: 'supporting-label',
      toRole: 'primary-value',
    });
    expect(strategy.shapes[0].kind).toBe('numeric');
  });

  it('keeps avatar media distinct from brand logo atoms', () => {
    const strategy = analyzeContentShape({
      name: 'Hank Green',
      title: 'Creator',
      avatar: 'https://x/a.jpg',
    });

    expect(strategy.structure.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'name', channel: 'identity', sourceKey: 'name' }),
      expect.objectContaining({ role: 'avatar', channel: 'media', sourceKey: 'avatar' }),
    ]));
    expect(strategy.structure.parts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'logo', sourceKey: 'avatar' }),
    ]));
    expect(strategy.structure.relations).toContainEqual({
      type: 'portrait-of',
      fromRole: 'avatar',
      toRole: 'name',
    });
    expect(strategy.shapes.map((shape) => shape.kind)).toEqual(['identity']);
  });

  it('promotes keyword-with-transcript-context into structured meaning instead of a naked word', () => {
    const strategy = analyzeContentShape({
      text: 'editing',
      keyword: 'editing',
      contextPhrase: 'editing completely changed how people watch YouTube',
    });

    expect(strategy.structure.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'keyword', channel: 'text', sourceKey: 'keyword' }),
      expect.objectContaining({ role: 'context-phrase', channel: 'text', sourceKey: 'contextPhrase' }),
    ]));
    expect(strategy.structure.relations).toContainEqual({
      type: 'context-for',
      fromRole: 'context-phrase',
      toRole: 'keyword',
    });
    expect(strategy.shapes[0]).toEqual(expect.objectContaining({
      kind: 'structured',
      title: 'editing',
      body: 'editing completely changed how people watch YouTube',
    }));
  });

  it('infers data-viz form in the structural signature before planning', () => {
    const bar = analyzeContentShape({ values: [12, 19, 31, 47], labels: ['Q1', 'Q2', 'Q3', 'Q4'] });
    const ring = analyzeContentShape({ values: [72], labels: ['Progress'] });
    const spark = analyzeContentShape({ values: [12, 19, 31, 47, 51], labels: ['A', 'B', 'C', 'D', 'E'] });
    const ranked = analyzeContentShape({ values: [92, 78, 64, 51, 33], labels: ['A', 'B', 'C', 'D', 'E'] });

    expect(bar.structure.evidence.dataSeriesVisualForm).toBe('bar-chart');
    expect(ring.structure.evidence.dataSeriesVisualForm).toBe('percentage-ring');
    expect(spark.structure.evidence.dataSeriesVisualForm).toBe('sparkline');
    expect(ranked.structure.evidence.dataSeriesVisualForm).toBe('bar-chart');
    expect(spark.structure.evidence.seriesCardinality).toBe(5);
    expect(spark.structure.evidence.seriesTrend).toBe('rising');
    expect(ranked.structure.evidence.seriesRanked).toBe(true);
    expect(ranked.structure.evidence.seriesComparison).toBe(true);
    expect(bar.shapes[0]).toEqual(expect.objectContaining({ kind: 'data-series', visualForm: 'bar-chart' }));
    expect(ring.shapes[0]).toEqual(expect.objectContaining({ kind: 'data-series', visualForm: 'percentage-ring' }));
    expect(spark.shapes[0]).toEqual(expect.objectContaining({ kind: 'data-series', visualForm: 'sparkline' }));
    expect(ranked.shapes[0]).toEqual(expect.objectContaining({ kind: 'data-series', visualForm: 'bar-chart' }));
  });

  it('routes composers from structural evidence instead of the projected legacy kind', () => {
    const tokens = resolveMotionTokens(energeticSignals, { accentColor: '#00ff00' });
    const scores = mgScoresFor(energeticSignals);

    const comparison = planComposition(
      { content: { from: 'Manual', to: 'Automated', fromLabel: 'Before', toLabel: 'After' }, triggerMoment: 'relation' },
      tokens,
      energeticSignals,
      scores,
    );
    const ranked = planComposition(
      { content: { values: [92, 78, 64, 51, 33], labels: ['A', 'B', 'C', 'D', 'E'] }, triggerMoment: 'series' },
      tokens,
      energeticSignals,
      scores,
    );

    expect(comparison.id).toBe('composed-comparison');
    expect(comparison.elements.some((element) => element.bind.text === 'content:from')).toBe(true);
    expect(comparison.elements.some((element) => element.bind.text === 'content:to')).toBe(true);
    expect(ranked.id).toBe('composed-data-series');
    expect(ranked.elements.find((element) => element.primitive === 'data-viz')?.role).toBe('bar-chart');
  });

  it('does not let explicit kind force a preset against content evidence', () => {
    const strategy = analyzeContentShape(
      { values: [12, 19, 31, 47], labels: ['Q1', 'Q2', 'Q3', 'Q4'] },
      'numeric',
    );

    expect(strategy.structure.primaryChannel).toBe('series');
    expect(strategy.structure.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'series-values', channel: 'series', sourceKey: 'values' }),
    ]));
    expect(strategy.shapes[0].kind).toBe('data-series');
  });

  it('stamps brand atoms onto generated atomic overlay plans', () => {
    const brand = brandInputsFromUnifiedBrandAtomic({
      visual: {
        industry: 'B2B SaaS',
        colors: ['#00ff00', '#1a1a1a'],
        visualStyle: 'clean technical enterprise',
        typography: 'Inter + JetBrains Mono',
      },
    } as never);
    const tokens = resolveMotionTokens(energeticSignals, brand);
    const scores = mgScoresFor(energeticSignals);
    const content = { value: '47%', label: 'conversion lift' };
    const recipe = planComposition({ content, triggerMoment: 'scalar' }, tokens, energeticSignals, scores);
    const atomic = buildAtomicOverlayPlan(recipe, tokens, content, energeticSignals, scores, brand);

    expect(atomic.brand?.source).toBe('brand-vault');
    expect(atomic.brand?.colors.accent).toBe('#00ff00');
    expect(atomic.brand?.typography.monoFont).toBe('JetBrains Mono');
    expect(atomic.brand?.styleSignals.technical).toBeGreaterThan(0);
  });

  it('scores MG property dials into planner-consumable values', () => {
    const scores = mgScoresFor(energeticSignals);

    expect(scores['mg.typography.font_size']?.values.fontSize).toEqual(expect.any(Number));
    expect(scores['mg.typography.font_weight']?.values.fontWeight).toEqual(expect.any(Number));
    expect(scores['mg.emphasis.scale_contrast']?.values.scaleContrast).toEqual(expect.any(Number));
  });
});
