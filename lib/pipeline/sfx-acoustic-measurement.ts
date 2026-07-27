import { z } from 'zod';

export const MIN_EBUR128_INTEGRATED_DURATION_MS = 400;
export const MAX_SFX_ACOUSTIC_MEASUREMENT_DURATION_MS = 30_000;

const sharedMeasurementShape = {
  version: z.literal('sfx-acoustic-measurement-v1'),
  loudnessDb: z.number().min(-100).max(6),
  truePeakDbtp: z.number().min(-100).max(6),
  sampleRateHz: z.number().int().positive(),
  channelCount: z.number().int().positive(),
  durationMs: z.number().int().positive().max(MAX_SFX_ACOUSTIC_MEASUREMENT_DURATION_MS),
  measuredAt: z.string().datetime(),
  sourceHashSha256: z.string().regex(/^[a-f0-9]{64}$/),
};

const integratedLufsMeasurementSchema = z.object({
  ...sharedMeasurementShape,
  algorithm: z.literal('ffmpeg-ebur128-v1'),
  loudnessMetric: z.literal('integrated-lufs'),
  integratedLufs: z.number().min(-100).max(6),
}).strict();

const shortWindowRmsMeasurementSchema = z.object({
  ...sharedMeasurementShape,
  algorithm: z.literal('pcm-rms+ffmpeg-true-peak-v1'),
  loudnessMetric: z.literal('rms-dbfs'),
  shortWindowRmsDbfs: z.number().min(-100).max(6),
}).strict();

export const sfxAcousticMeasurementSchema = z.discriminatedUnion('loudnessMetric', [
  integratedLufsMeasurementSchema,
  shortWindowRmsMeasurementSchema,
]).superRefine((measurement, context) => {
  if (
    measurement.loudnessMetric === 'integrated-lufs'
    && measurement.durationMs < MIN_EBUR128_INTEGRATED_DURATION_MS
  ) {
    context.addIssue({
      code: 'custom',
      path: ['durationMs'],
      message: `integrated LUFS requires at least ${MIN_EBUR128_INTEGRATED_DURATION_MS}ms of audio`,
    });
  }
  if (
    measurement.loudnessMetric === 'rms-dbfs'
    && measurement.durationMs >= MIN_EBUR128_INTEGRATED_DURATION_MS
  ) {
    context.addIssue({
      code: 'custom',
      path: ['durationMs'],
      message: `short-window RMS is only valid below ${MIN_EBUR128_INTEGRATED_DURATION_MS}ms`,
    });
  }

  const metricValue = measurement.loudnessMetric === 'integrated-lufs'
    ? measurement.integratedLufs
    : measurement.shortWindowRmsDbfs;
  if (Math.abs(measurement.loudnessDb - metricValue) > 0.05) {
    context.addIssue({
      code: 'custom',
      path: [measurement.loudnessMetric === 'integrated-lufs' ? 'integratedLufs' : 'shortWindowRmsDbfs'],
      message: 'loudness fields disagree',
    });
  }
});

export type SfxAcousticMeasurement = z.infer<typeof sfxAcousticMeasurementSchema>;
