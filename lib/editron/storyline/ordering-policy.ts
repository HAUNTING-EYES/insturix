/**
 * ordering-policy - the ORDER-INTENT gate (B7). Decides HOW a set of scenes should be ordered:
 * a NARRATIVE (story) order that reorders for impact, or a PROCEDURAL order that recovers the
 * natural step/causal sequence and must NOT be scrambled.
 *
 * Why it exists (evidence, not theory): on the production model (gemini-2.5-flash) the always-story
 * ordering prompt led a furniture-assembly edit with the finished product ("opens with the finished
 * product") - a broken tutorial. Detection is CONSERVATIVE because the damage is asymmetric:
 * scrambling a process is a damage-10 failure (the video is wrong); leaving a highlight reel
 * chronological is a damage-3 (just less punchy).
 *
 * Order SOURCE (separate axis from mode): a SCRIPT (given or imported) is the authoritative order
 * when present; otherwise the clips' own CONTENT (audio + video) decides; when neither can tell us
 * the order, we say so (lowConfidence) rather than fake it - the same conviction principle as the
 * coverage work. We deliberately do NOT rank on filename numbering or upload order (founder: those
 * are not reliable intent).
 *
 * Rule 30 boundary: the heavy "is this a process?" judgment ultimately belongs to the LLM reading
 * the content (the ordering prompt, Phase 2). This module supplies cheap, RELIABLE deterministic
 * priors - explicit content-type, speech coverage, script presence - plus a conservative,
 * CORROBORATED sequence-cue signal. It never fabricates: absent signal => lower confidence, not a
 * guessed mode. Pure; never throws.
 */

import type { ProductionBrief } from '../production-brief/production-brief';
import type { Scene } from './scene';

export type OrderingMode = 'narrative' | 'procedural';
export type OrderingConfidence = 'high' | 'medium' | 'low';
/** Where the correct order comes from. 'insufficient' = we cannot tell (surface to the user). */
export type OrderSource = 'script' | 'content' | 'insufficient';

export interface OrderingPolicy {
  /** How to order: recover a story (narrative) or preserve the causal step sequence (procedural). */
  mode: OrderingMode;
  /** What the order is derived from. */
  orderSource: OrderSource;
  confidence: OrderingConfidence;
  /** True when we cannot order with conviction - the caller should flag this to the user, not fake it. */
  lowConfidence: boolean;
  /** One-line human-readable rationale (telemetry + the user-facing low-confidence note). */
  reason: string;
  /** The signals that fired, for provenance/telemetry. */
  signals: string[];
}

export interface ResolvePolicyOptions {
  /** Explicit content-type from the analysis pipeline (contentTypeDetection), when known. */
  contentType?: string;
  /** True when an authoritative script/order was given or imported (order SOURCE = script). */
  hasScript?: boolean;
  /** Min scenes carrying a sequence cue to corroborate 'procedural'. INVENTED-PLACEHOLDER. */
  minSequenceCueScenes?: number;
  /** Speech coverage at/above which content is a trustworthy order source. INVENTED-PLACEHOLDER. */
  speechCoverageForContent?: number;
}

/** Content-type / intent words that mean "a process with steps". */
const PROCEDURAL_CONTENT = /\b(tutorial|how[- ]?to|guide|recipe|cook(ing)?|diy|instructional|walk[- ]?through|step[- ]by[- ]step|explainer|demo(nstration)?|setup|install(ation)?|assembl(y|e)|process|lesson|course)\b/i;
/** Content-type / intent words that mean "a story / promo" (reorder for impact). */
const NARRATIVE_CONTENT = /\b(ad|advert(isement)?|promo|commercial|highlight|montage|reel|testimonial|story|vlog|trailer|teaser|brand\s*film|hype)\b/i;

/**
 * STRONG sequence cues - ordinals and explicit step markers, in English and a few UNAMBIGUOUS Hindi
 * ordinals. Deliberately EXCLUDES bare "then / next / after": "then he said" is narration, not a
 * step (the Rule 29 false-positive that regex meta-detection keeps tripping on). Corroboration
 * (>= minSequenceCueScenes) is required before this alone flips the mode.
 */
const SEQUENCE_CUE = /\b(first(ly)?|second(ly)?|third(ly)?|fourth(ly)?|step\s*(one|two|three|four|five|1|2|3|4|5)|finally|lastly|to begin with|begin by|start by|sabse pehle|doosra|teesra|chautha)\b/i;

function clampCount(scenes: readonly Scene[]): { speech: Scene[]; coverage: number } {
  const speech = scenes.filter((s) => s.hasSpeech && s.transcription.trim().length > 0);
  const coverage = scenes.length > 0 ? speech.length / scenes.length : 0;
  return { speech, coverage };
}

/**
 * Resolve the ordering policy for a scene set. Pure; never throws. Signals come only from what a
 * Scene actually carries (transcript, hasSpeech) plus injected priors (contentType, hasScript) -
 * never fabricated. When nothing tells us the order, `lowConfidence` is true and `orderSource` is
 * 'insufficient' so the caller can ask the user instead of guessing.
 */
export function resolveOrderingPolicy(
  scenes: readonly Scene[],
  brief: ProductionBrief,
  opts?: ResolvePolicyOptions,
): OrderingPolicy {
  const signals: string[] = [];
  const minCues = opts?.minSequenceCueScenes ?? 2;
  const speechForContent = opts?.speechCoverageForContent ?? 0.5;

  const ctText = `${opts?.contentType ?? ''} ${brief.output.intent ?? ''} ${brief.output.style ?? ''}`;
  const ctProcedural = PROCEDURAL_CONTENT.test(ctText);
  const ctNarrative = NARRATIVE_CONTENT.test(ctText);

  const { speech, coverage } = clampCount(scenes);
  const cueScenes = speech.filter((s) => SEQUENCE_CUE.test(s.transcription)).length;
  // A cue signal only counts as STRONG when corroborated across clips AND it is at least half of the
  // speaking clips - a single incidental "first of all" in an ad must not flip the whole edit.
  const strongCues = cueScenes >= minCues && cueScenes >= Math.ceil(speech.length / 2);

  // ── order SOURCE ──
  let orderSource: OrderSource;
  if (opts?.hasScript) {
    orderSource = 'script';
    signals.push('script-provided');
  } else if (coverage >= speechForContent) {
    orderSource = 'content';
    signals.push(`speech-coverage ${coverage.toFixed(2)}`);
  } else if (speech.length > 0) {
    orderSource = 'content';
    signals.push(`partial-speech ${speech.length}/${scenes.length}`);
  } else {
    orderSource = 'insufficient';
    signals.push('no-speech, no-script');
  }

  // ── MODE ── (content-type is the reliable primary; corroborated cues are secondary)
  let mode: OrderingMode = 'narrative';
  if (ctProcedural) {
    mode = 'procedural';
    signals.push('content-type:procedural');
  } else if (strongCues && !ctNarrative) {
    mode = 'procedural';
    signals.push(`sequence-cues x${cueScenes}`);
  } else if (ctNarrative) {
    signals.push('content-type:narrative');
  } else if (cueScenes > 0) {
    signals.push(`weak-cues x${cueScenes} (not corroborated)`);
  }

  // ── CONFIDENCE ──
  let confidence: OrderingConfidence;
  if (orderSource === 'script' || ctProcedural || ctNarrative) {
    confidence = 'high';
  } else if (orderSource === 'content' && (strongCues || coverage >= 0.7)) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  const lowConfidence = orderSource === 'insufficient' || confidence === 'low';

  const reason = buildReason(mode, orderSource, confidence, lowConfidence);
  return { mode, orderSource, confidence, lowConfidence, reason, signals };
}

function buildReason(mode: OrderingMode, orderSource: OrderSource, confidence: OrderingConfidence, low: boolean): string {
  if (orderSource === 'insufficient') {
    return 'Not enough signal to know the order (no speech, no script) - ordered as given; ask the user to confirm.';
  }
  const src = orderSource === 'script' ? 'the provided script' : 'the clips\' own content';
  const how = mode === 'procedural'
    ? 'kept in step/causal order (a process - not reordered for drama)'
    : 'ordered for the strongest story';
  const caveat = low ? ' Low confidence - worth a user check.' : '';
  return `${mode === 'procedural' ? 'Procedural' : 'Narrative'} edit from ${src}: ${how}. (${confidence} confidence)${caveat}`;
}
