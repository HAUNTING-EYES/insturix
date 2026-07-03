/**
 * Genre Parameter Computer — Signal-Computed Creative Parameters
 *
 * Computes 9 genre parameters from observed signals (FLAG 2: no content-type labels).
 * These parameters modulate ALL signal thresholds in the signal executor.
 *
 * Architecture (from creative doc v3, Part 0 §0.4):
 *   Stage 2: Analyze content from clean transcript (NLP)
 *   Stage 3: Analyze visual setup from footage
 *   Stage 4: Compute speech signals on best takes only
 *   Stage 5: Single optional Gemini call for narrative intelligence
 *
 * Gemini call is OPTIONAL (FLAG 3): pipeline works without it.
 * Output: GenreParameters + BGM recommendation.
 */

import type { GenreParameters } from './graph-query';
import type { MusicAnalysisResult } from './music-analysis-service';
import type { AssetAnalysis, RawFootageAnalysis } from './signal-registry';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GenreParameterInput {
  rawFootage: RawFootageAnalysis | null;
  analyses: AssetAnalysis[];
  musicAnalysis?: Pick<MusicAnalysisResult, 'bpm' | 'beats' | 'sections' | 'energyCurve' | 'musicPresence'> | null;
  videoDurationSec: number;
  userPlatform?: string;
  userIntent?: string;
  brandContext?: string;
}

export interface BgmRecommendation {
  shouldAddBgm: boolean;
  reason: string;
  params?: {
    tempoBpm: [number, number];   // range
    mood: string;
    genre: string;
    levelDb: number;
  };
}

interface SourceMusicConfidence {
  bpm: number;
  confidence: number;
  musicAlreadyPresent: boolean;
  reason: string;
}

export interface GenreParameterOutput {
  genreParams: GenreParameters;
  bgmRecommendation: BgmRecommendation;
  confidence: 'high' | 'medium' | 'low';
  computedFrom: string[];  // which signals contributed
}

// ─── Cold Start Fallbacks (from v3 doc §0.4) ────────────────────────────────

const COLD_START_FALLBACK: GenreParameters = {
  pacing_tolerance: 5,
  energy_baseline: 0.45,
  transition_density: 10,
  graphic_density: 3,
  silence_tolerance: 1.0,
  zoom_budget: 5,
  sfx_density: 0.5,
  color_temperature: 5500,
  formality: 0.5,
};

// ─── Main Computation ───────────────────────────────────────────────────────

/**
 * Compute genre parameters from observed signals.
 * No content-type labels, no profile lookup — pure signal computation.
 */
export function computeGenreParameters(input: GenreParameterInput): GenreParameterOutput {
  const { rawFootage, analyses, videoDurationSec } = input;
  const computedFrom: string[] = [];

  // If no data at all, return cold start
  if (!rawFootage && analyses.length === 0) {
    return {
      genreParams: COLD_START_FALLBACK,
      bgmRecommendation: { shouldAddBgm: false, reason: 'No data available for BGM decision' },
      confidence: 'low',
      computedFrom: ['cold_start_fallback'],
    };
  }

  // ── Stage 2: Content analysis from transcript ─────────────────────────

  const speechCoverage = computeSpeechCoverage(rawFootage);
  const entityNumberCount = countEntities(rawFootage, 'number');
  const entityCtaCount = countEntities(rawFootage, 'cta');
  const topicBoundaryCount = rawFootage?.segments?.length ?? 0;
  const avgFillerRate = computeFillerRate(rawFootage);
  computedFrom.push('transcript_content');

  // ── Stage 3: Visual setup ─────────────────────────────────────────────

  const visualComplexityAvg = computeVisualComplexity(analyses);
  const motionIntensityAvg = computeAvgMotionIntensity(analyses);
  const hasFacePresent = analyses.some(a =>
    a.subjectTracks?.some(s => s.category === 'person')
  );
  computedFrom.push('visual_setup');

  // ── Stage 4: Speech signals on best takes ─────────────────────────────

  const speechEnergyAvg = computeAvgSpeechEnergy(analyses);
  const speakingRateAvg = computeAvgSpeakingRate(rawFootage);
  computedFrom.push('speech_signals');

  // ── Compute each dial ─────────────────────────────────────────────────

  // pacing_tolerance: f(speech_coverage, visual_complexity, formality)
  let pacing_tolerance = 5; // default
  if (speechCoverage > 0.7) pacing_tolerance = lerp(5, 8, (speechCoverage - 0.7) / 0.3);
  else if (speechCoverage < 0.3) pacing_tolerance = lerp(2, 3, speechCoverage / 0.3);
  if (visualComplexityAvg > 0.6) pacing_tolerance += 1; // complex visuals need more time
  pacing_tolerance = clamp(pacing_tolerance, 2, 15);

  // energy_baseline: average observed energy in best takes
  const energy_baseline = clamp(speechEnergyAvg || 0.45, 0.2, 0.8);

  // transition_density: f(pacing_tolerance, source music, speech_coverage)
  const sourceMusic = resolveSourceMusicConfidence(analyses, speechCoverage, input.musicAnalysis ?? null);
  const musicBpm = sourceMusic.musicAlreadyPresent ? sourceMusic.bpm : 0;
  computedFrom.push('source_music_confidence');
  let transition_density = 60 / pacing_tolerance; // baseline from pacing
  if (musicBpm > 0 && speechCoverage < 0.3) {
    // Music-driven: transitions sync to beats
    transition_density = musicBpm / 8; // one transition every 8 beats
  }
  transition_density = clamp(transition_density, 2, 25);

  // graphic_density: f(entity_count, formality)
  const entityRate = (entityNumberCount + entityCtaCount) / Math.max(1, videoDurationSec / 60);
  let graphic_density = Math.min(entityRate * 0.5, 8);
  const formality = computeFormality(avgFillerRate, speakingRateAvg, hasFacePresent);
  if (formality > 0.7) graphic_density *= 0.6; // formal = fewer graphics
  graphic_density = clamp(graphic_density, 0, 8);

  // silence_tolerance: f(formality, speech_coverage, speaking_rate)
  let silence_tolerance = 1.0;
  if (formality > 0.6 && speakingRateAvg < 140) silence_tolerance = lerp(1.5, 3, formality);
  else if (formality < 0.3 && speakingRateAvg > 160) silence_tolerance = lerp(0.3, 0.5, 1 - formality);
  silence_tolerance = clamp(silence_tolerance, 0.3, 5.0);

  // zoom_budget: f(duration, entity_count, emphasis_count)
  const emphasisDensity = entityNumberCount / Math.max(1, videoDurationSec / 30);
  let zoom_budget = Math.ceil(videoDurationSec / 20); // ~1 per 20s baseline
  zoom_budget = Math.min(zoom_budget + Math.floor(emphasisDensity), 15);
  zoom_budget = clamp(zoom_budget, 1, 15);

  // sfx_density: f(transition_density, energy_baseline)
  const sfx_density = clamp(transition_density * 0.3 + energy_baseline * 0.4, 0, 1);

  // color_temperature: from visual keyframes
  const color_temperature = estimateColorTemp(analyses);

  const genreParams: GenreParameters = {
    pacing_tolerance,
    energy_baseline,
    transition_density,
    graphic_density,
    silence_tolerance,
    zoom_budget,
    sfx_density,
    color_temperature,
    formality,
  };

  // ── BGM Decision (FLAG 2: signal-computed, no content-type labels) ────

  const bgmRecommendation = computeBgmRecommendation(
    speechCoverage, formality, videoDurationSec, sourceMusic, speechEnergyAvg
  );

  return {
    genreParams,
    bgmRecommendation,
    confidence: speechCoverage > 0 ? 'medium' : 'low',
    computedFrom,
  };
}

// ─── BGM Recommendation (FLAG 2) ───────────────────────────────────────────

function computeBgmRecommendation(
  speechCoverage: number,
  formality: number,
  durationSec: number,
  sourceMusic: SourceMusicConfidence,
  speechEnergyAvg: number
): BgmRecommendation {
  // Don't add BGM if source music is actually evidenced, not merely speech-rhythm BPM.
  if (sourceMusic.musicAlreadyPresent) {
    return {
      shouldAddBgm: false,
      reason: `Music already present in footage (${sourceMusic.reason})`,
    };
  }

  // Signal-computed decision (no content-type labels)
  const shouldAdd = (
    speechCoverage > 0.7 &&     // mostly talking - music fills gaps
    formality < 0.6 &&          // formal content may prefer no music
    durationSec > 30            // very short clips don't need BGM
  );

  if (!shouldAdd) {
    const reasons: string[] = [];
    if (speechCoverage <= 0.7) reasons.push('low speech coverage');
    if (formality >= 0.6) reasons.push('formal content');
    if (durationSec <= 30) reasons.push('too short');
    reasons.push(sourceMusic.reason);
    return { shouldAddBgm: false, reason: `Skipping BGM: ${reasons.join(', ')}` };
  }

  // Compute BGM params from signals
  const tempoBpm: [number, number] = speechEnergyAvg > 0.6
    ? [100, 120]   // high energy speaker -> upbeat
    : [60, 80];    // low energy speaker -> calm

  const mood = speechEnergyAvg > 0.6 ? 'upbeat' : 'calm';
  const genre = formality > 0.4 ? 'corporate' : 'lo-fi';

  return {
    shouldAddBgm: true,
    reason: `High speech coverage + casual content + sufficient duration; no source music detected (${sourceMusic.reason})`,
    params: {
      tempoBpm,
      mood,
      genre,
      levelDb: -24, // felt not heard, per creative doc sound layer specs
    },
  };
}

function resolveSourceMusicConfidence(
  analyses: AssetAnalysis[],
  speechCoverage: number,
  projectMusicAnalysis?: Pick<MusicAnalysisResult, 'bpm' | 'beats' | 'sections' | 'energyCurve' | 'musicPresence'> | null,
): SourceMusicConfidence {
  const assetMusic = analyses.find((analysis) => analysis.musicStructure)?.musicStructure;
  const music = assetMusic ?? projectMusicAnalysisToStructure(projectMusicAnalysis);
  if (!music) {
    return {
      bpm: 0,
      confidence: 0,
      musicAlreadyPresent: false,
      reason: 'sourceMusicConfidence=0.00; no music-structure analysis',
    };
  }

  const bpm = music.bpm ?? 0;
  const sections = music.sections ?? [];
  const validSections = sections.filter((section) => {
    const label = String(section.type ?? '').toLowerCase();
    return /intro|verse|chorus|drop|bridge|break|outro|music|instrumental|song|build/.test(label);
  });
  const energyCurve = music.energyCurve ?? [];
  const avgMusicEnergy = energyCurve.length
    ? clamp(
        energyCurve.reduce((sum, point) => sum + (Number.isFinite(point.energy) ? point.energy : 0), 0) /
          energyCurve.length,
        0,
        1,
      )
    : 0;
  const explicitEventCount = (music.drops?.length ?? 0) + (music.builds?.length ?? 0);

  const structureEvidence =
    (bpm > 0 ? 0.25 : 0) +
    Math.min(0.35, validSections.length * 0.08) +
    Math.min(0.2, explicitEventCount * 0.1) +
    (avgMusicEnergy > 0.55 ? 0.15 : avgMusicEnergy > 0.3 ? 0.08 : 0);
  const speechPenalty = speechCoverage > 0.75 ? 0.45 : speechCoverage > 0.55 ? 0.25 : speechCoverage > 0.35 ? 0.1 : 0;
  const confidence = clamp(structureEvidence - speechPenalty, 0, 1);

  const explicitMusicEvents = explicitEventCount >= 2;
  const lowSpeechMusicBed = speechCoverage < 0.45 && bpm > 0 && (validSections.length > 0 || avgMusicEnergy > 0.3);
  const mediumSpeechStrongMusic = speechCoverage < 0.7 && validSections.length >= 4 && avgMusicEnergy > 0.55;
  const musicAlreadyPresent =
    (explicitMusicEvents && confidence >= 0.45) ||
    (confidence >= 0.55 && (lowSpeechMusicBed || mediumSpeechStrongMusic));

  return {
    bpm,
    confidence,
    musicAlreadyPresent,
    reason: [
      `sourceMusicConfidence=${confidence.toFixed(2)}`,
      `bpm=${bpm || 0}`,
      `sections=${validSections.length}`,
      `explicitEvents=${explicitEventCount}`,
      `speechCoverage=${speechCoverage.toFixed(2)}`,
    ].join('; '),
  };
}

function projectMusicAnalysisToStructure(
  musicAnalysis?: Pick<MusicAnalysisResult, 'bpm' | 'beats' | 'sections' | 'energyCurve' | 'musicPresence'> | null,
): AssetAnalysis['musicStructure'] | null {
  if (!musicAnalysis) return null;
  const hasUsefulMusicAnalysis =
    (musicAnalysis.bpm ?? 0) > 0 ||
    (musicAnalysis.sections?.length ?? 0) > 0 ||
    (musicAnalysis.energyCurve?.length ?? 0) > 0 ||
    (musicAnalysis.musicPresence ?? 0) > 0;
  if (!hasUsefulMusicAnalysis) return null;

  return {
    bpm: musicAnalysis.bpm,
    sections: (musicAnalysis.sections ?? []).map((section) => ({
      type: section.label,
      startMs: section.startMs,
      endMs: section.endMs,
    })),
    energyCurve: (musicAnalysis.energyCurve ?? []).map((energy, index) => ({
      timestampMs: musicAnalysis.energyCurve.length > 1
        ? Math.round((index / (musicAnalysis.energyCurve.length - 1)) * 1000)
        : 0,
      energy,
    })),
    drops: [],
    builds: [],
  };
}

// ─── Gemini Call Interface (FLAG 3) ─────────────────────────────────────────

/**
 * Gemini Creative Intent Input — what we send to the LLM.
 * This call is OPTIONAL. If it fails, pipeline continues with flat weights.
 */
export interface GeminiCreativeIntentInput {
  clean_transcript: string;
  video_duration_seconds: number;
  computed_genre_params: GenreParameters;
  signal_summary: {
    speech_coverage: number;
    topic_boundary_count: number;
    entity_number_count: number;
    entity_cta_count: number;
    speech_energy_avg: number;
    motion_intensity_avg: number;
  };
  brand_context?: string;
  project_brief?: string;
  target_platform?: string;
}

/**
 * Gemini Creative Intent Output — what the LLM returns.
 * Does NOT include genre_parameters (those are computed BEFORE this call).
 */
export interface GeminiCreativeIntentOutput {
  moment_weights: Array<{
    segment_start_ms: number;
    segment_end_ms: number;
    weight: number;
    reason: string;
  }>;
  narrative_strategy: {
    structure: string;
    emotional_arc: string;
    loop_structure: boolean;
    cross_cut: boolean;
  };
  content_signals_supplemental: {
    has_testimonial: boolean;
    has_demonstration: boolean;
    has_product: boolean;
    primary_emotion: string;
  };
}

/**
 * Build the Gemini input from computed data.
 * Called by the worker before dispatching the optional LLM call.
 */
export function buildGeminiInput(
  rawFootage: RawFootageAnalysis | null,
  analyses: AssetAnalysis[],
  genreParams: GenreParameters,
  options?: { brandContext?: string; projectBrief?: string; platform?: string }
): GeminiCreativeIntentInput {
  const transcript = rawFootage?.transcription?.words
    ?.map(w => w.word).join(' ') ?? '';

  return {
    clean_transcript: transcript.substring(0, 8000), // cap at ~8K chars for token budget
    video_duration_seconds: (rawFootage?.originalDurationMs ?? 30000) / 1000,
    computed_genre_params: genreParams,
    signal_summary: {
      speech_coverage: computeSpeechCoverage(rawFootage),
      topic_boundary_count: rawFootage?.segments?.length ?? 0,
      entity_number_count: countEntities(rawFootage, 'number'),
      entity_cta_count: countEntities(rawFootage, 'cta'),
      speech_energy_avg: computeAvgSpeechEnergy(analyses),
      motion_intensity_avg: computeAvgMotionIntensity(analyses),
    },
    brand_context: options?.brandContext,
    project_brief: options?.projectBrief,
    target_platform: options?.platform,
  };
}

// ─── Helper Functions ───────────────────────────────────────────────────────

function computeSpeechCoverage(rawFootage: RawFootageAnalysis | null): number {
  if (!rawFootage?.transcription?.words?.length || !rawFootage.originalDurationMs) return 0;
  const words = rawFootage.transcription.words;
  if (words.length === 0) return 0;
  const speechSpanMs = words[words.length - 1].endMs - words[0].startMs;
  return Math.min(1, speechSpanMs / rawFootage.originalDurationMs);
}

function countEntities(rawFootage: RawFootageAnalysis | null, type: 'number' | 'cta'): number {
  if (!rawFootage?.transcription?.words) return 0;
  const pattern = type === 'number'
    ? /\b\d+[%$€£]?|\b(?:hundred|thousand|million|billion)\b/i
    : /\b(?:subscribe|sign up|click|visit|download|get started|try|buy|join|follow)\b/i;
  return rawFootage.transcription.words.filter(w => pattern.test(w.word)).length;
}

function computeFillerRate(rawFootage: RawFootageAnalysis | null): number {
  if (!rawFootage?.fillerWords || !rawFootage.transcription?.words?.length) return 0;
  return rawFootage.fillerWords.length / rawFootage.transcription.words.length;
}

function computeVisualComplexity(analyses: AssetAnalysis[]): number {
  if (!analyses.length || !analyses[0].subjectTracks?.length) return 0.5;
  // More subjects + more motion = higher complexity
  const subjectCount = analyses[0].subjectTracks.length;
  const motionAvg = computeAvgMotionIntensity(analyses);
  return clamp((subjectCount * 0.2) + (motionAvg * 0.5), 0, 1);
}

function computeAvgMotionIntensity(analyses: AssetAnalysis[]): number {
  if (!analyses.length || !analyses[0].motionSegments?.length) return 0.3;
  const segments = analyses[0].motionSegments;
  return segments.reduce((sum, s) => sum + s.intensity, 0) / segments.length;
}

function computeAvgSpeechEnergy(analyses: AssetAnalysis[]): number {
  if (!analyses.length || !analyses[0].audio?.energyCurve?.length) return 0.45;
  const curve = analyses[0].audio.energyCurve;
  return curve.reduce((sum, p) => sum + p.energy, 0) / curve.length;
}

function computeAvgSpeakingRate(rawFootage: RawFootageAnalysis | null): number {
  if (!rawFootage?.transcription?.words?.length || !rawFootage.originalDurationMs) return 140;
  const wordCount = rawFootage.transcription.words.length;
  const durationMin = rawFootage.originalDurationMs / 60000;
  return wordCount / durationMin;
}

function computeFormality(fillerRate: number, speakingRate: number, hasFace: boolean): number {
  // High filler = low formality, fast speech = low formality
  let f = 0.5;
  if (fillerRate > 0.05) f -= 0.3;
  else if (fillerRate > 0.02) f -= 0.1;
  else if (fillerRate < 0.01) f += 0.2;

  if (speakingRate > 180) f -= 0.1;
  else if (speakingRate < 120) f += 0.15;

  // Studio setup (inferred from face tracking quality) suggests formality
  if (hasFace) f += 0.05;

  return clamp(f, 0, 1);
}

function estimateColorTemp(analyses: AssetAnalysis[]): number {
  // Default neutral daylight
  if (!analyses.length || !analyses[0].keyframeAnalyses?.length) return 5500;
  // If dominant colors are warm (orange/yellow/red) → lower K
  // If cool (blue/cyan) → higher K
  // This is a rough estimate; real implementation would read colorTemp from 5-Track
  const firstFrame = analyses[0].keyframeAnalyses[0];
  const colors = firstFrame?.dominantColors ?? [];
  const warmColors = colors.filter(c => /orange|yellow|red|gold|amber/i.test(c));
  const coolColors = colors.filter(c => /blue|cyan|teal|purple/i.test(c));
  if (warmColors.length > coolColors.length) return 4000; // warm
  if (coolColors.length > warmColors.length) return 7000; // cool
  return 5500; // neutral
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
