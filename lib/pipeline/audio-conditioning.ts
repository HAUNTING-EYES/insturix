import { spawn } from 'node:child_process';

import decode from 'audio-decode';

import { resolveAudioLoudnessTarget } from '@/lib/editron/constants/audio-standards';
import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';

const DEFAULT_CROSSFADE_MS = 250;
const SILENCE_THRESHOLD_LUFS = -60;
const MAX_DURATION_SECONDS = 600;
const MIN_MUSIC_DURATION_SECONDS = 0.4;
const FFMPEG_TIMEOUT_MS = 120_000;
export const MAX_AUDIO_CONDITIONING_INPUT_BYTES = 128 * 1024 * 1024;
const MAX_PCM_BYTES = 256 * 1024 * 1024;
const MAX_FFMPEG_OUTPUT_BYTES = 256 * 1024 * 1024;
const MAX_STDERR_BYTES = 2 * 1024 * 1024;

export type AudioConditioningErrorCode =
  | 'INVALID_REQUEST'
  | 'INPUT_TOO_LARGE'
  | 'DECODE_FAILED'
  | 'INVALID_PCM'
  | 'UNSUPPORTED_CHANNELS'
  | 'AUDIO_SILENT'
  | 'LOUDNESS_OUT_OF_RANGE'
  | 'TRUE_PEAK_EXCEEDED'
  | 'FFMPEG_FAILED'
  | 'FFMPEG_TIMEOUT'
  | 'OUTPUT_TOO_LARGE';

export class AudioConditioningError extends Error {
  constructor(
    public readonly code: AudioConditioningErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AudioConditioningError';
  }
}

export interface DecodedPcm {
  channelData: readonly Float32Array[];
  sampleRate: number;
}

export interface FitPcmOptions {
  targetFrames: number;
  fps: number;
  crossfadeMs?: number;
}

export interface FittedPcm {
  interleaved: Float32Array;
  sampleRate: number;
  channels: number;
  sourceSamplesPerChannel: number;
  targetSamplesPerChannel: number;
  wasLooped: boolean;
  wasTrimmed: boolean;
  loopsAdded: number;
  crossfadeSamples: number;
}

export interface ConditionAudioInput extends FitPcmOptions {
  role: 'music';
  buffer: Buffer;
  platform?: string | null;
}

export interface AudioConditioningResult {
  buffer: Buffer;
  contentType: 'audio/flac';
  filenameExtension: 'flac';
  targetFrames: number;
  durationMs: number;
  sourceDurationMs: number;
  sampleRate: number;
  channels: number;
  measuredInputLufs: number;
  measuredOutputLufs: number;
  truePeakDbtp: number;
  targetLufs: number;
  targetTruePeakDbtp: number;
  loudnessPlatform: string;
  wasLooped: boolean;
  wasTrimmed: boolean;
  loopsAdded: number;
  crossfadeMs: number;
}

export interface EncodedMusicInspection {
  durationMs: number;
  sampleRate: number;
  channels: number;
  measuredLufs: number;
  truePeakDbtp: number;
  clippingRisk: boolean;
}

interface FfmpegResult {
  stdout: Buffer;
  stderr: string;
}

interface AudioMeasurements {
  integratedLufs: number;
  truePeakDbtp: number;
}

export function fitPcmToExactDuration(decoded: DecodedPcm, options: FitPcmOptions): FittedPcm {
  validateTimeline(options.targetFrames, options.fps);
  if (!Number.isFinite(decoded.sampleRate) || decoded.sampleRate <= 0) {
    throw new AudioConditioningError('INVALID_PCM', `Invalid PCM sample rate: ${decoded.sampleRate}`);
  }
  if (decoded.channelData.length < 1 || decoded.channelData.length > 2) {
    throw new AudioConditioningError(
      'UNSUPPORTED_CHANNELS',
      `Music conditioning supports mono or stereo PCM, received ${decoded.channelData.length} channels`,
    );
  }

  const sourceSamples = Math.min(...decoded.channelData.map((channel) => channel.length));
  if (!Number.isFinite(sourceSamples) || sourceSamples <= 0) {
    throw new AudioConditioningError('INVALID_PCM', 'Decoded PCM contains no samples');
  }

  const targetSamples = Math.round((options.targetFrames / options.fps) * decoded.sampleRate);
  if (!Number.isSafeInteger(targetSamples) || targetSamples <= 0) {
    throw new AudioConditioningError('INVALID_REQUEST', 'Target timeline resolves to zero audio samples');
  }

  const channels = decoded.channelData.length;
  const targetPcmBytes = targetSamples * channels * Float32Array.BYTES_PER_ELEMENT;
  if (!Number.isSafeInteger(targetPcmBytes) || targetPcmBytes > MAX_PCM_BYTES) {
    throw new AudioConditioningError(
      'OUTPUT_TOO_LARGE',
      `Target PCM requires ${targetPcmBytes} bytes; limit is ${MAX_PCM_BYTES}`,
    );
  }
  const output = new Float32Array(targetSamples * channels);
  const readSample = (channel: number, frame: number): number => {
    const sample = decoded.channelData[channel][frame];
    if (!Number.isFinite(sample)) {
      throw new AudioConditioningError('INVALID_PCM', `Non-finite PCM sample at channel ${channel}, frame ${frame}`);
    }
    return sample;
  };
  const copySource = (sourceStart: number, destinationStart: number, frameCount: number) => {
    for (let frame = 0; frame < frameCount; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        output[(destinationStart + frame) * channels + channel] = readSample(channel, sourceStart + frame);
      }
    }
  };

  const firstCopyFrames = Math.min(sourceSamples, targetSamples);
  copySource(0, 0, firstCopyFrames);

  const wasLooped = sourceSamples < targetSamples;
  const crossfadeMs = options.crossfadeMs ?? DEFAULT_CROSSFADE_MS;
  if (!Number.isFinite(crossfadeMs) || crossfadeMs < 0) {
    throw new AudioConditioningError('INVALID_REQUEST', `crossfadeMs must be non-negative, received ${crossfadeMs}`);
  }
  const requestedCrossfadeSamples = Math.max(
    0,
    Math.round((crossfadeMs / 1000) * decoded.sampleRate),
  );
  const crossfadeSamples = wasLooped
    ? Math.min(requestedCrossfadeSamples, Math.floor(sourceSamples / 2))
    : 0;

  let writtenFrames = firstCopyFrames;
  let loopsAdded = 0;
  while (writtenFrames < targetSamples) {
    const overlapFrames = Math.min(crossfadeSamples, writtenFrames);
    const overlapStart = writtenFrames - overlapFrames;
    for (let frame = 0; frame < overlapFrames; frame += 1) {
      const phase = ((frame + 1) / (overlapFrames + 1)) * (Math.PI / 2);
      const outgoingGain = Math.cos(phase);
      const incomingGain = Math.sin(phase);
      for (let channel = 0; channel < channels; channel += 1) {
        const destinationIndex = (overlapStart + frame) * channels + channel;
        output[destinationIndex] = (
          output[destinationIndex] * outgoingGain
          + readSample(channel, frame) * incomingGain
        );
      }
    }

    const sourceStart = overlapFrames;
    const framesToAppend = Math.min(sourceSamples - sourceStart, targetSamples - writtenFrames);
    if (framesToAppend <= 0) {
      throw new AudioConditioningError('INVALID_PCM', 'Source audio is too short for the requested crossfade');
    }
    copySource(sourceStart, writtenFrames, framesToAppend);
    writtenFrames += framesToAppend;
    loopsAdded += 1;
  }

  return {
    interleaved: output,
    sampleRate: decoded.sampleRate,
    channels,
    sourceSamplesPerChannel: sourceSamples,
    targetSamplesPerChannel: targetSamples,
    wasLooped,
    wasTrimmed: sourceSamples > targetSamples,
    loopsAdded,
    crossfadeSamples,
  };
}

export async function conditionAudio(input: ConditionAudioInput): Promise<AudioConditioningResult> {
  if (input.role !== 'music') {
    throw new AudioConditioningError('INVALID_REQUEST', `Unsupported audio conditioning role: ${String(input.role)}`);
  }
  validateTimeline(input.targetFrames, input.fps);
  const targetDurationSeconds = input.targetFrames / input.fps;
  if (targetDurationSeconds > MAX_DURATION_SECONDS) {
    throw new AudioConditioningError(
      'INVALID_REQUEST',
      `Music conditioning supports timelines up to ${MAX_DURATION_SECONDS}s, received ${targetDurationSeconds.toFixed(3)}s`,
    );
  }
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
    throw new AudioConditioningError('INVALID_REQUEST', 'Audio conditioning requires a non-empty encoded buffer');
  }
  if (input.buffer.length > MAX_AUDIO_CONDITIONING_INPUT_BYTES) {
    throw new AudioConditioningError(
      'INPUT_TOO_LARGE',
      `Encoded audio is ${input.buffer.length} bytes; limit is ${MAX_AUDIO_CONDITIONING_INPUT_BYTES}`,
    );
  }

  let decoded: DecodedPcm;
  try {
    decoded = await decode(input.buffer);
  } catch (error) {
    throw new AudioConditioningError('DECODE_FAILED', 'Unable to decode source audio', { cause: error });
  }

  const sourceSamples = Math.min(...decoded.channelData.map((channel) => channel.length));
  const sourceDurationSeconds = sourceSamples / decoded.sampleRate;
  if (!Number.isFinite(sourceDurationSeconds) || sourceDurationSeconds < MIN_MUSIC_DURATION_SECONDS) {
    throw new AudioConditioningError(
      'INVALID_PCM',
      `Decoded music is too short to condition safely (${sourceDurationSeconds.toFixed(3)}s)`,
    );
  }

  const fitted = fitPcmToExactDuration(decoded, input);
  const rawPcm = Buffer.from(
    fitted.interleaved.buffer as ArrayBuffer,
    fitted.interleaved.byteOffset,
    fitted.interleaved.byteLength,
  );
  const loudnessTarget = resolveAudioLoudnessTarget(input.platform);
  const inputMeasurements = await measureAudio(rawPcm, {
    sampleRate: fitted.sampleRate,
    channels: fitted.channels,
  });
  if (inputMeasurements.integratedLufs <= SILENCE_THRESHOLD_LUFS) {
    throw new AudioConditioningError(
      'AUDIO_SILENT',
      `Source audio measured ${inputMeasurements.integratedLufs.toFixed(1)} LUFS (silence threshold ${SILENCE_THRESHOLD_LUFS} LUFS)`,
    );
  }

  const normalized = await runFfmpeg([
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'f32le',
    '-ar', String(fitted.sampleRate),
    '-ac', String(fitted.channels),
    '-i', 'pipe:0',
    '-af', `loudnorm=I=${loudnessTarget.integratedLufs}:TP=${loudnessTarget.truePeakDbtp}`,
    '-ar', String(fitted.sampleRate),
    '-ac', String(fitted.channels),
    '-codec:a', 'flac',
    '-compression_level', '5',
    '-f', 'flac',
    'pipe:1',
  ], rawPcm);
  const outputMeasurements = await measureAudio(normalized.stdout);
  validateOutputMeasurements(outputMeasurements, loudnessTarget.integratedLufs, loudnessTarget.truePeakDbtp);

  return {
    buffer: normalized.stdout,
    contentType: 'audio/flac',
    filenameExtension: 'flac',
    targetFrames: input.targetFrames,
    durationMs: (fitted.targetSamplesPerChannel / fitted.sampleRate) * 1000,
    sourceDurationMs: sourceDurationSeconds * 1000,
    sampleRate: fitted.sampleRate,
    channels: fitted.channels,
    measuredInputLufs: inputMeasurements.integratedLufs,
    measuredOutputLufs: outputMeasurements.integratedLufs,
    truePeakDbtp: outputMeasurements.truePeakDbtp,
    targetLufs: loudnessTarget.integratedLufs,
    targetTruePeakDbtp: loudnessTarget.truePeakDbtp,
    loudnessPlatform: loudnessTarget.platform,
    wasLooped: fitted.wasLooped,
    wasTrimmed: fitted.wasTrimmed,
    loopsAdded: fitted.loopsAdded,
    crossfadeMs: (fitted.crossfadeSamples / fitted.sampleRate) * 1000,
  };
}

export async function inspectEncodedMusicAudio(buffer: Buffer): Promise<EncodedMusicInspection> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AudioConditioningError('INVALID_REQUEST', 'Audio inspection requires a non-empty encoded buffer');
  }
  if (buffer.length > MAX_AUDIO_CONDITIONING_INPUT_BYTES) {
    throw new AudioConditioningError(
      'INPUT_TOO_LARGE',
      `Encoded audio is ${buffer.length} bytes; limit is ${MAX_AUDIO_CONDITIONING_INPUT_BYTES}`,
    );
  }

  let decoded: DecodedPcm;
  try {
    decoded = await decode(buffer);
  } catch (error) {
    throw new AudioConditioningError('DECODE_FAILED', 'Unable to decode source audio', { cause: error });
  }
  if (!Number.isFinite(decoded.sampleRate) || decoded.sampleRate <= 0) {
    throw new AudioConditioningError('INVALID_PCM', `Invalid PCM sample rate: ${decoded.sampleRate}`);
  }
  if (decoded.channelData.length < 1 || decoded.channelData.length > 2) {
    throw new AudioConditioningError(
      'UNSUPPORTED_CHANNELS',
      `Music inspection supports mono or stereo PCM, received ${decoded.channelData.length} channels`,
    );
  }

  const sourceSamples = Math.min(...decoded.channelData.map((channel) => channel.length));
  const sourceDurationSeconds = sourceSamples / decoded.sampleRate;
  if (!Number.isFinite(sourceDurationSeconds) || sourceDurationSeconds < MIN_MUSIC_DURATION_SECONDS) {
    throw new AudioConditioningError(
      'INVALID_PCM',
      `Decoded music is too short to inspect safely (${sourceDurationSeconds.toFixed(3)}s)`,
    );
  }
  if (sourceDurationSeconds > MAX_DURATION_SECONDS) {
    throw new AudioConditioningError(
      'INVALID_PCM',
      `Music inspection supports sources up to ${MAX_DURATION_SECONDS}s, received ${sourceDurationSeconds.toFixed(3)}s`,
    );
  }

  const measurements = await measureAudio(buffer);
  if (measurements.integratedLufs <= SILENCE_THRESHOLD_LUFS) {
    throw new AudioConditioningError(
      'AUDIO_SILENT',
      `Source audio measured ${measurements.integratedLufs.toFixed(1)} LUFS (silence threshold ${SILENCE_THRESHOLD_LUFS} LUFS)`,
    );
  }
  if (!Number.isFinite(measurements.truePeakDbtp)) {
    throw new AudioConditioningError('FFMPEG_FAILED', 'FFmpeg returned no finite true-peak measurement');
  }

  return {
    durationMs: sourceDurationSeconds * 1000,
    sampleRate: decoded.sampleRate,
    channels: decoded.channelData.length,
    measuredLufs: measurements.integratedLufs,
    truePeakDbtp: measurements.truePeakDbtp,
    clippingRisk: measurements.truePeakDbtp > 0,
  };
}

function validateTimeline(targetFrames: number, fps: number): void {
  if (!Number.isInteger(targetFrames) || targetFrames <= 0) {
    throw new AudioConditioningError('INVALID_REQUEST', `targetFrames must be a positive integer, received ${targetFrames}`);
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new AudioConditioningError('INVALID_REQUEST', `fps must be positive, received ${fps}`);
  }
}

async function measureAudio(
  buffer: Buffer,
  pcm?: { sampleRate: number; channels: number },
): Promise<AudioMeasurements> {
  const inputArgs = pcm
    ? ['-f', 'f32le', '-ar', String(pcm.sampleRate), '-ac', String(pcm.channels)]
    : [];
  const result = await runFfmpeg([
    '-hide_banner',
    '-nostats',
    ...inputArgs,
    '-i', 'pipe:0',
    '-filter_complex', 'ebur128=peak=true:framelog=verbose',
    '-f', 'null',
    '-',
  ], buffer);
  const integratedMatches = [...result.stderr.matchAll(/\bI:\s*(-?\d+(?:\.\d+)?)\s+LUFS/g)];
  const peakMatches = [...result.stderr.matchAll(/\bPeak:\s*(-?(?:\d+(?:\.\d+)?|inf))\s+dBFS/g)];
  const integratedLufs = Number(integratedMatches.at(-1)?.[1]);
  const peakText = peakMatches.at(-1)?.[1];
  const truePeakDbtp = peakText === '-inf' ? Number.NEGATIVE_INFINITY : Number(peakText);
  if (!Number.isFinite(integratedLufs)) {
    throw new AudioConditioningError('FFMPEG_FAILED', `FFmpeg returned no integrated LUFS measurement: ${result.stderr.slice(-1_000)}`);
  }
  return { integratedLufs, truePeakDbtp };
}

function validateOutputMeasurements(
  measurements: AudioMeasurements,
  targetLufs: number,
  targetTruePeakDbtp: number,
): void {
  if (measurements.integratedLufs <= SILENCE_THRESHOLD_LUFS) {
    throw new AudioConditioningError('AUDIO_SILENT', 'Conditioned audio is silent');
  }
  if (Math.abs(measurements.integratedLufs - targetLufs) > 1) {
    throw new AudioConditioningError(
      'LOUDNESS_OUT_OF_RANGE',
      `Conditioned audio measured ${measurements.integratedLufs.toFixed(1)} LUFS; target is ${targetLufs} LUFS`,
    );
  }
  if (!Number.isFinite(measurements.truePeakDbtp) || measurements.truePeakDbtp > targetTruePeakDbtp + 0.1) {
    throw new AudioConditioningError(
      'TRUE_PEAK_EXCEEDED',
      `Conditioned audio true peak ${measurements.truePeakDbtp} dBTP exceeds ${targetTruePeakDbtp} dBTP`,
    );
  }
}

function runFfmpeg(args: string[], input: Buffer): Promise<FfmpegResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(getFFmpegPath(), args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new AudioConditioningError('FFMPEG_TIMEOUT', `FFmpeg exceeded ${FFMPEG_TIMEOUT_MS}ms`));
    }, FFMPEG_TIMEOUT_MS);
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_FFMPEG_OUTPUT_BYTES) {
        child.kill();
        fail(new AudioConditioningError('OUTPUT_TOO_LARGE', `FFmpeg output exceeded ${MAX_FFMPEG_OUTPUT_BYTES} bytes`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBytes >= MAX_STDERR_BYTES) return;
      const remaining = MAX_STDERR_BYTES - stderrBytes;
      const bounded = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      stderr.push(bounded);
      stderrBytes += bounded.length;
    });
    child.on('error', (error) => fail(new AudioConditioningError('FFMPEG_FAILED', error.message, { cause: error })));
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE' && error.code !== 'EOF') {
        fail(new AudioConditioningError('FFMPEG_FAILED', error.message, { cause: error }));
      }
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const stderrText = Buffer.concat(stderr).toString('utf8');
      if (code !== 0) {
        reject(new AudioConditioningError('FFMPEG_FAILED', `FFmpeg exited with ${code}: ${stderrText.slice(-1_000)}`));
        return;
      }
      resolve({ stdout: Buffer.concat(stdout), stderr: stderrText });
    });

    try {
      child.stdin.end(input);
    } catch (error) {
      fail(new AudioConditioningError('FFMPEG_FAILED', 'Unable to stream input to FFmpeg', { cause: error }));
    }
  });
}
