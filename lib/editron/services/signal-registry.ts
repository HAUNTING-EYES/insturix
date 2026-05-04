/**
 * Signal Registry — Dual-Timing Signal Collection for Mode 2
 *
 * Collects all signal values from 5-Track Analysis + RawFootageAnalysis + transcript
 * into a queryable time-indexed structure.
 *
 * TWO timing systems (FLAG 1):
 *   Grid-based (every 15 frames / 0.5s): continuous signals (energy, motion, color, etc.)
 *   Event-based (exact word timestamps): transcript signals (entities, emphasis, boundaries)
 *
 * TWO computation passes (FLAG 7):
 *   Pass 1: All basic signals computed
 *   Pass 2: Composite signals computed FROM basic signals (reads neighboring points)
 *
 * Consumers: signal-executor.ts
 */

import type { SignalValues } from './graph-query';

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
    words: Array<{ word: string; startMs: number; endMs: number }>;
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

// ─── Main Builder ───────────────────────────────────────────────────────────

/**
 * Build the complete signal timeline from all available analysis data.
 * This is the main entry point for the signal-driven executor.
 */
export function buildSignalTimeline(
  analyses: AssetAnalysis[],
  rawFootage: RawFootageAnalysis | null,
  overlays: OverlayInfo[],
  fps: number = DEFAULT_FPS
): SignalTimeline {
  const totalDurationMs = rawFootage?.originalDurationMs ?? rawFootage?.estimatedCleanDurationMs ?? 30000;
  const totalFrames = Math.ceil((totalDurationMs / 1000) * fps);
  const mergedAnalysis = mergeAnalyses(analyses);

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

    // Speech signals
    snapshot['speech.energy'] = getSpeechEnergyAt(mergedAnalysis, timestampMs);
    snapshot['speech.energy_delta'] = getSpeechEnergyDelta(mergedAnalysis, timestampMs);
    snapshot['speech.speaking_rate_wpm'] = getSpeakingRateAt(rawFootage, timestampMs);
    snapshot['speech.silence_duration_ms'] = getSilenceDurationAt(rawFootage, timestampMs);
    snapshot['speech.coverage'] = getSpeechCoverageAt(rawFootage, timestampMs);

    // Visual signals
    snapshot['visual.motion_intensity'] = getMotionIntensityAt(mergedAnalysis, frame);
    snapshot['visual.shot_scale'] = getShotScaleAt(mergedAnalysis, frame);
    snapshot['visual.face_present'] = getFacePresentAt(mergedAnalysis, frame);
    snapshot['visual.ai_artifact_risk'] = getAiArtifactRiskAt(mergedAnalysis, frame);
    snapshot['visual.scene_type'] = getSceneTypeAt(mergedAnalysis, frame);

    // Audio signals
    snapshot['audio.music_energy'] = getMusicEnergyAt(mergedAnalysis, timestampMs);
    snapshot['audio.music_beat'] = isMusicBeatAt(mergedAnalysis, timestampMs) ? 1 : 0;
    snapshot['audio.music_section'] = getMusicSectionAt(mergedAnalysis, timestampMs);

    // Structural signals
    snapshot['structural.position_in_video'] = frame / totalFrames;
    snapshot['structural.time_since_last_cut'] = getTimeSinceLastCut(overlays, frame, fps);
    snapshot['structural.active_overlays_count'] = getActiveOverlayCount(overlays, frame);
    snapshot['structural.cumulative_edit_density'] = getCumulativeEditDensity(overlays, frame, fps);

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
    snapshot['composite.narrative_pressure'] = computeNarrativePressure(snapshot, neighbors);

    // montage_mode: multiple short shots + high motion + music-driven
    snapshot['composite.montage_mode'] = computeMontageMode(snapshot, overlays, frame, fps);

    // cinematic_moment: 2+ tracks peaking within 500ms (15 frames at 30fps)
    snapshot['composite.cinematic_moment'] = computeCinematicMoment(snapshot, neighbors);
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
  }

  // ── GLOBAL signals (non-time-varying) ─────────────────────────────────

  timeline.globalSignals['content.speech_coverage'] = computeOverallSpeechCoverage(rawFootage);
  timeline.globalSignals['content.formality'] = estimateFormality(rawFootage);
  timeline.globalSignals['content.content_type'] = rawFootage?.contentTypeDetection?.contentType ?? 'unknown';
  timeline.globalSignals['audio.music_present'] = hasMusicPresent(mergedAnalysis);
  timeline.globalSignals['video.duration_s'] = totalDurationMs / 1000;
  timeline.globalSignals['audio.music_bpm'] = mergedAnalysis.musicStructure?.bpm ?? 0;

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

  // High energy + rising trend + no silence + past midpoint = high pressure
  let pressure = 0;
  pressure += energy * 0.3;
  pressure += Math.max(0, delta) * 0.3;  // Only positive delta contributes
  pressure += (silence === 0 ? 0.2 : 0);  // Active speech adds pressure
  pressure += (position > 0.5 ? 0.2 : 0); // Past midpoint = building

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
  let peakCount = 0;
  const speechEnergy = (snapshot['speech.energy'] as number) ?? 0;
  const motionIntensity = (snapshot['visual.motion_intensity'] as number) ?? 0;
  const musicEnergy = (snapshot['audio.music_energy'] as number) ?? 0;
  const musicBeat = (snapshot['audio.music_beat'] as number) ?? 0;

  if (speechEnergy > 0.7) peakCount++;
  if (motionIntensity > 0.6) peakCount++;
  if (musicEnergy > 0.7) peakCount++;
  if (musicBeat > 0) peakCount++;

  // Score: 0 for <2, 0.5 for 2, 0.8 for 3, 1.0 for 4+
  if (peakCount >= 4) return 1.0;
  if (peakCount === 3) return 0.8;
  if (peakCount === 2) return 0.5;
  return 0;
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
