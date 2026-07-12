import { describe, expect, it } from 'vitest';

import { analyzeBeatsFull } from '@/lib/editron/services/media/beat-detection-service';

const EMPTY_ANALYSIS = {
  beats: [],
  bpm: 0,
  bpmConfidence: 0,
  durationMs: 0,
  timeSignatureNumerator: 4,
  energyPeaks: [],
  rawOnsets: [],
};

describe('beat detection invalid-buffer resilience', () => {
  it('returns typed empty evidence when a URL is passed instead of a decoded AudioBuffer', async () => {
    await expect(analyzeBeatsFull('https://cdn.test/silent.mp4' as never)).resolves.toEqual(EMPTY_ANALYSIS);
  });

  it('returns empty evidence with known duration when getChannelData throws', async () => {
    const result = await analyzeBeatsFull({
      sampleRate: 48_000,
      length: 96_000,
      numberOfChannels: 1,
      duration: 2,
      getChannelData: () => { throw new Error('decoder failed'); },
    });
    expect(result).toEqual({ ...EMPTY_ANALYSIS, durationMs: 2_000 });
  });

  it('returns empty evidence when channel data is malformed', async () => {
    const result = await analyzeBeatsFull({
      sampleRate: 48_000,
      length: 96_000,
      numberOfChannels: 2,
      duration: 2,
      getChannelData: (() => ({ length: 96_000 })) as never,
    });
    expect(result).toEqual({ ...EMPTY_ANALYSIS, durationMs: 2_000 });
  });

  it('still analyzes a valid silent PCM buffer without fabricating energy', async () => {
    const samples = new Float32Array(4_096);
    const result = await analyzeBeatsFull({
      sampleRate: 4_096,
      length: samples.length,
      numberOfChannels: 1,
      duration: 1,
      getChannelData: () => samples,
    });
    expect(result.durationMs).toBe(1_000);
    expect(result.rawOnsets).toEqual([]);
    expect(result.energyPeaks).toEqual([]);
  });
});
