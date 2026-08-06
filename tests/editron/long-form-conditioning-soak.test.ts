import { describe, expect, it } from 'vitest';

import {
  LONG_FORM_SOAK_MAX_DURATION_MS,
  LONG_FORM_SOAK_MIN_DURATION_MS,
  LONG_FORM_SOAK_TARGET_FRAMES,
  LONG_FORM_SOAK_VERSION,
  createSoakSourceWav,
  readMemoryReading,
  runLongFormConditioningSoak,
} from '@/scripts/long-form-conditioning-soak';
import { parsePcm16Wav } from '@/scripts/sfx-render-canary-core';

describe('long-form conditioning soak (5-minute memory/performance proof)', () => {
  it('creates an exact 8s stereo source for looping', () => {
    const wav = parsePcm16Wav(createSoakSourceWav());

    expect(wav).toMatchObject({ sampleRateHz: 48_000, channelCount: 2 });
    expect(wav.sampleFrameCount).toBe(384_000); // 8s @ 48kHz
    expect(wav.nonZeroSamples).toBeGreaterThan(0);
  });

  it('conditions to exactly 300s with loops, crossfade, loudness, and bounded memory', async () => {
    const result = await runLongFormConditioningSoak();

    expect(result.durationMs).toBeGreaterThanOrEqual(LONG_FORM_SOAK_MIN_DURATION_MS);
    expect(result.durationMs).toBeLessThanOrEqual(LONG_FORM_SOAK_MAX_DURATION_MS);
    expect(result.durationMs).toBe(300_000);
    expect(result.wasLooped).toBe(true);
    expect(result.loopsAdded).toBeGreaterThanOrEqual(37); // 300s / 8s - 1
    expect(result.crossfadeMs).toBeGreaterThan(0);
    expect(result.measuredOutputLufs).toBeCloseTo(-14, 0);
    expect(result.truePeakDbtp).toBeLessThan(0);
    expect(result.truePeakDbtp).toBeGreaterThan(-12);
    expect(result.memory.deltaRssMb).toBeGreaterThan(0);
    expect(result.elapsedMs).toBeGreaterThan(0);
  }, 60_000);

  it('reports a live process memory reading', () => {
    const reading = readMemoryReading();

    expect(reading.rssMb).toBeGreaterThan(0);
    expect(reading.heapUsedMb).toBeGreaterThan(0);
    expect(reading.arrayBuffersMb).toBeGreaterThanOrEqual(0);
  });

  it('declares a timeboxed target contract', () => {
    expect(LONG_FORM_SOAK_VERSION).toBe('editron-long-form-conditioning-soak-v1');
    expect(LONG_FORM_SOAK_TARGET_FRAMES / 30 / 60).toBe(5);
  });
});
