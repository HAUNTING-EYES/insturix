import type { Pcm16Wav, PcmWindowEvidence } from './sfx-render-canary-core';
import { encodePcm16Wav } from './bgm-render-canary-core';

export const UPLOADED_SFX_CANARY_VERSION = 'editron-uploaded-sfx-render-canary-v1' as const;
export const UPLOADED_SFX_CANARY_FPS = 30;
export const UPLOADED_SFX_CANARY_DURATION_FRAMES = 90;
export const UPLOADED_SFX_CANARY_FROM = 30;
export const UPLOADED_SFX_CANARY_SOUND_FRAMES = 30;

const SAMPLE_RATE_HZ = 48_000;
const CHANNEL_COUNT = 2;

export interface UploadedSfxCanaryWindows {
  before: PcmWindowEvidence;
  assigned: PcmWindowEvidence;
  after: PcmWindowEvidence;
}

export function createUploadedSfxWav(): Buffer {
  const sampleFrames = SAMPLE_RATE_HZ;
  const pcm = Buffer.alloc(sampleFrames * CHANNEL_COUNT * 2);
  const fadeFrames = Math.round(SAMPLE_RATE_HZ * 0.02);
  for (let frame = 0; frame < sampleFrames; frame++) {
    const edgeGain = Math.min(
      1,
      frame / fadeFrames,
      (sampleFrames - 1 - frame) / fadeFrames,
    );
    const sample = Math.round(
      Math.sin(2 * Math.PI * 880 * frame / SAMPLE_RATE_HZ)
      * 0.2
      * Math.max(0, edgeGain)
      * 32_767,
    );
    for (let channel = 0; channel < CHANNEL_COUNT; channel++) {
      pcm.writeInt16LE(sample, (frame * CHANNEL_COUNT + channel) * 2);
    }
  }
  return encodePcm16Wav(pcm, SAMPLE_RATE_HZ, CHANNEL_COUNT);
}

export function validateUploadedSfxCanaryRender(
  wav: Pcm16Wav,
  windows: UploadedSfxCanaryWindows,
): number {
  const expectedSampleFrameCount = Math.round(
    UPLOADED_SFX_CANARY_DURATION_FRAMES / UPLOADED_SFX_CANARY_FPS * wav.sampleRateHz,
  );
  if (wav.sampleFrameCount !== expectedSampleFrameCount) {
    throw new Error(
      `Uploaded SFX render duration drifted: expected ${expectedSampleFrameCount}, received ${wav.sampleFrameCount}`,
    );
  }
  if (wav.peakSample >= 32_767) {
    throw new Error(`Uploaded SFX render clipped at PCM peak ${wav.peakSample}`);
  }
  if (windows.assigned.nonZeroSamples === 0 || windows.assigned.rms <= 0) {
    throw new Error('Uploaded SFX assigned window is digitally silent');
  }
  if (windows.before.nonZeroSamples !== 0 || windows.after.nonZeroSamples !== 0) {
    throw new Error('Uploaded SFX escaped its assigned timeline window');
  }
  return expectedSampleFrameCount;
}
