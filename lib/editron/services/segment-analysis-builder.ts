/**
 * Segment Analysis Builder — merges 5 analysis sources into one unified type.
 *
 * Pure function. No DB calls, no side effects, no service imports.
 * Takes the raw outputs from each analysis stage and aligns them
 * by time range into SegmentRecord[] keyed to transcript segments.
 */

import type { RawFootageAnalysis } from './raw-footage-processor';
import type { SyntheticStoryboard } from './video-understanding-service';
import type { VjepaAnalysisResult, VjepaSegmentResult } from './vjepa-service';
import type { Wav2VecAnalysisResult, Wav2VecSegmentResult } from './wav2vec-service';
import type { MomentWeightMap, MomentWeight } from './moment-weight-service';
import type { SegmentAnalysis, SegmentRecord, SegmentAnalysisGlobalContext } from '../types/segment-analysis';

// ─── Time-Range Alignment ──────────────────────────────────────
// Same linear scan as signal-registry.ts:162-187.

function findVjepaAt(
  segments: VjepaSegmentResult[] | undefined,
  startMs: number,
  endMs: number,
): VjepaSegmentResult | null {
  if (!segments?.length) return null;
  const midMs = (startMs + endMs) / 2;
  for (const seg of segments) {
    if (midMs >= seg.startMs && midMs < seg.endMs) return seg;
  }
  const last = segments[segments.length - 1];
  if (midMs >= last.startMs && midMs <= last.endMs) return last;
  return null;
}

function findWav2VecAt(
  segments: Wav2VecSegmentResult[] | undefined,
  startMs: number,
  endMs: number,
): Wav2VecSegmentResult | null {
  if (!segments?.length) return null;
  const midMs = (startMs + endMs) / 2;
  for (const seg of segments) {
    if (midMs >= seg.startMs && midMs < seg.endMs) return seg;
  }
  const last = segments[segments.length - 1];
  if (midMs >= last.startMs && midMs <= last.endMs) return last;
  return null;
}

function findWeightAt(
  weights: MomentWeight[] | undefined,
  startMs: number,
  endMs: number,
): MomentWeight | null {
  if (!weights?.length) return null;
  const midMs = (startMs + endMs) / 2;
  for (const w of weights) {
    if (midMs >= w.segment_start_ms && midMs < w.segment_end_ms) return w;
  }
  const last = weights[weights.length - 1];
  if (midMs >= last.segment_start_ms && midMs <= last.segment_end_ms) return last;
  return null;
}

// ─── Global Context Builder ────────────────────────────────────

function buildGlobalContext(
  storyboard: SyntheticStoryboard | null,
  rawFootage: RawFootageAnalysis,
): SegmentAnalysisGlobalContext {
  const ged = storyboard?.globalEditDirections;
  return {
    visualSetup: storyboard?.visualSetup ?? null,
    contentType: rawFootage.contentTypeDetection?.contentType
      ?? storyboard?.contentType
      ?? 'unknown',
    platform: storyboard?.platform ?? 'general',
    colorGrade: ged?.colorGrade ?? 'neutral',
    pacing: ged?.pacing ?? 'medium',
    narrativeArc: ged?.narrativeArc ?? 'three-act',
  };
}

// ─── Default Weight Record ─────────────────────────────────────

const DEFAULT_WEIGHT_RECORD: SegmentRecord['weight'] = {
  finalWeight: 0.5,
  sources: {
    gemini: null,
    vjepa: null,
    wav2vec: null,
    thompsonAdjustment: 0,
    emlOverride: null,
  },
  confidence: 'low',
  reason: 'no moment weight data available',
};

function buildVjepaMeta(vjepa: VjepaAnalysisResult | null): Pick<SegmentAnalysis['meta'],
  | 'hasVjepa'
  | 'vjepaStatus'
  | 'vjepaRequestedSegmentCount'
  | 'vjepaAnalyzedSegmentCount'
  | 'vjepaDroppedSegmentCount'
  | 'vjepaCoverageRatio'
  | 'vjepaFailedBatchCount'
> {
  const analyzed = Math.max(0, Math.floor(vjepa?.analyzedSegmentCount ?? vjepa?.segments?.length ?? 0));
  const requested = Math.max(0, Math.floor(vjepa?.requestedSegmentCount ?? analyzed));
  const dropped = Math.max(0, Math.floor(vjepa?.droppedSegmentCount ?? Math.max(0, requested - analyzed)));
  const coverageRatio = requested > 0
    ? clamp01(vjepa?.coverageRatio ?? analyzed / requested)
    : null;
  const partial = !!vjepa?.partial || dropped > 0 || (coverageRatio != null && coverageRatio < 1);

  return {
    hasVjepa: analyzed > 0,
    vjepaStatus: analyzed <= 0 ? 'absent' : partial ? 'partial' : 'complete',
    vjepaRequestedSegmentCount: requested,
    vjepaAnalyzedSegmentCount: analyzed,
    vjepaDroppedSegmentCount: dropped,
    vjepaCoverageRatio: coverageRatio,
    vjepaFailedBatchCount: Math.max(0, Math.floor(vjepa?.failedBatchCount ?? 0)),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// ─── Main Builder ──────────────────────────────────────────────

export function buildSegmentAnalysis(
  rawFootage: RawFootageAnalysis | null,
  storyboard: SyntheticStoryboard | null,
  vjepa: VjepaAnalysisResult | null,
  wav2vec: Wav2VecAnalysisResult | null,
  momentWeights: MomentWeightMap | null,
): SegmentAnalysis | null {
  if (!rawFootage?.segments?.length) return null;

  const segments: SegmentRecord[] = rawFootage.segments.map((seg, i) => {
    const vjepaSeg = findVjepaAt(vjepa?.segments, seg.startMs, seg.endMs);
    const wav2vecSeg = findWav2VecAt(wav2vec?.segments, seg.startMs, seg.endMs);
    const weightSeg = findWeightAt(momentWeights?.weights, seg.startMs, seg.endMs);

    return {
      index: i,
      startMs: seg.startMs,
      endMs: seg.endMs,

      transcript: {
        text: seg.text,
        wordCount: seg.wordCount,
        fillerCount: seg.fillerCount,
        silenceGapCount: seg.silenceGapCount,
        avgWordGapMs: seg.avgWordGapMs,
      },

      visual: vjepaSeg ? {
        significance: vjepaSeg.visualSignificance,
        motionIntensity: vjepaSeg.motionIntensity,
        actionType: vjepaSeg.actionType,
        motionType: vjepaSeg.motionType,
        faceEmotion: vjepaSeg.faceEmotion,
        eyeContact: vjepaSeg.eyeContact,
        motionVectorX: vjepaSeg.motionVectorX,
        motionVectorY: vjepaSeg.motionVectorY,
        mainSubject: vjepaSeg.mainSubject,
        mainSubjectX: vjepaSeg.mainSubjectX,
        mainSubjectY: vjepaSeg.mainSubjectY,
        mainSubjectWidth: vjepaSeg.mainSubjectWidth,
        mainSubjectHeight: vjepaSeg.mainSubjectHeight,
        textBoxes: vjepaSeg.textBoxes,
        textBoxCount: vjepaSeg.textBoxCount,
        textCoverage: vjepaSeg.textCoverage,
        objectCount: vjepaSeg.objectCount,
        faceCount: vjepaSeg.faceCount,
        negativeSpaceTop: vjepaSeg.negativeSpaceTop,
        negativeSpaceRight: vjepaSeg.negativeSpaceRight,
        negativeSpaceBottom: vjepaSeg.negativeSpaceBottom,
        negativeSpaceLeft: vjepaSeg.negativeSpaceLeft,
        primitivePresence: vjepaSeg.primitivePresence,
      } : null,

      vocal: wav2vecSeg ? {
        emotionIntensity: wav2vecSeg.emotionIntensity,
        emotionalValence: wav2vecSeg.emotionalValence,
        energy: wav2vecSeg.energy,
        pitchVariability: wav2vecSeg.pitchVariability,
        stressDetected: wav2vecSeg.stressDetected,
        fillerConfidence: wav2vecSeg.fillerConfidence,
      } : null,

      weight: weightSeg ? {
        finalWeight: weightSeg.final_weight,
        sources: {
          gemini: weightSeg.sources.gemini,
          vjepa: weightSeg.sources.vjepa,
          wav2vec: weightSeg.sources.wav2vec,
          thompsonAdjustment: weightSeg.sources.thompson_adjustment,
          emlOverride: weightSeg.sources.eml_override,
        },
        confidence: weightSeg.confidence,
        reason: weightSeg.reason,
      } : DEFAULT_WEIGHT_RECORD,
    };
  });

  const vjepaMeta = buildVjepaMeta(vjepa);

  return {
    version: 1,
    globalContext: buildGlobalContext(storyboard, rawFootage),
    segments,
    defaultWeight: momentWeights?.default_weight ?? 0.5,
    meta: {
      builtAt: new Date().toISOString(),
      ...vjepaMeta,
      hasWav2vec: !!wav2vec?.segments?.length,
      momentWeightPhase: momentWeights?.computation_phase ?? 0,
      segmentCount: segments.length,
      originalDurationMs: rawFootage.originalDurationMs,
      estimatedCleanDurationMs: rawFootage.estimatedCleanDurationMs,
    },
  };
}
