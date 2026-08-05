import { describe, expect, it } from 'vitest';

import {
  measureSilence,
  SILENCE_MEASUREMENT_VERSION,
} from '@/lib/editron/reference-video/measure-silence';

function sine(sampleRate: number, seconds: number, freq: number, amp = 0.5): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * seconds));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return samples;
}

describe('R2 silence measurement', () => {
  const sr = 16_000;

  it('returns a v1 empty measurement for empty input', () => {
    const result = measureSilence(new Float32Array(0), sr);
    expect(result.version).toBe(SILENCE_MEASUREMENT_VERSION);
    expect(result.windows).toEqual([]);
    expect(result.silentRatio).toBe(0);
  });

  it('detects a loud + quiet + loud structure as silent in the middle', () => {
    const loud1 = sine(sr, 1.0, 440, 0.6);
    const quiet = sine(sr, 1.0, 440, 0.02); // well below the 20th percentile floor
    const loud2 = sine(sr, 1.0, 440, 0.6);
    const samples = new Float32Array(loud1.length + quiet.length + loud2.length);
    samples.set(loud1, 0);
    samples.set(quiet, loud1.length);
    samples.set(loud2, loud1.length + quiet.length);

    const result = measureSilence(samples, sr);
    expect(result.windows.length).toBe(1);
    const window = result.windows[0];
    // Silent gap sits between the two loud regions.
    expect(window.startMs).toBeGreaterThan(400);
    expect(window.endMs).toBeLessThanOrEqual(2000);
    expect(window.durationMs).toBeGreaterThan(600);
    expect(result.silentRatio).toBeGreaterThan(0.2);
    expect(result.silentRatio).toBeLessThan(0.5);
  });

  it('reports no silence in a fully-loud tone', () => {
    const samples = sine(sr, 2.0, 330, 0.6);
    const result = measureSilence(samples, sr);
    expect(result.windows).toEqual([]);
    expect(result.silentRatio).toBe(0);
  });

  it('honours an explicit minimum silence duration', () => {
    const quiet = sine(sr, 0.2, 200, 0.01); // 200ms quiet — under a 500ms minimum
    const loud = sine(sr, 2.0, 300, 0.6);
    const samples = new Float32Array(quiet.length * 2 + loud.length);
    samples.set(quiet, 0);
    samples.set(loud, quiet.length);
    samples.set(quiet, quiet.length + loud.length);

    const strict = measureSilence(samples, sr, { minSilenceMs: 500 });
    expect(strict.windows.length).toBe(0); // 200ms runs below the floor

    const lenient = measureSilence(samples, sr, { minSilenceMs: 150 });
    expect(lenient.windows.length).toBeGreaterThan(0);
  });
});
