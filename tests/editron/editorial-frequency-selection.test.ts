import { describe, expect, it } from 'vitest';

import {
  resolveEditorialFrequencySelection,
  type EditorialFrequencyCandidate,
} from '@/lib/editron/services/editorial-frequency-selection';

function candidate(
  overrides: Partial<EditorialFrequencyCandidate> & Pick<EditorialFrequencyCandidate, 'candidateKey' | 'opportunityKey'>,
): EditorialFrequencyCandidate {
  return {
    family: 'zoom',
    score: 0.8,
    frame: 0,
    requestedFrequency: 0.5,
    ...overrides,
  };
}

describe('editorial frequency selection', () => {
  it('ranks unique opportunities so duplicate producers cannot inflate density', () => {
    const result = resolveEditorialFrequencySelection([
      candidate({ candidateKey: 'brief-a', opportunityKey: 'moment-a', score: 0.9, frame: 30, requestedFrequency: 0.25 }),
      candidate({ candidateKey: 'signal-a', opportunityKey: 'moment-a', score: 0.84, frame: 34, requestedFrequency: 0.25 }),
      candidate({ candidateKey: 'signal-b', opportunityKey: 'moment-b', score: 0.8, frame: 180, requestedFrequency: 0.25 }),
      candidate({ candidateKey: 'signal-c', opportunityKey: 'moment-c', score: 0.7, frame: 330, requestedFrequency: 0.25 }),
      candidate({ candidateKey: 'signal-d', opportunityKey: 'moment-d', score: 0.6, frame: 480, requestedFrequency: 0.25 }),
    ]);

    expect(result.report.groups).toEqual([expect.objectContaining({
      family: 'zoom',
      candidateCount: 5,
      opportunityCount: 4,
      selectedOpportunityCount: 1,
    })]);
    expect(result.selections.filter((selection) => selection.selected).map((selection) => selection.candidateKey))
      .toEqual(['brief-a', 'signal-a']);
    expect(result.selections.find((selection) => selection.candidateKey === 'signal-a'))
      .toEqual(expect.objectContaining({
        opportunityKey: 'moment-a',
        familyRank: 1,
        opportunityCount: 4,
        score: 0.9,
      }));
  });

  it('is monotonic: higher requested frequency selects a superset of the same opportunities', () => {
    const base = [
      candidate({ candidateKey: 'a', opportunityKey: 'a', score: 0.9, frame: 30 }),
      candidate({ candidateKey: 'b', opportunityKey: 'b', score: 0.8, frame: 180 }),
      candidate({ candidateKey: 'c', opportunityKey: 'c', score: 0.7, frame: 330 }),
      candidate({ candidateKey: 'd', opportunityKey: 'd', score: 0.6, frame: 480 }),
    ];
    const low = resolveEditorialFrequencySelection(base.map((entry) => ({ ...entry, requestedFrequency: 0.25 })));
    const high = resolveEditorialFrequencySelection(base.map((entry) => ({ ...entry, requestedFrequency: 0.75 })));
    const selectedLow = new Set(low.selections.filter((selection) => selection.selected).map((selection) => selection.opportunityKey));
    const selectedHigh = new Set(high.selections.filter((selection) => selection.selected).map((selection) => selection.opportunityKey));

    expect(selectedLow.size).toBeLessThan(selectedHigh.size);
    expect([...selectedLow].every((key) => selectedHigh.has(key))).toBe(true);
  });

  it('preserves one valid opportunity at frequency zero because off is the hard veto', () => {
    const result = resolveEditorialFrequencySelection([
      candidate({ candidateKey: 'only', opportunityKey: 'only', requestedFrequency: 0 }),
    ]);

    expect(result.selections[0]).toEqual(expect.objectContaining({
      selected: true,
      qualityPercentile: 1,
      requiredPercentile: 1,
      calibrationStatus: 'invented-needs-calibration',
    }));
  });

  it('fails loudly when one family receives conflicting policy values', () => {
    expect(() => resolveEditorialFrequencySelection([
      candidate({ candidateKey: 'a', opportunityKey: 'a', requestedFrequency: 0.25 }),
      candidate({ candidateKey: 'b', opportunityKey: 'b', requestedFrequency: 0.75 }),
    ])).toThrow('Conflicting editorial frequency values for family: zoom');
  });

  it('breaks score ties deterministically and bounds telemetry without changing behavior', () => {
    const result = resolveEditorialFrequencySelection([
      candidate({ candidateKey: 'later', opportunityKey: 'later', score: 0.8, frame: 60, requestedFrequency: 1 }),
      candidate({ candidateKey: 'earlier', opportunityKey: 'earlier', score: 0.8, frame: 30, requestedFrequency: 1 }),
      candidate({ candidateKey: 'same-frame-z', opportunityKey: 'z', score: 0.8, frame: 60, requestedFrequency: 1 }),
    ], 1);

    expect(result.selections.map((selection) => selection.opportunityKey)).toEqual(['earlier', 'later', 'z']);
    expect(result.selections.every((selection) => selection.selected)).toBe(true);
    expect(result.report).toEqual(expect.objectContaining({
      sampleLimit: 1,
      sampleCount: 1,
      samplesTruncated: true,
    }));
  });
});
