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
import {
  analyzeContentShape,
  enumerateDataSeriesVisualForms,
} from '../../lib/editron/motion-graphics/engine/content-shape-analyzer';
import { fitFontSize } from '../../lib/editron/motion-graphics/engine/primitive-renderers';

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

  it('licenses process-stack form from list and step atoms, not a graphic menu', () => {
    const tokens = resolveMotionTokens(energeticSignals, { accentColor: '#00ff00' });
    const scores = mgScoresFor(energeticSignals);
    const strategy = analyzeContentShape({
      title: 'Three-step workflow',
      body: 'How the edit gets better',
      steps: ['Find the claim', 'Show the proof', 'Land the payoff'],
      semanticKind: 'process',
    });
    const recipe = planComposition(
      {
        content: {
          title: 'Three-step workflow',
          body: 'How the edit gets better',
          steps: ['Find the claim', 'Show the proof', 'Land the payoff'],
          semanticKind: 'process',
        },
        triggerMoment: 'process explanation',
      },
      tokens,
      energeticSignals,
      scores,
    );

    expect(strategy.structure.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'title', channel: 'text', sourceKey: 'title' }),
      expect.objectContaining({ role: 'body', channel: 'text', sourceKey: 'body' }),
      expect.objectContaining({ role: 'list-items', channel: 'text', sourceKey: 'steps' }),
    ]));
    expect(strategy.structure.evidence).toEqual(expect.objectContaining({
      listCardinality: 3,
      listAffordance: true,
      processAffordance: true,
      orderedListAffordance: true,
    }));
    expect(strategy.shapes[0]).toEqual(expect.objectContaining({
      kind: 'process',
      steps: ['Find the claim', 'Show the proof', 'Land the payoff'],
      ordered: true,
    }));

    expect(recipe.id).toBe('composed-process');
    expect(recipe.layout).toEqual(expect.objectContaining({ position: 'center', maxWidth: '88%' }));
    expect(recipe.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ primitive: 'text', role: 'primary', bind: expect.objectContaining({ text: 'content:title' }) }),
      expect.objectContaining({ primitive: 'decoration', role: 'process-progress-rule', shape: 'line' }),
      expect.objectContaining({ primitive: 'text', role: 'process-step-1', textSplit: 'none' }),
      expect.objectContaining({ primitive: 'text', role: 'process-connector-1', bind: expect.objectContaining({ text: '↓' }) }),
      expect.objectContaining({ primitive: 'text', role: 'process-step-3', bind: expect.objectContaining({ text: '03  Land the payoff' }) }),
    ]));
  });

  it('keeps dense process stacks readable with truthful overflow evidence', () => {
    const tokens = resolveMotionTokens(energeticSignals);
    const scores = mgScoresFor(energeticSignals);
    const recipe = planComposition(
      {
        content: {
          title: 'Launch checklist',
          items: ['Hook', 'Proof', 'Offer', 'Objection', 'CTA'],
          ordered: true,
        },
        triggerMoment: 'checklist',
      },
      tokens,
      { ...energeticSignals, visual_complexity: 0.8 },
      scores,
    );

    expect(recipe.id).toBe('composed-process');
    expect(recipe.elements.some((element) => element.role === 'process-step-4')).toBe(false);
    expect(recipe.elements.find((element) => element.role === 'process-overflow-count')?.bind.text).toBe('+2 more');
  });

  it('keeps scalar stat atoms out of one-point data-viz shells', () => {
    const tokens = resolveMotionTokens(energeticSignals);
    const scores = mgScoresFor(energeticSignals);
    const recipe = planComposition(
      {
        content: {
          value: '0.02',
          label: 'human beings per day',
          values: [0.02],
          labels: ['human beings per day'],
        },
        triggerMoment: 'spoken scalar stat',
      },
      tokens,
      energeticSignals,
      scores,
    );

    expect(recipe.id).toBe('composed-numeric');
    expect(recipe.elements.some((element) => element.primitive === 'data-viz')).toBe(false);
    expect(recipe.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ primitive: 'text', role: 'counter' }),
      expect.objectContaining({ primitive: 'text', role: 'label' }),
      expect.objectContaining({ primitive: 'decoration', role: 'numeric-sparse-rate-trace' }),
      expect.objectContaining({ primitive: 'decoration', role: 'numeric-rate-rule' }),
    ]));
    expect(recipe.elements.find((element) => element.role === 'counter')?.animation).toBe('none');
    expect(recipe.elements.some((element) => element.role === 'sm-backdrop')).toBe(false);
  });

  it('varies numeric motion by atomic value form instead of one stat preset', () => {
    const tokens = resolveMotionTokens(energeticSignals);
    const scores = mgScoresFor(energeticSignals);
    const make = (value: string, label: string) => planComposition(
      { content: { value, label }, triggerMoment: 'scalar stat' },
      tokens,
      energeticSignals,
      scores,
    );

    const fraction = make('1/3', 'of people');
    const percent = make('90%', 'good people');
    const count = make('100,000', 'people');

    expect(fraction.elements.find((element) => element.role === 'counter')?.animation).toBe('none');
    expect(fraction.elements.some((element) => element.role === 'numeric-fraction-rule')).toBe(true);
    expect(percent.elements.find((element) => element.role === 'counter')?.animation).toBe('count-up');
    expect(percent.elements.find((element) => element.role === 'counter')?.bind.color).toBe('token:color.accent');
    expect(count.elements.find((element) => element.role === 'counter')?.animation).toBe('count-up');
  });

  it('licenses proportion and negation form from content atoms', () => {
    const tokens = resolveMotionTokens(energeticSignals);
    const scores = mgScoresFor(energeticSignals);
    const proportionStrategy = analyzeContentShape({
      value: '90%',
      label: 'good people',
      quantityKind: 'percent',
      relationKind: 'part_of_whole',
      bounded: true,
      polarity: 'positive',
      salience: 0.9,
    });
    const negatedStrategy = analyzeContentShape({
      value: '1/3',
      label: 'claim being rejected',
      quantityKind: 'fraction',
      relationKind: 'part_of_whole',
      bounded: true,
      polarity: 'false',
      negated: true,
      refuted: true,
    });

    const proportion = planComposition(
      {
        kind: 'emphasis',
        content: {
          value: '90%',
          label: 'good people',
          quantityKind: 'percent',
          relationKind: 'part_of_whole',
          bounded: true,
          polarity: 'positive',
          salience: 0.9,
        },
        triggerMoment: 'scalar proportion',
      },
      tokens,
      energeticSignals,
      scores,
    );
    const negated = planComposition(
      {
        kind: 'emphasis',
        content: {
          value: '1/3',
          label: 'claim being rejected',
          quantityKind: 'fraction',
          relationKind: 'part_of_whole',
          bounded: true,
          polarity: 'false',
          negated: true,
          refuted: true,
        },
        triggerMoment: 'negated proportion',
      },
      tokens,
      energeticSignals,
      scores,
    );

    expect(proportionStrategy.structure.evidence.proportionAffordance).toBe(true);
    expect(proportionStrategy.structure.evidence.quantityKind).toBe('percent');
    expect(proportionStrategy.structure.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'quantity-kind', channel: 'control', value: 'percent' }),
      expect.objectContaining({ role: 'salience-score', channel: 'control', value: 0.9 }),
    ]));
    expect(proportion.elements.some((element) => element.role === 'proportion-boundary-rule')).toBe(true);
    expect(proportion.id).toBe('composed-numeric');

    expect(negatedStrategy.structure.evidence.proportionAffordance).toBe(true);
    expect(negatedStrategy.structure.evidence.negationAffordance).toBe(true);
    expect(negatedStrategy.structure.relations).toContainEqual({
      type: 'refutes',
      fromRole: 'truth-negation',
      toRole: 'primary-value',
    });
    expect(negated.elements.find((element) => element.role === 'counter')?.animation).toBe('none');
    expect(negated.elements.some((element) => element.role === 'numeric-fraction-rule')).toBe(true);
    expect(negated.elements.some((element) => element.role === 'truth-negation-strike')).toBe(true);
    expect(negated.elements.find((element) => element.role === 'truth-negation-strike')?.entranceOverride).toBe('draw');
  });

  it('extracts semantic facts from language without turning them into preset forms', () => {
    const fuzzy = analyzeContentShape({ text: 'Most people quit.' });
    const refute = analyzeContentShape({ text: 'Not harder, but smarter.' });
    const transition = analyzeContentShape({ text: 'Broke to millionaire.' });
    const beats = analyzeContentShape({ text: 'Consistency beats talent.' });

    expect(fuzzy.structure.evidence.quantityKind).toBe('fuzzy-proportion');
    expect(fuzzy.structure.evidence.boundedRange).toBe(true);
    expect(fuzzy.structure.evidence.proportionAffordance).toBe(true);
    expect(fuzzy.structure.evidence.polarity).toBe('negative');
    expect(fuzzy.structure.evidence.negationAffordance).toBeUndefined();
    expect(fuzzy.structure.relations.some((relation) => relation.type === 'refutes')).toBe(false);

    expect(refute.structure.evidence.negationAffordance).toBe(true);
    expect(refute.structure.relations).toContainEqual({
      type: 'refutes',
      fromRole: 'truth-negation',
      toRole: 'emphasis-text',
    });
    expect(refute.structure.relations.some((relation) => relation.type === 'compares')).toBe(false);
    expect(refute.shapes.some((shape) => shape.kind === 'comparison')).toBe(false);

    expect(transition.structure.relations).toContainEqual({
      type: 'compares',
      fromRole: 'compare-from',
      toRole: 'compare-to',
    });
    expect(transition.structure.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'compare-from', value: 'Broke' }),
      expect.objectContaining({ role: 'compare-to', value: 'millionaire' }),
    ]));
    expect(transition.shapes).toContainEqual(expect.objectContaining({
      kind: 'comparison',
      from: 'Broke',
      to: 'millionaire',
    }));
    expect(transition.structure.evidence.polarity).toBe('positive');

    expect(beats.structure.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'compare-from', value: 'talent' }),
      expect.objectContaining({ role: 'compare-to', value: 'Consistency' }),
    ]));
    expect(beats.shapes).toContainEqual(expect.objectContaining({
      kind: 'comparison',
      from: 'talent',
      to: 'Consistency',
    }));
  });

  it('uses support and salience atoms as form gates, not graphic labels', () => {
    const tokens = resolveMotionTokens(energeticSignals);
    const scores = mgScoresFor(energeticSignals);
    const unsupported = planComposition(
      {
        content: {
          value: '200%',
          label: 'maybe improvement',
          quantityKind: 'percent',
          warranted: false,
        },
      },
      tokens,
      energeticSignals,
      scores,
    );
    const salient = planComposition(
      {
        content: {
          value: '90%',
          label: 'good people',
          quantityKind: 'percent',
          relationKind: 'part_of_whole',
          bounded: true,
          salience: 0.95,
          warranted: true,
        },
      },
      tokens,
      { ...energeticSignals, visual_complexity: 0.1, text_on_screen: 0.1 },
      scores,
    );

    expect(unsupported.id).toBe('suppressed');
    expect(salient.id).toBe('composed-numeric');
    expect(salient.elements.find((element) => element.role === 'counter')?.entranceOverride).toBe('pop');
    expect(salient.elements.find((element) => element.role === 'proportion-boundary-rule')?.entranceOverride).toBe('draw');
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

  it('promotes keyword-with-explanatory-body into structured concept composition', () => {
    const tokens = resolveMotionTokens(energeticSignals, { accentColor: '#00ff00' });
    const scores = mgScoresFor(energeticSignals);
    const content = {
      keyword: 'selection bias',
      emphasisWord: 'selection bias',
      text: 'selection bias',
      body: 'the sample changed the story',
      warranted: true,
      salience: 0.82,
    };
    const strategy = analyzeContentShape(content);
    const recipe = planComposition({ content, triggerMoment: 'concept explanation' }, tokens, energeticSignals, scores);

    expect(strategy.structure.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'keyword', channel: 'text', sourceKey: 'keyword' }),
      expect.objectContaining({ role: 'body', channel: 'text', sourceKey: 'body' }),
    ]));
    expect(strategy.structure.relations).toContainEqual({
      type: 'context-for',
      fromRole: 'body',
      toRole: 'keyword',
    });
    expect(strategy.shapes[0]).toEqual(expect.objectContaining({
      kind: 'structured',
      title: 'selection bias',
      body: 'the sample changed the story',
    }));
    expect(recipe.id).toBe('composed-structured-claim');
    expect(recipe.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ primitive: 'text', role: 'primary', bind: expect.objectContaining({ text: 'selection bias' }) }),
      expect.objectContaining({ primitive: 'text', role: 'secondary', bind: expect.objectContaining({ text: 'the sample changed the story' }) }),
    ]));
    expect(recipe.elements.find((element) => element.role === 'primary')?.bind.minSize).toBeGreaterThanOrEqual(48);
  });

  it('gives long semantic MG copy readable width instead of corner-card compression', () => {
    const tokens = resolveMotionTokens(energeticSignals);
    const scores = mgScoresFor(energeticSignals);
    const quoteText = "Anonymity doesn't bring out the worst in people. It just brings out the worst people.";
    const quote = planComposition(
      { content: { quote: quoteText }, triggerMoment: 'standout assertion' },
      tokens,
      energeticSignals,
      scores,
    );
    const structured = planComposition(
      {
        content: {
          title: 'Algorithm Problem',
          body: 'Promoting inflammatory discussion over enthusiasm',
        },
        triggerMoment: 'claim support',
      },
      tokens,
      energeticSignals,
      scores,
    );

    expect(quote.id).toBe('composed-quotation');
    expect(quote.layout.maxWidth).toBe('85%');
    expect(quote.elements.find((element) => element.role === 'primary')?.bind.minSize).toBeLessThanOrEqual(64);

    expect(structured.id).toBe('composed-structured-problem');
    expect(structured.layout).toEqual(expect.objectContaining({ position: 'top-right', maxWidth: '68%' }));
    expect(structured.elements.find((element) => element.role === 'secondary')?.bind.minSize).toBeLessThanOrEqual(54);
  });

  it('keeps short MG titles one-line but lets long sentence copy wrap at spaces', () => {
    const measure = (text: string, px: number) => text.length * px * 0.62;
    const shortTitle = fitFontSize('Selection Bias', 864, 98, 36, {}, measure);
    const longSentence = fitFontSize(
      "Anonymity doesn't bring out the worst in people. It just brings out the worst people.",
      864,
      64,
      36,
      {},
      measure,
    );

    expect(shortTitle).toBeLessThan(98);
    expect('Selection Bias'.length * shortTitle * 0.62).toBeLessThanOrEqual(864 * 0.9);
    expect(longSentence).toBe(64);
  });

  it('licenses data-viz forms from series facts before planning', () => {
    const bar = analyzeContentShape({ values: [12, 19, 31, 47], labels: ['Q1', 'Q2', 'Q3', 'Q4'] });
    const ring = analyzeContentShape({ values: [72], labels: ['Progress'] });
    const arbitraryScalar = analyzeContentShape({ values: [0.02], labels: ['human beings per day'] });
    const spark = analyzeContentShape({ values: [12, 19, 31, 47, 51], labels: ['A', 'B', 'C', 'D', 'E'] });
    const ranked = analyzeContentShape({ values: [92, 78, 64, 51, 33], labels: ['A', 'B', 'C', 'D', 'E'] });
    const sparkCandidates = enumerateDataSeriesVisualForms([12, 19, 31, 47, 51], ['A', 'B', 'C', 'D', 'E']);
    const rankedCandidates = enumerateDataSeriesVisualForms([92, 78, 64, 51, 33], ['A', 'B', 'C', 'D', 'E']);

    expect(bar.structure.evidence.dataSeriesVisualForm).toBe('bar-chart');
    expect(ring.structure.evidence.dataSeriesVisualForm).toBe('percentage-ring');
    expect(arbitraryScalar.structure.evidence.dataSeriesVisualForm).toBe('bar-chart');
    expect(spark.structure.evidence.dataSeriesVisualForm).toBe('sparkline');
    expect(ranked.structure.evidence.dataSeriesVisualForm).toBe('bar-chart');
    expect(spark.structure.evidence.dataSeriesCandidateForms).toContain('sparkline');
    expect(spark.structure.evidence.dataSeriesSelectedWires).toContain('slope');
    expect(ranked.structure.evidence.dataSeriesCandidateForms).toContain('bar-chart');
    expect(ranked.structure.evidence.dataSeriesSelectedWires).toContain('length');
    expect(spark.structure.evidence.seriesCardinality).toBe(5);
    expect(spark.structure.evidence.seriesTrend).toBe('rising');
    expect(ranked.structure.evidence.seriesRanked).toBe(true);
    expect(ranked.structure.evidence.seriesComparison).toBe(true);
    expect(sparkCandidates.map((candidate) => candidate.visualForm)).toEqual(expect.arrayContaining(['sparkline', 'bar-chart']));
    expect(rankedCandidates.map((candidate) => candidate.visualForm)).toEqual(expect.arrayContaining(['bar-chart', 'sparkline']));
    expect(bar.shapes[0]).toEqual(expect.objectContaining({ kind: 'data-series', visualForm: 'bar-chart' }));
    expect(ring.shapes[0]).toEqual(expect.objectContaining({ kind: 'data-series', visualForm: 'percentage-ring' }));
    expect(spark.shapes[0]).toEqual(expect.objectContaining({
      kind: 'data-series',
      visualForm: 'sparkline',
      candidateVisualForms: expect.arrayContaining(['sparkline', 'bar-chart']),
      visualFormLicense: expect.stringContaining('slope'),
    }));
    expect(ranked.shapes[0]).toEqual(expect.objectContaining({
      kind: 'data-series',
      visualForm: 'bar-chart',
      candidateVisualForms: expect.arrayContaining(['bar-chart', 'sparkline']),
      visualFormLicense: expect.stringContaining('length'),
    }));
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
