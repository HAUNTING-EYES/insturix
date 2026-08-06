import { describe, expect, it } from 'vitest';

import {
  deriveReferenceSections,
  DERIVED_SECTION_CONFIDENCE,
  DERIVED_SECTIONIZER_VERSION,
} from '@/lib/editron/reference-video/derive-reference-sections';

describe('R2/R5 derived reference sectionizer', () => {
  it('produces intro + body + outro for a plain clip with silence breaks', () => {
    const sections = deriveReferenceSections({
      durationMs: 100_000,
      beats: [],
      dropsMs: [],
      silenceWindows: [
        { startMs: 30_000, endMs: 31_000 },
        { startMs: 60_000, endMs: 61_000 },
      ],
    });
    const labels = sections.map((s) => s.label);
    expect(labels[0]).toBe('intro');
    expect(labels).toContain('body');
    expect(labels[labels.length - 1]).toBe('outro');
    // All boundaries inside the clip + ordered.
    for (const s of sections) {
      expect(s.startMs).toBeGreaterThanOrEqual(0);
      expect(s.endMs).toBeLessThanOrEqual(100_000);
      expect(s.endMs).toBeGreaterThan(s.startMs);
    }
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i].startMs).toBeGreaterThanOrEqual(sections[i - 1].endMs - 1);
    }
  });

  it('anchors a drop region + build before it', () => {
    const sections = deriveReferenceSections({
      durationMs: 100_000,
      beats: [],
      dropsMs: [50_000],
      silenceWindows: [],
    });
    const drop = sections.find((s) => s.label === 'drop');
    const build = sections.find((s) => s.label === 'build');
    expect(drop?.startMs).toBeLessThanOrEqual(50_000);
    expect(drop?.endMs).toBeGreaterThanOrEqual(50_000);
    expect(build?.endMs).toBeLessThanOrEqual(drop?.startMs ?? 0);
  });

  it('is deterministic and returns [] for a too-short clip', () => {
    expect(deriveReferenceSections({ durationMs: 500, beats: [], dropsMs: [], silenceWindows: [] })).toEqual([]);
    const a = deriveReferenceSections({ durationMs: 100_000, beats: [], dropsMs: [20_000], silenceWindows: [] });
    const b = deriveReferenceSections({ durationMs: 100_000, beats: [], dropsMs: [20_000], silenceWindows: [] });
    expect(a).toEqual(b);
  });

  it('carries the derived confidence + version contract', () => {
    const sections = deriveReferenceSections({ durationMs: 100_000, beats: [], dropsMs: [], silenceWindows: [] });
    expect(DERIVED_SECTION_CONFIDENCE).toBe(0.6);
    expect(DERIVED_SECTIONIZER_VERSION).toMatch(/editron-r2-derived-sectionizer-v1/);
    expect(sections.every((s) => s.confidence === 0.6)).toBe(true);
  });
});
