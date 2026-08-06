import { describe, expect, it } from 'vitest';

import {
  UPLOADED_SFX_CANARY_DURATION_FRAMES,
  UPLOADED_SFX_CANARY_FPS,
  createUploadedSfxWav,
  validateUploadedSfxCanaryRender,
} from '@/scripts/uploaded-sfx-render-canary-core';
import { encodePcm16Wav } from '@/scripts/bgm-render-canary-core';
import { measurePcmFrameWindow, parsePcm16Wav } from '@/scripts/sfx-render-canary-core';

describe('zero-credit uploaded SFX render canary', () => {
  it('creates a one-second audible stereo upload fixture', () => {
    const wav = parsePcm16Wav(createUploadedSfxWav());
    expect(wav).toMatchObject({
      sampleRateHz: 48_000,
      channelCount: 2,
      sampleFrameCount: 48_000,
    });
    expect(wav.nonZeroSamples).toBeGreaterThan(0);
    expect(wav.peakSample).toBeLessThan(32_767);
  });

  it('accepts sound only inside the assigned SFX window', () => {
    const wav = renderedFixture(false);
    const expectedFrames = validateUploadedSfxCanaryRender(wav, windows(wav));
    expect(expectedFrames).toBe(144_000);
  });

  it('fails loud on timeline leakage, silence, clipping, and duration drift', () => {
    const leaked = renderedFixture(true);
    expect(() => validateUploadedSfxCanaryRender(leaked, windows(leaked)))
      .toThrow(/escaped its assigned timeline window/i);

    const silent = parsePcm16Wav(encodePcm16Wav(Buffer.alloc(144_000 * 4), 48_000, 2));
    expect(() => validateUploadedSfxCanaryRender(silent, windows(silent)))
      .toThrow(/assigned window is digitally silent/i);

    const clippedPcm = Buffer.alloc(144_000 * 4);
    clippedPcm.writeInt16LE(32_767, 48_000 * 4);
    const clipped = parsePcm16Wav(encodePcm16Wav(clippedPcm, 48_000, 2));
    expect(() => validateUploadedSfxCanaryRender(clipped, windows(clipped)))
      .toThrow(/clipped/i);

    const short = parsePcm16Wav(encodePcm16Wav(Buffer.alloc(48_000 * 4), 48_000, 2));
    const validWindows = windows(renderedFixture(false));
    expect(() => validateUploadedSfxCanaryRender(short, validWindows))
      .toThrow(/duration drifted/i);
  });
});

function windows(wav: ReturnType<typeof parsePcm16Wav>) {
  return {
    before: measurePcmFrameWindow(wav, 0, 30, UPLOADED_SFX_CANARY_FPS),
    assigned: measurePcmFrameWindow(wav, 30, 60, UPLOADED_SFX_CANARY_FPS),
    after: measurePcmFrameWindow(wav, 60, 90, UPLOADED_SFX_CANARY_FPS),
  };
}

function renderedFixture(leak: boolean) {
  const sampleFrames = UPLOADED_SFX_CANARY_DURATION_FRAMES / UPLOADED_SFX_CANARY_FPS * 48_000;
  const pcm = Buffer.alloc(sampleFrames * 4);
  for (let frame = 0; frame < sampleFrames; frame++) {
    const videoFrame = frame * UPLOADED_SFX_CANARY_FPS / 48_000;
    const active = videoFrame >= 30 && videoFrame < 60;
    const sample = active || leak ? 4_000 : 0;
    pcm.writeInt16LE(sample, frame * 4);
    pcm.writeInt16LE(sample, frame * 4 + 2);
  }
  return parsePcm16Wav(encodePcm16Wav(pcm, 48_000, 2));
}
