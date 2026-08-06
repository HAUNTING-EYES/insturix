import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveMusicGenerationPolicy } from '@/lib/pipeline/bgm-conditioning-contract';
import { buildLambdaRenderInputProps } from '@/lib/editron/shared/render-request-payload';
import {
  MUSIC_OFF_CANARY_DURATION_FRAMES,
  MUSIC_OFF_CANARY_FPS,
  buildMusicOffRenderOverlays,
  createSilentVoiceoverWav,
  encodePcm16Wav,
  resolveMusicOffPolicyEvidence,
  validateMusicOffRender,
} from '@/scripts/music-off-render-canary-core';
import { measurePcmFrameWindow, parsePcm16Wav } from '@/scripts/sfx-render-canary-core';

describe('zero-credit rendered music:off canary', () => {
  it('builds an input with zero music overlays and valid voiceover generated rights', () => {
    const overlays = buildMusicOffRenderOverlays('data:audio/wav;base64,AAAA');
    const assembled = buildLambdaRenderInputProps({ overlays });

    expect(overlays).toHaveLength(1);
    expect(assembled.overlays).toHaveLength(1);
    expect('audioRightsNotices' in assembled).toBe(false);
    expect(overlays[0].audioRights).toMatchObject({
      mediaRole: 'voiceover',
      source: 'generated',
      licensed: true,
    });
  });

  it('creates an exact-duration fully silent voiceover marker', () => {
    const voiceover = parsePcm16Wav(createSilentVoiceoverWav());

    expect(voiceover).toMatchObject({ sampleRateHz: 48_000, channelCount: 2 });
    expect(voiceover.sampleFrameCount).toBe(288_000);
    expect(voiceover.nonZeroSamples).toBe(0);
  });

  it('resolves music:off through the shared policy owner to zero music and full silence', () => {
    expect(resolveMusicOffPolicyEvidence()).toMatchObject({
      version: 'music-generation-policy-v1',
      allowed: false,
      reason: 'music-preference-none',
      musicPreference: 'none',
    });

    const wav = renderedSilentFixture();
    const windows = measureWindows(wav);
    const measurement = validateMusicOffRender(wav, windows);
    expect(measurement.expectedSampleFrameCount).toBe(288_000);
    expect(windows.full.nonZeroSamples).toBe(0);
    expect(windows.full.rms).toBe(0);
  });

  it('fails loud when music leaks into the rendered mix', () => {
    const wav = renderedSilentFixture(1_000);
    expect(() => validateMusicOffRender(wav, measureWindows(wav)))
      .toThrow(/leaked audio/i);
  });

  it('blocks both legacy music none and editorial music off through the shared policy', () => {
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

  it('wires the shared fail-closed music policy through the three production generation paths', () => {
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
    firstThird: measurePcmFrameWindow(wav, 0, 60, MUSIC_OFF_CANARY_FPS),
    secondThird: measurePcmFrameWindow(wav, 60, 120, MUSIC_OFF_CANARY_FPS),
    finalThird: measurePcmFrameWindow(wav, 120, 180, MUSIC_OFF_CANARY_FPS),
    full: measurePcmFrameWindow(wav, 0, 180, MUSIC_OFF_CANARY_FPS),
  };
}

function renderedSilentFixture(leakSample = 0) {
  const sampleRateHz = 48_000;
  const channelCount = 2;
  const sampleFrames = MUSIC_OFF_CANARY_DURATION_FRAMES / MUSIC_OFF_CANARY_FPS * sampleRateHz;
  const pcm = Buffer.alloc(sampleFrames * channelCount * 2);
  for (let frame = 0; frame < sampleFrames; frame++) {
    for (let channel = 0; channel < channelCount; channel++) {
      pcm.writeInt16LE(leakSample, (frame * channelCount + channel) * 2);
    }
  }
  return parsePcm16Wav(encodePcm16Wav(pcm, sampleRateHz, channelCount));
}
