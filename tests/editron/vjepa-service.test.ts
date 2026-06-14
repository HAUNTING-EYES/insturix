import { describe, expect, it } from 'vitest';

import { buildVjepaCoverageSegments } from '../../lib/editron/services/vjepa-service';

describe('V-JEPA service segment coverage', () => {
  it('builds continuous visual coverage segments from duration instead of speech gaps', () => {
    const segments = buildVjepaCoverageSegments(12_000, [
      { startMs: 0, endMs: 2_000 },
      { startMs: 10_000, endMs: 12_000 },
    ], { segmentDurationMs: 5_000 });

    expect(segments).toEqual([
      { startMs: 0, endMs: 5_000 },
      { startMs: 5_000, endMs: 10_000 },
      { startMs: 10_000, endMs: 12_000 },
    ]);
  });

  it('bounds segment count for long videos while preserving full coverage', () => {
    const segments = buildVjepaCoverageSegments(20_000, [], {
      segmentDurationMs: 3_000,
      maxSegments: 4,
    });

    expect(segments).toEqual([
      { startMs: 0, endMs: 5_000 },
      { startMs: 5_000, endMs: 10_000 },
      { startMs: 10_000, endMs: 15_000 },
      { startMs: 15_000, endMs: 20_000 },
    ]);
  });

  it('uses fallback segment end time to recover visual coverage when explicit duration is missing', () => {
    const fallback = [{ startMs: 1_000, endMs: 2_000 }];

    expect(buildVjepaCoverageSegments(undefined, fallback)).toEqual([
      { startMs: 0, endMs: 2_000 },
    ]);
  });

  it('returns the original empty fallback when no duration evidence exists', () => {
    expect(buildVjepaCoverageSegments(undefined, [])).toEqual([]);
  });
});
