/**
 * Signal Executor — Core Signal-to-Technique Decision Engine
 *
 * The beating heart of Mode 2 editing. For each moment in the video:
 *   1. Reads signal values (from signal-registry.ts)
 *   2. Evaluates 95 mappings from the creative knowledge graph
 *   3. Applies technique parameters modulated by moment weight
 *   4. Enforces anti-patterns and budgets
 *   5. Outputs standard EditDecisionList for EDL executor
 *
 * Two evaluation modes (FLAG 1 dual timing):
 *   - Grid-based: continuous signals evaluated every 15 frames
 *   - Event-based: transcript signals evaluated at exact word timestamps
 *
 * Weight interpolation (FLAG 4): technique parameters interpolated within ranges
 * based on moment_weight at that frame.
 *
 * Consumers: director-agent.ts (Path D)
 * Produces: EditDecisionList (same type EDL executor already consumes)
 */

import type {
  GraphIndex, GenreParameters, SignalValues,
  MappingNode, TechniqueNode,
} from './graph-query';
import {
  evaluateMapping, getTechnique, interpolateParams,
  getMappingsForSignal,
} from './graph-query';
import type { SignalTimeline, SignalSnapshot, EventSignal, OverlayInfo } from './signal-registry';
import type { MomentWeightMap } from './moment-weight-service';
import { getWeightAtTimestamp } from './moment-weight-service';
import { enrichMotionGraphicFactParams } from './mg-semantic-facts';

// ─── Output Types (compatible with EDL Executor) ────────────────────────────

export interface EditDecision {
  type: 'zoom' | 'transition' | 'graphic' | 'sfx' | 'sfx-trigger' | 'speed-change' |
        'filter-change' | 'caption-emphasis' | 'audio-duck' | 'fade' | 'camera-shake' |
        'cut' | 'pacing';
  frame: number;
  confidence: number;
  source: string;               // mapping ID that produced this
  technique: string;            // technique ID applied
  params: Record<string, unknown>;
  complements?: EditDecision[];  // paired SFX, caption emphasis, etc.
  reason?: string;               // from mapping's "why" field
}

export interface EditDecisionList {
  decisions: EditDecision[];
  metadata: {
    totalMappingsEvaluated: number;
    totalMappingsFired: number;
    totalDecisionsGenerated: number;
    totalDecisionsSuppressed: number;
    executionTimeMs: number;
  };
}

// ─── Budget Tracking ────────────────────────────────────────────────────────

interface BudgetState {
  zoomCount: number;
  zoomBudget: number;
  graphicCount: number;
  shakeCount: number;
  sfxCount: number;
  captionEmphasisCount: number;
  lastZoomFrame: number;
  lastGraphicFrame: number;
  lastCutFrame: number;
  lastShakeFrame: number;
  lastSfxFrame: number;
  transitionCounts: Map<string, number>;
  // Scaled budgets (computed from video duration)
  shakeBudget: number;
  sfxBudget: number;
  captionEmphasisBudget: number;
}

interface SignalCandidateScore {
  momentImportance: number;
  candidateConfidence: number;
  executionConfidence: number;
  evidenceStrength: number;
  triggerSignalCount: number;
  strongestSignal?: string;
  strongestSignalValue?: number | boolean | string;
  calibrationStatus: 'invented-needs-calibration';
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MIN_ZOOM_GAP_FRAMES = 90;        // 3s at 30fps between zooms
const MIN_GRAPHIC_GAP_FRAMES = 90;     // 3s between graphics
const MIN_CUT_GAP_FRAMES = 15;         // 0.5s minimum between cuts
const MIN_SHAKE_GAP_FRAMES = 60;       // 2s between shakes (KB CS-020)
const MIN_SFX_GAP_FRAMES = 15;         // 0.5s between SFX triggers
const MAX_TRANSITIONS_PER_TYPE = 4;    // max 4 of same transition type per video
// Per-30s rate limits (used for scaled budgets)
// ⚠️ UNVERIFIED — values from decision-budget.ts citing KB rule IDs.
// KB audit (Phase 3) may revise these. Reasonable defaults for now.
const SHAKE_PER_30S = 4;               // decision-budget.ts cites KB CS-020
const SFX_PER_30S = 15;                // decision-budget.ts cites KB A-100
const CAPTION_EMPHASIS_PER_30S = 10;   // decision-budget.ts cites KB C-012
const BUDGET_OVERRIDE_WEIGHT = 0.9;    // weight > 0.9 can override ONE budget limit
const MAX_DECISIONS_PER_WINDOW = 3;    // max 3 decisions per 15-frame window (prevent flooding)
const SIGNAL_ACTIVATION_THRESHOLD = 0.25; // signals below this don't trigger mappings

// Mappings that should fire ONCE per project (not per sample point)
const ONCE_PER_PROJECT_CATEGORIES = new Set([
  'sound-design',  // ambient_bed_construction, spot_sfx, etc.
  'color',         // initial_grade_selection, grade_shift
  'caption',       // caption_activation, caption_position
  'visual-finishing', // film_grain, vignette, color_consistency
]);

// Mappings that require clip boundaries (useless with single clip)
const REQUIRES_CLIP_BOUNDARY = new Set([
  'mapping:transition.dissolve', 'mapping:transition.fade_to_black',
  'mapping:transition.whip_pan', 'mapping:transition.flash',
  'mapping:transition.wipe', 'mapping:transition.j_cut',
  'mapping:transition.l_cut', 'mapping:transition.match_cut',
  'mapping:transition.smash_cut', 'mapping:transition.jump_cut',
  'mapping:transition.invisible_cut', 'mapping:transition.dip_to_white',
  'mapping:transition.film_burn', 'mapping:transition.iris_wipe',
  'mapping:transition.blur', 'mapping:transition.slide',
  'mapping:transition.soft_cut', 'mapping:transition.default_hard_cut',
]);

// Mode 2: Structural-positional mappings SKIPPED for raw footage.
// These are Mode 1 assembly rules (timers, position zones, density targets).
// Mode 2 content already has inherent flow from the speaker's pacing, energy,
// and topic structure. Imposing structural rules fights the content.
// Content-driven mappings (speech, entity, visual, audio, composite) handle
// everything: energy peaks → zooms, entities → graphics, topic shifts → cuts.
const MODE_2_SKIP_CATEGORIES = new Set([
  'structural',       // pacing_tolerance_exceeded, hook_zone, closing_zone, edit_density_correction, etc.
  'title-card',       // chapter markers (Mode 1 concept — topic_boundary handles this for Mode 2)
  'music-editing',    // music_duration_fit, music_climax_alignment (Mode 2 has production audio)
]);

// ─── Main Executor ──────────────────────────────────────────────────────────

/**
 * Execute signal-driven editing on a timeline.
 * Evaluates all mappings, applies techniques, respects constraints.
 */
export function executeSignalDrivenEdit(
  timeline: SignalTimeline,
  genreParams: GenreParameters,
  weightMap: MomentWeightMap,
  graphIndex: GraphIndex,
  overlays: OverlayInfo[]
): EditDecisionList {
  const startTime = Date.now();
  const decisions: EditDecision[] = [];
  const seenEntityNames = new Set<string>();
  let mappingsEvaluated = 0;
  let mappingsFired = 0;
  let decisionsSuppressed = 0;

  // Compute duration-scaled budgets for rate-limited decision types.
  // KB rates are per 30 seconds. Scale linearly with video duration.
  const durationScale = Math.max(1, timeline.totalFrames / (30 * (timeline.fps || 30)));
  const budget: BudgetState = {
    zoomCount: 0,
    zoomBudget: genreParams.zoom_budget,
    graphicCount: 0,
    shakeCount: 0,
    sfxCount: 0,
    captionEmphasisCount: 0,
    lastZoomFrame: -999,
    lastGraphicFrame: -999,
    lastCutFrame: -999,
    lastShakeFrame: -999,
    lastSfxFrame: -999,
    transitionCounts: new Map(),
    shakeBudget: Math.ceil(SHAKE_PER_30S * durationScale),         // KB CS-020
    sfxBudget: Math.ceil(SFX_PER_30S * durationScale),             // KB A-100
    captionEmphasisBudget: Math.ceil(CAPTION_EMPHASIS_PER_30S * durationScale), // KB C-012
  };

  // ── Structural guards ─────────────────────────────────────────────

  // Single-clip guard: if only 1 video overlay, transitions are impossible
  const videoOverlays = overlays.filter(o => o.type === 'video');
  const videoOverlayCount = videoOverlays.length;
  const hasSingleClip = videoOverlayCount <= 1;

  // CRITICAL: Clamp decisions to actual video overlay extent.
  // The transcript may be longer than the video on timeline (e.g., 17 min transcript
  // but only 28s video overlay due to upload truncation). Decisions placed beyond
  // the video's frame range are garbage — they land in empty timeline space.
  const maxVideoFrame = videoOverlays.length > 0
    ? Math.max(...videoOverlays.map(o => o.from + o.durationInFrames))
    : timeline.totalFrames;

  // Track once-per-project mappings that already fired
  const firedOnceCategories = new Set<string>();
  const firedOnceMappings = new Set<string>();

  // Per-window decision counter (prevents flooding)
  let decisionsInCurrentWindow = 0;
  let currentWindowFrame = -999;

  // ── Evaluate grid-based signals (continuous, every 15 frames) ───────

  const gridFrames = Array.from(timeline.gridSignals.keys()).sort((a, b) => a - b);

  for (const frame of gridFrames) {
    // CLAMP: skip sample points beyond the actual video extent on timeline
    if (frame > maxVideoFrame) break;

    const snapshot = timeline.gridSignals.get(frame)!;
    const timestampMs = snapshot.timestampMs;
    const momentWeight = getWeightAtTimestamp(weightMap, timestampMs);

    // Reset per-window counter
    if (frame - currentWindowFrame >= 15) {
      decisionsInCurrentWindow = 0;
      currentWindowFrame = frame;
    }

    // Build combined signal values (grid + global)
    const signals: SignalValues = { ...timeline.globalSignals, ...snapshot };

    // Get candidate mappings — only for signals ABOVE activation threshold
    const candidateMappings = getCandidateMappings(signals, graphIndex);
    mappingsEvaluated += candidateMappings.length;

    for (const mapping of candidateMappings) {
      // Per-window limit: prevent decision flooding (max 3 per 0.5s)
      if (decisionsInCurrentWindow >= MAX_DECISIONS_PER_WINDOW) {
        decisionsSuppressed++;
        continue;
      }

      // Single-clip guard: skip transition mappings when no clip boundaries exist
      if (hasSingleClip && REQUIRES_CLIP_BOUNDARY.has(mapping.id)) {
        decisionsSuppressed++;
        continue;
      }

      // Mode 2: skip structural-positional mappings (timer/position rules).
      // Raw footage has inherent flow from the speaker. Content signals drive editing.
      if (MODE_2_SKIP_CATEGORIES.has(mapping.category)) {
        decisionsSuppressed++;
        continue;
      }

      // Once-per-project guard: sound-design, color, caption, finishing fire once
      if (ONCE_PER_PROJECT_CATEGORIES.has(mapping.category)) {
        if (firedOnceCategories.has(mapping.category) || firedOnceMappings.has(mapping.id)) {
          decisionsSuppressed++;
          continue;
        }
      }

      // Evaluate trigger condition
      if (!evaluateMapping(graphIndex, mapping.id, signals, genreParams)) {
        continue;
      }

      mappingsFired++;

      // Check anti-patterns
      if (isAntiPatternViolated(mapping, signals, frame, budget, genreParams)) {
        decisionsSuppressed++;
        continue;
      }

      // Determine weight tier
      const tier = getWeightTier(momentWeight);

      // Skip if weight too low for this mapping
      if (tier === 'skip') {
        decisionsSuppressed++;
        continue;
      }

      // Get technique and interpolate parameters
      const decision = buildDecision(mapping, tier, momentWeight, frame, graphIndex, budget, signals);
      if (!decision) continue;

      // Budget check
      if (!checkBudget(decision, budget, momentWeight)) {
        decisionsSuppressed++;
        continue;
      }

      // Update budget state
      updateBudget(decision, frame, budget);

      // Track per-window and once-per-project
      decisionsInCurrentWindow++;
      if (ONCE_PER_PROJECT_CATEGORIES.has(mapping.category)) {
        firedOnceCategories.add(mapping.category);
        firedOnceMappings.add(mapping.id);
      }

      decisions.push(decision);

      // Add complement decisions (SFX pairings, caption emphasis)
      const complements = buildComplements(mapping, decision, momentWeight, frame, graphIndex, budget);
      decisions.push(...complements);
    }
  }

  // ── Evaluate event-based signals (at exact word timestamps) ─────────

  for (const event of timeline.eventSignals) {
    const { frame, signal, value, context } = event;

    // CLAMP: skip events beyond the actual video extent on timeline
    if (frame > maxVideoFrame) continue;

    const timestampMs = event.timestampMs;
    const momentWeight = getWeightAtTimestamp(weightMap, timestampMs);

    // Get mappings for this specific signal
    const signalId = `signal:${signal}`;
    const mappings = getMappingsForSignal(graphIndex, signalId);
    mappingsEvaluated += mappings.length;

    // Build signal values for this event
    const gridSnapshot = getNearestGridSnapshot(timeline, frame);
    const signals: SignalValues = {
      ...timeline.globalSignals,
      ...(gridSnapshot ?? {}),
      [signal]: value,
      [`${signal}_context`]: context ?? '',
    };
    if (signal === 'entity.number') {
      const claimStrength = inferLocalClaimStrength(context ?? '');
      signals.claim_strength = claimStrength;
      signals['entity.claim_strength'] = claimStrength;
    }

    for (const mapping of mappings) {
      if (!evaluateMapping(graphIndex, mapping.id, signals, genreParams)) {
        continue;
      }

      mappingsFired++;

      if (isAntiPatternViolated(mapping, signals, frame, budget, genreParams)) {
        decisionsSuppressed++;
        continue;
      }

      const tier = getWeightTier(momentWeight);
      if (tier === 'skip') { decisionsSuppressed++; continue; }

      const decision = buildDecision(mapping, tier, momentWeight, frame, graphIndex, budget, signals);
      if (!decision) continue;

      if (context && decision.type === 'graphic') {
        if (event.signal === 'entity.name') {
          const normalized = context.toLowerCase();
          if (seenEntityNames.has(normalized)) {
            decisionsSuppressed++;
            continue;
          }
          seenEntityNames.add(normalized);
        }
        enrichMotionGraphicFactParams(decision.params, { signal: event.signal, context });
      }

      if (!checkBudget(decision, budget, momentWeight)) {
        decisionsSuppressed++;
        continue;
      }

      updateBudget(decision, frame, budget);
      decisions.push(decision);

      const complements = buildComplements(mapping, decision, momentWeight, frame, graphIndex, budget);
      decisions.push(...complements);
    }
  }

  // ── Deduplicate + sort ────────────────────────────────────────────────

  const deduped = deduplicateDecisions(decisions);
  deduped.sort((a, b) => a.frame - b.frame || b.confidence - a.confidence);

  return {
    decisions: deduped,
    metadata: {
      totalMappingsEvaluated: mappingsEvaluated,
      totalMappingsFired: mappingsFired,
      totalDecisionsGenerated: deduped.length,
      totalDecisionsSuppressed: decisionsSuppressed,
      executionTimeMs: Date.now() - startTime,
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCandidateMappings(signals: SignalValues, graphIndex: GraphIndex): MappingNode[] {
  const candidates = new Set<MappingNode>();

  // For each active signal ABOVE activation threshold, get its triggered mappings.
  // This prevents low-energy signals (speech_energy = 0.1) from pulling in all speech mappings.
  for (const [key, value] of Object.entries(signals)) {
    if (value === null || value === undefined || value === false) continue;

    // Numeric signals must exceed threshold to activate
    if (typeof value === 'number') {
      if (value < SIGNAL_ACTIVATION_THRESHOLD) continue;
    }
    // String signals (like "none") don't activate
    if (typeof value === 'string' && (value === 'none' || value === 'unknown' || value === '')) continue;

    const signalId = key.startsWith('signal:') ? key : `signal:${key}`;
    const mappings = getMappingsForSignal(graphIndex, signalId);
    for (const m of mappings) candidates.add(m);
  }

  return Array.from(candidates);
}

function getWeightTier(weight: number): 'high' | 'medium' | 'low' | 'skip' {
  if (weight >= 0.8) return 'high';
  if (weight >= 0.5) return 'medium';
  if (weight >= 0.3) return 'low';
  return 'skip';
}

function inferLocalClaimStrength(context: string): 'assertive' | 'hedged' {
  return /\b(maybe|perhaps|around|about|roughly|approximately|could be|might be|probably|i think|it seems)\b/i.test(context)
    ? 'hedged'
    : 'assertive';
}

function isAntiPatternViolated(
  mapping: MappingNode,
  signals: SignalValues,
  frame: number,
  budget: BudgetState,
  genreParams: GenreParameters
): boolean {
  const antiPatterns = mapping.details.antiPatterns;
  if (!antiPatterns?.length) return false;

  for (const ap of antiPatterns) {
    const lower = ap.toLowerCase();

    // "Don't zoom if already zoomed past 1.2x"
    if (lower.includes('already zoomed') && budget.zoomCount > 0 &&
        frame - budget.lastZoomFrame < MIN_ZOOM_GAP_FRAMES) {
      return true;
    }

    // "Don't if time_since_last_zoom < 3s"
    if (lower.includes('time_since_last_zoom') && frame - budget.lastZoomFrame < MIN_ZOOM_GAP_FRAMES) {
      return true;
    }

    // "Don't add graphics during energy build"
    if (lower.includes('don\'t add graphics') || lower.includes('don\'t add graphic')) {
      const speechDelta = (signals['speech.energy_delta'] as number) ?? 0;
      if (speechDelta > 0.1) return true;
    }

    // "Don't if formality > 0.7"
    if (lower.includes('formality > 0.7') && genreParams.formality > 0.7) {
      return true;
    }

    // "Don't if formality > 0.6"
    if (lower.includes('formality > 0.6') && genreParams.formality > 0.6) {
      return true;
    }

    // "Don't during montage_mode"
    if (lower.includes('montage_mode') || lower.includes('montage')) {
      if (signals['composite.montage_mode'] === true) return true;
    }

    // "NEVER cut mid-word"
    if (lower.includes('never cut mid-word') || lower.includes('cut mid-word')) {
      // This is enforced downstream by constraint-enforcer, not here
      // But we note it for the decision metadata
    }

    // "Don't if active_overlays_count >= 2"
    if (lower.includes('active_overlays') || lower.includes('overlays_count')) {
      const count = (signals['structural.active_overlays_count'] as number) ?? 0;
      if (count >= 2) return true;
    }
  }

  return false;
}

function buildDecision(
  mapping: MappingNode,
  tier: 'high' | 'medium' | 'low',
  momentWeight: number,
  frame: number,
  graphIndex: GraphIndex,
  budget: BudgetState,
  signals?: Record<string, unknown>,
): EditDecision | null {
  const primary = mapping.details.primary;
  if (!primary) return null;

  const producedTechniqueId = graphIndex.producesTechnique.get(mapping.id);
  if (!producedTechniqueId) return null;
  const technique = getTechnique(graphIndex, producedTechniqueId);
  if (!technique) return null;

  const techniqueId = technique.id;
  if (!isExecutableMappingTechnique(mapping, technique, producedTechniqueId)) return null;

  const edlType = technique.details?.edlDecisionType;
  if (!isExecutableEdlType(edlType)) return null;

  // Interpolate parameters based on weight
  const params: Record<string, unknown> = interpolateParams(technique, momentWeight);
  // Propagate transition type from technique ID → params.transitionType
  // so the EDL executor can read it (it reads params.transitionType, not decision.technique)
  if (edlType === 'transition' && techniqueId.startsWith('technique:transition.')) {
    params.transitionType = mapGraphTransitionToEdl(techniqueId);
  }

  // ── Attach signal snapshot to decision (ROOT CAUSE FIX) ──
  // Previously: signal values were DISCARDED after triggering mappings.
  // edl-executor read decision.params.signals → always {} → composition used DEFAULT_SIGNALS.
  // Now: attach the signal values that PRODUCED this decision so composition uses REAL data.
  // Only attach PlannerSignals-relevant subset to avoid bloating every decision.
  // ── Attach signal snapshot to decision (ROOT CAUSE FIX) ──
  // Previously: signal values were DISCARDED after triggering mappings.
  // edl-executor read decision.params.signals → always {} → composition used DEFAULT_SIGNALS.
  // Now: attach the signal values that PRODUCED this decision so composition uses REAL data.
  //
  // Key mapping: signal-registry uses dot-notation (speech.emotion_intensity)
  // but ContentSignals/PlannerSignals use flat keys (emotion_intensity).
  // Map dot→flat so resolveMotionTokens and planComposition receive compatible data.
  if (signals) {
    const signalSubset: Record<string, number | string> = {};

    // Dot-notation registry key → flat ContentSignals/PlannerSignals key
    const SIGNAL_MAP: Array<[string, string]> = [
      // Personality signals (computed in signal-registry.ts as globals, available via line 215 merge)
      ['content.formality', 'formality'],
      ['personality.enthusiasm', 'enthusiasm'],
      ['personality.warmth', 'warmth'],
      ['personality.emotional_arousal', 'emotional_arousal'],
      ['personality.pacing_velocity', 'pacing_velocity'],
      ['personality.humor', 'humor'],
      ['personality.visceral_impact', 'visceral_impact'],
      ['personality.visual_dependency', 'visual_dependency'],
      // Phase B ContentSignals (dot → flat)
      ['speech.emotion_intensity', 'emotion_intensity'],
      ['speech.pitch_variability', 'pitch_variability'],
      ['speech.speaking_rate_wpm', 'speaking_rate_wpm'],
      ['speech.silence_duration_ms', 'silence_duration_ms'],
      ['audio.music_energy', 'music_energy'],
      ['audio.music_section', 'music_section'],
      ['structural.position_in_video', 'position_in_video'],
      ['composite.narrative_pressure', 'narrative_pressure'],
      // NEW: 7 signals wired to MG planner (CEO plan D1)
      ['visual.motion_intensity', 'motion_intensity'],
      ['visual.shot_scale', 'shot_scale'],
      ['visual.face_emotion', 'face_emotion'],
      ['speech.energy', 'speech_energy'],
      ['structural.time_since_last_cut', 'time_since_last_cut'],
      ['composite.cinematic_moment', 'cinematic_moment'],
      ['speech.stress_detected', 'stress_detected'],
      // D1 expansion: 8 high-value signals from registry → PlannerSignals
      ['visual.face_present', 'face_present'],
      ['visual.scene_type', 'scene_type'],
      ['visual.significance', 'visual_significance'],
      ['structural.active_overlays_count', 'active_overlay_count'],
      ['composite.montage_mode', 'montage_mode'],
      ['speech.energy_delta', 'energy_delta'],
      ['speech.coverage', 'speech_coverage'],
      ['composite.emotional_alignment', 'emotional_alignment'],
      // D1/D6: tatum sub-beat signal for 7-level beat hierarchy
      ['audio.music_tatum', 'music_tatum'],
      // D1 final: PERCEPTUAL dimension — closes the biggest signal gap
      ['visual.complexity', 'visual_complexity'],
      ['visual.text_on_screen', 'text_on_screen'],
      // BPM for beat grid generation at render time
      ['audio.bpm', 'bpm'],
    ];

    for (const [registryKey, flatKey] of SIGNAL_MAP) {
      const val = signals[registryKey];
      if (val != null && val !== '') {
        signalSubset[flatKey] = typeof val === 'number' ? val : String(val);
      }
    }

    if (Object.keys(signalSubset).length > 0) {
      (params as any).signals = signalSubset;
    }
  }

  const score = computeSignalCandidateScore(mapping, momentWeight, graphIndex, signals);
  params.momentImportance = score.momentImportance;
  params.candidateConfidence = score.candidateConfidence;
  params.executionConfidence = score.executionConfidence;
  params.evidenceStrength = score.evidenceStrength;
  params.signalNormalization = {
    version: 'signal-candidate-normalization-v1',
    triggerSignalCount: score.triggerSignalCount,
    strongestSignal: score.strongestSignal,
    strongestSignalValue: score.strongestSignalValue,
    calibrationStatus: score.calibrationStatus,
  };

  return {
    type: edlType as EditDecision['type'],
    frame,
    confidence: score.executionConfidence,
    source: mapping.id,
    technique: techniqueId,
    params,
    reason: mapping.details.why,
  };
}

function computeSignalCandidateScore(
  mapping: MappingNode,
  momentWeight: number,
  graphIndex: GraphIndex,
  signals?: Record<string, unknown>,
): SignalCandidateScore {
  const momentImportance = roundSignalScore(clampSignal01(momentWeight));
  const evidence = collectMappingSignalEvidence(mapping, graphIndex, signals);
  const evidenceStrength = roundSignalScore(evidence.strength ?? 0.55);
  const candidateConfidence = roundSignalScore(clampSignal01(0.45 + evidenceStrength * 0.45 + momentImportance * 0.1));
  const executionConfidence = roundSignalScore(clampSignal01(candidateConfidence * 0.78 + momentImportance * 0.22));

  return {
    momentImportance,
    candidateConfidence,
    executionConfidence,
    evidenceStrength,
    triggerSignalCount: evidence.count,
    strongestSignal: evidence.strongestSignal,
    strongestSignalValue: evidence.strongestSignalValue,
    calibrationStatus: 'invented-needs-calibration',
  };
}

function collectMappingSignalEvidence(
  mapping: MappingNode,
  graphIndex: GraphIndex,
  signals?: Record<string, unknown>,
): { strength?: number; count: number; strongestSignal?: string; strongestSignalValue?: number | boolean | string } {
  if (!signals) return { count: 0 };

  const triggerEdges = graphIndex.edgesFrom.get(mapping.id)?.filter((edge) => edge.type === 'triggered_by') ?? [];
  let strongestScore = -1;
  let strongestSignal: string | undefined;
  let strongestSignalValue: number | boolean | string | undefined;
  let count = 0;

  for (const edge of triggerEdges) {
    const signalId = edge.to;
    const value = lookupSignalEvidenceValue(signals, signalId);
    if (value === undefined) continue;
    const score = signalValueEvidenceScore(value);
    count++;
    if (score > strongestScore) {
      strongestScore = score;
      strongestSignal = signalId;
      strongestSignalValue = typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string'
        ? value
        : String(value);
    }
  }

  return strongestScore >= 0
    ? { strength: strongestScore, count, strongestSignal, strongestSignalValue }
    : { count };
}

function lookupSignalEvidenceValue(signals: Record<string, unknown>, signalId: string): unknown {
  const bare = signalId.startsWith('signal:') ? signalId.slice('signal:'.length) : signalId;
  const candidates = [
    signalId,
    bare,
    bare.replace(/_/g, '.'),
    bare.replace(/\./g, '_'),
    bare.split('.').slice(-1)[0],
  ];

  for (const key of candidates) {
    if (key && signals[key] !== undefined && signals[key] !== null) return signals[key];
  }
  return undefined;
}

function signalValueEvidenceScore(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0;
    if (value >= 0 && value <= 1) return roundSignalScore(value);
    return roundSignalScore(clampSignal01(Math.abs(value)));
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized && normalized !== 'none' && normalized !== 'unknown' ? 0.85 : 0;
  }
  return 0;
}

function decisionCandidateRank(decision: EditDecision): number {
  const execution = numericParam(decision.params.executionConfidence) ?? decision.confidence;
  const candidate = numericParam(decision.params.candidateConfidence) ?? execution;
  const evidence = numericParam(decision.params.evidenceStrength) ?? candidate;
  const moment = numericParam(decision.params.momentImportance) ?? decision.confidence;
  return roundSignalScore(clampSignal01(execution * 0.55 + candidate * 0.2 + evidence * 0.15 + moment * 0.1));
}

function numericParam(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clampSignal01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundSignalScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function buildComplements(
  mapping: MappingNode,
  primaryDecision: EditDecision,
  momentWeight: number,
  frame: number,
  graphIndex: GraphIndex,
  budget?: BudgetState
): EditDecision[] {
  const complements: EditDecision[] = [];
  if (!mapping.details.complements?.length) return complements;

  // Only add complements at medium+ weight
  if (momentWeight < 0.5) return complements;

  for (const complement of mapping.details.complements) {
    const lower = complement.toLowerCase();

    // SFX complement — rate-limited by budget (KB A-100: max 15/30s)
    if (lower.includes('sfx') || lower.includes('impact') || lower.includes('whoosh')) {
      const sfxDecision: EditDecision = {
        type: 'sfx-trigger',
        frame,
        confidence: momentWeight * 0.8,
        source: mapping.id,
        technique: 'technique:sound.sfx_impact',
        params: { level_db: momentWeight > 0.7 ? -12 : -16, type: inferSfxType(lower) },
        reason: `Complement for ${primaryDecision.technique}`,
      };
      if (!budget || checkBudget(sfxDecision, budget, momentWeight)) {
        complements.push(sfxDecision);
        if (budget) updateBudget(sfxDecision, frame, budget);
      }
    }

    // Caption emphasis complement — rate-limited by budget (KB C-012: max 10/30s)
    if (lower.includes('caption') && lower.includes('emphasis')) {
      const capDecision: EditDecision = {
        type: 'caption-emphasis',
        frame,
        confidence: momentWeight * 0.7,
        source: mapping.id,
        technique: 'technique:caption.caption_emphasis',
        params: { scale: momentWeight > 0.7 ? 1.4 : 1.2, accent_color: 'true' },
        reason: `Complement for ${primaryDecision.technique}`,
      };
      if (!budget || checkBudget(capDecision, budget, momentWeight)) {
        complements.push(capDecision);
        if (budget) updateBudget(capDecision, frame, budget);
      }
    }

    // Zoom complement (subtle)
    if (lower.includes('zoom_drift') || lower.includes('zoom_push') && !primaryDecision.type.includes('zoom')) {
      if (momentWeight > 0.6) {
        complements.push({
          type: 'zoom',
          frame,
          confidence: momentWeight * 0.6,
          source: mapping.id,
          technique: 'technique:zoom.zoom_drift',
          params: { start_scale: 1.0, end_scale: 1.05, duration_s: 4 },
          reason: `Subtle zoom complement`,
        });
      }
    }
  }

  return complements;
}

function checkBudget(decision: EditDecision, budget: BudgetState, weight: number): boolean {
  switch (decision.type) {
    case 'zoom':
      if (budget.zoomCount >= budget.zoomBudget) {
        // Weight > 0.9 can override ONE time
        if (weight > BUDGET_OVERRIDE_WEIGHT && budget.zoomCount === budget.zoomBudget) {
          return true; // allow one override
        }
        return false;
      }
      if (decision.frame - budget.lastZoomFrame < MIN_ZOOM_GAP_FRAMES) return false;
      return true;

    case 'graphic':
      if (decision.frame - budget.lastGraphicFrame < MIN_GRAPHIC_GAP_FRAMES) return false;
      return true;

    case 'transition': {
      const transType = (decision.params['transitionType'] as string) ?? (decision.params['type'] as string) ?? 'hard-cut';
      const count = budget.transitionCounts.get(transType) ?? 0;
      if (count >= MAX_TRANSITIONS_PER_TYPE && transType !== 'hard-cut') return false;
      return true;
    }

    case 'camera-shake':
      if (budget.shakeCount >= budget.shakeBudget) return false;
      if (decision.frame - budget.lastShakeFrame < MIN_SHAKE_GAP_FRAMES) return false;
      return true;

    case 'sfx-trigger':
      if (budget.sfxCount >= budget.sfxBudget) return false;
      if (decision.frame - budget.lastSfxFrame < MIN_SFX_GAP_FRAMES) return false;
      return true;

    case 'caption-emphasis':
      if (budget.captionEmphasisCount >= budget.captionEmphasisBudget) return false;
      return true;

    default:
      return true;
  }
}

function updateBudget(decision: EditDecision, frame: number, budget: BudgetState): void {
  switch (decision.type) {
    case 'zoom':
      budget.zoomCount++;
      budget.lastZoomFrame = frame;
      break;
    case 'graphic':
      budget.graphicCount++;
      budget.lastGraphicFrame = frame;
      break;
    case 'transition': {
      const transType = (decision.params['transitionType'] as string) ?? (decision.params['type'] as string) ?? 'hard-cut';
      budget.transitionCounts.set(transType, (budget.transitionCounts.get(transType) ?? 0) + 1);
      break;
    }
    case 'cut':
      budget.lastCutFrame = frame;
      break;
    case 'camera-shake':
      budget.shakeCount++;
      budget.lastShakeFrame = frame;
      break;
    case 'sfx-trigger':
      budget.sfxCount++;
      budget.lastSfxFrame = frame;
      break;
    case 'caption-emphasis':
      budget.captionEmphasisCount++;
      break;
  }
}

function deduplicateDecisions(decisions: EditDecision[]): EditDecision[] {
  const bestByWindow = new Map<string, EditDecision>();
  const insertionOrder: string[] = [];

  for (const d of decisions) {
    // Key: type + frame window (within 10 frames = same moment)
    const frameWindow = Math.floor(d.frame / 10) * 10;
    const key = `${d.type}:${frameWindow}`;

    const current = bestByWindow.get(key);
    if (!current) {
      insertionOrder.push(key);
      bestByWindow.set(key, d);
      continue;
    }

    if (decisionCandidateRank(d) > decisionCandidateRank(current)) {
      bestByWindow.set(key, d);
    }
  }

  return insertionOrder
    .map((key) => bestByWindow.get(key))
    .filter((decision): decision is EditDecision => Boolean(decision));
}

function getNearestGridSnapshot(timeline: SignalTimeline, frame: number): SignalSnapshot | null {
  const gridFrame = Math.round(frame / timeline.gridInterval) * timeline.gridInterval;
  return timeline.gridSignals.get(gridFrame) ?? null;
}

// ─── Transition Name Mapping ────────────────────────────────────────────────

const GRAPH_TO_EDL_TRANSITION: Record<string, string> = {
  hard_cut: 'hard-cut',
  soft_cut: 'soft-cut',
  dissolve: 'dissolve',
  fade_to_black: 'dip-to-black',
  fade_from_black: 'dip-to-black',
  dip_to_white: 'dip-to-white',
  wipe: 'wipe-left',
  wipe_right: 'wipe-right',
  whip_pan: 'whip-pan',
  zoom_punch: 'zoom-punch',
  glitch: 'glitch',
  flash: 'flash',
  film_burn: 'film-burn',
  iris_wipe: 'iris-wipe',
  blur_transition: 'blur-transition',
  slide_transition: 'slide-up',
  slide_up: 'slide-up',
  slide_down: 'slide-down',
  j_cut: 'hard-cut',
  smash_cut: 'smash-cut',
  match_cut: 'match-cut',
  jump_cut: 'jump-cut',
  cut_on_action: 'cut-on-action',
};

function mapGraphTransitionToEdl(techniqueId: string): string {
  const graphName = techniqueId.replace('technique:transition.', '');
  return GRAPH_TO_EDL_TRANSITION[graphName] || graphName.replace(/_/g, '-');
}

// ─── Inference Helpers ──────────────────────────────────────────────────────

function inferSfxType(description: string): string {
  if (description.includes('impact') || description.includes('hit')) return 'impact';
  if (description.includes('whoosh')) return 'whoosh';
  if (description.includes('shimmer') || description.includes('chime')) return 'shimmer';
  if (description.includes('pop') || description.includes('ding')) return 'pop';
  if (description.includes('click') || description.includes('shutter')) return 'shutter';
  return 'impact';
}

function isExecutableMappingTechnique(
  mapping: MappingNode,
  technique: TechniqueNode,
  producedTechniqueId?: string,
): boolean {
  const rawTechniqueId = (producedTechniqueId ?? technique.id).toLowerCase();
  const resolvedTechniqueId = technique.id.toLowerCase();
  const mappingTags = mapping.tags.map((tag) => tag.toLowerCase());
  const nonExecutablePrefixes = [
    'technique:composition.',
    'technique:flag.',
    'technique:pacing.',
    'technique:cut.',
    'technique:hold.',
    'technique:layout.',
    'technique:silence.',
    'technique:shot-type.',
  ];

  const isNonExecutable = nonExecutablePrefixes.some((prefix) =>
    rawTechniqueId.startsWith(prefix) || resolvedTechniqueId.startsWith(prefix)
  );
  if (isNonExecutable) return false;

  if (mappingTags.includes('deterministic') && technique.tags.includes('AI_GEN_ONLY')) {
    return false;
  }

  return true;
}

function isExecutableEdlType(edlType: unknown): edlType is EditDecision['type'] {
  return edlType === 'zoom' || edlType === 'transition' || edlType === 'graphic' ||
    edlType === 'sfx' || edlType === 'sfx-trigger' || edlType === 'speed-change' ||
    edlType === 'filter-change' || edlType === 'caption-emphasis' ||
    edlType === 'audio-duck' || edlType === 'fade' || edlType === 'camera-shake' ||
    edlType === 'cut' || edlType === 'pacing';
}
