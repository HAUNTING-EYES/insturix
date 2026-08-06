import { createHash } from 'node:crypto';

import {
  conditionAudio,
  inspectEncodedMusicAudio,
} from '../lib/pipeline/audio-conditioning';
import { encodePcm16Wav } from './bgm-render-canary-core';

export const LONG_FORM_SOAK_VERSION = 'editron-long-form-conditioning-soak-v1' as const;
export const LONG_FORM_SOAK_FPS = 30;
/** 5 minutes of timeline at 30fps. */
export const LONG_FORM_SOAK_TARGET_FRAMES = 9_000;
export const LONG_FORM_SOAK_MIN_DURATION_MS = 300_000;
export const LONG_FORM_SOAK_MAX_DURATION_MS = 300_500;

const SAMPLE_RATE_HZ = 48_000;
const CHANNEL_COUNT = 2;
const SOURCE_SECONDS = 8;

export interface MemoryReading {
  heapUsedMb: number;
  heapTotalMb: number;
  rssMb: number;
  externalMb: number;
  arrayBuffersMb: number;
}

export interface LongFormSoakResult {
  durationMs: number;
  sourceDurationMs: number;
  measuredOutputLufs: number;
  truePeakDbtp: number;
  wasLooped: boolean;
  loopsAdded: number;
  crossfadeMs: number;
  memory: {
    providerRssMb: number;
    afterRssMb: number;
    deltaRssMb: number;
    providerHeapMb: number;
    afterHeapMb: number;
  };
  elapsedMs: number;
  sourceHashSha256: string;
}

export function createSoakSourceWav(): Buffer {
  const sampleFrames = SAMPLE_RATE_HZ * SOURCE_SECONDS;
  const pcm = Buffer.alloc(sampleFrames * CHANNEL_COUNT * 2);
  const amplitude = 0.2;
  for (let frame = 0; frame < sampleFrames; frame++) {
    const fades = Math.min(
      1,
      frame / (SAMPLE_RATE_HZ * 0.02),
      (sampleFrames - 1 - frame) / (SAMPLE_RATE_HZ * 0.02),
    );
    const value = Math.round(
      Math.sin(2 * Math.PI * 220 * frame / SAMPLE_RATE_HZ)
      * amplitude
      * Math.max(0, fades)
      * 32_767,
    );
    for (let channel = 0; channel < CHANNEL_COUNT; channel++) {
      pcm.writeInt16LE(value, (frame * CHANNEL_COUNT + channel) * 2);
    }
  }
  return encodePcm16Wav(pcm, SAMPLE_RATE_HZ, CHANNEL_COUNT);
}

export async function runLongFormConditioningSoak(): Promise<LongFormSoakResult> {
  const sourceBuffer = createSoakSourceWav();
  const sourceHashSha256 = createSha256(sourceBuffer);

  const providerBefore = process.memoryUsage();
  const startMs = Date.now();
  const conditioning = await conditionAudio({
    role: 'music',
    buffer: sourceBuffer,
    targetFrames: LONG_FORM_SOAK_TARGET_FRAMES,
    fps: LONG_FORM_SOAK_FPS,
  });
  const elapsedMs = Date.now() - startMs;
  const providerAfter = process.memoryUsage();
  const inspection = await inspectEncodedMusicAudio(conditioning.buffer);

  if (conditioning.durationMs < LONG_FORM_SOAK_MIN_DURATION_MS
    || conditioning.durationMs > LONG_FORM_SOAK_MAX_DURATION_MS) {
    throw new Error(
      `Long-form conditioning duration ${conditioning.durationMs}ms; expected ~${LONG_FORM_SOAK_MIN_DURATION_MS}ms`,
    );
  }
  if (!conditioning.wasLooped || conditioning.loopsAdded < 1 || conditioning.crossfadeMs <= 0) {
    throw new Error('Long-form source was not looped with a crossfade');
  }
  if (Math.abs(inspection.measuredLufs - conditioning.targetLufs) > 1) {
    throw new Error(
      `Conditioned output measured ${inspection.measuredLufs} LUFS; target ${conditioning.targetLufs}`,
    );
  }
  if (inspection.clippingRisk || inspection.truePeakDbtp > conditioning.targetTruePeakDbtp + 0.1) {
    throw new Error(`Long-form output true peak is unsafe at ${inspection.truePeakDbtp} dBTP`);
  }
  if (conditioning.buffer.length === 0) {
    throw new Error('Long-form conditioning produced an empty output buffer');
  }

  return {
    durationMs: conditioning.durationMs,
    sourceDurationMs: conditioning.sourceDurationMs,
    measuredOutputLufs: inspection.measuredLufs,
    truePeakDbtp: inspection.truePeakDbtp,
    wasLooped: conditioning.wasLooped,
    loopsAdded: conditioning.loopsAdded,
    crossfadeMs: conditioning.crossfadeMs,
    memory: {
      providerRssMb: mb(providerBefore.rss),
      afterRssMb: mb(providerAfter.rss),
      deltaRssMb: mb(providerAfter.rss - providerBefore.rss),
      providerHeapMb: mb(providerBefore.heapUsed),
      afterHeapMb: mb(providerAfter.heapUsed),
    },
    elapsedMs,
    sourceHashSha256,
  };
}

function createSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function mb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

export function readMemoryReading(): MemoryReading {
  const usage = process.memoryUsage();
  return {
    heapUsedMb: mb(usage.heapUsed),
    heapTotalMb: mb(usage.heapTotal),
    rssMb: mb(usage.rss),
    externalMb: mb(usage.external),
    arrayBuffersMb: mb(usage.arrayBuffers),
  };
}
