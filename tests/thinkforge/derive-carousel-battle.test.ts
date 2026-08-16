import { describe, it, expect } from 'vitest';
import { deriveCarouselVisualSpec, type DeriveCarouselInput } from '@/lib/thinkforge/visual-language/derive-carousel-visual-spec';

/**
 * BATTLE TEST (Rule 29): feed realistic, diverse content types with the signals the
 * resolver would actually set (keyword-heuristic), print the decisions, and assert only
 * hard invariants. The console output is read by a human to judge whether the decisions
 * are WISE, not just non-crashing.
 */

const SCENARIOS: Array<{ name: string; input: DeriveCarouselInput }> = [
  {
    name: 'SaaS launch (the real Insturix case) — conversion, has logo',
    input: {
      signals: {}, goal: 'conversion', slideCount: 4,
      blocks: [
        { title: 'Your tools are fragmented', text: 'Every app is a silo. Context is rebuilt constantly.' },
        { title: 'This is how businesses get robbed', text: 'Not just time — their potential.' },
        { title: 'Integrated production power', text: 'One floor, every creative tool in harmony.' },
        { title: 'Stop navigating a maze of apps', text: 'Discover the Insturix difference today.' },
      ],
    },
  },
  {
    name: 'Educational how-to tutorial',
    input: {
      signals: { education_intent: 0.78, behavioral_utility: 0.76 }, goal: 'education', slideCount: 5,
      blocks: [
        { title: 'How to cut your edit time in half', text: 'A 4-step workflow.' },
        { title: 'Step 1: Batch your clips', text: 'Group similar shots first.' },
        { title: 'Step 2: Rough cut on markers', text: 'Never scrub the timeline.' },
        { title: 'Step 3: Polish last', text: 'Color and audio at the end.' },
        { title: 'Step 4: Export presets', text: 'Save once, reuse forever.' },
      ],
    },
  },
  {
    name: 'Data / research report — stats-heavy',
    input: {
      signals: { logos_load: 0.76, specificity_grain: 0.74 }, goal: 'education', slideCount: 3,
      proofPoints: ['73% waste 2h/day', '3x ROI', '40% faster'],
      blocks: [
        { title: '73% of teams waste 2 hours a day', text: 'New research across 500 companies.' },
        { title: 'The cost: $12k per employee', text: 'Annualized productivity loss.' },
        { title: 'Integrated teams see 3x ROI', text: 'The data is unambiguous.' },
      ],
    },
  },
  {
    name: 'Emotional / personal story',
    input: {
      signals: { narrative_transportation: 0.74, tension_arc: 0.66, warmth: 0.74 }, goal: 'connection', slideCount: 3,
      blocks: [
        { title: 'I almost quit last year', text: 'Burnout nearly took everything.' },
        { title: 'The turning point', text: 'One small change in how I worked.' },
        { title: 'Where I am now', text: 'Calmer, clearer, shipping more.' },
      ],
    },
  },
  {
    name: 'Meme / humor',
    input: {
      signals: { humor: 0.62, entertainment_intent: 0.72, formality: -0.35 }, goal: 'connection', slideCount: 2,
      blocks: [
        { title: 'POV: the client says "one small change"', text: 'It is never one small change.' },
        { title: 'Narrator: it was not small', text: 'Three days later...' },
      ],
    },
  },
  {
    name: 'Urgent launch — the "urgent but sober" combo',
    input: {
      signals: { kairos_pressure: 0.78, formality: 0.58, ethos_load: 0.76 }, goal: 'announcement', slideCount: 3,
      blocks: [
        { title: 'Launching Monday', text: 'The wait is over.' },
        { title: 'Built for teams that ship', text: 'Enterprise-grade from day one.' },
        { title: 'Early access closes Friday', text: 'Reserve your seat.' },
      ],
    },
  },
  {
    name: 'Minimal input — no signals, no platform, no goal (edge)',
    input: {
      signals: {}, slideCount: 3,
      blocks: [
        { title: 'A', text: 'First point.' },
        { title: 'B', text: 'Second point.' },
        { title: 'C', text: 'Third point.' },
      ],
    },
  },
  {
    name: 'Very short — 2 blocks only (edge)',
    input: {
      signals: { kairos_pressure: 0.78 }, slideCount: 2,
      blocks: [{ title: 'Big news', text: 'We shipped it.' }, { title: 'Try it free', text: 'Link in bio.' }],
    },
  },
  {
    name: 'Contradictory signals (formal AND casual matched — resolver last-write)',
    input: {
      signals: { formality: -0.35, ethos_load: 0.76 }, goal: 'education', slideCount: 4,
      blocks: [{ title: 'X', text: 'a.' }, { title: 'Y', text: 'b.' }, { title: 'Z', text: 'c.' }, { title: 'W', text: 'd.' }],
    },
  },
  {
    name: 'Conversion but NO brand logo (product_mockup should NOT fire)',
    input: {
      signals: {}, goal: 'conversion', slideCount: 3,
      blocks: [{ title: 'Save 10 hours a week', text: 'Automate the busywork.' }, { title: 'Start free', text: 'No card needed.' }, { title: 'Cancel anytime', text: 'Really.' }],
    },
  },
];

describe('deriveCarouselVisualSpec — BATTLE TEST (read the console)', () => {
  for (const { name, input } of SCENARIOS) {
    it(`${name}`, () => {
      const s = deriveCarouselVisualSpec(input);
      const roles = s.slides.map((sl) => sl.role).join(' → ');
      const copy = s.slides.map((sl) => `[${sl.role}] ${sl.overlayCopy ?? '∅'}`).join('  |  ');
      // eslint-disable-next-line no-console
      console.log(
        `\n### ${name}\n` +
        `  visualMode : ${s.visualMode}\n` +
        `  slideCount : ${s.slideCount}   roles: ${roles}\n` +
        `  vibe       : [${s.vibe.join(', ')}]   imageStyle: [${s.imageStyle.join(', ')}]   palette: ${s.palette.temperatureBias}\n` +
        `  textPolicy : ${s.textPolicy}\n` +
        `  confidence : ${s.confidence.toFixed(2)}   lowConf: [${s.lowConfidenceFields.join(', ') || 'none'}]\n` +
        `  overlayCopy: ${copy}\n` +
        `  why        : ${s.rationale.join(' · ')}`,
      );
      // Hard invariants (must always hold)
      expect(s.slides.length).toBe(s.slideCount);
      expect(s.slideCount).toBeGreaterThanOrEqual(2);
      expect(s.slides[0].role).toBe('hook');
      expect(['cta', 'context']).toContain(s.slides[s.slides.length - 1].role);
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    });
  }
});
