import { describe, expect, it } from 'vitest';
import { deriveVoiceWindows } from '@/lib/editron/reference-video/edit-fingerprint-voice-windows';
import { DEFAULTS } from '@/lib/editron/services/media/types';
import type { TranscriptionWord } from '@/lib/editron/services/media/types';
import type { MusicSection } from '@/lib/editron/services/music-analysis-service';

const GAP = DEFAULTS.SILENCE_THRESHOLD_MS;

function w(startMs: number, endMs: number): TranscriptionWord {
  return { word: 'x', startMs, endMs, confidence: 0.9 };
}

function sections(...s: Array<[number, number, string]>): { sections: MusicSection[] } {
  return { sections: s.map(([startMs, endMs, label]) => ({ startMs, endMs, label })) };
}

const NO_SECTIONS = { sections: [] as MusicSection[] };

describe('deriveVoiceWindows', () => {
  it('merges words separated by less than the silence gap into one span', () => {
    const windows = deriveVoiceWindows([w(0, 500), w(500 + (GAP - 1), 500 + (GAP - 1) + 300)], NO_SECTIONS);
    expect(windows).toEqual([{ startMs: 0, endMs: 500 + (GAP - 1) + 300, hadVocals: true }]);
  });

  it('splits into two spans on a gap at or beyond the silence threshold', () => {
    const windows = deriveVoiceWindows([w(0, 500), w(500 + GAP, 500 + GAP + 300)], NO_SECTIONS);
    expect(windows).toEqual([
      { startMs: 0, endMs: 500, hadVocals: true },
      { startMs: 500 + GAP, endMs: 500 + GAP + 300, hadVocals: true },
    ]);
  });

  it('sorts out-of-order words before merging', () => {
    const windows = deriveVoiceWindows([w(3000 + GAP, 3400 + GAP), w(0, 500), w(600, 1000)], NO_SECTIONS);
    expect(windows).toEqual([
      { startMs: 0, endMs: 1000, hadVocals: true },
      { startMs: 3000 + GAP, endMs: 3400 + GAP, hadVocals: true },
    ]);
  });

  it('drops a vocal span fully inside a chorus peak', () => {
    const windows = deriveVoiceWindows([w(1000, 2000)], sections([0, 4000, 'chorus']));
    expect(windows).toEqual([]);
  });

  it('splits a vocal span straddling a drop peak into before + after', () => {
    const windows = deriveVoiceWindows([w(0, 10000)], sections([4000, 6000, 'drop']));
    expect(windows).toEqual([
      { startMs: 0, endMs: 4000, hadVocals: true },
      { startMs: 6000, endMs: 10000, hadVocals: true },
    ]);
  });

  it('ignores non-peak sections (verse/intro) and is case-insensitive on peak labels', () => {
    const windows = deriveVoiceWindows(
      [w(0, 10000)],
      sections([0, 3000, 'verse'], [4000, 6000, 'Chorus'], [6000, 9000, 'intro']),
    );
    expect(windows).toEqual([
      { startMs: 0, endMs: 4000, hadVocals: true },
      { startMs: 6000, endMs: 10000, hadVocals: true },
    ]);
  });

  it('returns [] when there are no vocals (low-energy source is Demucs-gated)', () => {
    expect(deriveVoiceWindows([], sections([0, 4000, 'verse']))).toEqual([]);
  });
});
