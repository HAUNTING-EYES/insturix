import { describe, expect, it } from 'vitest';

import { buildLambdaRenderInputProps } from '@/lib/editron/shared/render-request-payload';
import {
  LONG_FORM_RENDER_CANARY_DURATION_FRAMES,
  LONG_FORM_RENDER_CANARY_FPS,
  LONG_FORM_RENDER_CANARY_VERSION,
  LONG_FORM_RENDER_CANARY_VO_DURATION,
  LONG_FORM_RENDER_CANARY_VO_FROM,
  buildLongFormRenderOverlays,
  createLongFormDuckMarkerWav,
  encodePcm16Wav,
  validateLongFormRender,
} from '@/scripts/long-form-render-canary-core';
import { measurePcmFrameWindow, parsePcm16Wav } from '@/scripts/sfx-render-canary-core';

describe('zero-credit long-form (5-minute) render canary', () => {
  it('builds overlays with music spanning the full 300s timeline and a mid duck marker', () => {
    const overlays = buildLongFormRenderOverlays(
      'data:audio/flac;base64,AAAA',
      'data:audio/wav;base64,AAAA',
    );
    const assembled = buildLambdaRenderInputProps({ overlays });

    expect(overlays).toHaveLength(2);
    expect(assembled.overlays).toHaveLength(2);
    expect('audioRightsNotices' in assembled).toBe(false);
    expect(overlays[0]).toMatchObject({
      from: 0,
      durationInFrames: LONG_FORM_RENDER_CANARY_DURATION_FRAMES,
      row: 1,
    });
    expect(overlays[1]).toMatchObject({
      from: LONG_FORM_RENDER_CANARY_VO_FROM,
      durationInFrames: LONG_FORM_RENDER_CANARY_VO_DURATION,
      row: 3,
    });
    expect(overlays.map(overlay => overlay.audioRights)).toEqual([
      expect.objectContaining({ mediaRole: 'music', licensed: true }),
      expect.objectContaining({ mediaRole: 'voiceover', licensed: true }),
    ]);
  });

  it('creates an exact silent duck-marker covering 20s of a 300s timeline', () => {
    const vo = parsePcm16Wav(createLongFormDuckMarkerWav());

    expect(vo).toMatchObject({ sampleRateHz: 48_000, channelCount: 2 });
    expect(vo.sampleFrameCount).toBe(LONG_FORM_RENDER_CANARY_VO_DURATION / LONG_FORM_RENDER_CANARY_FPS * 48_000);
    expect(vo.nonZeroSamples).toBe(0);
  });

  it('accepts an exact 300s render with full-timeline music and bounded ducking', () => {
    const wav = renderFixture(8_000, 2_000);
    const windows = windowFixture(wav);
    const measurement = validateLongFormRender(wav, windows);

    expect(measurement.expectedSampleFrameCount).toBe(14_400_000); // 300s @ 48kHz
    expect(measurement.duckReductionDb).toBeCloseTo(12.04, 1);
  });

  it('fails loud when the timeline drifts, the tail is silent, or ducking is absent', () => {
    const drifted = renderFixture(8_000, 2_000, { shortenFrames: 1 });
    expect(() => validateLongFormRender(drifted, windowFixture(drifted)))
      .toThrow(/duration drifted/i);

    const silentTail = renderFixture(8_000, 2_000, { silentTail: true });
    const silentTailWindows = windowFixture(silentTail, true);
    expect(() => validateLongFormRender(silentTail, silentTailWindows))
      .toThrow(/tail window is digitally silent/i);

    const unducked = renderFixture(8_000, 8_000);
    expect(() => validateLongFormRender(unducked, windowFixture(unducked)))
      .toThrow(/ducking measured/i);
  });

  it('declares a 300-second target contract', () => {
    expect(LONG_FORM_RENDER_CANARY_VERSION).toBe('editron-long-form-render-canary-v1');
    expect(LONG_FORM_RENDER_CANARY_DURATION_FRAMES / LONG_FORM_RENDER_CANARY_FPS / 60).toBe(5);
  });

  it('rejects malformed PCM fixture input', () => {
    expect(() => encodePcm16Wav(Buffer.alloc(3), 48_000, 2)).toThrow(/aligned samples/i);
  });
});

function windowFixture(wav: ReturnType<typeof parsePcm16Wav>, silentTailMarker = false) {
  const w = {
    earlySolo: measurePcmFrameWindow(wav, 300, 900, LONG_FORM_RENDER_CANARY_FPS),
    ducked: measurePcmFrameWindow(wav, 4500, 4800, LONG_FORM_RENDER_CANARY_FPS),
    lateSolo: measurePcmFrameWindow(wav, 7800, 8400, LONG_FORM_RENDER_CANARY_FPS),
    tail: measurePcmFrameWindow(wav, 8820, 9000, LONG_FORM_RENDER_CANARY_FPS),
  };
  if (silentTailMarker) {
    w.tail = { ...w.tail, nonZeroSamples: 0, rms: 0 };
  }
  return w;
}

function renderFixture(soloSample: number, duckedSample: number, opts: {
  shortenFrames?: number;
  silentTail?: boolean;
} = {}) {
  const sampleRateHz = 48_000;
  const channelCount = 2;
  const total = LONG_FORM_RENDER_CANARY_DURATION_FRAMES;
  const sampleFrames = total / LONG_FORM_RENDER_CANARY_FPS * sampleRateHz - (opts.shortenFrames ?? 0);
  const pcm = Buffer.alloc(sampleFrames * channelCount * 2);
  for (let frame = 0; frame < sampleFrames; frame++) {
    const videoFrame = frame * LONG_FORM_RENDER_CANARY_FPS / sampleRateHz;
    const inDuck = videoFrame >= LONG_FORM_RENDER_CANARY_VO_FROM
      && videoFrame < LONG_FORM_RENDER_CANARY_VO_FROM + LONG_FORM_RENDER_CANARY_VO_DURATION;
    const inTail = videoFrame >= 8820;
    const sample = opts.silentTail && inTail
      ? 0
      : inDuck ? duckedSample : soloSample;
    for (let channel = 0; channel < channelCount; channel++) {
      pcm.writeInt16LE(sample, (frame * channelCount + channel) * 2);
    }
  }
  return parsePcm16Wav(encodePcm16Wav(pcm, sampleRateHz, channelCount));
}
