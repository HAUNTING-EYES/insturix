import { AUDIO_LEVELS, DUCKING_DEFAULTS } from '../lib/editron/constants/audio-standards';
import type { Pcm16Wav, PcmWindowEvidence } from './sfx-render-canary-core';

export const LONG_FORM_RENDER_CANARY_VERSION = 'editron-long-form-render-canary-v1' as const;
export const LONG_FORM_RENDER_CANARY_FPS = 30;
/** 5 minutes at 30fps. */
export const LONG_FORM_RENDER_CANARY_DURATION_FRAMES = 9_000;
/** A voiceover mask across the middle of the timeline to prove ducking holds at 5-min scale. */
export const LONG_FORM_RENDER_CANARY_VO_FROM = 4_200;
export const LONG_FORM_RENDER_CANARY_VO_DURATION = 600;

const SAMPLE_RATE_HZ = 48_000;
const CHANNEL_COUNT = 2;
/** Relatively wide duck band for a 5-min render (still bounded by the graph's 5.5-12.5 dB). */
const MIN_DUCK_REDUCTION_DB = 4.5;
const MAX_DUCK_REDUCTION_DB = 13.5;

export interface LongFormRenderWindows {
  earlySolo: PcmWindowEvidence;
  ducked: PcmWindowEvidence;
  lateSolo: PcmWindowEvidence;
  tail: PcmWindowEvidence;
}

export interface LongFormRenderMeasurement {
  expectedSampleFrameCount: number;
  duckReductionDb: number;
}

/**
 * Build the 5-minute render overlays. The conditioned music spans the FULL 9000
 * frames (unlike short canaries), with a voiceover mask in the middle so ducking
 * is proven at long-form scale and the final 300ms tail is checked for an
 * audible ending (guards the audio-tail regression class).
 */
export function buildLongFormRenderOverlays(
  conditionedMusicDataUrl: string,
  silentVoiceoverDataUrl: string,
): Array<Record<string, unknown>> {
  return [
    {
      id: 5_001,
      type: 'sound',
      from: 0,
      durationInFrames: LONG_FORM_RENDER_CANARY_DURATION_FRAMES,
      row: 1,
      left: 0,
      top: 0,
      width: 320,
      height: 180,
      isDragging: false,
      rotation: 0,
      content: conditionedMusicDataUrl,
      src: conditionedMusicDataUrl,
      assetId: 'longform_canary_music',
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
      audioRights: generatedRights('music', 'longform_canary_music'),
      metadata: { source: 'zero-credit-long-form-render-canary' },
    },
    {
      id: 5_002,
      type: 'sound',
      from: LONG_FORM_RENDER_CANARY_VO_FROM,
      durationInFrames: LONG_FORM_RENDER_CANARY_VO_DURATION,
      row: 3,
      left: 0,
      top: 0,
      width: 320,
      height: 180,
      isDragging: false,
      rotation: 0,
      content: silentVoiceoverDataUrl,
      src: silentVoiceoverDataUrl,
      assetId: 'longform_canary_duck_marker',
      styles: { volume: 1 },
      audioRights: generatedRights('voiceover', 'longform_canary_duck_marker'),
      metadata: { source: 'zero-credit-long-form-render-canary-duck-marker' },
    },
  ];
}

export function createLongFormDuckMarkerWav(): Buffer {
  const sampleFrames = Math.round(
    LONG_FORM_RENDER_CANARY_VO_DURATION / LONG_FORM_RENDER_CANARY_FPS * SAMPLE_RATE_HZ,
  );
  return encodePcm16Wav(
    Buffer.alloc(sampleFrames * CHANNEL_COUNT * 2),
    SAMPLE_RATE_HZ,
    CHANNEL_COUNT,
  );
}

export function validateLongFormRender(
  wav: Pcm16Wav,
  windows: LongFormRenderWindows,
): LongFormRenderMeasurement {
  const expectedSampleFrameCount = Math.round(
    LONG_FORM_RENDER_CANARY_DURATION_FRAMES / LONG_FORM_RENDER_CANARY_FPS * wav.sampleRateHz,
  );
  if (wav.sampleFrameCount !== expectedSampleFrameCount) {
    throw new Error(
      `Long-form canary duration drifted: expected ${expectedSampleFrameCount} PCM frames (300s), received ${wav.sampleFrameCount}`,
    );
  }
  if (wav.peakSample >= 32_767) {
    throw new Error(`Long-form canary clipped at PCM peak ${wav.peakSample}`);
  }

  // The full-timeline music must be audible everywhere except the ducked window.
  for (const label of ['earlySolo', 'lateSolo', 'tail'] as const) {
    const window = windows[label];
    if (window.nonZeroSamples === 0 || window.rms <= 0) {
      throw new Error(`Long-form canary ${label} window is digitally silent (music lost/trimmed)`);
    }
  }
  if (windows.ducked.nonZeroSamples === 0 || windows.ducked.rms <= 0) {
    throw new Error('Long-form canary ducked window is digitally silent');
  }

  const soloRms = (windows.earlySolo.rms + windows.lateSolo.rms) / 2;
  const duckReductionDb = 20 * Math.log10(soloRms / windows.ducked.rms);
  if (duckReductionDb < MIN_DUCK_REDUCTION_DB || duckReductionDb > MAX_DUCK_REDUCTION_DB) {
    throw new Error(
      `Long-form ducking measured ${duckReductionDb.toFixed(2)} dB; expected ${MIN_DUCK_REDUCTION_DB}-${MAX_DUCK_REDUCTION_DB} dB`,
    );
  }

  return { expectedSampleFrameCount, duckReductionDb };
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
