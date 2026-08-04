import { resolveMusicGenerationPolicy } from '../lib/pipeline/bgm-conditioning-contract';
import type { Pcm16Wav, PcmWindowEvidence } from './sfx-render-canary-core';

export const MUSIC_OFF_CANARY_VERSION = 'editron-music-off-render-canary-v1' as const;
export const MUSIC_OFF_CANARY_FPS = 30;
export const MUSIC_OFF_CANARY_DURATION_FRAMES = 180;

export interface MusicOffCanaryWindows {
  firstThird: PcmWindowEvidence;
  secondThird: PcmWindowEvidence;
  finalThird: PcmWindowEvidence;
  full: PcmWindowEvidence;
}

export interface MusicOffPolicyEvidence {
  version: 'music-generation-policy-v1';
  allowed: boolean;
  reason: 'music-preference-none' | 'user-policy-off:music' | 'music-enabled';
  musicPreference: string | null;
}

export function resolveMusicOffPolicyEvidence(): MusicOffPolicyEvidence {
  // Exercise the REAL production policy owner with a music:off project.
  const policy = resolveMusicGenerationPolicy({
    musicPreferences: [
      { value: 'none', source: 'project.musicPreference' },
      { value: null, source: 'project.productionBrief.musicPreference' },
    ],
    editorialPreferences: [
      { value: null, source: 'project.editorialPreferences' },
      { value: null, source: 'project.productionBrief.editorialPreferences' },
    ],
  });
  return {
    version: policy.version,
    allowed: policy.allowed,
    reason: policy.reason,
    musicPreference: policy.musicPreference,
  };
}

/**
 * Build the music:off render overlays. The project has NO music overlay — only a
 * silent voiceover marker that spans the full timeline so the render still has a
 * legitimate audio lane. Any music that sneaks into the exported mix would show
 * up as non-silent PCM in the WAV.
 */
export function buildMusicOffRenderOverlays(
  silentVoiceoverDataUrl: string,
): Array<Record<string, unknown>> {
  return [
    {
      id: 4_001,
      type: 'sound',
      from: 0,
      durationInFrames: MUSIC_OFF_CANARY_DURATION_FRAMES,
      row: 3,
      left: 0,
      top: 0,
      width: 320,
      height: 180,
      isDragging: false,
      rotation: 0,
      content: silentVoiceoverDataUrl,
      src: silentVoiceoverDataUrl,
      assetId: 'voiceover_music_off_silence',
      styles: { volume: 1 },
      audioRights: generatedRights('voiceover', 'voiceover_music_off_silence'),
      metadata: { source: 'zero-credit-music-off-render-canary' },
    },
  ];
}

export function createSilentVoiceoverWav(): Buffer {
  const sampleFrames = Math.round(
    MUSIC_OFF_CANARY_DURATION_FRAMES / MUSIC_OFF_CANARY_FPS * 48_000,
  );
  return encodePcm16Wav(Buffer.alloc(sampleFrames * 2 * 2), 48_000, 2);
}

export function validateMusicOffRender(
  wav: Pcm16Wav,
  windows: MusicOffCanaryWindows,
): { expectedSampleFrameCount: number } {
  const expectedSampleFrameCount = Math.round(
    MUSIC_OFF_CANARY_DURATION_FRAMES / MUSIC_OFF_CANARY_FPS * wav.sampleRateHz,
  );
  if (wav.sampleFrameCount !== expectedSampleFrameCount) {
    throw new Error(
      `music:off canary duration drifted: expected ${expectedSampleFrameCount} PCM frames, received ${wav.sampleFrameCount}`,
    );
  }
  if (wav.peakSample >= 32_767) {
    throw new Error(`music:off canary clipped at PCM peak ${wav.peakSample}`);
  }

  // Every window across the whole timeline must be digitally silent: with music:off,
  // the export must contain zero music (and the silent voiceover marker adds silence too).
  for (const [label, window] of Object.entries(windows)) {
    if (window.nonZeroSamples !== 0 || window.rms !== 0) {
      throw new Error(
        `music:off canary leaked audio in window ${label}: ${window.nonZeroSamples} non-silent samples (rms=${window.rms})`,
      );
    }
  }
  return { expectedSampleFrameCount };
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

function generatedRights(mediaRole: 'voiceover', sourceAssetId: string) {
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
