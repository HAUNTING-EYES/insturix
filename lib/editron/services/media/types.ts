/**
 * Media Services - Shared Types
 * 
 * Common interfaces used across transcription, audio analysis, and caption services.
 * These types are the contract between services and their consumers (AI tools, UI).
 */

import type { CaptionWord } from '@/components/editron/editor/version-7.0.0/types';

// ============================================================================
// TRANSCRIPTION
// ============================================================================

/**
 * Word-level transcription data with 0-based timestamps (relative to video start)
 */
export interface TranscriptionWord {
  word: string;
  startMs: number;  // 0-based, relative to video start
  endMs: number;    // 0-based, relative to video start
  confidence: number;
}

/**
 * Complete transcription result stored in MediaAsset
 */
export interface TranscriptionData {
  words: TranscriptionWord[];
  transcript: string;
  language: string;
  confidence: number;
  generatedAt: Date;
}

/**
 * Options for transcription requests
 */
export interface TranscriptionOptions {
  forceRefresh?: boolean;
  language?: string;
}

// ============================================================================
// AUDIO ANALYSIS
// ============================================================================

/**
 * A gap in speech (silence between words)
 */
export interface SilenceGap {
  startMs: number;
  endMs: number;
  durationMs: number;
  /** Word before the gap (for context) */
  beforeWord?: string;
  /** Word after the gap (for context) */
  afterWord?: string;
}

/**
 * Detected filler word with context
 */
export interface DetectedFiller {
  word: string;
  startMs: number;
  endMs: number;
  /** True if there's significant silence around this filler */
  hasSurroundingSilence: boolean;
  /** Total duration including surrounding silence */
  totalGapMs: number;
}

/**
 * A segment that's a candidate for removal
 */
export interface ProblematicSegment {
  startMs: number;
  endMs: number;
  reason: 'filler_with_silence' | 'long_silence' | 'repeated_filler';
  severity: 'low' | 'medium' | 'high';
  /** Human-readable description for LLM */
  description: string;
}

/**
 * Complete audio content analysis result
 */
export interface ContentAnalysis {
  silences: any;
  fillers: any;
  silenceGaps: SilenceGap[];
  fillerWords: DetectedFiller[];
  problematicSegments: ProblematicSegment[];
  summary: {
    totalSilenceMs: number;
    totalFillerWords: number;
    problematicCount: number;
    /** Estimated time that could be saved by removing all problematic segments */
    potentialSavingsMs: number;
  };
}

/**
 * Options for audio analysis
 */
export interface AudioAnalysisOptions {
  /** Minimum gap duration to flag as silence (default: 2000ms) */
  silenceThresholdMs?: number;
  /** Whether to detect filler words (default: true) */
  detectFillers?: boolean;
}

// ============================================================================
// BEAT DETECTION
// ============================================================================

/**
 * A single detected beat with timing, strength, and downbeat marker
 */
export interface Beat {
  /** Timestamp of the beat in ms (0-based relative to audio start) */
  timeMs: number;
  /** Beat strength/confidence 0..1 (derived from spectral flux magnitude) */
  strength: number;
  /** Whether this beat falls on a detected downbeat (first beat of a bar) */
  isDownbeat: boolean;
}

/**
 * Complete beat analysis result from audio processing
 */
export interface BeatAnalysis {
  /** Detected beats sorted by timeMs */
  beats: Beat[];
  /** Estimated tempo in BPM */
  bpm: number;
  /** Confidence of BPM estimate 0..1 — exposed in UI for manual override decision */
  bpmConfidence: number;
  /** Duration of the analyzed audio in ms */
  durationMs: number;
  /** Time signature numerator (default 4) */
  timeSignatureNumerator: number;
  /** Energy peaks — strongest amplitude moments, beat-locked (snapped to nearest beat) */
  energyPeaks: { timeMs: number; magnitude: number }[];
  /** Raw onset data preserved for re-quantization on BPM override */
  rawOnsets: { timeMs: number; strength: number }[];
}

/**
 * Options for selecting which beats to use as cut points
 */
export interface BeatSyncOptions {
  /** Which beats to use: 'all' | 'downbeats' | 'strong' (strength > threshold) */
  beatFilter: 'all' | 'downbeats' | 'strong';
  /** Minimum strength when beatFilter is 'strong' (0..1, default 0.6) */
  strengthThreshold?: number;
  /** Tolerance in ms for snapping energy peaks to beats (default 50) */
  snapToleranceMs?: number;
  /** Whether to include energy peaks as cut candidates */
  includeEnergyPeaks?: boolean;
}

/**
 * Options for the beat detection algorithm
 */
export interface BeatDetectionOptions {
  /** FFT window size (default 2048) */
  fftSize?: number;
  /** Hop size between FFT frames (default 512) */
  hopSize?: number;
  /** Minimum BPM to consider (default 40) */
  minBPM?: number;
  /** Maximum BPM to consider (default 240) */
  maxBPM?: number;
  /** Time signature numerator (default 4) */
  timeSignature?: number;
  /** Number of top energy peaks to detect (default 20) */
  topEnergyPeaks?: number;
  /** Snap tolerance for energy peak beat-locking (default 50ms) */
  energySnapToleranceMs?: number;
}

// ============================================================================
// CAPTION
// ============================================================================

/**
 * Available caption style presets
 */
export type CaptionStylePreset = 'tiktok' | 'minimal' | 'bold' | 'karaoke' | 'subtitle';

/**
 * Caption position presets
 */
export type CaptionPosition = 'bottom' | 'top' | 'center';

/**
 * Options for caption creation
 */
export interface CreateCaptionOptions {
  style?: CaptionStylePreset;
  position?: CaptionPosition;
}

// ============================================================================
// TIMELINE CONVERSION
// ============================================================================

/**
 * Context needed to convert 0-based timestamps to timeline frames
 */
export interface TimelineContext {
  /** Frame where clip starts on timeline */
  clipFrom: number;
  /** Offset into source video (seconds) */
  videoStartTime: number;
  /** Frames per second */
  fps: number;
}

/**
 * Convert milliseconds to timeline frame
 */
export function msToTimelineFrame(
  ms: number, 
  context: TimelineContext
): number {
  const { clipFrom, videoStartTime, fps } = context;
  // Adjust for videoStartTime offset and convert to frames
  const adjustedMs = ms - (videoStartTime * 1000);
  const frameOffset = Math.round((adjustedMs / 1000) * fps);
  return clipFrom + frameOffset;
}

/**
 * Convert timeline frame to source video milliseconds
 */
export function timelineFrameToMs(
  frame: number,
  context: TimelineContext
): number {
  const { clipFrom, videoStartTime, fps } = context;
  const frameOffset = frame - clipFrom;
  const offsetMs = (frameOffset / fps) * 1000;
  return offsetMs + (videoStartTime * 1000);
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Common filler words to detect in transcriptions
 */
export const FILLER_WORDS = [
  'um', 'uh', 'uhm', 'umm', 'uhh',
  'like',
  'you know',
  'basically',
  'actually',
  'literally',
  'right',
  'so',
  'i mean',
  'kind of',
  'sort of',
] as const;

/**
 * Default configuration values
 */
export const DEFAULTS = {
  SILENCE_THRESHOLD_MS: 2000,
  MIN_SURROUNDING_SILENCE_MS: 500,  // Silence around filler to flag as problematic
  FPS: 30,
} as const;
