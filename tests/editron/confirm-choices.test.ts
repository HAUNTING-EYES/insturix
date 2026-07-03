import { describe, expect, it } from 'vitest';

import {
  ASPECT_CHOICES,
  DURATION_PRESET_SECONDS,
  formatChoicesFor,
} from '@/lib/editron/production-brief/confirm-choices';
import {
  isBriefReady,
  type IntakeSignals,
  nextConfirmField,
  pendingConfirmFields,
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

describe('pendingConfirmFields / isBriefReady', () => {
  it('lists every uncertain field in priority order and reports not-ready', () => {
    const brief = resolveProductionBrief(
      signals({ contentType: 'screencast-mystery', assetCount: 2, totalDurationSec: 300 }),
    );
    const pending = pendingConfirmFields(brief);
    expect(pending[0]).toBe('format'); // format leads (upstream of the rest)
    expect(pending).toContain('aspectRatio');
    expect(isBriefReady(brief)).toBe(false);
    // nextConfirmField is exactly the head of the pending list.
    expect(nextConfirmField(brief)).toBe(pending[0]);
  });

  it('a confident input has nothing pending and is ready to run', () => {
    const brief = resolveProductionBrief(signals({ contentType: 'vlog' }));
    expect(pendingConfirmFields(brief)).toEqual([]);
    expect(isBriefReady(brief)).toBe(true);
    expect(nextConfirmField(brief)).toBeNull();
  });
});

describe('formatChoicesFor - the podcast full-vs-reel decision', () => {
  it('offers the faithful edit AND the reel for a podcast', () => {
    const brief = resolveProductionBrief(signals({ contentType: 'podcast', totalDurationSec: 3600 }));
    const choices = formatChoicesFor(brief);
    expect(choices[0]).toBe('auto-edit'); // current inference is the default choice
    expect(choices).toContain('reel');
  });

  it('puts the current format first and never duplicates it', () => {
    const brief = resolveProductionBrief(signals({ contentType: 'talking-head' }));
    const choices = formatChoicesFor(brief);
    expect(choices[0]).toBe('talking-head');
    expect(new Set(choices).size).toBe(choices.length);
  });
});

describe('choice constants', () => {
  it('offers sane duration presets and all supported aspect ratios', () => {
    expect(DURATION_PRESET_SECONDS).toContain(30);
    expect(ASPECT_CHOICES).toContain('9:16');
    expect(ASPECT_CHOICES).toContain('16:9');
    expect(ASPECT_CHOICES).toHaveLength(4);
  });
});
