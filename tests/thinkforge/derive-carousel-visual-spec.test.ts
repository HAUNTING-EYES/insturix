import { describe, it, expect } from 'vitest';
import {
  deriveCarouselVisualSpec,
  MAX_CAROUSEL_SLIDES,
  type DeriveCarouselInput,
} from '@/lib/thinkforge/visual-language/derive-carousel-visual-spec';

/**
 * Golden eval harness for the carousel visual-language deriver (Rule 35: eval first).
 * Each case pins an atoms → visual-spec decision so the mapping can't silently drift.
 */

const blocks = (n: number): DeriveCarouselInput['blocks'] =>
  Array.from({ length: n }, (_, i) => ({ title: `Slide ${i + 1} title`, text: `Body sentence ${i + 1}. More detail here.` }));

const base: DeriveCarouselInput = { signals: {}, blocks: blocks(5) };

describe('deriveCarouselVisualSpec — visual mode', () => {
  it('data/proof-heavy content → text_forward_graphic', () => {
    const spec = deriveCarouselVisualSpec({ ...base, signals: { logos_load: 0.76 } });
    expect(spec.visualMode).toBe('text_forward_graphic');
    expect(spec.lowConfidenceFields).not.toContain('visualMode');
  });

  it('two+ proof points alone → text_forward_graphic (no signal needed)', () => {
    const spec = deriveCarouselVisualSpec({ ...base, proofPoints: ['40% faster', '3x cheaper'] });
    expect(spec.visualMode).toBe('text_forward_graphic');
  });

  it('narrative/warmth → photo', () => {
    const spec = deriveCarouselVisualSpec({ ...base, signals: { narrative_transportation: 0.74 } });
    expect(spec.visualMode).toBe('photo');
  });

  it('education intent → illustration', () => {
    const spec = deriveCarouselVisualSpec({ ...base, signals: { education_intent: 0.78 } });
    expect(spec.visualMode).toBe('illustration');
  });

  it('conversion + brand assets does NOT auto-pick product_mockup (only via override)', () => {
    // "Show the product" can't be inferred from goal+logo — most conversion content is
    // conceptual, not a product render. The deriver must not force product_mockup.
    const spec = deriveCarouselVisualSpec({ ...base, goal: 'conversion', brandHasLogo: true });
    expect(spec.visualMode).not.toBe('product_mockup');
    const overridden = deriveCarouselVisualSpec({ ...base, overrides: { visualMode: 'product_mockup' } });
    expect(overridden.visualMode).toBe('product_mockup');
  });

  it('no signals → photo default, flagged low-confidence', () => {
    const spec = deriveCarouselVisualSpec(base);
    expect(spec.visualMode).toBe('photo');
    expect(spec.lowConfidenceFields).toContain('visualMode');
  });

  it('user override beats every signal', () => {
    const spec = deriveCarouselVisualSpec({ ...base, signals: { logos_load: 0.9 }, overrides: { visualMode: 'diagram' } });
    expect(spec.visualMode).toBe('diagram');
  });
});

describe('deriveCarouselVisualSpec — slide count (platform decides, override wins)', () => {
  it('instagram defaults to 6, bounded by content', () => {
    const spec = deriveCarouselVisualSpec({ signals: {}, platform: 'instagram', blocks: blocks(6) });
    expect(spec.slideCount).toBe(6);
    expect(spec.lowConfidenceFields).not.toContain('slideCount');
  });

  it('slide count never exceeds available content blocks', () => {
    const spec = deriveCarouselVisualSpec({ signals: {}, platform: 'instagram', blocks: blocks(3) });
    expect(spec.slideCount).toBe(3); // 6 default clamped down to 3 blocks
  });

  it('unknown platform → generic default, flagged low-confidence', () => {
    const spec = deriveCarouselVisualSpec({ signals: {}, platform: 'myspace', blocks: blocks(5) });
    expect(spec.slideCount).toBe(5);
    expect(spec.lowConfidenceFields).toContain('slideCount');
  });

  it('override wins and is clamped to the max', () => {
    const spec = deriveCarouselVisualSpec({ signals: {}, platform: 'tiktok', blocks: blocks(10), overrides: { slideCount: 20 } });
    expect(spec.slideCount).toBe(MAX_CAROUSEL_SLIDES);
  });
});

describe('deriveCarouselVisualSpec — slide roles + real overlay copy', () => {
  it('persuasive goal: first hook, last cta, middle proof when proof points exist', () => {
    const spec = deriveCarouselVisualSpec({ ...base, goal: 'conversion', proofPoints: ['stat'] });
    expect(spec.slides[0].role).toBe('hook');
    expect(spec.slides[spec.slides.length - 1].role).toBe('cta');
    expect(spec.slides[1].role).toBe('proof');
  });

  it('non-persuasive goal (education): last slide is closing context, not a cta', () => {
    const spec = deriveCarouselVisualSpec({ ...base, goal: 'education' });
    expect(spec.slides[spec.slides.length - 1].role).toBe('context');
  });

  it('a cta slide carries no content copy — the CTA is goal/brand-owned', () => {
    const spec = deriveCarouselVisualSpec({ ...base, goal: 'conversion' });
    const cta = spec.slides[spec.slides.length - 1];
    expect(cta.role).toBe('cta');
    expect(cta.overlayCopy).toBeNull();
  });

  it('middle is context when there are no proof points', () => {
    const spec = deriveCarouselVisualSpec(base);
    expect(spec.slides[1].role).toBe('context');
  });

  it('overlayCopy is REAL extracted copy (title), never a keyword bag', () => {
    const spec = deriveCarouselVisualSpec(base);
    expect(spec.slides[0].overlayCopy).toBe('Slide 1 title');
    // no comma-joined word bag
    expect(spec.slides[0].overlayCopy).not.toMatch(/^(\w+, ){3,}/);
  });

  it('falls back to first sentence when a block has no title', () => {
    const spec = deriveCarouselVisualSpec({ signals: {}, blocks: [{ text: 'Hook line here. Second sentence.' }, { text: 'B' }, { text: 'C' }] });
    expect(spec.slides[0].overlayCopy).toBe('Hook line here.');
  });
});

describe('deriveCarouselVisualSpec — vibe (curated, from signals)', () => {
  it('reproduces the hand-typed "urgent but sober" from atoms', () => {
    // kairos_pressure (urgency) + positive formality (sober/polished) — the exact combo
    // the founder typed by hand into the free-text box.
    const spec = deriveCarouselVisualSpec({ ...base, signals: { kairos_pressure: 0.78, formality: 0.58 } });
    expect(spec.vibe).toContain('urgent');
    expect(spec.vibe).toContain('sober');
  });

  it('casual formality → casual chip', () => {
    const spec = deriveCarouselVisualSpec({ ...base, signals: { formality: -0.35 } });
    expect(spec.vibe).toContain('casual');
  });

  it('caps at 3 chips', () => {
    const spec = deriveCarouselVisualSpec({
      ...base,
      signals: { kairos_pressure: 0.8, warmth: 0.8, humor: 0.8, ethos_load: 0.8, novelty: 0.8 },
    });
    expect(spec.vibe.length).toBeLessThanOrEqual(3);
  });

  it('no signals → neutral "clean" + low-confidence flag', () => {
    const spec = deriveCarouselVisualSpec(base);
    expect(spec.vibe).toEqual(['clean']);
    expect(spec.lowConfidenceFields).toContain('vibe');
  });
});

describe('deriveCarouselVisualSpec — palette + confidence + determinism', () => {
  it('palette always brand-sourced; warmth biases temperature warm', () => {
    const spec = deriveCarouselVisualSpec({ ...base, signals: { warmth: 0.74 } });
    expect(spec.palette.source).toBe('brand');
    expect(spec.palette.temperatureBias).toBe('warm');
  });

  it('rich atoms → high confidence, empty atoms → low', () => {
    const rich = deriveCarouselVisualSpec({ signals: { logos_load: 0.76, kairos_pressure: 0.78 }, platform: 'instagram', blocks: blocks(6), proofPoints: ['x'] });
    const bare = deriveCarouselVisualSpec(base);
    expect(rich.confidence).toBeGreaterThan(bare.confidence);
    expect(rich.confidence).toBe(1);
  });

  it('is deterministic (same input → identical output)', () => {
    const input = { ...base, signals: { logos_load: 0.76 } };
    expect(deriveCarouselVisualSpec(input)).toEqual(deriveCarouselVisualSpec(input));
  });

  it('always emits a valid, bounded slide set with a rationale', () => {
    const spec = deriveCarouselVisualSpec(base);
    expect(spec.slides.length).toBe(spec.slideCount);
    expect(spec.slideCount).toBeGreaterThanOrEqual(2);
    expect(spec.slideCount).toBeLessThanOrEqual(MAX_CAROUSEL_SLIDES);
    expect(spec.rationale.length).toBeGreaterThan(0);
  });
});
