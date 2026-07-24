import { analyzeBeatsFull } from './media/beat-detection-service';
import type { BeatAnalysis } from './media/types';

export interface AnalyzedMusicBeat {
  frame: number;
  isDownbeat: boolean;
}

export interface AnalyzedMusicBeatGrid {
  bpm: number;
  bpmConfidence: number;
  beats: AnalyzedMusicBeat[];
  downbeats: number[];
  firstBeatOffsetFrames: number;
  source: 'audio-analysis';
}

export interface ConditionedMusicBeatEvidence {
  beatAnalysis: BeatAnalysis;
  beatGrid: AnalyzedMusicBeatGrid;
}

export type MusicBeatGridErrorCode =
  | 'INVALID_ANALYSIS_INPUT'
  | 'AUDIO_DECODE_FAILED'
  | 'INSUFFICIENT_BEAT_EVIDENCE'
  | 'INVALID_BEAT_GRID';

export class MusicBeatGridError extends Error {
  constructor(
    readonly code: MusicBeatGridErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MusicBeatGridError';
  }
}

/**
 * Analyze the exact conditioned bytes that will be rendered. Callers must not
 * substitute URL metadata or a requested BPM: those describe intent, not the
 * timing of the delivered waveform.
 */
export async function analyzeConditionedMusicBeatGrid(params: {
  buffer: Uint8Array;
  fps: number;
  totalFrames: number;
}): Promise<ConditionedMusicBeatEvidence> {
  const { buffer, fps, totalFrames } = params;
  if (
    !(buffer instanceof Uint8Array)
    || buffer.byteLength === 0
    || !Number.isFinite(fps)
    || fps <= 0
    || !Number.isSafeInteger(totalFrames)
    || totalFrames <= 0
  ) {
    throw new MusicBeatGridError(
      'INVALID_ANALYSIS_INPUT',
      'Conditioned music beat analysis requires non-empty bytes, positive FPS, and positive integer frames',
    );
  }

  let decoded;
  try {
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
    const decode = (await import('audio-decode')).default;
    decoded = await decode(arrayBuffer);
  } catch (error) {
    throw new MusicBeatGridError(
      'AUDIO_DECODE_FAILED',
      'Conditioned music could not be decoded for beat analysis',
      { cause: error },
    );
  }

  const channelData = Array.isArray(decoded?.channelData) ? decoded.channelData : [];
  const primaryChannel = channelData[0];
  if (
    !Number.isFinite(decoded?.sampleRate)
    || decoded.sampleRate <= 0
    || !(primaryChannel instanceof Float32Array)
    || primaryChannel.length === 0
  ) {
    throw new MusicBeatGridError(
      'AUDIO_DECODE_FAILED',
      'Decoded conditioned music did not contain valid PCM channels',
    );
  }

  const beatAnalysis = await analyzeBeatsFull({
    sampleRate: decoded.sampleRate,
    length: primaryChannel.length,
    numberOfChannels: channelData.length,
    getChannelData: (channel: number) => channelData[channel] ?? primaryChannel,
    duration: primaryChannel.length / decoded.sampleRate,
  });

  if (
    !Array.isArray(beatAnalysis.beats)
    || beatAnalysis.beats.length === 0
    || !Number.isFinite(beatAnalysis.bpm)
    || beatAnalysis.bpm <= 0
    || !Number.isFinite(beatAnalysis.bpmConfidence)
    || beatAnalysis.bpmConfidence <= 0
    || beatAnalysis.bpmConfidence > 1
  ) {
    throw new MusicBeatGridError(
      'INSUFFICIENT_BEAT_EVIDENCE',
      'Conditioned music did not produce a trustworthy onset-derived beat grid',
    );
  }

  const beats = beatAnalysis.beats.map((beat) => ({
    frame: Math.round((beat.timeMs / 1_000) * fps),
    isDownbeat: beat.isDownbeat === true,
  }));
  const invalidBeatIndex = beats.findIndex((beat, index) => (
    !Number.isSafeInteger(beat.frame)
    || beat.frame < 0
    || beat.frame >= totalFrames
    || (index > 0 && beat.frame <= beats[index - 1].frame)
  ));
  if (invalidBeatIndex >= 0) {
    throw new MusicBeatGridError(
      'INVALID_BEAT_GRID',
      `Conditioned music produced an invalid beat at index ${invalidBeatIndex}`,
    );
  }

  return {
    beatAnalysis,
    beatGrid: {
      bpm: beatAnalysis.bpm,
      bpmConfidence: beatAnalysis.bpmConfidence,
      beats,
      downbeats: beats.filter(beat => beat.isDownbeat).map(beat => beat.frame),
      firstBeatOffsetFrames: beats[0].frame,
      source: 'audio-analysis',
    },
  };
}
