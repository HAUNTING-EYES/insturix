import { describe, expect, it } from 'vitest';

import {
  type BrandDefaults,
  type IntakeSignals,
  lowConfidenceFields,
  resolveProductionBrief,
} from '@/lib/editron/production-brief/intake-resolver';

function signals(over: Partial<IntakeSignals> = {}): IntakeSignals {
  return {
    entryPoint: 'upload', assetCount: 1, totalDurationSec: 3600,
    contentType: null, speechCoverage: null, hasBrand: true, ...over,
  };
}
const BRAND: BrandDefaults = {
  preferredPlatform: 'linkedin',
  preferredAspectRatio: '1:1',
  defaultDurationSec: 45,
  vibe: { tone: 'warm', energy: 0.6 },
};

describe('brand defaults - precedence user > brand > inference', () => {
  it('brand platform is used when the user did not pick one', () => {
    const b = resolveProductionBrief(signals({ brand: BRAND }));
    expect(b.output.platform).toBe('linkedin');
    expect(b.resolution.fieldConfidence.platform).toBe(0.8); // brand-default confidence
  });

  it('an explicit user platform beats the brand default', () => {
    const b = resolveProductionBrief(signals({ brand: BRAND, requested: { platform: 'tiktok' } }));
    expect(b.output.platform).toBe('tiktok');
    expect(b.resolution.confirmed).toContain('platform');
    expect(b.resolution.fieldConfidence.platform).toBe(1);
  });

  it('brand platform beats content inference', () => {
    // podcast content would infer youtube; brand says linkedin -> brand wins
    const b = resolveProductionBrief(signals({ brand: BRAND, contentType: 'podcast' }));
    expect(b.output.platform).toBe('linkedin');
  });

  it('brand aspect + duration apply, duration still clamped to source', () => {
    const b = resolveProductionBrief(signals({ brand: BRAND, totalDurationSec: 30 }));
    expect(b.output.aspectRatio).toBe('1:1');
    expect(b.output.targetDurationSec).toBe(30); // brand wanted 45, source is 30 -> clamped
  });

  it('user aspect + duration override the brand', () => {
    const b = resolveProductionBrief(
      signals({ brand: BRAND, requested: { aspectRatio: '16:9', targetDurationSec: 20 } }),
    );
    expect(b.output.aspectRatio).toBe('16:9');
    expect(b.output.targetDurationSec).toBe(20);
  });

  it('brand vibe becomes the default style; user style wins', () => {
    expect(resolveProductionBrief(signals({ brand: BRAND })).output.style).toEqual({ tone: 'warm', energy: 0.6 });
    expect(
      resolveProductionBrief(signals({ brand: BRAND, requested: { style: { tone: 'punchy' } } })).output.style,
    ).toEqual({ tone: 'punchy' });
  });

  it('brand-defaulted knobs are NOT highlighted (trusted default, above threshold)', () => {
    const b = resolveProductionBrief(signals({ brand: BRAND }));
    expect(lowConfidenceFields(b)).not.toContain('platform');
    expect(lowConfidenceFields(b)).not.toContain('aspectRatio');
  });

  it('no brand -> unchanged inference behavior (ambiguous stays flagged)', () => {
    const b = resolveProductionBrief(signals({ brand: null }));
    expect(b.output.platform).toBe('unspecified'); // no brand, no signal
    expect(lowConfidenceFields(b)).toContain('platform'); // still flagged for a glance
  });
});

describe('optional prompt', () => {
  it('a typed prompt seeds intent verbatim when no explicit intent is set', () => {
    const b = resolveProductionBrief(signals({ prompt: '  punchy 30s cut for instagram  ' }));
    expect(b.output.intent).toBe('punchy 30s cut for instagram'); // trimmed
    expect(b.resolution.confirmed).toContain('intent');
  });

  it('an explicit requested intent beats the prompt', () => {
    const b = resolveProductionBrief(signals({ prompt: 'from the prompt', requested: { intent: 'explicit' } }));
    expect(b.output.intent).toBe('explicit');
  });

  it('the prompt does NOT silently move knobs (structured parse is deferred)', () => {
    // "for instagram" in the prompt must NOT set platform - that needs the LLM parser
    const b = resolveProductionBrief(signals({ prompt: 'punchy 30s for instagram', contentType: 'podcast' }));
    expect(b.output.platform).toBe('youtube'); // still content-inferred, prompt did not move it
  });

  it('an empty / whitespace prompt sets no intent', () => {
    expect(resolveProductionBrief(signals({ prompt: '   ' })).output.intent).toBeUndefined();
    expect(resolveProductionBrief(signals({ prompt: null })).output.intent).toBeUndefined();
  });
});
