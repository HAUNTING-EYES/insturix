import { describe, expect, it } from 'vitest';

import { computeGenreParameters } from '../../lib/editron/services/genre-parameter-computer';
import { buildSignalTimeline } from '../../lib/editron/services/signal-registry';

function makeWords(count: number, startMs: number, endMs: number) {
  const step = (endMs - startMs) / count;
  return Array.from({ length: count }, (_, index) => ({
    text: index % 13 === 0 ? 'like' : `word${index}`,
    startMs: Math.round(startMs + index * step),
    endMs: Math.round(startMs + index * step + step * 0.7),
    confidence: 0.95,
  }));
}

function makeRawFootage(durationMs: number, wordCount: number, speechEndMs: number, fillerCount = 0) {
  const words = makeWords(wordCount, 0, speechEndMs);
  return {
    originalDurationMs: durationMs,
    transcription: {
      fullText: words.map((word) => word.text).join(' '),
      words,
      segments: [{ startMs: 0, endMs: speechEndMs, text: 'speech segment' }],
    },
    fillerWords: Array.from({ length: fillerCount }, (_, index) => ({
      text: 'like',
      startMs: index * 1000,
      endMs: index * 1000 + 200,
      hasSurroundingSilence: false,
    })),
    cutPlan: { removedRanges: [] },
  };
}

function musicSections(count: number) {
  const labels = ['intro', 'verse', 'chorus', 'bridge', 'outro'];
  return Array.from({ length: count }, (_, index) => ({
    type: labels[index % labels.length],
    startMs: index * 4000,
    endMs: index * 4000 + 3500,
  }));
}

describe('computeGenreParameters BGM source-music detection', () => {
  it('derives lower formality from energetic prosody even when transcript fillers are stripped', () => {
    const energetic = computeGenreParameters({
      rawFootage: makeRawFootage(90_000, 260, 80_000, 0) as any,
      analyses: [
        {
          audio: { energyCurve: [{ timestampMs: 0, energy: 0.75 }] },
          subjectTracks: [{ subjectId: 'person-1', category: 'person', totalScreenTimeMs: 80_000 }],
        } as any,
      ],
      wav2vecAnalysis: {
        segments: [
          { energy: 0.82, emotionIntensity: 0.76, pitchVariability: 0.88, stressDetected: true, fillerConfidence: 0 },
          { energy: 0.78, emotionIntensity: 0.72, pitchVariability: 0.8, stressDetected: true, fillerConfidence: 0 },
        ],
      },
      videoDurationSec: 90,
    });

    expect(energetic.genreParams.formality).toBeLessThan(0.45);
    expect(energetic.computedFrom).toContain('wav2vec_prosody');
  });

  it('derives higher formality from calm prosody without relying on low filler count', () => {
    const calm = computeGenreParameters({
      rawFootage: makeRawFootage(90_000, 135, 80_000, 0) as any,
      analyses: [
        {
          audio: { energyCurve: [{ timestampMs: 0, energy: 0.22 }] },
          subjectTracks: [{ subjectId: 'person-1', category: 'person', totalScreenTimeMs: 80_000 }],
        } as any,
      ],
      wav2vecAnalysis: {
        segments: [
          { energy: 0.22, emotionIntensity: 0.16, pitchVariability: 0.12, stressDetected: false, fillerConfidence: 0 },
          { energy: 0.24, emotionIntensity: 0.18, pitchVariability: 0.1, stressDetected: false, fillerConfidence: 0 },
        ],
      },
      videoDurationSec: 90,
    });

    expect(calm.genreParams.formality).toBeGreaterThan(0.62);
    expect(calm.computedFrom).toContain('wav2vec_prosody');
  });

  it('uses the same prosody source for signal timeline formality aliases', () => {
    const rawFootage = makeRawFootage(90_000, 260, 80_000, 0) as any;
    const timeline = buildSignalTimeline(
      [
        {
          audio: { energyCurve: [{ timestampMs: 0, energy: 0.75 }] },
          subjectTracks: [{ subjectId: 'person-1', category: 'person', totalScreenTimeMs: 80_000 }],
        } as any,
      ],
      rawFootage,
      [],
      30,
      null,
      {
        segments: [
          { startMs: 0, endMs: 40_000, energy: 0.82, emotionIntensity: 0.76, emotionalValence: 'positive', pitchVariability: 0.88, stressDetected: true, fillerConfidence: 0 },
          { startMs: 40_000, endMs: 80_000, energy: 0.78, emotionIntensity: 0.72, emotionalValence: 'positive', pitchVariability: 0.8, stressDetected: true, fillerConfidence: 0 },
        ],
        modelVersion: 'test',
        processingTimeMs: 0,
      },
    );

    expect(timeline.globalSignals['content.formality_source']).toBe('wav2vec_prosody');
    expect(timeline.globalSignals['content.formality']).toBeLessThan(0.45);
    expect(timeline.globalSignals.formality).toBe(timeline.globalSignals['content.formality']);
  });
  it('does not treat speech-derived BPM as source music in speech-heavy footage', () => {
    const params = computeGenreParameters({
      rawFootage: makeRawFootage(100_000, 320, 90_000, 25) as any,
      analyses: [
        {
          audio: { energyCurve: [{ timestampMs: 0, energy: 0.55 }] },
          musicStructure: {
            bpm: 129,
            sections: musicSections(20),
            energyCurve: [{ timestampMs: 0, energy: 0.8 }],
            drops: [],
            builds: [],
          },
          subjectTracks: [],
        } as any,
      ],
      videoDurationSec: 100,
    });

    expect(params.bgmRecommendation.shouldAddBgm).toBe(true);
    expect(params.bgmRecommendation.reason).toContain('no source music detected');
    expect(params.bgmRecommendation.reason).toContain('sourceMusicConfidence');
  });

  it('suppresses added BGM when low-speech footage has clear music structure', () => {
    const params = computeGenreParameters({
      rawFootage: makeRawFootage(120_000, 10, 5_000) as any,
      analyses: [
        {
          audio: { energyCurve: [{ timestampMs: 0, energy: 0.4 }] },
          musicStructure: {
            bpm: 128,
            sections: musicSections(8),
            energyCurve: [{ timestampMs: 0, energy: 0.82 }],
            drops: [36_000],
            builds: [24_000],
          },
          subjectTracks: [],
        } as any,
      ],
      videoDurationSec: 120,
    });

    expect(params.bgmRecommendation.shouldAddBgm).toBe(false);
    expect(params.bgmRecommendation.reason).toContain('Music already present');
    expect(params.bgmRecommendation.reason).toContain('explicitEvents=2');
  });

  it('suppresses added BGM in speech-heavy footage only when explicit music events are strong', () => {
    const params = computeGenreParameters({
      rawFootage: makeRawFootage(100_000, 320, 90_000, 25) as any,
      analyses: [
        {
          audio: { energyCurve: [{ timestampMs: 0, energy: 0.55 }] },
          musicStructure: {
            bpm: 129,
            sections: musicSections(20),
            energyCurve: [{ timestampMs: 0, energy: 0.8 }],
            drops: [30_000, 70_000],
            builds: [20_000, 60_000],
          },
          subjectTracks: [],
        } as any,
      ],
      videoDurationSec: 100,
    });

    expect(params.bgmRecommendation.shouldAddBgm).toBe(false);
    expect(params.bgmRecommendation.reason).toContain('explicitEvents=4');
  });

  it('uses project-level Essentia music analysis when asset musicStructure is absent', () => {
    const params = computeGenreParameters({
      rawFootage: makeRawFootage(100_000, 320, 90_000, 25) as any,
      analyses: [
        {
          audio: { energyCurve: [{ timestampMs: 0, energy: 0.55 }] },
          subjectTracks: [],
        } as any,
      ],
      musicAnalysis: {
        bpm: 129,
        beats: Array.from({ length: 64 }, (_, index) => ({
          timestampMs: index * 500,
          strength: 0.75,
        })),
        sections: [
          { label: 'intro', startMs: 0, endMs: 10_000 },
          { label: 'verse', startMs: 10_000, endMs: 40_000 },
          { label: 'chorus', startMs: 40_000, endMs: 70_000 },
          { label: 'outro', startMs: 70_000, endMs: 100_000 },
        ],
        energyCurve: [0.78, 0.82, 0.8],
        musicPresence: 0.9,
      },
      videoDurationSec: 100,
    });

    expect(params.bgmRecommendation.reason).not.toContain('no music-structure analysis');
    expect(params.bgmRecommendation.reason).toContain('sourceMusicConfidence');
    expect(params.bgmRecommendation.reason).toContain('sections=4');
    expect(params.bgmRecommendation.shouldAddBgm).toBe(true);
  });
});
