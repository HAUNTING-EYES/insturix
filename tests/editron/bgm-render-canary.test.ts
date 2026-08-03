import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveMusicGenerationPolicy } from '@/lib/pipeline/bgm-conditioning-contract';
import { buildLambdaRenderInputProps } from '@/lib/editron/shared/render-request-payload';
import {
  BGM_RENDER_CANARY_DURATION_FRAMES,
  BGM_RENDER_CANARY_FPS,
  buildBgmRenderCanaryOverlays,
  createSilentVoiceoverWav,
  createSyntheticMusicWav,
  encodePcm16Wav,
  validateBgmCanaryMeasurements,
} from '@/scripts/bgm-render-canary-core';
import { measurePcmFrameWindow, parsePcm16Wav } from '@/scripts/sfx-render-canary-core';

describe('zero-credit rendered BGM canary', () => {
  it('builds conditioned-music and voiceover marker inputs with valid generated rights', () => {
    const overlays = buildBgmRenderCanaryOverlays(
      'data:audio/flac;base64,AAAA',
      'data:audio/wav;base64,AAAA',
    );
    const assembled = buildLambdaRenderInputProps({ overlays });

    expect(overlays).toHaveLength(2);
    expect(assembled.overlays).toHaveLength(2);
    expect('audioRightsNotices' in assembled).toBe(false);
    expect(overlays.map(overlay => overlay.audioRights)).toEqual([
      expect.objectContaining({ mediaRole: 'music', source: 'generated', licensed: true }),
      expect.objectContaining({ mediaRole: 'voiceover', source: 'generated', licensed: true }),
    ]);
  });

  it('creates a loopable stereo music source and an exact silent VO marker', () => {
    const music = parsePcm16Wav(createSyntheticMusicWav());
    const voiceover = parsePcm16Wav(createSilentVoiceoverWav());

    expect(music).toMatchObject({ sampleRateHz: 48_000, channelCount: 2, sampleFrameCount: 96_000 });
    expect(music.nonZeroSamples).toBeGreaterThan(0);
    expect(voiceover.sampleFrameCount).toBe(192_000);
    expect(voiceover.nonZeroSamples).toBe(0);
  });

  it('accepts an exact render with graph-bounded ducking and an audible tail', () => {
    const wav = renderedFixture(8_000, 2_000);
    const windows = measureWindows(wav);
    const measurement = validateBgmCanaryMeasurements(wav, windows);

    expect(measurement.expectedSampleFrameCount).toBe(576_000);
    expect(measurement.duckReductionDb).toBeCloseTo(12.04, 1);
  });

  it('fails loud when ducking is absent or the rendered tail is silent', () => {
    const unducked = renderedFixture(8_000, 8_000);
    expect(() => validateBgmCanaryMeasurements(unducked, measureWindows(unducked)))
      .toThrow(/ducking measured/i);

    const silentTail = renderedFixture(8_000, 2_000, true);
    expect(() => validateBgmCanaryMeasurements(silentTail, measureWindows(silentTail)))
      .toThrow(/tail window is digitally silent/i);
  });

  it('blocks both legacy music none and editorial music off', () => {
    expect(resolveMusicGenerationPolicy({
      musicPreferences: [{ value: 'none', source: 'test.musicPreference' }],
      editorialPreferences: [],
    })).toMatchObject({ allowed: false, reason: 'music-preference-none' });
    expect(resolveMusicGenerationPolicy({
      musicPreferences: [],
      editorialPreferences: [{
        value: { families: { music: { mode: 'off' } } },
        source: 'test.editorialPreferences',
      }],
    })).toMatchObject({ allowed: false, reason: 'user-policy-off:music' });
  });

  it('wires the shared fail-closed music policy through all three generation paths', () => {
    const sources = [
      source('lib/editron/agent/director-agent.ts'),
      source('app/api/services/pipeline/storyboard/[id]/finalize/route.ts'),
      source('app/api/internal/workers/pipeline/audio/route.ts'),
    ];

    for (const contents of sources) {
      expect(contents).toContain('resolveMusicGenerationPolicy');
      expect(contents).toContain('musicGenerationPolicy.allowed');
    }
    expect(sources[0]).toContain('!musicGenerationPolicy.allowed');
    expect(sources[1]).toContain('if (!musicGenerationPolicy.allowed)');
    expect(sources[2]).toContain('if (!musicGenerationPolicy.allowed)');
  });

  it('rejects malformed PCM fixture input', () => {
    expect(() => encodePcm16Wav(Buffer.alloc(3), 48_000, 2)).toThrow(/aligned samples/i);
  });
});

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function measureWindows(wav: ReturnType<typeof parsePcm16Wav>) {
  return {
    soloBefore: measurePcmFrameWindow(wav, 30, 90, BGM_RENDER_CANARY_FPS),
    ducked: measurePcmFrameWindow(wav, 150, 210, BGM_RENDER_CANARY_FPS),
    soloAfter: measurePcmFrameWindow(wav, 270, 330, BGM_RENDER_CANARY_FPS),
    tail: measurePcmFrameWindow(wav, 345, 360, BGM_RENDER_CANARY_FPS),
  };
}

function renderedFixture(soloSample: number, duckedSample: number, silentTail = false) {
  const sampleRateHz = 48_000;
  const channelCount = 2;
  const sampleFrames = BGM_RENDER_CANARY_DURATION_FRAMES / BGM_RENDER_CANARY_FPS * sampleRateHz;
  const pcm = Buffer.alloc(sampleFrames * channelCount * 2);
  for (let frame = 0; frame < sampleFrames; frame++) {
    const videoFrame = frame * BGM_RENDER_CANARY_FPS / sampleRateHz;
    const inDuck = videoFrame >= 120 && videoFrame < 240;
    const inTail = videoFrame >= 345;
    const sample = silentTail && inTail ? 0 : inDuck ? duckedSample : soloSample;
    for (let channel = 0; channel < channelCount; channel++) {
      pcm.writeInt16LE(sample, (frame * channelCount + channel) * 2);
    }
  }
  return parsePcm16Wav(encodePcm16Wav(pcm, sampleRateHz, channelCount));
}
