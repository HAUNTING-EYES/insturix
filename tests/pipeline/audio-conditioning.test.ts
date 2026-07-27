import decode from 'audio-decode';
import { describe, expect, it } from 'vitest';

import {
  conditionAudio,
  fitPcmToExactDuration,
  inspectEncodedSfxAudio,
} from '../../lib/pipeline/audio-conditioning';
import { resolveAudioLoudnessTarget } from '../../lib/editron/constants/audio-standards';

function createWav(durationSeconds: number, options: { silent?: boolean } = {}): Buffer {
  const sampleRate = 48_000;
  const channels = 2;
  const samplesPerChannel = Math.round(durationSeconds * sampleRate);
  const dataBytes = samplesPerChannel * channels * 2;
  const wav = Buffer.allocUnsafe(44 + dataBytes);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channels * 2, 28);
  wav.writeUInt16LE(channels * 2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataBytes, 40);

  for (let frame = 0; frame < samplesPerChannel; frame += 1) {
    const left = options.silent
      ? 0
      : 0.08 * Math.sin((2 * Math.PI * 440 * frame) / sampleRate);
    const right = options.silent
      ? 0
      : 0.07 * Math.sin((2 * Math.PI * 523.25 * frame) / sampleRate);
    wav.writeInt16LE(Math.round(left * 32767), 44 + frame * 4);
    wav.writeInt16LE(Math.round(right * 32767), 46 + frame * 4);
  }
  return wav;
}

describe('audio conditioning', () => {
  it('resolves CKG-backed social, EBU, ATSC, and universal targets', () => {
    expect(resolveAudioLoudnessTarget('tiktok')).toMatchObject({
      integratedLufs: -14,
      truePeakDbtp: -1,
    });
    expect(resolveAudioLoudnessTarget('broadcast-ebu')).toMatchObject({
      integratedLufs: -23,
      truePeakDbtp: -1,
    });
    expect(resolveAudioLoudnessTarget('broadcast-atsc')).toMatchObject({
      integratedLufs: -24,
      truePeakDbtp: -2,
    });
    expect(resolveAudioLoudnessTarget('unspecified')).toMatchObject({
      platform: 'universal',
      integratedLufs: -14,
      truePeakDbtp: -1,
    });
  });

  it('loops with an equal-power seam and returns the exact requested sample count', () => {
    const sampleRate = 1_000;
    const source = new Float32Array(sampleRate);
    source.fill(-0.8, 0, sampleRate / 2);
    source.fill(0.8, sampleRate / 2);

    const fitted = fitPcmToExactDuration(
      { channelData: [source], sampleRate },
      { targetFrames: 250, fps: 100, crossfadeMs: 100 },
    );

    expect(fitted.targetSamplesPerChannel).toBe(2_500);
    expect(fitted.interleaved).toHaveLength(2_500);
    expect(fitted.wasLooped).toBe(true);
    expect(fitted.wasTrimmed).toBe(false);
    expect(fitted.crossfadeSamples).toBe(100);

    let maximumLoopSeamDelta = 0;
    for (let frame = 900; frame < 1_100; frame += 1) {
      maximumLoopSeamDelta = Math.max(
        maximumLoopSeamDelta,
        Math.abs(fitted.interleaved[frame] - fitted.interleaved[frame - 1]),
      );
    }
    expect(maximumLoopSeamDelta).toBeLessThan(0.05);

    expect(() => fitPcmToExactDuration(
      { channelData: [source], sampleRate },
      { targetFrames: 250, fps: 100, crossfadeMs: Number.NaN },
    )).toThrowError(expect.objectContaining({ code: 'INVALID_REQUEST' }));
  });

  it('conditions 47 seconds to an exact 130-second FLAC within the loudness and peak targets', async () => {
    const result = await conditionAudio({
      role: 'music',
      buffer: createWav(47),
      targetFrames: 3_900,
      fps: 30,
      platform: 'youtube',
    });
    const decoded = await decode(result.buffer);

    expect(result.buffer.subarray(0, 4).toString('ascii')).toBe('fLaC');
    expect(decoded.sampleRate).toBe(48_000);
    expect(decoded.channelData[0]).toHaveLength(130 * 48_000);
    expect(result.wasLooped).toBe(true);
    expect(result.wasTrimmed).toBe(false);
    expect(Math.abs(result.measuredOutputLufs - (-14))).toBeLessThanOrEqual(1);
    expect(result.truePeakDbtp).toBeLessThanOrEqual(-0.9);
  }, 60_000);

  it('trims longer audio exactly and rejects silent input before encoding', async () => {
    const trimmed = fitPcmToExactDuration(
      { channelData: [new Float32Array(3_000).fill(0.1)], sampleRate: 1_000 },
      { targetFrames: 200, fps: 100 },
    );
    expect(trimmed.targetSamplesPerChannel).toBe(2_000);
    expect(trimmed.wasTrimmed).toBe(true);
    expect(trimmed.wasLooped).toBe(false);

    await expect(conditionAudio({
      role: 'music',
      buffer: createWav(1, { silent: true }),
      targetFrames: 30,
      fps: 30,
      platform: 'youtube',
    })).rejects.toMatchObject({
      code: 'AUDIO_SILENT',
    });
  }, 30_000);

  it('measures short SFX without mislabeling the sub-400ms R128 gate as integrated LUFS', async () => {
    const inspection = await inspectEncodedSfxAudio(createWav(0.08));

    expect(inspection.durationMs).toBeCloseTo(80, 0);
    expect(inspection.sampleRate).toBe(48_000);
    expect(inspection.channels).toBe(2);
    expect(inspection.loudness).toEqual({
      metric: 'rms-dbfs',
      valueDb: expect.any(Number),
    });
    expect(inspection.loudness.valueDb).toBeGreaterThan(-60);
    expect(Number.isFinite(inspection.truePeakDbtp)).toBe(true);
  }, 30_000);
});
