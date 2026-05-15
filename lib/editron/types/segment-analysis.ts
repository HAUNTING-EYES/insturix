/**
 * SegmentAnalysis — One source of truth for Mode 2 per-segment analysis.
 *
 * Merges 5 separate analysis sources into a single queryable structure:
 *   1. RawFootageAnalysis (transcript, segments, content type)
 *   2. SyntheticStoryboard (VU global visual context)
 *   3. VjepaAnalysisResult (per-segment visual significance)
 *   4. Wav2VecAnalysisResult (per-segment vocal emotion)
 *   5. MomentWeightMap (combined weights)
 *
 * Built by segment-analysis-builder.ts after all sources are available.
 * Stored on the MongoDB project doc as `segmentAnalysis`.
 * Consumed by Director Agent Path D via signal-registry.
 */

import type { VjepaActionType, VjepaMotionType, VjepaFaceEmotion } from '../services/vjepa-service';
import type { EmotionalValence } from '../services/wav2vec-service';
import type { VisualSetup } from '../services/video-understanding-service';

// ─── Per-Segment Record ────────────────────────────────────────

export interface SegmentRecord {
  index: number;
  startMs: number;
  endMs: number;

  transcript: {
    text: string;
    wordCount: number;
    fillerCount: number;
    silenceGapCount: number;
    avgWordGapMs: number;
  };

  visual: {
    significance: number;
    motionIntensity: number;
    actionType: VjepaActionType;
    motionType: VjepaMotionType;
    faceEmotion: VjepaFaceEmotion | null;
    eyeContact: boolean | null;
  } | null;

  vocal: {
    emotionIntensity: number;
    emotionalValence: EmotionalValence;
    energy: number;
    pitchVariability: number;
    stressDetected: boolean;
    fillerConfidence: number;
  } | null;

  weight: {
    finalWeight: number;
    sources: {
      gemini: number | null;
      vjepa: number | null;
      wav2vec: number | null;
      thompsonAdjustment: number;
      emlOverride: number | null;
    };
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  };
}

// ─── Global Context ────────────────────────────────────────────

export interface SegmentAnalysisGlobalContext {
  visualSetup: VisualSetup | null;
  contentType: string;
  platform: string;
  colorGrade: string;
  pacing: string;
  narrativeArc: string;
}

// ─── Root Type ─────────────────────────────────────────────────

export interface SegmentAnalysis {
  version: 1;
  globalContext: SegmentAnalysisGlobalContext;
  segments: SegmentRecord[];
  defaultWeight: number;
  meta: {
    builtAt: string;
    hasVjepa: boolean;
    hasWav2vec: boolean;
    momentWeightPhase: 0 | 1 | 2 | 3;
    segmentCount: number;
    originalDurationMs: number;
    estimatedCleanDurationMs: number;
  };
}
