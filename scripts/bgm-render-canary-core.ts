import { AUDIO_LEVELS, DUCKING_DEFAULTS } from '../lib/editron/constants/audio-standards';
import type { Pcm16Wav, PcmWindowEvidence } from './sfx-render-canary-core';

export const BGM_RENDER_CANARY_VERSION = 'editron-bgm-render-canary-v1' as const;
export const BGM_RENDER_CANARY_FPS = 30;
export const BGM_RENDER_CANARY_DURATION_FRAMES = 360;
export const BGM_RENDER_CANARY_VOICEOVER_FROM = 120;
export const BGM_RENDER_CANARY_VOICEOVER_DURATION = 120;

const SAMPLE_RATE_HZ = 48_000;
const CHANNEL_COUNT = 2;
const SOURCE_DURATION_SECONDS = 2;
const SOURCE_FREQUENCY_HZ = 440;
const SOURCE_AMPLITUDE = 0.15;
const MIN_DUCK_REDUCTION_DB = 5.5;
const MAX_DUCK_REDUCTION_DB = 12.5;

export interface BgmCanaryWindows {
  soloBefore: PcmWindowEvidence;
  ducked: PcmWindowEvidence;
  soloAfter: PcmWindowEvidence;
  tail: PcmWindowEvidence;
}

export interface BgmCanaryMeasurement {
  duckReductionDb: number;
  expectedSampleFrameCount: number;
}

export function createSyntheticMusicWav(): Buffer {
  const sampleFrames = SAMPLE_RATE_HZ * SOURCE_DURATION_SECONDS;
  const pcm = Buffer.alloc(sampleFrames * CHANNEL_COUNT * 2);
  for (let frame = 0; frame < sampleFrames; frame++) {
    const value = Math.round(
      Math.sin(2 * Math.PI * SOURCE_FREQUENCY_HZ * frame / SAMPLE_RATE_HZ)
      * SOURCE_AMPLITUDE
      * 32_767,
    );
    for (let channel = 0; channel < CHANNEL_COUNT; channel++) {
      pcm.writeInt16LE(value, (frame * CHANNEL_COUNT + channel) * 2);
    }
  }
  return encodePcm16Wav(pcm, SAMPLE_RATE_HZ, CHANNEL_COUNT);
}

export function createSilentVoiceoverWav(): Buffer {
  const sampleFrames = Math.round(
    BGM_RENDER_CANARY_VOICEOVER_DURATION / BGM_RENDER_CANARY_FPS * SAMPLE_RATE_HZ,
  );
  return encodePcm16Wav(
    Buffer.alloc(sampleFrames * CHANNEL_COUNT * 2),
    SAMPLE_RATE_HZ,
    CHANNEL_COUNT,
  );
}

export function buildBgmRenderCanaryOverlays(
  conditionedMusicDataUrl: string,
  silentVoiceoverDataUrl: string,
): Array<Record<string, unknown>> {
  return [
    {
      id: 3_001,
      type: 'sound',
      from: 0,
      durationInFrames: BGM_RENDER_CANARY_DURATION_FRAMES,
      row: 1,
      left: 0,
      top: 0,
      width: 320,
      height: 180,
      isDragging: false,
      rotation: 0,
      content: conditionedMusicDataUrl,
      src: conditionedMusicDataUrl,
      assetId: 'bgm_canary_conditioned',
      styles: {
        volume: AUDIO_LEVELS.BGM_WITHOUT_VO,
        duckingConfig: {
          enabled: true,
          duckLevel: AUDIO_LEVELS.BGM_WITH_VO,
          rampDownMs: DUCKING_DEFAULTS.rampDownMs,
          rampUpMs: DUCKING_DEFAULTS.rampUpMs,
          lookAheadMs: DUCKING_DEFAULTS.lookAheadMs,
        },
      },
      audioRights: generatedRights('music', 'bgm_canary_conditioned'),
      metadata: { source: 'zero-credit-bgm-render-canary' },
    },
    {
      id: 3_002,
      type: 'sound',
      from: BGM_RENDER_CANARY_VOICEOVER_FROM,
      durationInFrames: BGM_RENDER_CANARY_VOICEOVER_DURATION,
      row: 3,
      left: 0,
      top: 0,
      width: 320,
      height: 180,
      isDragging: false,
      rotation: 0,
      content: silentVoiceoverDataUrl,
      src: silentVoiceoverDataUrl,
      assetId: 'voiceover_canary_silence',
      styles: { volume: 1 },
      audioRights: generatedRights('voiceover', 'voiceover_canary_silence'),
      metadata: { source: 'zero-credit-bgm-render-canary-duck-marker' },
    },
  ];
}

export function validateBgmCanaryMeasurements(
  wav: Pcm16Wav,
  windows: BgmCanaryWindows,
): BgmCanaryMeasurement {
  const expectedSampleFrameCount = Math.round(
    BGM_RENDER_CANARY_DURATION_FRAMES / BGM_RENDER_CANARY_FPS * wav.sampleRateHz,
  );
  if (wav.sampleFrameCount !== expectedSampleFrameCount) {
    throw new Error(
      `BGM canary duration drifted: expected ${expectedSampleFrameCount} PCM frames, received ${wav.sampleFrameCount}`,
    );
  }
  if (wav.peakSample >= 32_767) {
    throw new Error(`BGM canary clipped at PCM peak ${wav.peakSample}`);
  }

  for (const [label, window] of Object.entries(windows)) {
    if (window.nonZeroSamples === 0 || window.rms <= 0) {
      throw new Error(`BGM canary ${label} window is digitally silent`);
    }
  }

  const soloRms = (windows.soloBefore.rms + windows.soloAfter.rms) / 2;
  const duckReductionDb = 20 * Math.log10(soloRms / windows.ducked.rms);
  if (duckReductionDb < MIN_DUCK_REDUCTION_DB || duckReductionDb > MAX_DUCK_REDUCTION_DB) {
    throw new Error(
      `BGM ducking measured ${duckReductionDb.toFixed(2)} dB; expected ${MIN_DUCK_REDUCTION_DB}-${MAX_DUCK_REDUCTION_DB} dB`,
    );
  }

  return { duckReductionDb, expectedSampleFrameCount };
}

export function encodePcm16Wav(
  pcm: Buffer,
  sampleRateHz: number,
  channelCount: number,
): Buffer {
  if (sampleRateHz <= 0 || channelCount <= 0 || pcm.length % (channelCount * 2) !== 0) {
    throw new Error('PCM16 WAV input must contain aligned samples and valid format values');
  }
  const blockAlign = channelCount * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channelCount, 22);
  header.writeUInt32LE(sampleRateHz, 24);
  header.writeUInt32LE(sampleRateHz * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function generatedRights(mediaRole: 'music' | 'voiceover', sourceAssetId: string) {
  return {
    mediaRole,
    source: 'generated',
    userChoice: 'attested',
    licensed: true,
    evidence: {
      kind: 'generated-provider',
      sourceAssetId,
      licenseId: 'synthetic-local-canary-v1',
    },
  };
}
