import { describe, expect, it } from 'vitest';
import {
  parseTrendSpec,
  TREND_SPEC_VERSION,
} from '@/lib/thinkforge/schemas/trend-spec';

function trendSpec(overrides: Record<string, unknown> = {}) {
  return {
    trendId: 'trend_pov_drop_reveal',
    version: TREND_SPEC_VERSION,
    alignmentFrame: 'beat-space',
    beatGrid: {
      bpm: 128,
      beatsMs: [0, 469, 938, 1406, 1875, 2344, 2813, 3281],
      dropsMs: [3281],
      totalMs: 7500,
      sections: [
        { id: 's_hook', role: 'hook', start: 0, end: 3281, beats: [0, 1, 2, 3, 4, 5, 6] },
        { id: 's_reveal', role: 'payoff', start: 3281, end: 7500, beats: [7] },
      ],
    },
    invariants: [
      {
        layer: 'decisionStream',
        feature: 'cut_on_drop',
        support: 0.9,
        anchor: { beat: 7, sectionId: 's_reveal' },
      },
    ],
    variables: [
      {
        layer: 'blocking',
        feature: 'subject',
        freedomRange: ['creator', 'product', 'screen'],
      },
    ],
    copyFormula: {
      slots: [
        { id: 'hook', role: 'hook', template: 'POV: you just found {thing}', maxChars: 40 },
        { id: 'cta', role: 'cta', template: '{action} - link in bio', maxChars: 30 },
      ],
      hashtags: ['#fyp', '#{brand}'],
    },
    performanceScript: 'Beat 0-6: build anticipation. Beat 7: reveal and react.',
    audio: {
      trackIdentity: 'Track X - Artist Y',
      soundClass: 'catalog-track',
      playOffsetMs: 12000,
    },
    ...overrides,
  };
}

describe('TrendSpec v1 read contract', () => {
  it('accepts the signed TF-read fields and keeps the derived duration source explicit', () => {
    const parsed = parseTrendSpec(trendSpec());

    expect(parsed.version).toBe(TREND_SPEC_VERSION);
    expect(parsed.beatGrid.totalMs).toBe(7500);
    expect(parsed.copyFormula.slots.map((slot) => slot.id)).toEqual(['hook', 'cta']);
    expect(parsed.invariants[0]?.anchor?.sectionId).toBe('s_reveal');
  });

  it('validates producer-only fields loosely because ThinkForge never depends on them', () => {
    const parsed = parseTrendSpec(
      trendSpec({
        exemplarRefs: ['ex_1', 42, null],
        audio: {
          soundClass: 'future-provider-value',
          rightsHint: { nested: true },
        },
        rankScore: 'not-a-number',
        fetchedAt: 12345,
      }),
    );

    expect(parsed.exemplarRefs).toEqual(['ex_1']);
    expect(parsed.audio?.soundClass).toBeUndefined();
    expect(parsed.audio?.rightsHint).toEqual({ nested: true });
    expect(parsed.rankScore).toBeUndefined();
    expect(parsed.fetchedAt).toBeUndefined();
  });

  it('rejects invalid TF-read section ranges', () => {
    expect(() =>
      parseTrendSpec(
        trendSpec({
          beatGrid: {
            ...trendSpec().beatGrid,
            sections: [{ id: 'bad', role: 'hook', start: 3000, end: 1000 }],
          },
        }),
      ),
    ).toThrow(/section.end/);
  });

  it('rejects invariants anchored to unknown sections', () => {
    expect(() =>
      parseTrendSpec(
        trendSpec({
          invariants: [
            {
              layer: 'decisionStream',
              feature: 'cut_on_drop',
              support: 0.9,
              anchor: { sectionId: 'missing_section' },
            },
          ],
        }),
      ),
    ).toThrow(/anchor.sectionId/);
  });

  it('rejects unsupported TrendSpec versions', () => {
    expect(() => parseTrendSpec(trendSpec({ version: 2 }))).toThrow();
  });
});
