import { describe, expect, it } from 'vitest';

import {
  applyUserOutput,
  markConfirmed,
  type ProductionBrief,
} from '@/lib/editron/production-brief/production-brief';

function baseBrief(): ProductionBrief {
  return {
    output: { format: 'auto-edit', targetDurationSec: null, aspectRatio: '16:9' },
    brand: null,
    entryPoint: 'upload',
    resolution: {
      fieldConfidence: { format: 0.5, targetDurationSec: 0.85, aspectRatio: 0.5 },
      confirmed: [],
      inferred: ['format', 'targetDurationSec', 'aspectRatio'],
    },
  };
}

describe('applyUserOutput', () => {
  it('applies patched fields, marks them confirmed at confidence 1, and removes them from inferred', () => {
    const next = applyUserOutput(baseBrief(), { format: 'reel', targetDurationSec: 45 });

    expect(next.output.format).toBe('reel');
    expect(next.output.targetDurationSec).toBe(45);
    expect(next.resolution.confirmed).toEqual(expect.arrayContaining(['format', 'targetDurationSec']));
    expect(next.resolution.inferred).toEqual(['aspectRatio']);
    expect(next.resolution.fieldConfidence.format).toBe(1);
    expect(next.resolution.fieldConfidence.targetDurationSec).toBe(1);
  });

  it('treats an explicit null duration as a real user choice (confirmed), not "unset"', () => {
    const next = applyUserOutput(baseBrief(), { targetDurationSec: null });
    expect(next.output.targetDurationSec).toBeNull();
    expect(next.resolution.confirmed).toContain('targetDurationSec');
    expect(next.resolution.fieldConfidence.targetDurationSec).toBe(1);
  });

  it('does not mutate the input brief', () => {
    const brief = baseBrief();
    const snapshot = JSON.stringify(brief);
    applyUserOutput(brief, { format: 'explainer' });
    expect(JSON.stringify(brief)).toBe(snapshot);
  });

  it('does not double-add a field that was already confirmed', () => {
    const first = applyUserOutput(baseBrief(), { format: 'reel' });
    const second = applyUserOutput(first, { format: 'reel' });
    expect(second.resolution.confirmed.filter((f) => f === 'format')).toHaveLength(1);
  });
});

describe('markConfirmed', () => {
  it('promotes an inferred field to confirmed without changing its value', () => {
    const next = markConfirmed(baseBrief(), 'format');
    expect(next.output.format).toBe('auto-edit'); // value unchanged
    expect(next.resolution.confirmed).toContain('format');
    expect(next.resolution.inferred).not.toContain('format');
    expect(next.resolution.fieldConfidence.format).toBe(1);
  });

  it('is a no-op when the field is already confirmed', () => {
    const once = markConfirmed(baseBrief(), 'format');
    const twice = markConfirmed(once, 'format');
    expect(twice).toBe(once);
  });
});
