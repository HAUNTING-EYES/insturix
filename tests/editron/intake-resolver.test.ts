import { describe, expect, it } from 'vitest';

import {
  type IntakeSignals,
  isBriefReady,
  lowConfidenceFields,
  resolveProductionBrief,
  topFieldToConfirm,
} from '@/lib/editron/production-brief/intake-resolver';

function signals(over: Partial<IntakeSignals> = {}): IntakeSignals {
  return {
    entryPoint: 'upload',
    assetCount: 1,
    totalDurationSec: 3600,
    contentType: null,
    speechCoverage: null,
    hasBrand: false,
    ...over,
  };
}

describe('resolveProductionBrief - platform is the master knob', () => {
  it('an explicit platform sets aspect + a default duration; format is derived', () => {
    const b = resolveProductionBrief(signals({ requested: { platform: 'tiktok' } }));
    expect(b.output.platform).toBe('tiktok');
    expect(b.output.aspectRatio).toBe('9:16');
    expect(b.output.targetDurationSec).toBe(30);
    expect(b.resolution.confirmed).toContain('platform');
    expect(b.output.format).toBe('reel'); // 30s of 3600 => condensed
  });

  it('connected accounts are the best platform signal (high confidence, no highlight)', () => {
    const b = resolveProductionBrief(signals({ connectedPlatforms: ['instagram-reels'] }));
    expect(b.output.platform).toBe('instagram-reels');
    expect(b.output.aspectRatio).toBe('9:16');
    expect(lowConfidenceFields(b)).not.toContain('platform');
  });
});

describe('resolveProductionBrief - the podcast case: infer, do NOT ask a type', () => {
  it('a podcast defaults to a faithful YouTube edit, but flags platform for a glance', () => {
    const b = resolveProductionBrief(signals({ contentType: 'podcast', totalDurationSec: 5400 }));
    expect(b.output.platform).toBe('youtube');
    expect(b.output.aspectRatio).toBe('16:9');
    expect(b.output.targetDurationSec).toBeNull(); // follow content = full edit
    expect(b.output.format).toBe('auto-edit');
    // NOT two buttons: platform is just highlighted as low-confidence in the spec card.
    expect(lowConfidenceFields(b)).toContain('platform');
    expect(topFieldToConfirm(b)).toBe('platform');
  });

  it('switching that podcast to TikTok makes it a short vertical reel - a knob change, no menu', () => {
    const b = resolveProductionBrief(
      signals({ contentType: 'podcast', totalDurationSec: 5400, requested: { platform: 'tiktok' } }),
    );
    expect(b.output.aspectRatio).toBe('9:16');
    expect(b.output.targetDurationSec).toBe(30);
    expect(b.output.format).toBe('reel');
  });
});

describe('resolveProductionBrief - duration is bounded to the source', () => {
  it('never proposes a longer output than the footage uploaded', () => {
    const b = resolveProductionBrief(signals({ totalDurationSec: 12, requested: { platform: 'linkedin' } }));
    expect(b.output.targetDurationSec).toBe(12); // linkedin wants 60s, only 12s exists
  });

  it('clamps an explicit over-long request down to the source length', () => {
    const b = resolveProductionBrief(signals({ totalDurationSec: 40, requested: { targetDurationSec: 300 } }));
    expect(b.output.targetDurationSec).toBe(40);
  });
});

describe('resolveProductionBrief - count and misc contracts', () => {
  it('count defaults to 1', () => {
    expect(resolveProductionBrief(signals()).output.count).toBe(1);
  });
  it('honors an explicit count, floored to >= 1', () => {
    expect(resolveProductionBrief(signals({ requested: { count: 3 } })).output.count).toBe(3);
    expect(resolveProductionBrief(signals({ requested: { count: 0 } })).output.count).toBe(1);
  });
  it('sets a brand ref only when a brand is present', () => {
    expect(resolveProductionBrief(signals({ hasBrand: true })).brand).toEqual({});
    expect(resolveProductionBrief(signals({ hasBrand: false })).brand).toBeNull();
  });
  it('carries sourceDurationSec through for the duration bound', () => {
    expect(resolveProductionBrief(signals({ totalDurationSec: 900 })).sourceDurationSec).toBe(900);
  });
  it('never throws on empty-ish signals and still returns a usable platform', () => {
    const b = resolveProductionBrief(signals({ contentType: null, totalDurationSec: null, assetCount: 0 }));
    expect(b.output.platform).toBeTruthy();
    expect(b.output.count).toBe(1);
  });
});

describe('lowConfidenceFields / isBriefReady', () => {
  it('a confident platform (from connected accounts) leaves nothing to glance at', () => {
    const b = resolveProductionBrief(signals({ connectedPlatforms: ['tiktok'] }));
    expect(lowConfidenceFields(b)).toEqual([]);
    expect(isBriefReady(b)).toBe(true);
    expect(topFieldToConfirm(b)).toBeNull();
  });
  it('a low-confidence inferred platform is flagged (not blocking)', () => {
    const b = resolveProductionBrief(signals({ contentType: 'mystery-thing', totalDurationSec: 300, assetCount: 2 }));
    expect(b.output.platform).toBe('unspecified');
    expect(isBriefReady(b)).toBe(false);
    expect(topFieldToConfirm(b)).toBe('platform');
  });
  it('respects a raised threshold', () => {
    const b = resolveProductionBrief(signals({ connectedPlatforms: ['tiktok'] })); // platform 0.9
    expect(topFieldToConfirm(b, { threshold: 0.95 })).toBe('platform');
  });
});
