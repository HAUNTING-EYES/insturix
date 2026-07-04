import { describe, expect, it } from 'vitest';

import {
  applyUserOutput,
  deriveFormat,
  markConfirmed,
  type ProductionBrief,
} from '@/lib/editron/production-brief/production-brief';

function baseBrief(over: Partial<ProductionBrief> = {}): ProductionBrief {
  return {
    output: { platform: 'youtube', format: 'auto-edit', count: 1, targetDurationSec: null, aspectRatio: '16:9' },
    brand: null,
    entryPoint: 'upload',
    sourceDurationSec: 3600,
    resolution: {
      fieldConfidence: { platform: 0.6, targetDurationSec: 0.85, aspectRatio: 0.6, count: 1 },
      confirmed: [],
      inferred: ['platform', 'targetDurationSec', 'aspectRatio', 'count'],
    },
    ...over,
  };
}

describe('deriveFormat (internal ordering hint, never a user choice)', () => {
  it('short output relative to source => reel (condensed highlight)', () => {
    expect(deriveFormat({ targetDurationSec: 30 }, 3600)).toBe('reel');
  });
  it('near-full output => auto-edit (faithful)', () => {
    expect(deriveFormat({ targetDurationSec: 3000 }, 3600)).toBe('auto-edit');
  });
  it('null duration (follow content) => auto-edit', () => {
    expect(deriveFormat({ targetDurationSec: null }, 3600)).toBe('auto-edit');
  });
  it('unknown source => auto-edit (cannot judge condensation)', () => {
    expect(deriveFormat({ targetDurationSec: 30 }, null)).toBe('auto-edit');
  });
});

describe('applyUserOutput', () => {
  it('applies patched knobs, marks them confirmed, removes them from inferred', () => {
    const next = applyUserOutput(baseBrief(), { platform: 'tiktok', targetDurationSec: 30 });
    expect(next.output.platform).toBe('tiktok');
    expect(next.output.targetDurationSec).toBe(30);
    expect(next.resolution.confirmed).toEqual(expect.arrayContaining(['platform', 'targetDurationSec']));
    expect(next.resolution.inferred).not.toContain('platform');
    expect(next.resolution.fieldConfidence.platform).toBe(1);
  });

  it('RE-DERIVES format from the merged spec (shortening flips it to a highlight)', () => {
    const b = baseBrief(); // source 3600, duration null => auto-edit
    expect(b.output.format).toBe('auto-edit');
    const next = applyUserOutput(b, { targetDurationSec: 30 }); // 30 of 3600 => reel
    expect(next.output.format).toBe('reel');
  });

  it('treats an explicit null duration as a real choice (confirmed)', () => {
    const next = applyUserOutput(baseBrief(), { targetDurationSec: null });
    expect(next.output.targetDurationSec).toBeNull();
    expect(next.resolution.confirmed).toContain('targetDurationSec');
  });

  it('does not mutate the input', () => {
    const b = baseBrief();
    const snap = JSON.stringify(b);
    applyUserOutput(b, { platform: 'tiktok' });
    expect(JSON.stringify(b)).toBe(snap);
  });

  it('does not double-add an already-confirmed knob', () => {
    const once = applyUserOutput(baseBrief(), { platform: 'tiktok' });
    const twice = applyUserOutput(once, { platform: 'tiktok' });
    expect(twice.resolution.confirmed.filter((f) => f === 'platform')).toHaveLength(1);
  });
});

describe('markConfirmed', () => {
  it('promotes an inferred knob to confirmed without changing its value', () => {
    const next = markConfirmed(baseBrief(), 'platform');
    expect(next.output.platform).toBe('youtube');
    expect(next.resolution.confirmed).toContain('platform');
    expect(next.resolution.inferred).not.toContain('platform');
    expect(next.resolution.fieldConfidence.platform).toBe(1);
  });
  it('is a no-op when already confirmed', () => {
    const once = markConfirmed(baseBrief(), 'platform');
    expect(markConfirmed(once, 'platform')).toBe(once);
  });
});
