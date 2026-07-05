import { describe, expect, it } from 'vitest';

import {
  ASPECT_CHOICES,
  DURATION_PRESET_SECONDS,
  durationBounds,
  MIN_TARGET_DURATION_SEC,
  PLATFORM_CHOICES,
} from '@/lib/editron/production-brief/confirm-choices';
import { type IntakeSignals, resolveProductionBrief } from '@/lib/editron/production-brief/intake-resolver';

function signals(over: Partial<IntakeSignals> = {}): IntakeSignals {
  return {
    entryPoint: 'upload',
    assetCount: 1,
    totalDurationSec: 600,
    contentType: null,
    speechCoverage: null,
    hasBrand: false,
    ...over,
  };
}

describe('choice lists (metadata editors, not creative-type menus)', () => {
  it('offers real destinations and standard aspects', () => {
    expect(PLATFORM_CHOICES).toContain('tiktok');
    expect(PLATFORM_CHOICES).toContain('youtube');
    // never offer "unspecified" as something to pick - it is only an internal default.
    expect(PLATFORM_CHOICES).not.toContain('unspecified');
    expect(ASPECT_CHOICES).toContain('9:16');
    expect(ASPECT_CHOICES).toContain('16:9');
    expect(DURATION_PRESET_SECONDS).toContain(30);
  });
});

describe('durationBounds - cannot cut more than you uploaded', () => {
  it('caps the max at the source length', () => {
    const b = resolveProductionBrief(signals({ totalDurationSec: 45 }));
    expect(durationBounds(b)).toEqual({ min: MIN_TARGET_DURATION_SEC, max: 45 });
  });
  it('has no cap when the source length is unknown', () => {
    const b = resolveProductionBrief(signals({ totalDurationSec: null }));
    expect(durationBounds(b).max).toBeNull();
  });
});
