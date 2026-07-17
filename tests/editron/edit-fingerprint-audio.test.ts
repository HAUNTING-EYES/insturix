import { describe, expect, it } from 'vitest';
import { audioLayerFromMusicAnalysis } from '@/lib/editron/reference-video/edit-fingerprint-audio';
import { getThreshold } from '@/lib/editron/data/threshold-registry';
import type { MusicAnalysisResult } from '@/lib/editron/services/music-analysis-service';

// Read the real CRG-sourced threshold so the boundary test can't drift from the registry.
const MUSIC_PRESENCE = getThreshold('music-presence-threshold')!.value;

function music(overrides: Partial<MusicAnalysisResult> = {}): MusicAnalysisResult {
  return {
    bpm: 120,
    beats: [
      { timestampMs: 0, strength: 1 },
      { timestampMs: 500, strength: 0.8 },
    ],
    sections: [
      { startMs: 0, endMs: 4000, label: 'intro' },
      { startMs: 4000, endMs: 8000, label: 'drop' },
      { startMs: 8000, endMs: 12000, label: 'verse' },
    ],
    musicPresence: 0.9,
    energyCurve: [0.1, 0.5, 0.9],
    durationMs: 12000,
    processingTimeMs: 100,
    ...overrides,
  };
}

describe('audioLayerFromMusicAnalysis', () => {
  it('maps the Essentia fields structurally (beats/sections reused verbatim)', () => {
    const m = music();
    const layer = audioLayerFromMusicAnalysis(m);
    expect(layer.bpm).toBe(120);
    expect(layer.beats).toBe(m.beats);
    expect(layer.sections).toBe(m.sections);
    expect(layer.energyCurve).toBe(m.energyCurve);
    expect(layer.durationMs).toBe(12000);
  });

  it('extracts dropsMs from the starts of drop-labelled sections only', () => {
    expect(audioLayerFromMusicAnalysis(music()).dropsMs).toEqual([4000]);
  });

  it('matches drop labels exactly (case-insensitive), rejecting non-drop lookalikes', () => {
    const layer = audioLayerFromMusicAnalysis(
      music({
        sections: [
          { startMs: 0, endMs: 1000, label: 'DROP' }, //   → drop
          { startMs: 1000, endMs: 2000, label: ' drop ' }, // → drop (trimmed)
          { startMs: 2000, endMs: 3000, label: 'raindrop' }, // NOT a drop
          { startMs: 3000, endMs: 4000, label: 'breakdown' }, // NOT a drop
          { startMs: 4000, endMs: 5000, label: 'build' }, //   NOT a drop
        ],
      }),
    );
    expect(layer.dropsMs).toEqual([0, 1000]);
  });

  it('sets audioAnchored via the CRG music-presence threshold (inclusive boundary)', () => {
    expect(audioLayerFromMusicAnalysis(music({ musicPresence: MUSIC_PRESENCE })).audioAnchored).toBe(true);
    expect(audioLayerFromMusicAnalysis(music({ musicPresence: MUSIC_PRESENCE - 0.01 })).audioAnchored).toBe(false);
    expect(audioLayerFromMusicAnalysis(music({ musicPresence: 0.95 })).audioAnchored).toBe(true);
    expect(audioLayerFromMusicAnalysis(music({ musicPresence: 0 })).audioAnchored).toBe(false);
  });

  it('leaves perception-derived fields blank instead of faking them', () => {
    const layer = audioLayerFromMusicAnalysis(music());
    expect(layer.soundClass).toBe('unknown');
    expect(layer.voiceWindows).toEqual([]);
    expect(layer.recognition).toBeUndefined();
    expect(layer.stemRefs).toBeUndefined();
  });

  it('handles empty sections/beats', () => {
    const layer = audioLayerFromMusicAnalysis(music({ sections: [], beats: [] }));
    expect(layer.dropsMs).toEqual([]);
    expect(layer.sections).toEqual([]);
    expect(layer.beats).toEqual([]);
  });
});
