/**
 * Signal Registry — Dual-Timing Signal Collection for Mode 2
 *
 * Collects all signal values from 5-Track Analysis + RawFootageAnalysis + transcript
 * + V-JEPA visual features + Wav2Vec vocal emotion into a queryable time-indexed structure.
 *
 * THREE data sources:
 *   Primary: 5-Track Analysis (Gemini Vision) + RawFootageAnalysis (transcript)
 *   V-JEPA 2: Learned visual features — significance, motion, action, face emotion, eye contact
 *   Wav2Vec 2.0: Vocal prosodic features — emotion intensity, valence, energy, pitch, stress
 *
 * TWO timing systems (FLAG 1):
 *   Grid-based (every 15 frames / 0.5s): continuous signals (energy, motion, color, etc.)
 *   Event-based (exact word timestamps): transcript signals (entities, emphasis, boundaries)
 *
 * TWO computation passes (FLAG 7):
 *   Pass 1: All basic signals computed (V-JEPA/Wav2Vec REPLACE heuristics when available)
 *   Pass 2: Composite signals computed FROM basic signals (reads neighboring points)
 *
 * ENRICHMENT STRATEGY:
 *   When V-JEPA/Wav2Vec data is present, learned signals REPLACE heuristic approximations
 *   and NEW signal keys are added for graph mappings previously tagged NEEDS_INFRA.
 *   When absent, existing heuristic signals remain (graceful degradation).
 *
 * Consumers: signal-executor.ts
 */

import type { SignalValues } from './graph-query';
import type { VjepaAnalysisResult, VjepaSegmentResult } from './vjepa-service';
import type { Wav2VecAnalysisResult, Wav2VecSegmentResult } from './wav2vec-service';

// ─── Input Types (from existing services) ───────────────────────────────────

/** From five-track-analysis.ts */
export interface AssetAnalysis {
  shots?: Array<{ startFrame: number; endFrame: number; durationMs: number }>;
  motionSegments?: Array<{ startFrame: number; endFrame: number; type: string; intensity: number }>;
  motionPeaks?: number[];
  audio?: {
    beats?: number[];
    silences?: Array<{ startMs: number; endMs: number; durationMs: number }>;
    energyCurve?: Array<{ timestampMs: number; energy: number }>;
    transients?: number[];
  };
  keyframeAnalyses?: Array<{
    frameNumber: number;
    shotType?: string;
    cameraAngle?: string;
    dominantColors?: string[];
    brightness?: number;
    moodScore?: number;
    energyLevel?: string;
    naturalCutPoint?: boolean;
  }>;
  subjectTracks?: Array<{
    subjectId: string;
    category: string;
    totalScreenTimeMs: number;
  }>;
  speechSegments?: Array<{
    startMs: number;
    endMs: number;
    text: string;
    contentType?: string;
    suggestedGraphicType?: string;
    entities?: string[];
  }>;
  musicStructure?: {
    bpm?: number;
    key?: string;
    sections?: Array<{ type: string; startMs: number; endMs: number }>;
    energyCurve?: Array<{ timestampMs: number; energy: number }>;
    drops?: number[];
    builds?: number[];
  };
  analysisQuality?: string;
  confidenceBreakdown?: Record<string, number>;
}

/** From raw-footage-processor.ts */
export interface RawFootageAnalysis {
  transcription?: {
    words: Array<{ word: string; startMs: number; endMs: number; speaker?: number }>;
  };
  silenceGaps?: Array<{ startMs: number; endMs: number; durationMs: number }>;
  fillerWords?: Array<{ word: string; startMs: number; endMs: number; hasSurroundingSilence: boolean }>;
  segments?: Array<{
    text: string;
    startMs: number;
    endMs: number;
    fillerCount: number;
    silenceGapCount: number;
    avgWordGapMs: number;
  }>;
  contentTypeDetection?: {
    contentType: string;
    confidence: number;
    profileId: string;
  };
  estimatedCleanDurationMs?: number;
  originalDurationMs?: number;
}

/** From overlay types */
export interface OverlayInfo {
  id: string;
  type: string;
  from: number;         // start frame
  durationInFrames: number;
  row?: number;
  assetId?: string;
}

// ─── Output Types ───────────────────────────────────────────────────────────

export interface SignalSnapshot extends SignalValues {
  frame: number;
  timestampMs: number;
}

export interface EventSignal {
  timestampMs: number;
  frame: number;
  signal: string;
  value: number | boolean | string;
  context?: string;  // e.g., the actual word/phrase for entity signals
}

export interface SignalTimeline {
  /** Continuous signals sampled every 15 frames */
  gridSignals: Map<number, SignalSnapshot>;
  /** Transcript signals at exact word timestamps */
  eventSignals: EventSignal[];
  /** Non-time-varying signals (content type, formality, etc.) */
  globalSignals: SignalValues;
  /** Metadata */
  fps: number;
  totalFrames: number;
  gridInterval: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const GRID_INTERVAL_FRAMES = 15; // 0.5s at 30fps
const DEFAULT_FPS = 30;

// Emphasis detection thresholds
const EMPHASIS_VOLUME_MULTIPLIER = 1.5;
const EMPHASIS_DURATION_MULTIPLIER = 1.1;

// Entity patterns (simple NER for transcript — no LLM)
const NUMBER_PATTERN = /\b\d+[%$€£]?|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion)\b/i;
const CTA_PATTERNS = /\b(?:subscribe|sign up|click|visit|download|get started|try|buy|order|join|follow|like|share|comment|check out|link in|head to|go to)\b/i;
const QUESTION_PATTERN = /\?\s*$/;
const HEDGED_PATTERNS = /\b(?:maybe|perhaps|around|about|roughly|approximately|could be|might be|probably|I think|it seems)\b/i;
const NAME_PATTERN = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/; // "John Smith", "Apple Inc"

// ─── V-JEPA / Wav2Vec Segment Lookup ───────────────────────────────────────
// Both services produce segments with startMs/endMs. Grid points may fall
// anywhere within a segment. Binary-style search finds the containing segment.

function findVjepaSegmentAt(
  segments: VjepaSegmentResult[] | undefined,
  timestampMs: number
): VjepaSegmentResult | null {
  if (!segments?.length) return null;
  for (const seg of segments) {
    if (timestampMs >= seg.startMs && timestampMs < seg.endMs) return seg;
  }
  // Edge case: timestampMs exactly at last segment's endMs
  const last = segments[segments.length - 1];
  if (timestampMs >= last.startMs && timestampMs <= last.endMs) return last;
  return null;
}

function findWav2VecSegmentAt(
  segments: Wav2VecSegmentResult[] | undefined,
  timestampMs: number
): Wav2VecSegmentResult | null {
  if (!segments?.length) return null;
  for (const seg of segments) {
    if (timestampMs >= seg.startMs && timestampMs < seg.endMs) return seg;
  }
  const last = segments[segments.length - 1];
  if (timestampMs >= last.startMs && timestampMs <= last.endMs) return last;
  return null;
}

// ─── Main Builder ───────────────────────────────────────────────────────────

/**
 * Build the complete signal timeline from all available analysis data.
 * This is the main entry point for the signal-driven executor.
 *
 * Optional V-JEPA/Wav2Vec data enriches signals when available:
 *   - V-JEPA: replaces heuristic visual.motion_intensity, adds visual.significance,
 *             visual.action_type, visual.motion_type, visual.face_emotion, visual.eye_contact
 *   - Wav2Vec: replaces heuristic speech.energy, adds speech.emotion_intensity,
 *              speech.emotional_valence, speech.pitch_variability, speech.stress_detected
 */
export function buildSignalTimeline(
  analyses: AssetAnalysis[],
  rawFootage: RawFootageAnalysis | null,
  overlays: OverlayInfo[],
  fps: number = DEFAULT_FPS,
  vjepaAnalysis?: VjepaAnalysisResult | null,
  wav2vecAnalysis?: Wav2VecAnalysisResult | null,
): SignalTimeline {
  const totalDurationMs = rawFootage?.originalDurationMs ?? rawFootage?.estimatedCleanDurationMs ?? 30000;
  const totalFrames = Math.ceil((totalDurationMs / 1000) * fps);
  const mergedAnalysis = mergeAnalyses(analyses);

  // Pre-extract segment arrays for enrichment (null-safe)
  const vjepaSegments = vjepaAnalysis?.segments;
  const wav2vecSegments = wav2vecAnalysis?.segments;
  const hasVjepa = (vjepaSegments?.length ?? 0) > 0;
  const hasWav2Vec = (wav2vecSegments?.length ?? 0) > 0;

  if (hasVjepa) console.log(`[SignalRegistry] V-JEPA enrichment: ${vjepaSegments!.length} segments`);
  if (hasWav2Vec) console.log(`[SignalRegistry] Wav2Vec enrichment: ${wav2vecSegments!.length} segments`);

  const timeline: SignalTimeline = {
    gridSignals: new Map(),
    eventSignals: [],
    globalSignals: {},
    fps,
    totalFrames,
    gridInterval: GRID_INTERVAL_FRAMES,
  };

  // ── PASS 1: Basic signals at grid points ──────────────────────────────

  for (let frame = 0; frame < totalFrames; frame += GRID_INTERVAL_FRAMES) {
    const timestampMs = (frame / fps) * 1000;
    const snapshot: SignalSnapshot = {
      frame,
      timestampMs,
    };

    // ── Speech signals (base from 5-Track) ──
    snapshot['speech.energy'] = getSpeechEnergyAt(mergedAnalysis, timestampMs);
    snapshot['speech.energy_delta'] = getSpeechEnergyDelta(mergedAnalysis, timestampMs);
    snapshot['speech.speaking_rate_wpm'] = getSpeakingRateAt(rawFootage, timestampMs);
    snapshot['speech.silence_duration_ms'] = getSilenceDurationAt(rawFootage, timestampMs);
    snapshot['speech.silence_normalized'] = Math.min(1, (snapshot['speech.silence_duration_ms'] as number) / 3000);
    snapshot['speech.coverage'] = getSpeechCoverageAt(rawFootage, timestampMs);

    // ── Wav2Vec enrichment: REPLACE heuristic speech.energy + ADD new speech signals ──
    // Wav2Vec semantic energy is superior to RMS amplitude from 5-Track energyCurve.
    // New signals: emotion_intensity, emotional_valence, pitch_variability, stress_detected
    // These fulfill graph nodes tagged NEEDS_INFRA (speech.emotional_valence etc.)
    if (hasWav2Vec) {
      const wav2vecSeg = findWav2VecSegmentAt(wav2vecSegments, timestampMs);
      if (wav2vecSeg) {
        // REPLACE: semantic energy > RMS heuristic
        snapshot['speech.energy'] = wav2vecSeg.energy;
        // ADD: new signals from vocal prosody (previously NEEDS_INFRA)
        snapshot['speech.emotion_intensity'] = wav2vecSeg.emotionIntensity;
        snapshot['speech.emotional_valence'] = wav2vecSeg.emotionalValence;
        snapshot['speech.pitch_variability'] = wav2vecSeg.pitchVariability;
        snapshot['speech.stress_detected'] = wav2vecSeg.stressDetected;
        snapshot['speech.filler_confidence'] = wav2vecSeg.fillerConfidence;
      }
    }

    // ── Visual signals (base from 5-Track) ──
    snapshot['visual.motion_intensity'] = getMotionIntensityAt(mergedAnalysis, frame);
    snapshot['visual.shot_scale'] = getShotScaleAt(mergedAnalysis, frame);
    snapshot['visual.face_present'] = getFacePresentAt(mergedAnalysis, frame);
    snapshot['visual.ai_artifact_risk'] = getAiArtifactRiskAt(mergedAnalysis, frame);
    snapshot['visual.scene_type'] = getSceneTypeAt(mergedAnalysis, frame);
    snapshot['visual.complexity'] = getVisualComplexityAt(mergedAnalysis, frame);
    snapshot['visual.text_on_screen'] = hasTextOnScreen(mergedAnalysis) ? 1 : 0;

    // ── V-JEPA enrichment: REPLACE heuristic visual.motion_intensity + ADD new visual signals ──
    // V-JEPA learned motion > optical flow heuristic. Action type, motion type, face emotion,
    // eye contact are entirely new capabilities. These fulfill 4 NEEDS_INFRA graph nodes.
    if (hasVjepa) {
      const vjepaSeg = findVjepaSegmentAt(vjepaSegments, timestampMs);
      if (vjepaSeg) {
        // REPLACE: learned motion intensity > 5-Track heuristic
        snapshot['visual.motion_intensity'] = vjepaSeg.motionIntensity;
        // ADD: visual significance (embedding divergence — key V-JEPA output)
        snapshot['visual.significance'] = vjepaSeg.visualSignificance;
        // ADD: semantic action classification (previously NEEDS_INFRA)
        snapshot['visual.action_type'] = vjepaSeg.actionType;
        // ADD: subject vs camera motion discrimination (previously NEEDS_INFRA)
        snapshot['visual.motion_type'] = vjepaSeg.motionType;
        // ADD: facial emotion from video features (previously NEEDS_INFRA)
        if (vjepaSeg.faceEmotion) {
          snapshot['visual.face_emotion'] = vjepaSeg.faceEmotion;
        }
        // ADD: eye contact / gaze tracking (previously NEEDS_INFRA)
        if (vjepaSeg.eyeContact !== null && vjepaSeg.eyeContact !== undefined) {
          snapshot['visual.eye_contact'] = vjepaSeg.eyeContact;
        }
        // Enrich scene_type with V-JEPA action semantics (more accurate than heuristic)
        if (vjepaSeg.actionType === 'talking' || vjepaSeg.actionType === 'still') {
          snapshot['visual.scene_type'] = 'talking-head';
        } else if (vjepaSeg.actionType === 'walking' || vjepaSeg.actionType === 'gesturing' || vjepaSeg.actionType === 'demonstrating') {
          snapshot['visual.scene_type'] = 'action';
        }
      }
    }

    // Audio signals
    snapshot['audio.music_energy'] = getMusicEnergyAt(mergedAnalysis, timestampMs);
    snapshot['audio.music_beat'] = isMusicBeatAt(mergedAnalysis, timestampMs) ? 1 : 0;
    snapshot['audio.music_tatum'] = isMusicTatumAt(mergedAnalysis, timestampMs) ? 1 : 0;
    snapshot['audio.music_section'] = getMusicSectionAt(mergedAnalysis, timestampMs);
    snapshot['audio.bpm'] = mergedAnalysis.musicStructure?.bpm ?? 0;

    // Structural signals
    snapshot['structural.position_in_video'] = frame / totalFrames;
    snapshot['structural.time_since_last_cut'] = getTimeSinceLastCut(overlays, frame, fps);
    snapshot['structural.active_overlays_count'] = getActiveOverlayCount(overlays, frame);
    snapshot['structural.cumulative_edit_density'] = getCumulativeEditDensity(overlays, frame, fps);

    // ── Phase 4: Visual intelligence signals (ADDITIVE — Phase 1C safe) ──

    // 4.3: Scene boundary detection from keyframe color histogram diff
    snapshot['visual.scene_change'] = getSceneChangeAt(mergedAnalysis, frame, fps);

    // 4.4a: Brightness stability — how stable is brightness between consecutive keyframes
    snapshot['visual.brightness_stability'] = getBrightnessStabilityAt(mergedAnalysis, frame);

    // 4.4b: Visual Engagement Score — composite from available sub-signals
    // Weights: eye_contact 0.3, visual_significance 0.25, motion 0.2, face_quality 0.15, brightness 0.1
    // ⚠️ INVENTED weights — need calibration (D-013)
    snapshot['visual.engagement'] = computeVES(snapshot);

    timeline.gridSignals.set(frame, snapshot);
  }

  // ── PASS 2: Composite + temporal-smoothed signals ───────────────────────
  // The creative doc marks some triggers with temporal modifiers:
  //   "speech_energy_delta > 0.15 over 2s window" → check rolling average, not instant
  //   "motion_intensity > 0.7 sustained 2+ seconds" → check minimum over window
  //   "music_energy delta > 0.2 over 4s window" → check rolling delta
  // These smoothed values replace the instantaneous values in the snapshot
  // so the trigger evaluator automatically uses the correct temporal semantics.

  const gridFrames = Array.from(timeline.gridSignals.keys()).sort((a, b) => a - b);
  for (const frame of gridFrames) {
    const snapshot = timeline.gridSignals.get(frame)!;
    const neighbors = getNeighborSnapshots(timeline.gridSignals, frame, GRID_INTERVAL_FRAMES, 4);

    // Temporal smoothing: replace instantaneous values with rolling window values.
    // "over 2s" = 4 sample points at 0.5s intervals
    // "sustained 2+" = minimum across 4 points (ALL must exceed threshold)
    // "over 4s" = 8 sample points
    const prevPoints = getNeighborSnapshots(timeline.gridSignals, frame, GRID_INTERVAL_FRAMES, 4)
      .filter(n => n.frame < frame); // only PREVIOUS points

    if (prevPoints.length >= 3) {
      // speech.energy_delta: doc says "over 2s window" → rolling average
      const deltaValues = prevPoints.map(n => (n['speech.energy_delta'] as number) ?? 0);
      deltaValues.push((snapshot['speech.energy_delta'] as number) ?? 0);
      snapshot['speech.energy_delta'] = deltaValues.reduce((s, v) => s + v, 0) / deltaValues.length;

      // visual.motion_intensity: doc says "sustained 2+ seconds" → minimum (all must be high)
      const motionValues = prevPoints.map(n => (n['visual.motion_intensity'] as number) ?? 0);
      motionValues.push((snapshot['visual.motion_intensity'] as number) ?? 0);
      snapshot['visual.motion_intensity_sustained'] = Math.min(...motionValues);
    }

    // narrative_pressure: high speech energy + rising delta + low silence = building pressure
    // Enhanced: Wav2Vec emotion_intensity amplifies pressure when speaker is emotionally charged
    snapshot['composite.narrative_pressure'] = computeNarrativePressure(snapshot, neighbors);

    // montage_mode: multiple short shots + high motion + music-driven
    snapshot['composite.montage_mode'] = computeMontageMode(snapshot, overlays, frame, fps);

    // cinematic_moment: 2+ tracks peaking within 500ms (15 frames at 30fps)
    // Enhanced: V-JEPA visual.significance + Wav2Vec stress_detected contribute as peak sources
    snapshot['composite.cinematic_moment'] = computeCinematicMoment(snapshot, neighbors);

    // NEW composite: emotional_alignment — do visual and vocal emotions agree?
    // When V-JEPA face_emotion and Wav2Vec emotional_valence are both present,
    // compute alignment score. Misalignment flags mood mismatch (graph quality gate).
    const faceEmotion = snapshot['visual.face_emotion'] as string | undefined;
    const vocalValence = snapshot['speech.emotional_valence'] as string | undefined;
    if (faceEmotion && vocalValence) {
      snapshot['composite.emotional_alignment'] = computeEmotionalAlignment(faceEmotion, vocalValence);
    }
  }

  // ── PASS 3: EMA + Surprise + Trajectory (Phase 5 — temporal context) ──
  // EMA = exponential moving average over ~3s window (alpha=0.3).
  // Surprise = raw - EMA (positive = rising, negative = dropping).
  // Trajectory = categorical state derived from EMA slope.
  // These are ADDITIVE — they don't modify Pass 1/2 values.
  {
    const EMA_ALPHA = 0.3;
    const emaSignals = ['speech.energy', 'visual.engagement', 'visual.motion_intensity'] as const;
    const emaState: Record<string, number> = {};

    for (const frame of gridFrames) {
      const snapshot = timeline.gridSignals.get(frame)!;

      for (const sig of emaSignals) {
        const raw = (snapshot[sig] as number) ?? 0;
        const key = sig;

        if (!(key in emaState)) {
          emaState[key] = raw;
        } else {
          emaState[key] = EMA_ALPHA * raw + (1 - EMA_ALPHA) * emaState[key];
        }

        const ema = emaState[key];
        const surprise = raw - ema;

        snapshot[`${sig}_ema`] = ema;
        snapshot[`${sig}_surprise`] = surprise;
      }

      const energyEma = (snapshot['speech.energy_ema'] as number) ?? 0;
      const energySurprise = (snapshot['speech.energy_surprise'] as number) ?? 0;
      const energyRaw = (snapshot['speech.energy'] as number) ?? 0;

      let trajectory: string = 'neutral';
      if (energySurprise > 0.05 && energyRaw > energyEma) trajectory = 'rising';
      else if (energySurprise > 0.1 && energyRaw > 0.6) trajectory = 'peaked';
      else if (energySurprise < -0.05) trajectory = 'falling';
      else if (energyRaw < 0.1 && energyEma < 0.15) trajectory = 'quiet';

      snapshot['temporal.energy_trajectory'] = trajectory;
    }
  }

  // ── EVENT-BASED signals from transcript ───────────────────────────────

  if (rawFootage?.transcription?.words) {
    const words = rawFootage.transcription.words;
    const avgDuration = words.reduce((sum, w) => sum + (w.endMs - w.startMs), 0) / words.length;
    const avgAmplitude = 1.0; // Normalized baseline (actual amplitude from 5-Track)

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const frame = Math.round((word.startMs / 1000) * fps);

      // Emphasis word detection
      const wordDuration = word.endMs - word.startMs;
      if (wordDuration > avgDuration * EMPHASIS_DURATION_MULTIPLIER) {
        timeline.eventSignals.push({
          timestampMs: word.startMs,
          frame,
          signal: 'speech.emphasis_word',
          value: true,
          context: word.word,
        });
      }

      // Entity: number/statistic
      if (NUMBER_PATTERN.test(word.word)) {
        timeline.eventSignals.push({
          timestampMs: word.startMs,
          frame,
          signal: 'entity.number',
          value: true,
          context: word.word,
        });
      }

      // Entity: CTA
      if (CTA_PATTERNS.test(word.word)) {
        timeline.eventSignals.push({
          timestampMs: word.startMs,
          frame,
          signal: 'entity.cta',
          value: true,
          context: word.word,
        });
      }

      // Entity: name (multi-word check)
      if (i < words.length - 1) {
        const twoWords = word.word + ' ' + words[i + 1].word;
        if (NAME_PATTERN.test(twoWords)) {
          timeline.eventSignals.push({
            timestampMs: word.startMs,
            frame,
            signal: 'entity.name',
            value: true,
            context: twoWords,
          });
        }
      }
    }

    // Segment-level events (topic boundaries, questions, claims)
    if (rawFootage.segments) {
      for (const segment of rawFootage.segments) {
        const frame = Math.round((segment.startMs / 1000) * fps);

        // Topic boundary at segment start
        timeline.eventSignals.push({
          timestampMs: segment.startMs,
          frame,
          signal: 'entity.topic_boundary',
          value: true,
          context: segment.text.substring(0, 50),
        });

        // Rhetorical question
        if (QUESTION_PATTERN.test(segment.text)) {
          timeline.eventSignals.push({
            timestampMs: segment.startMs,
            frame,
            signal: 'entity.rhetorical_question',
            value: true,
            context: segment.text,
          });
        }

        // Claim strength (hedged vs assertive)
        const isHedged = HEDGED_PATTERNS.test(segment.text);
        if (NUMBER_PATTERN.test(segment.text)) {
          timeline.eventSignals.push({
            timestampMs: segment.startMs,
            frame,
            signal: 'entity.claim_strength',
            value: isHedged ? 'hedged' : 'assertive',
            context: segment.text.substring(0, 80),
          });
        }
      }
    }

    // Filler word events
    if (rawFootage.fillerWords) {
      for (const filler of rawFootage.fillerWords) {
        const frame = Math.round((filler.startMs / 1000) * fps);
        timeline.eventSignals.push({
          timestampMs: filler.startMs,
          frame,
          signal: 'speech.filler_detected',
          value: true,
          context: filler.word,
        });
      }
    }

    // Speaker change events (from Grok diarization)
    // ← signal:speech.speaker_change (NEEDS_INFRA → now fulfilled)
    // "Speaker changes are natural event boundaries" (event segmentation theory)
    // Detects when speaker label changes between consecutive words.
    // Enables: interview B-roll insertion, speaker-specific captions, turn-taking editing.
    {
      let lastSpeaker: number | undefined;
      for (const word of words) {
        if (word.speaker !== undefined && word.speaker !== lastSpeaker) {
          if (lastSpeaker !== undefined) {
            // Speaker actually changed (not just the first labeled word)
            const frame = Math.round((word.startMs / 1000) * fps);
            timeline.eventSignals.push({
              timestampMs: word.startMs,
              frame,
              signal: 'speech.speaker_change',
              value: true,
              context: `speaker_${lastSpeaker} → speaker_${word.speaker}`,
            });
          }
          lastSpeaker = word.speaker;
        }
      }
    }
  }

  // ── GLOBAL signals (non-time-varying) ─────────────────────────────────

  timeline.globalSignals['content.speech_coverage'] = computeOverallSpeechCoverage(rawFootage);
  timeline.globalSignals['content.formality'] = estimateFormality(rawFootage);
  timeline.globalSignals['content.content_type'] = rawFootage?.contentTypeDetection?.contentType ?? 'unknown';
  timeline.globalSignals['audio.music_present'] = hasMusicPresent(mergedAnalysis);
  timeline.globalSignals['video.duration_s'] = totalDurationMs / 1000;
  timeline.globalSignals['audio.music_bpm'] = mergedAnalysis.musicStructure?.bpm ?? 0;

  // Speaker diarization global — number of distinct speakers detected
  const speakerIds = new Set<number>();
  if (rawFootage?.transcription?.words) {
    for (const w of rawFootage.transcription.words) {
      if (w.speaker !== undefined) speakerIds.add(w.speaker);
    }
  }
  timeline.globalSignals['content.speaker_count'] = speakerIds.size;
  timeline.globalSignals['content.is_multi_speaker'] = speakerIds.size > 1;

  // Enrichment source markers — downstream can detect which GPU models contributed
  timeline.globalSignals['enrichment.visual_source'] = hasVjepa ? 'vjepa' : 'five-track';
  timeline.globalSignals['enrichment.speech_source'] = hasWav2Vec ? 'wav2vec' : 'transcript';
  timeline.globalSignals['enrichment.vjepa_segments'] = vjepaSegments?.length ?? 0;
  timeline.globalSignals['enrichment.wav2vec_segments'] = wav2vecSegments?.length ?? 0;
  timeline.globalSignals['enrichment.diarization'] = speakerIds.size > 1 ? 'grok' : 'none';

  return timeline;
}

// ─── Signal Computation Helpers ─────────────────────────────────────────────

function mergeAnalyses(analyses: AssetAnalysis[]): AssetAnalysis {
  if (analyses.length === 0) return {};
  if (analyses.length === 1) return analyses[0];
  // For multiple clips: merge motion peaks, audio curves, etc.
  // For Mode 2, typically only 1 analysis exists (the single raw clip)
  return analyses[0];
}

function getSpeechEnergyAt(analysis: AssetAnalysis, timestampMs: number): number {
  if (!analysis.audio?.energyCurve?.length) return 0;
  const curve = analysis.audio.energyCurve;
  const closest = curve.reduce((prev, curr) =>
    Math.abs(curr.timestampMs - timestampMs) < Math.abs(prev.timestampMs - timestampMs) ? curr : prev
  );
  return closest.energy ?? 0;
}

function getSpeechEnergyDelta(analysis: AssetAnalysis, timestampMs: number): number {
  if (!analysis.audio?.energyCurve?.length) return 0;
  const curve = analysis.audio.energyCurve;
  const windowMs = 2000;
  const current = curve.filter(p => Math.abs(p.timestampMs - timestampMs) < 500);
  const previous = curve.filter(p => p.timestampMs >= timestampMs - windowMs && p.timestampMs < timestampMs - 500);
  if (current.length === 0 || previous.length === 0) return 0;
  const currentAvg = current.reduce((s, p) => s + p.energy, 0) / current.length;
  const previousAvg = previous.reduce((s, p) => s + p.energy, 0) / previous.length;
  return currentAvg - previousAvg;
}

function getSpeakingRateAt(rawFootage: RawFootageAnalysis | null, timestampMs: number): number {
  if (!rawFootage?.transcription?.words?.length) return 0;
  const windowMs = 10000; // 10s rolling window
  const wordsInWindow = rawFootage.transcription.words.filter(
    w => w.startMs >= timestampMs - windowMs && w.startMs < timestampMs
  );
  if (wordsInWindow.length === 0) return 0;
  const durationMin = windowMs / 60000;
  return wordsInWindow.length / durationMin;
}

function getSilenceDurationAt(rawFootage: RawFootageAnalysis | null, timestampMs: number): number {
  if (!rawFootage?.silenceGaps) return 0;
  const activeGap = rawFootage.silenceGaps.find(
    g => timestampMs >= g.startMs && timestampMs <= g.endMs
  );
  return activeGap ? activeGap.durationMs : 0;
}

function getSpeechCoverageAt(rawFootage: RawFootageAnalysis | null, timestampMs: number): number {
  if (!rawFootage?.transcription?.words?.length) return 0;
  const windowMs = 5000;
  const start = timestampMs - windowMs;
  const wordsInWindow = rawFootage.transcription.words.filter(
    w => w.startMs >= start && w.endMs <= timestampMs
  );
  const speechMs = wordsInWindow.reduce((s, w) => s + (w.endMs - w.startMs), 0);
  return Math.min(1, speechMs / windowMs);
}

function getMotionIntensityAt(analysis: AssetAnalysis, frame: number): number {
  if (!analysis.motionSegments?.length) return 0;
  const seg = analysis.motionSegments.find(s => frame >= s.startFrame && frame <= s.endFrame);
  return seg?.intensity ?? 0;
}

function getShotScaleAt(analysis: AssetAnalysis, frame: number): string {
  if (!analysis.keyframeAnalyses?.length) return 'unknown';
  const closest = analysis.keyframeAnalyses.reduce((prev, curr) =>
    Math.abs(curr.frameNumber - frame) < Math.abs(prev.frameNumber - frame) ? curr : prev
  );
  return closest.shotType ?? 'unknown';
}

function getFacePresentAt(analysis: AssetAnalysis, frame: number): boolean {
  if (!analysis.subjectTracks?.length) return false;
  return analysis.subjectTracks.some(s => s.category === 'person');
}

function getAiArtifactRiskAt(analysis: AssetAnalysis, frame: number): number {
  // For real footage, artifact risk is always 0
  if (analysis.analysisQuality === 'high') return 0;
  // For AI footage, risk increases with time from clip start
  const clipDurationFrames = analysis.shots?.[0]?.endFrame ?? 150;
  const progress = frame / clipDurationFrames;
  return progress > 0.7 ? (progress - 0.7) / 0.3 : 0;
}

function getSceneTypeAt(analysis: AssetAnalysis, frame: number): string {
  // Derive from motion + face + shot type
  const hasFace = getFacePresentAt(analysis, frame);
  const motion = getMotionIntensityAt(analysis, frame);
  if (hasFace && motion < 0.3) return 'talking-head';
  if (motion > 0.7) return 'action';
  return 'general';
}

// D1: Visual complexity — proxy from color diversity + brightness extremity.
// ⚠️ ALL thresholds INVENTED — need calibration against reference videos
function getVisualComplexityAt(analysis: AssetAnalysis, frame: number): number {
  if (!analysis.keyframeAnalyses?.length) return 0;
  const closest = analysis.keyframeAnalyses.reduce((prev, curr) =>
    Math.abs(curr.frameNumber - frame) < Math.abs(prev.frameNumber - frame) ? curr : prev
  );
  // Color diversity: more dominant colors = more complex frame
  // ⚠️ 8 colors = max complexity INVENTED — typical dominant color extraction yields 3-8
  const colorCount = closest.dominantColors?.length ?? 0;
  const colorScore = Math.min(1, colorCount / 8);
  // Brightness extremity: very bright or very dark = simpler; mid-range = more detail visible
  const brightness = closest.brightness ?? 0.5;
  const brightnessScore = 1 - Math.abs(brightness - 0.5) * 2;
  // Energy level mapping
  const energyMap: Record<string, number> = { low: 0.2, medium: 0.5, high: 0.8 };
  const energyScore = energyMap[closest.energyLevel ?? 'medium'] ?? 0.5;
  // Weighted average: color diversity is strongest indicator
  return colorScore * 0.5 + brightnessScore * 0.25 + energyScore * 0.25;
}

// D1: Text on screen — detects existing text/logo in frame via subject tracking.
// Used to avoid overlapping MG text on burned-in subtitles, signs, or watermarks.
function hasTextOnScreen(analysis: AssetAnalysis): boolean {
  if (!analysis.subjectTracks?.length) return false;
  return analysis.subjectTracks.some(s => s.category === 'text' || s.category === 'logo');
}

function getMusicEnergyAt(analysis: AssetAnalysis, timestampMs: number): number {
  if (!analysis.musicStructure?.energyCurve?.length) return 0;
  const curve = analysis.musicStructure.energyCurve;
  const closest = curve.reduce((prev, curr) =>
    Math.abs(curr.timestampMs - timestampMs) < Math.abs(prev.timestampMs - timestampMs) ? curr : prev
  );
  return closest.energy ?? 0;
}

function isMusicBeatAt(analysis: AssetAnalysis, timestampMs: number): boolean {
  if (!analysis.audio?.beats?.length) return false;
  return analysis.audio.beats.some(b => Math.abs(b - timestampMs) < 50); // within 50ms
}

// D1/D6: Tatum = smallest metric subdivision (16th notes).
// BPM × 4 = tatums per minute. Tolerance ±25ms (half of beat tolerance).
function isMusicTatumAt(analysis: AssetAnalysis, timestampMs: number): boolean {
  const bpm = analysis.musicStructure?.bpm;
  if (!bpm || bpm <= 0) return false;
  const tatumIntervalMs = 60000 / (bpm * 4);
  const remainder = timestampMs % tatumIntervalMs;
  return remainder < 25 || (tatumIntervalMs - remainder) < 25;
}

function getMusicSectionAt(analysis: AssetAnalysis, timestampMs: number): string {
  if (!analysis.musicStructure?.sections?.length) return 'none';
  const section = analysis.musicStructure.sections.find(
    s => timestampMs >= s.startMs && timestampMs <= s.endMs
  );
  return section?.type ?? 'none';
}

function getTimeSinceLastCut(overlays: OverlayInfo[], frame: number, fps: number): number {
  const videoOverlays = overlays
    .filter(o => o.type === 'video' || o.type === 'image')
    .sort((a, b) => a.from - b.from);

  for (let i = videoOverlays.length - 1; i >= 0; i--) {
    if (videoOverlays[i].from <= frame) {
      return (frame - videoOverlays[i].from) / fps;
    }
  }
  return frame / fps;
}

function getActiveOverlayCount(overlays: OverlayInfo[], frame: number): number {
  return overlays.filter(o =>
    frame >= o.from && frame < (o.from + o.durationInFrames) &&
    o.type !== 'video' && o.type !== 'sound'
  ).length;
}

function getCumulativeEditDensity(overlays: OverlayInfo[], frame: number, fps: number): number {
  const elapsedSec = Math.max(1, frame / fps);
  const editsBeforeFrame = overlays.filter(o => o.from < frame && o.type !== 'video').length;
  return editsBeforeFrame / (elapsedSec / 60); // edits per minute
}

// ─── Composite Signal Computations (Pass 2) ─────────────────────────────────

function getNeighborSnapshots(
  grid: Map<number, SignalSnapshot>,
  currentFrame: number,
  interval: number,
  count: number
): SignalSnapshot[] {
  const neighbors: SignalSnapshot[] = [];
  for (let i = -count; i <= count; i++) {
    if (i === 0) continue;
    const neighbor = grid.get(currentFrame + i * interval);
    if (neighbor) neighbors.push(neighbor);
  }
  return neighbors;
}

function computeNarrativePressure(snapshot: SignalSnapshot, neighbors: SignalSnapshot[]): number {
  const energy = (snapshot['speech.energy'] as number) ?? 0;
  const delta = (snapshot['speech.energy_delta'] as number) ?? 0;
  const silence = (snapshot['speech.silence_duration_ms'] as number) ?? 0;
  const position = (snapshot['structural.position_in_video'] as number) ?? 0;

  // Wav2Vec enrichment: emotion intensity amplifies pressure when speaker is emotionally charged.
  // Without Wav2Vec, emotionBoost = 0 (no change to existing behavior).
  const emotionIntensity = (snapshot['speech.emotion_intensity'] as number) ?? 0;
  const stressDetected = snapshot['speech.stress_detected'] === true;

  // High energy + rising trend + no silence + past midpoint = high pressure
  // Wav2Vec emotion adds up to 0.15 boost (redistributed from base weights)
  let pressure = 0;
  pressure += energy * 0.25;                                    // was 0.3 — ← energy base
  pressure += Math.max(0, delta) * 0.25;                        // was 0.3 — ← delta base
  pressure += (silence === 0 ? 0.15 : 0);                       // was 0.2 — ← speech active
  pressure += (position > 0.5 ? 0.15 : 0);                      // was 0.2 — ← position
  pressure += emotionIntensity * 0.1;                            // Wav2Vec: vocal arousal
  pressure += (stressDetected ? 0.1 : 0);                       // Wav2Vec: vocal stress

  return Math.min(1, Math.max(0, pressure));
}

function computeMontageMode(
  snapshot: SignalSnapshot,
  overlays: OverlayInfo[],
  frame: number,
  fps: number
): boolean {
  // Montage = multiple short video clips + low speech + high music
  const videoOverlays = overlays.filter(o => o.type === 'video');
  const recentClips = videoOverlays.filter(o =>
    o.from >= frame - (fps * 10) && o.from <= frame
  );

  const avgDuration = recentClips.length > 0
    ? recentClips.reduce((s, c) => s + c.durationInFrames, 0) / recentClips.length / fps
    : 999;

  const speechEnergy = (snapshot['speech.energy'] as number) ?? 0;
  const musicEnergy = (snapshot['audio.music_energy'] as number) ?? 0;

  // Short clips (<2s avg) + low speech + music present = montage
  return avgDuration < 2 && speechEnergy < 0.3 && musicEnergy > 0.3;
}

function computeCinematicMoment(snapshot: SignalSnapshot, neighbors: SignalSnapshot[]): number {
  // 2+ tracks peaking simultaneously = cinematic moment
  // Enhanced: V-JEPA visual significance and Wav2Vec stress detection contribute as peak sources.
  // More peak sources = more sensitivity to multi-modal convergence.
  let peakCount = 0;
  const speechEnergy = (snapshot['speech.energy'] as number) ?? 0;
  const motionIntensity = (snapshot['visual.motion_intensity'] as number) ?? 0;
  const musicEnergy = (snapshot['audio.music_energy'] as number) ?? 0;
  const musicBeat = (snapshot['audio.music_beat'] as number) ?? 0;

  // Base peaks (always available)
  if (speechEnergy > 0.7) peakCount++;
  if (motionIntensity > 0.6) peakCount++;
  if (musicEnergy > 0.7) peakCount++;
  if (musicBeat > 0) peakCount++;

  // V-JEPA peak: high visual significance (embedding divergence) = visually distinctive moment
  const visualSignificance = (snapshot['visual.significance'] as number) ?? 0;
  if (visualSignificance > 0.7) peakCount++;

  // Wav2Vec peak: vocal stress detected = emotionally charged speech
  const stressDetected = snapshot['speech.stress_detected'] === true;
  if (stressDetected) peakCount++;

  // Adjusted scoring — now 6 possible peak sources instead of 4.
  // Threshold still 2+ for activation, but higher peaks are more likely with enrichment.
  if (peakCount >= 5) return 1.0;
  if (peakCount === 4) return 0.9;
  if (peakCount === 3) return 0.7;
  if (peakCount === 2) return 0.5;
  return 0;
}

/**
 * Cross-modal emotional alignment: do face emotion (V-JEPA) and vocal valence (Wav2Vec) agree?
 *
 * Returns 0-1 where:
 *   1.0 = perfect alignment (happy face + positive voice)
 *   0.5 = neutral/ambiguous (neutral face or neutral voice)
 *   0.0 = mismatch (sad face + positive voice, or happy face + negative voice)
 *
 * Misalignment flags mood-mismatch quality gate in creative knowledge graph:
 *   "If face_emotion = sad AND music_energy = high-positive → mood mismatch"
 *   "If music_energy is high-positive AND emotional_valence is negative → mood mismatch"
 *
 * Valence categories for face emotions (Ekman 1992 + Scherer 2003):
 *   positive: happy, surprised
 *   negative: sad, angry, fearful, disgusted, contempt
 *   neutral: neutral
 */
function computeEmotionalAlignment(faceEmotion: string, vocalValence: string): number {
  // Map face emotion to valence category
  const POSITIVE_FACE = new Set(['happy', 'surprised']);
  const NEGATIVE_FACE = new Set(['sad', 'angry', 'fearful', 'disgusted', 'contempt']);

  let faceValence: 'positive' | 'negative' | 'neutral';
  if (POSITIVE_FACE.has(faceEmotion)) faceValence = 'positive';
  else if (NEGATIVE_FACE.has(faceEmotion)) faceValence = 'negative';
  else faceValence = 'neutral';

  // Alignment scoring
  if (faceValence === 'neutral' || vocalValence === 'neutral' || vocalValence === 'mixed') {
    return 0.5; // Ambiguous — neither aligned nor misaligned
  }
  if (faceValence === vocalValence) {
    return 1.0; // Perfect alignment
  }
  return 0.0; // Mismatch — face and voice disagree
}

// ─── Global Signal Computations ─────────────────────────────────────────────

function computeOverallSpeechCoverage(rawFootage: RawFootageAnalysis | null): number {
  if (!rawFootage?.transcription?.words?.length || !rawFootage.originalDurationMs) return 0;
  const words = rawFootage.transcription.words;
  // Compute total speech time using span (max endMs - min startMs) to avoid >100%
  if (words.length === 0) return 0;
  const speechSpanMs = words[words.length - 1].endMs - words[0].startMs;
  return Math.min(1, speechSpanMs / rawFootage.originalDurationMs);
}

function estimateFormality(rawFootage: RawFootageAnalysis | null): number {
  if (!rawFootage?.segments?.length) return 0.5;
  // Formality from filler rate + speaking pace
  const totalFillers = rawFootage.segments.reduce((s, seg) => s + seg.fillerCount, 0);
  const totalWords = rawFootage.transcription?.words?.length ?? 100;
  const fillerRate = totalFillers / totalWords;

  // High filler rate = low formality
  if (fillerRate > 0.05) return 0.2;  // Very casual
  if (fillerRate > 0.02) return 0.4;  // Casual
  if (fillerRate > 0.01) return 0.6;  // Moderate
  return 0.8;  // Formal (almost no fillers)
}

function hasMusicPresent(analysis: AssetAnalysis): boolean {
  if (!analysis.musicStructure) return false;
  return (analysis.musicStructure.bpm ?? 0) > 0;
}

// ─── Phase 4: Visual Intelligence Helpers ─────────────────────────────────

function getSceneChangeAt(analysis: AssetAnalysis, frame: number, fps: number): number {
  if (!analysis.keyframeAnalyses?.length || analysis.keyframeAnalyses.length < 2) return 0;
  const kfs = analysis.keyframeAnalyses;
  let closestIdx = 0;
  let closestDist = Infinity;
  for (let i = 0; i < kfs.length; i++) {
    const dist = Math.abs(kfs[i].frameNumber - frame);
    if (dist < closestDist) { closestDist = dist; closestIdx = i; }
  }
  if (closestIdx === 0) return 0;
  const curr = kfs[closestIdx];
  const prev = kfs[closestIdx - 1];
  if (!curr.dominantColors?.length || !prev.dominantColors?.length) return 0;
  const currColors = curr.dominantColors!;
  const prevColors = prev.dominantColors!;
  const allColors = new Set<string>();
  currColors.forEach(c => allColors.add(c));
  prevColors.forEach(c => allColors.add(c));
  let shared = 0;
  currColors.forEach(c => { if (prevColors.includes(c)) shared++; });
  if (allColors.size === 0) return 0;
  return 1 - shared / allColors.size;
}

function getBrightnessStabilityAt(analysis: AssetAnalysis, frame: number): number {
  if (!analysis.keyframeAnalyses?.length || analysis.keyframeAnalyses.length < 2) return 1;
  const kfs = analysis.keyframeAnalyses;
  let closestIdx = 0;
  let closestDist = Infinity;
  for (let i = 0; i < kfs.length; i++) {
    const dist = Math.abs(kfs[i].frameNumber - frame);
    if (dist < closestDist) { closestDist = dist; closestIdx = i; }
  }
  if (closestIdx === 0) return 1;
  const currBrightness = kfs[closestIdx].brightness ?? 0.5;
  const prevBrightness = kfs[closestIdx - 1].brightness ?? 0.5;
  const delta = Math.abs(currBrightness - prevBrightness);
  return Math.max(0, 1 - delta * 3);
}

function computeVES(snapshot: Record<string, number | boolean | string>): number {
  let weightSum = 0;
  let valueSum = 0;
  const components: Array<{ key: string; weight: number }> = [
    { key: 'visual.eye_contact', weight: 0.3 },
    { key: 'visual.significance', weight: 0.25 },
    { key: 'visual.motion_intensity', weight: 0.2 },
    { key: 'visual.face_present', weight: 0.15 },
    { key: 'visual.brightness_stability', weight: 0.1 },
  ];
  for (const { key, weight } of components) {
    const val = snapshot[key];
    if (typeof val === 'number' && isFinite(val)) {
      valueSum += val * weight;
      weightSum += weight;
    }
  }
  if (weightSum === 0) return 0.5;
  return valueSum / weightSum;
}

// ─── SegmentAnalysis Adapter ───────────────────────────────────────────────
// Extracts V-JEPA/Wav2Vec data from the unified SegmentAnalysis type
// and delegates to the existing buildSignalTimeline. Avoids duplicating
// the 600+ lines of signal computation logic.

import type { SegmentAnalysis } from '../types/segment-analysis';

export function buildSignalTimelineFromAnalysis(
  segmentAnalysis: SegmentAnalysis,
  analyses: AssetAnalysis[],
  rawFootage: RawFootageAnalysis | null,
  overlays: OverlayInfo[],
  fps: number = DEFAULT_FPS,
): SignalTimeline {
  const vjepaSegments: VjepaSegmentResult[] = [];
  const wav2vecSegments: Wav2VecSegmentResult[] = [];

  for (const seg of segmentAnalysis.segments) {
    if (seg.visual) {
      vjepaSegments.push({
        startMs: seg.startMs,
        endMs: seg.endMs,
        visualSignificance: seg.visual.significance,
        motionIntensity: seg.visual.motionIntensity,
        actionType: seg.visual.actionType,
        motionType: seg.visual.motionType,
        faceEmotion: seg.visual.faceEmotion,
        eyeContact: seg.visual.eyeContact,
      });
    }
    if (seg.vocal) {
      wav2vecSegments.push({
        startMs: seg.startMs,
        endMs: seg.endMs,
        emotionIntensity: seg.vocal.emotionIntensity,
        emotionalValence: seg.vocal.emotionalValence,
        energy: seg.vocal.energy,
        pitchVariability: seg.vocal.pitchVariability,
        stressDetected: seg.vocal.stressDetected,
        fillerConfidence: seg.vocal.fillerConfidence,
      });
    }
  }

  return buildSignalTimeline(
    analyses,
    rawFootage,
    overlays,
    fps,
    vjepaSegments.length > 0 ? { segments: vjepaSegments, modelVersion: 'from-segment-analysis', processingTimeMs: 0 } : null,
    wav2vecSegments.length > 0 ? { segments: wav2vecSegments, modelVersion: 'from-segment-analysis', processingTimeMs: 0 } : null,
  );
}

/**
 * Project event signals onto the nearest grid-point snapshots.
 * Event signals (entity.cta, entity.name, etc.) are stored at exact word timestamps
 * but the utility scorer reads grid-point snapshots. This copies event signal values
 * onto the nearest grid point so the scorer can evaluate them.
 *
 * ⚠️ INVENTED: claim_strength string encodings (assertive=0.8, hedged=0.3)
 */
export function projectEventsOntoGrid(timeline: SignalTimeline): void {
  if (!timeline.eventSignals.length) return;
  const gridFrames = Array.from(timeline.gridSignals.keys()).sort((a, b) => a - b);
  if (!gridFrames.length) return;

  const CLAIM_ENCODINGS: Record<string, number> = { assertive: 0.8, hedged: 0.3 };
  let projected = 0;

  for (const event of timeline.eventSignals) {
    let nearest = gridFrames[0];
    let minDist = Math.abs(event.frame - gridFrames[0]);
    for (const gf of gridFrames) {
      const dist = Math.abs(event.frame - gf);
      if (dist < minDist) { minDist = dist; nearest = gf; }
      if (gf > event.frame + timeline.gridInterval) break;
    }

    const snapshot = timeline.gridSignals.get(nearest);
    if (!snapshot) continue;

    let numericValue: number;
    if (typeof event.value === 'number') numericValue = event.value;
    else if (typeof event.value === 'boolean') numericValue = event.value ? 1.0 : 0.0;
    else numericValue = CLAIM_ENCODINGS[event.value] ?? 0.5;

    if (snapshot[event.signal] === undefined) {
      (snapshot as Record<string, number | boolean | string>)[event.signal] = numericValue;
      projected++;
    }
  }

  if (projected > 0) {
    console.log(`[SignalRegistry] Projected ${projected} event signals onto grid (${timeline.eventSignals.length} total events)`);
  }
}
