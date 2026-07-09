import { describe, expect, it } from 'vitest';
import { fitLineToShotBudget, measureWavDurationSec } from '../../lib/avatar/avatar-audio-fit';
import { assertRelipEligible, relipWithKling, type RelipInput } from '../../lib/avatar/avatar-relip';

function makeWav(durationSec: number, sampleRate = 24000, channels = 1, bits = 16): Buffer {
  const bytesPerSec = sampleRate * channels * (bits / 8);
  const dataSize = Math.round(bytesPerSec * durationSec);
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(bytesPerSec, 28);
  buf.writeUInt16LE(channels * (bits / 8), 32);
  buf.writeUInt16LE(bits, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

describe('fitLineToShotBudget (audio-first law)', () => {
  it('accepts a VO that fits the shot budget as-is', () => {
    const d = fitLineToShotBudget(7);
    expect(d.action).toBe('ok');
    expect(d.finalSec).toBe(7);
  });

  it('speeds up (atempo) a small ≤4% overshoot', () => {
    const d = fitLineToShotBudget(10.3);
    expect(d.action).toBe('atempo');
    expect(d.finalSec).toBe(10);
    expect(d.atempoFactor).toBeGreaterThan(1);
    expect(d.atempoFactor).toBeLessThanOrEqual(1.04);
  });

  it('flags a 4–8% overshoot as a soft rewrite (atempo cannot cover it)', () => {
    const d = fitLineToShotBudget(10.6);
    expect(d.action).toBe('rewrite');
    expect(d.severity).toBe('soft');
  });

  it('flags a >8% overshoot as a hard rewrite', () => {
    const d = fitLineToShotBudget(11);
    expect(d.action).toBe('rewrite');
    expect(d.severity).toBe('hard');
  });
});

describe('measureWavDurationSec (measure, never estimate)', () => {
  it('measures the real duration from WAV bytes', () => {
    expect(measureWavDurationSec(makeWav(2))).toBe(2);
    expect(measureWavDurationSec(makeWav(3.5, 44100, 2, 16))).toBe(3.5);
  });

  it('returns null for non-WAV bytes (never guesses)', () => {
    expect(measureWavDurationSec(Buffer.from('this is definitely not a wav file at all!!'))).toBeNull();
  });
});

describe('assertRelipEligible (refuse before spend)', () => {
  const ok: RelipInput = { videoUrl: 'v', audioUrl: 'a', videoDurationSec: 8, audioDurationSec: 8.1 };

  it('passes an aligned ≤10s shot', () => {
    expect(() => assertRelipEligible(ok)).not.toThrow();
  });

  it('refuses input video over the 10s cap', () => {
    expect(() => assertRelipEligible({ ...ok, videoDurationSec: 12, audioDurationSec: 12 })).toThrow(/hard cap/);
  });

  it('refuses an audio/video duration mismatch (Kling drifts)', () => {
    expect(() => assertRelipEligible({ ...ok, videoDurationSec: 8, audioDurationSec: 9 })).toThrow(/drifts on mismatch/);
  });
});

describe('relipWithKling', () => {
  it('relips an eligible shot via the injected fal client', async () => {
    let submitted: Record<string, unknown> | undefined;
    const result = await relipWithKling(
      { videoUrl: 'https://cdn/body.mp4', audioUrl: 'https://cdn/voice.wav', videoDurationSec: 8, audioDurationSec: 8 },
      {
        submit: async (_model, input) => {
          submitted = input;
          return { requestId: 'r1' };
        },
        poll: async () => ({ done: true, videoUrl: 'https://cdn/relipped.mp4' }),
      },
    );
    expect(result.videoUrl).toBe('https://cdn/relipped.mp4');
    expect(submitted).toEqual({ video_url: 'https://cdn/body.mp4', audio_url: 'https://cdn/voice.wav' });
  });

  it('refuses to spend on an ineligible shot (submit never called)', async () => {
    let called = false;
    await expect(
      relipWithKling(
        { videoUrl: 'v', audioUrl: 'a', videoDurationSec: 15, audioDurationSec: 15 },
        { submit: async () => { called = true; return { requestId: 'x' }; }, poll: async () => ({ done: true, videoUrl: 'x' }) },
      ),
    ).rejects.toThrow(/hard cap/);
    expect(called).toBe(false);
  });

  it('fails loud when the relip provider reports failure', async () => {
    await expect(
      relipWithKling(
        { videoUrl: 'v', audioUrl: 'a', videoDurationSec: 8, audioDurationSec: 8 },
        { submit: async () => ({ requestId: 'r1' }), poll: async () => ({ done: false, failed: true, error: 'boom' }) },
      ),
    ).rejects.toThrow(/Kling LipSync failed/);
  });
});
