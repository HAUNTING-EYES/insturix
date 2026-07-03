import { describe, expect, it } from 'vitest';

import {
  CONFIRM_CONFIDENCE_THRESHOLD,
  type IntakeSignals,
  nextConfirmField,
  resolveProductionBrief,
} from '@/lib/editron/production-brief/intake-resolver';

function signals(overrides: Partial<IntakeSignals> = {}): IntakeSignals {
  return {
    entryPoint: 'upload',
    assetCount: 1,
    totalDurationSec: 600,
    contentType: null,
    speechCoverage: null,
    hasBrand: false,
    ...overrides,
  };
}

describe('resolveProductionBrief - the founder podcast ambiguity', () => {
  it('a podcast upload defaults to a faithful edit but stays uncertain, so it asks about FORMAT', () => {
    const brief = resolveProductionBrief(
      signals({ contentType: 'podcast', totalDurationSec: 3600 }),
    );

    expect(brief.output.format).toBe('auto-edit');
    expect(brief.resolution.fieldConfidence.format).toBeLessThan(CONFIRM_CONFIDENCE_THRESHOLD);
    expect(brief.resolution.inferred).toContain('format');
    expect(brief.resolution.confirmed).toHaveLength(0);
    // The whole point: don't silently commit "reel" or "full edit" - ask the one question.
    expect(nextConfirmField(brief)).toBe('format');
  });
});

describe('resolveProductionBrief - explicit requests always win', () => {
  it('an explicit reel request is confirmed, drives 9:16, and only the guessed length is asked', () => {
    const brief = resolveProductionBrief(
      signals({ contentType: 'podcast', requested: { format: 'reel' } }),
    );

    expect(brief.output.format).toBe('reel');
    expect(brief.output.aspectRatio).toBe('9:16');
    expect(brief.output.targetDurationSec).toBe(30);
    expect(brief.resolution.confirmed).toContain('format');
    expect(brief.resolution.fieldConfidence.format).toBe(1);
    // Format is settled; the derived 30s length is the only thing worth confirming.
    expect(nextConfirmField(brief)).toBe('targetDurationSec');
  });

  it('an explicit duration overrides the format default', () => {
    const brief = resolveProductionBrief(
      signals({ requested: { format: 'reel', targetDurationSec: 12 } }),
    );
    expect(brief.output.targetDurationSec).toBe(12);
    expect(brief.resolution.confirmed).toEqual(expect.arrayContaining(['format', 'targetDurationSec']));
    expect(nextConfirmField(brief)).toBeNull();
  });
});

describe('resolveProductionBrief - confident inputs proceed without questions', () => {
  it('a vlog upload is confidently a faithful edit and asks nothing', () => {
    const brief = resolveProductionBrief(signals({ contentType: 'vlog' }));
    expect(brief.output.format).toBe('auto-edit');
    expect(brief.output.targetDurationSec).toBeNull(); // follow the content
    expect(nextConfirmField(brief)).toBeNull();
  });

  it('a talking-head upload proceeds without questions', () => {
    const brief = resolveProductionBrief(signals({ contentType: 'talking-head' }));
    expect(brief.output.format).toBe('talking-head');
    expect(nextConfirmField(brief)).toBeNull();
  });

  it('a script entry with explainer content is a high-confidence explainer, asks only the length', () => {
    const brief = resolveProductionBrief(
      signals({ entryPoint: 'script', assetCount: 0, totalDurationSec: null, contentType: 'saas-explainer' }),
    );
    expect(brief.output.format).toBe('explainer');
    expect(brief.resolution.fieldConfidence.format).toBeGreaterThanOrEqual(CONFIRM_CONFIDENCE_THRESHOLD);
    expect(brief.output.targetDurationSec).toBe(60);
    expect(nextConfirmField(brief)).toBe('targetDurationSec');
  });
});

describe('resolveProductionBrief - genuinely unknown inputs ask FORMAT first', () => {
  it('an unrecognized content type falls to a faithful edit but asks what to make', () => {
    const brief = resolveProductionBrief(
      signals({ contentType: 'screencast-mystery', assetCount: 2, totalDurationSec: 300 }),
    );
    expect(brief.output.format).toBe('auto-edit');
    expect(brief.resolution.fieldConfidence.format).toBeLessThan(CONFIRM_CONFIDENCE_THRESHOLD);
    expect(nextConfirmField(brief)).toBe('format');
  });

  it('a tiny single clip leans reel but still confirms format before anything else', () => {
    const brief = resolveProductionBrief(
      signals({ contentType: null, assetCount: 1, totalDurationSec: 18 }),
    );
    expect(brief.output.format).toBe('reel');
    expect(nextConfirmField(brief)).toBe('format');
  });
});

describe('resolveProductionBrief - misc contracts', () => {
  it('sets a brand ref only when the intake reports a brand', () => {
    expect(resolveProductionBrief(signals({ hasBrand: true })).brand).toEqual({});
    expect(resolveProductionBrief(signals({ hasBrand: false })).brand).toBeNull();
  });

  it('never throws and always returns a usable format on empty-ish signals', () => {
    const brief = resolveProductionBrief(signals({ contentType: null, totalDurationSec: null, assetCount: 0 }));
    expect(brief.output.format).toBeTruthy();
    expect(brief.entryPoint).toBe('upload');
  });

  it('respects a raised threshold by asking about an otherwise-settled field', () => {
    const brief = resolveProductionBrief(signals({ contentType: 'vlog' }));
    // format is 0.72 here; demanding 0.9 makes it uncertain again.
    expect(nextConfirmField(brief, { threshold: 0.9 })).toBe('format');
  });
});
