/**
 * Brief Executor — Translates Creative Brief to frame-level EDL
 *
 * Takes the word-index-based decisions from the Creative Brief service and
 * resolves each one to an exact frame number using word timestamps + audio
 * energy curves. Then dispatches to the existing executeEDL() which handles
 * all overlay creation, zoom application, transition placement, etc.
 *
 * Architecture:
 *   CreativeBrief (word indices) → Brief Executor → EditDecisionList (frames) → executeEDL()
 *
 * Deterministic: same CreativeBrief + same word timestamps = same frame numbers. Always.
 */

import type { EditDecision, EditDecisionList } from '../types/edit-decision';
import type { CreativeBrief, BriefDecision, BriefDecisionType } from './creative-brief';
import { TYPE_TO_EDL } from '../data/decision-registry';
import { normalizeMotionGraphicContent } from './mg-content-atoms';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BriefExecutorInput {
  brief: CreativeBrief;
  transcription: { word: string; startMs: number; endMs: number }[];
  fps: number;
  audioEnergyCurve?: number[];
  totalDurationMs: number;
  /** Video overlays with sourceStartFrame for original-to-cut timeline mapping */
  overlays?: { from: number; durationInFrames: number; sourceStartFrame?: number; type?: string }[];
  /** Beat timestamps for music-mode coordinate resolution */
  beats?: { timestampMs: number; strength: number }[];
}

export interface BriefExecutorOutput {
  edl: EditDecisionList;
  stats: {
    totalDecisions: number;
    resolvedToFrame: number;
    skippedOutOfRange: number;
    snappedToEnergy: number;
  };
}

// ─── Type Mapping (from Decision Registry — single source of truth) ─────────

const TYPE_MAP: Record<string, EditDecision['type']> = { ...TYPE_TO_EDL };

type BriefSemanticFamily = 'camera' | 'transition' | 'graphic' | 'caption' | 'audio' | 'pacing' | 'unknown';

interface BriefDecisionParamContext {
  reason: string;
  coordinateSource: 'timestamp' | 'beat' | 'word';
  targetWordIdx?: number;
  targetTimestampMs?: number;
  targetBeatIdx?: number;
}

interface BriefSemanticCandidate {
  version: 'brief-semantic-candidate-v1';
  role: 'semantic-context';
  executableAuthority: false;
  originalType: BriefDecisionType;
  family: BriefSemanticFamily;
  reason: string;
  timing: {
    source: 'timestamp' | 'beat' | 'word';
    targetWordIdx?: number;
    resolvedWordIdx?: number;
    targetTimestampMs?: number;
    targetBeatIdx?: number;
  };
  compatibilityHints: Record<string, string>;
  semanticFacts: Record<string, unknown>;
}

// ─── Main Function ──────────────────────────────────────────────────────────

const ENERGY_SNAP_WINDOW_MS = 500;

export function executeBrief(input: BriefExecutorInput): BriefExecutorOutput {
  const { brief, transcription, fps, audioEnergyCurve, totalDurationMs, overlays, beats } = input;

  // Build clip map for original-to-cut timeline mapping (Mode 2)
  const videoClips = (overlays || [])
    .filter(o => o.type === 'video' || !o.type)
    .sort((a, b) => (a.sourceStartFrame || 0) - (b.sourceStartFrame || 0));
  const hasFrameMapping = videoClips.length > 0 && videoClips.some(c => c.sourceStartFrame !== undefined);

  const stats = {
    totalDecisions: brief.decisions.length,
    resolvedToFrame: 0,
    skippedOutOfRange: 0,
    snappedToEnergy: 0,
    mappedToCutTimeline: 0,
    snappedFromGap: 0,
  };

  const decisions: EditDecision[] = [];

  for (const decision of brief.decisions) {
    const resolved = resolveDecisionToFrame(decision, transcription, fps, audioEnergyCurve, totalDurationMs, beats);

    if (resolved === null) {
      stats.skippedOutOfRange++;
      continue;
    }

    // Map from original-video frame space to cut-timeline frame space.
    // Word timestamps reference the original video (before silence removal).
    // Overlays are on the cut timeline (after silence removal).
    if (hasFrameMapping) {
      const mapped = mapOriginalFrameToCutTimeline(resolved.editDecision.frame, videoClips, fps);
      if (mapped === null) {
        stats.skippedOutOfRange++;
        console.warn(`[BriefExecutor] Frame ${resolved.editDecision.frame} falls in removed gap (no nearby clip) — SKIPPED (${resolved.editDecision.technique})`);
        continue;
      }
      if (mapped.snapped) {
        stats.snappedFromGap++;
        console.log(`[BriefExecutor] Frame ${resolved.editDecision.frame} → ${mapped.frame} (snapped from gap, distance: ${mapped.distance} frames)`);
      } else {
        console.log(`[BriefExecutor] Frame ${resolved.editDecision.frame} → ${mapped.frame} (mapped to cut timeline)`);
      }
      resolved.editDecision.frame = mapped.frame;
      stats.mappedToCutTimeline++;
    }

    if (resolved.snappedToEnergy) {
      stats.snappedToEnergy++;
    }

    decisions.push(resolved.editDecision);
    stats.resolvedToFrame++;
  }

  // Sort by frame (linear playback order) then confidence for tie-breaking
  decisions.sort((a, b) => a.frame - b.frame || b.confidence - a.confidence);

  const edl: EditDecisionList = {
    decisions,
    metadata: {
      totalMappingsEvaluated: brief.decisions.length,
      totalMappingsFired: brief.decisions.length,
      totalDecisionsGenerated: stats.resolvedToFrame,
      totalDecisionsSuppressed: stats.skippedOutOfRange,
      executionTimeMs: 0,
    },
  };

  console.log(
    `[BriefExecutor] ${stats.resolvedToFrame}/${stats.totalDecisions} resolved to frames ` +
    `(${stats.snappedToEnergy} snapped to energy peak, ${stats.skippedOutOfRange} out of range` +
    `${stats.mappedToCutTimeline > 0 ? `, ${stats.mappedToCutTimeline} mapped to cut timeline` : ''}` +
    `${stats.snappedFromGap > 0 ? `, ${stats.snappedFromGap} snapped from gap` : ''})`
  );

  return { edl, stats };
}

// ─── Frame Resolution ───────────────────────────────────────────────────────

interface ResolvedDecision {
  editDecision: EditDecision;
  snappedToEnergy: boolean;
}

function resolveDecisionToFrame(
  decision: BriefDecision,
  transcription: { word: string; startMs: number; endMs: number }[],
  fps: number,
  energyCurve: number[] | undefined,
  totalDurationMs: number,
  beats?: { timestampMs: number; strength: number }[],
): ResolvedDecision | null {
  const { type, confidence, reason, params } = decision;
  const maxFrame = Math.round(totalDurationMs / 1000 * fps);

  let targetMs: number | null = null;
  let snappedToEnergy = false;
  let coordinateSource: 'timestamp' | 'beat' | 'word' = 'word';
  let targetWordIdxForContext: number | null = null;

  // Priority 1: Direct timestamp (music/visual mode)
  if (decision.targetTimestampMs !== undefined && decision.targetTimestampMs >= 0) {
    targetMs = decision.targetTimestampMs;
    coordinateSource = 'timestamp';

    if (targetMs > totalDurationMs) {
      const overshootRatio = (targetMs - totalDurationMs) / totalDurationMs;
      if (overshootRatio <= 0.05) {
        targetMs = totalDurationMs;
        console.warn(`[BriefExecutor] Timestamp ${decision.targetTimestampMs}ms > duration ${totalDurationMs}ms — clamped (decision: ${type})`);
      } else {
        console.warn(`[BriefExecutor] Timestamp ${decision.targetTimestampMs}ms >> duration ${totalDurationMs}ms — DISCARDED (decision: ${type})`);
        return null;
      }
    }
  }

  // Priority 2: Beat index (music mode)
  if (targetMs === null && decision.targetBeatIdx !== undefined && decision.targetBeatIdx >= 0 && beats?.length) {
    const beatIdx = decision.targetBeatIdx;
    if (beatIdx < beats.length) {
      targetMs = beats[beatIdx].timestampMs;
      coordinateSource = 'beat';
    } else if (beatIdx < beats.length * 1.1) {
      targetMs = beats[beats.length - 1].timestampMs;
      coordinateSource = 'beat';
      console.warn(`[BriefExecutor] Beat index ${beatIdx} >= beats length ${beats.length} — clamped to last beat (decision: ${type})`);
    } else {
      console.warn(`[BriefExecutor] Beat index ${beatIdx} >> beats length ${beats.length} — DISCARDED (decision: ${type})`);
      return null;
    }
  }

  // Priority 3: Word index (speech mode — existing path)
  if (targetMs === null) {
    const rawIdx = decision.targetWordIdx;
    if (transcription.length === 0 || rawIdx < 0) return null;

    const MAX_OVERSHOOT_RATIO = 0.1;
    const maxAllowedOvershoot = Math.max(3, Math.ceil(transcription.length * MAX_OVERSHOOT_RATIO));
    let targetWordIdx = rawIdx;

    if (rawIdx >= transcription.length) {
      const overshoot = rawIdx - (transcription.length - 1);
      if (overshoot <= maxAllowedOvershoot) {
        targetWordIdx = transcription.length - 1;
        console.warn(`[BriefExecutor] Word index ${rawIdx} >= transcript length ${transcription.length} — clamped to last word (decision: ${type})`);
      } else {
        console.warn(`[BriefExecutor] Word index ${rawIdx} >> transcript length ${transcription.length} — DISCARDED (decision: ${type})`);
        return null;
      }
    }

    const word = transcription[targetWordIdx];
    targetWordIdxForContext = targetWordIdx;
    targetMs = word.startMs;

    // For transition decisions, snap to BETWEEN words
    if (isTransitionType(type) && targetWordIdx > 0) {
      const prevWord = transcription[targetWordIdx - 1];
      targetMs = prevWord.endMs + (word.startMs - prevWord.endMs) / 2;
    }
  }

  // Energy snapping (all coordinate types)
  if (shouldSnapToEnergy(type) && energyCurve && energyCurve.length > 0) {
    const snapped = snapToEnergyPeak(targetMs, energyCurve, totalDurationMs, fps);
    if (snapped !== null) {
      targetMs = snapped;
      snappedToEnergy = true;
    }
  }

  if (targetWordIdxForContext === null && targetMs !== null) {
    targetWordIdxForContext = nearestTranscriptWordIndex(transcription, targetMs);
  }

  const frame = Math.round(targetMs / 1000 * fps);
  if (frame < 0 || frame > maxFrame) return null;

  const editDecision: EditDecision = {
    type: TYPE_MAP[type] || 'zoom',
    frame,
    confidence,
    source: `creative-brief:${reason}:${coordinateSource}`,
    technique: type,
    params: normalizeBriefDecisionParams(type, params, transcription, targetWordIdxForContext, {
      reason,
      coordinateSource,
      targetWordIdx: decision.targetWordIdx,
      targetTimestampMs: decision.targetTimestampMs,
      targetBeatIdx: decision.targetBeatIdx,
    }) as EditDecision['params'],
    reason: reason,
  };

  return { editDecision, snappedToEnergy };
}

// ─── Energy Snap ────────────────────────────────────────────────────────────

function snapToEnergyPeak(
  targetMs: number,
  energyCurve: number[],
  totalDurationMs: number,
  fps: number,
): number | null {
  if (energyCurve.length === 0 || totalDurationMs <= 0) return null;

  const msPerSample = totalDurationMs / energyCurve.length;
  const targetSample = Math.round(targetMs / msPerSample);
  const windowSamples = Math.round(ENERGY_SNAP_WINDOW_MS / msPerSample);

  const startSample = Math.max(0, targetSample - windowSamples);
  const endSample = Math.min(energyCurve.length - 1, targetSample + windowSamples);

  let peakSample = targetSample;
  let peakValue = energyCurve[targetSample] ?? 0;

  for (let i = startSample; i <= endSample; i++) {
    if (energyCurve[i] > peakValue) {
      peakValue = energyCurve[i];
      peakSample = i;
    }
  }

  // Only snap if peak is meaningfully higher than target (avoid snapping to noise)
  const targetValue = energyCurve[targetSample] ?? 0;
  if (peakValue - targetValue < 0.05) return null;

  return peakSample * msPerSample;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function shouldSnapToEnergy(type: BriefDecisionType): boolean {
  return type.startsWith('zoom_') || type === 'caption_emphasis' || type === 'camera_shake';
}

function isTransitionType(type: BriefDecisionType): boolean {
  return type.startsWith('transition_');
}

function normalizeBriefDecisionParams(
  type: BriefDecisionType,
  params: Record<string, unknown>,
  transcription: { word: string; startMs: number; endMs: number }[] = [],
  targetWordIdx: number | null = null,
  context?: BriefDecisionParamContext,
): Record<string, unknown> {
  const rawParams: Record<string, unknown> = { ...(params ?? {}) };
  const normalized: Record<string, unknown> = { ...rawParams };

  // Path E owns intent and timing hints only. Concrete legacy form labels are
  // resolved later by atomic/utility resolvers in executeEDL.
  delete normalized.zoomType;
  delete normalized.graphicType;
  delete normalized.transitionType;
  delete normalized.transitionCompatibilityHint;
  delete normalized.scaleFrom;
  delete normalized.scaleTo;
  delete normalized.durationFrames;
  delete normalized.durationMs;
  delete normalized.direction;
  if (type.startsWith('sfx_')) {
    delete normalized.sfxType;
    delete normalized.sfxCue;
    delete normalized.soundEffectType;
    delete normalized.audioDescription;
    delete normalized.soundDescription;
  }

  normalized.creativeDecisionType = type;
  normalized.creativeDecisionAuthority = 'semantic-context';
  if (type.startsWith('transition_')) {
    const transitionAtoms = transitionAtomsFromBriefType(type);
    if (transitionAtoms) {
      normalized.transitionIntent = transitionAtoms.intent;
      normalized.transitionRelation = transitionAtoms.relation;
      normalized.transitionEnergy = transitionAtoms.energy;
    }
  }
  if (type.startsWith('graphic_')) {
    atomizeGraphicDecision(normalized, transcription, targetWordIdx);
  }
  normalized.creativeBriefSemanticCandidate = buildBriefSemanticCandidate(type, rawParams, normalized, targetWordIdx, context);

  return normalized;
}

function buildBriefSemanticCandidate(
  type: BriefDecisionType,
  rawParams: Record<string, unknown>,
  normalized: Record<string, unknown>,
  resolvedWordIdx: number | null,
  context?: BriefDecisionParamContext,
): BriefSemanticCandidate {
  const transitionAtoms = transitionAtomsFromBriefType(type);
  const timing: BriefSemanticCandidate['timing'] = {
    source: context?.coordinateSource ?? 'word',
  };
  if (typeof context?.targetWordIdx === 'number' && Number.isFinite(context.targetWordIdx)) {
    timing.targetWordIdx = context.targetWordIdx;
  }
  if (resolvedWordIdx !== null) timing.resolvedWordIdx = resolvedWordIdx;
  if (typeof context?.targetTimestampMs === 'number' && Number.isFinite(context.targetTimestampMs)) {
    timing.targetTimestampMs = context.targetTimestampMs;
  }
  if (typeof context?.targetBeatIdx === 'number' && Number.isFinite(context.targetBeatIdx)) {
    timing.targetBeatIdx = context.targetBeatIdx;
  }

  return {
    version: 'brief-semantic-candidate-v1',
    role: 'semantic-context',
    executableAuthority: false,
    originalType: type,
    family: briefSemanticFamily(type),
    reason: context?.reason ?? 'unknown',
    timing,
    compatibilityHints: compactStringRecord({
      legacyType: type,
      transitionStyle: transitionAtoms?.compatibilityHint,
      graphicKind: type.startsWith('graphic_') ? type.replace(/^graphic_/, '').replace(/_/g, '-') : undefined,
      zoomKind: type.startsWith('zoom_') ? type.replace(/^zoom_/, '').replace(/_/g, '-') : stringParam(rawParams.zoomType),
      sfxToken: type.startsWith('sfx_') ? sfxCompatibilityHint(type, rawParams) : undefined,
      captionKind: type === 'caption_emphasis' ? 'emphasis' : undefined,
    }),
    semanticFacts: compactRecord({
      transitionIntent: normalized.transitionIntent,
      transitionRelation: normalized.transitionRelation,
      transitionEnergy: normalized.transitionEnergy,
      semanticAtoms: rawParams.semanticAtoms,
      contentStructure: normalized.contentStructure,
      text: normalized.text ?? rawParams.text,
      title: normalized.title ?? rawParams.title,
      body: normalized.body ?? rawParams.body,
      quote: normalized.quote ?? rawParams.quote,
      keyword: normalized.keyword ?? rawParams.keyword,
      value: normalized.value ?? rawParams.value,
      label: normalized.label ?? rawParams.label,
      from: normalized.from ?? rawParams.from,
      to: normalized.to ?? rawParams.to,
      relation: normalized.relation ?? rawParams.relation,
      items: normalized.items ?? rawParams.items,
      audioIntent: rawParams.audioDescription ?? rawParams.soundDescription ?? rawParams.intent,
    }),
  };
}

function briefSemanticFamily(type: BriefDecisionType): BriefSemanticFamily {
  if (type.startsWith('zoom_') || type.startsWith('camera_')) return 'camera';
  if (type.startsWith('transition_')) return 'transition';
  if (type.startsWith('graphic_')) return 'graphic';
  if (type.startsWith('caption_')) return 'caption';
  if (type.startsWith('sfx_') || type.startsWith('audio_')) return 'audio';
  if (type.includes('pacing')) return 'pacing';
  return 'unknown';
}

function sfxCompatibilityHint(type: BriefDecisionType, rawParams: Record<string, unknown>): string {
  return stringParam(rawParams.sfxType)
    || stringParam(rawParams.sfxCue)
    || type.replace(/^sfx_/, '').replace(/_/g, '-');
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function compactStringRecord(record: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => typeof value === 'string' && value.length > 0)
  ) as Record<string, string>;
}

function transitionAtomsFromBriefType(type: BriefDecisionType): {
  intent: string;
  relation: string;
  energy: 'low' | 'medium' | 'high';
  compatibilityHint: string;
} | undefined {
  switch (type) {
    case 'transition_dissolve':
      return { intent: 'continuity-blend', relation: 'soft-topic-bridge', energy: 'low', compatibilityHint: 'dissolve' };
    case 'transition_hard_cut':
      return { intent: 'editorial-cut', relation: 'direct-continuity', energy: 'medium', compatibilityHint: 'hard-cut' };
    case 'transition_whip_pan':
      return { intent: 'motion-transfer', relation: 'directional-momentum', energy: 'high', compatibilityHint: 'whip-pan' };
    case 'transition_fade_to_black':
      return { intent: 'soft-release', relation: 'chapter-close', energy: 'low', compatibilityHint: 'dip-to-black' };
    case 'transition_flash':
      return { intent: 'impact-transfer', relation: 'beat-accent', energy: 'high', compatibilityHint: 'flash' };
    case 'transition_soft_cut':
      return { intent: 'continuity-blend', relation: 'invisible-polish', energy: 'low', compatibilityHint: 'soft-cut' };
    case 'transition_wipe':
      return { intent: 'reveal-wipe', relation: 'spatial-reveal', energy: 'medium', compatibilityHint: 'wipe-left' };
    case 'transition_j_cut':
      return { intent: 'editorial-cut', relation: 'audio-leads-picture', energy: 'medium', compatibilityHint: 'hard-cut' };
    case 'transition_l_cut':
      return { intent: 'editorial-cut', relation: 'audio-trails-picture', energy: 'medium', compatibilityHint: 'hard-cut' };
    default:
      return undefined;
  }
}

function nearestTranscriptWordIndex(
  transcription: { word: string; startMs: number; endMs: number }[],
  targetMs: number,
): number | null {
  if (transcription.length === 0 || !Number.isFinite(targetMs)) return null;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < transcription.length; index += 1) {
    const word = transcription[index];
    const center = (word.startMs + word.endMs) / 2;
    const distance = Math.abs(center - targetMs);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function atomizeGraphicDecision(
  normalized: Record<string, unknown>,
  transcription: { word: string; startMs: number; endMs: number }[],
  targetWordIdx: number | null,
): void {
  applySharedGraphicContentNormalization(normalized);
  enrichGraphicDecisionWithTranscriptAtoms(normalized, transcription, targetWordIdx);
  deriveGraphicAtomsFromText(normalized);
  stampGraphicContentStructure(normalized);
}

function applySharedGraphicContentNormalization(normalized: Record<string, unknown>): void {
  const content = normalizeMotionGraphicContent(normalized).content;
  for (const [key, value] of Object.entries(content)) {
    if (key === 'contentStructure') continue;
    normalized[key] = value;
  }
}

function stampGraphicContentStructure(normalized: Record<string, unknown>): void {
  normalized.contentStructure = normalizeMotionGraphicContent(normalized).content.contentStructure;
}

function enrichGraphicDecisionWithTranscriptAtoms(
  normalized: Record<string, unknown>,
  transcription: { word: string; startMs: number; endMs: number }[],
  targetWordIdx: number | null,
): void {
  if (targetWordIdx === null || targetWordIdx < 0 || targetWordIdx >= transcription.length) return;
  const phrase = transcriptPhraseAroundWord(transcription, targetWordIdx);
  if (!phrase) return;

  normalized.contextPhrase = phrase;
  normalized.contextStartMs = Math.round(transcription[Math.max(0, targetWordIdx - 6)]?.startMs ?? transcription[targetWordIdx].startMs);
  normalized.contextEndMs = Math.round(transcription[Math.min(transcription.length - 1, targetWordIdx + 8)]?.endMs ?? transcription[targetWordIdx].endMs);
  normalized.targetWord = cleanTranscriptToken(transcription[targetWordIdx].word);
  normalized.targetWordStartMs = Math.round(transcription[targetWordIdx].startMs);
  normalized.targetWordEndMs = Math.round(transcription[targetWordIdx].endMs);

  const existingText = normalized.text ?? normalized.title ?? normalized.quote ?? normalized.name ?? normalized.value;
  if (existingText !== undefined) {
    normalized.keyword = String(existingText);
  }
}

function deriveGraphicAtomsFromText(normalized: Record<string, unknown>): void {
  const text = stringParam(normalized.contextPhrase)
    || stringParam(normalized.body)
    || stringParam(normalized.text)
    || stringParam(normalized.title)
    || '';
  if (!text) return;

  if (!Array.isArray(normalized.values)) {
    const numericMatches = [...text.matchAll(/(?:[$€£¥₹]\s*)?\d[\d,.]*(?:\.\d+)?%?/g)];
    const values = numericMatches
      .map((match) => parseFloat(match[0].replace(/[^0-9.-]/g, '')))
      .filter((value) => Number.isFinite(value));
    if (values.length >= 2) {
      normalized.values = values;
      normalized.labels = numericMatches.map((match) => match[0].trim());
    }
  }

  if (!normalized.from && !normalized.to) {
    const comparison = parseComparison(text);
    if (comparison) {
      normalized.from = comparison.from;
      normalized.to = comparison.to;
      normalized.relation = comparison.relation;
    }
  }
}

function parseComparison(text: string): { from: string; to: string; relation: 'vs' | 'arrow' } | null {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const vsMatch = cleaned.match(/\b(.{2,48}?)\s+(?:vs\.?|versus)\s+(.{2,48})\b/i);
  if (vsMatch) return { from: trimComparisonSide(vsMatch[1]), to: trimComparisonSide(vsMatch[2]), relation: 'vs' };

  const fromToMatch = cleaned.match(/\bfrom\s+(.{2,48}?)\s+to\s+(.{2,48})\b/i);
  if (fromToMatch) return { from: trimComparisonSide(fromToMatch[1]), to: trimComparisonSide(fromToMatch[2]), relation: 'arrow' };

  return null;
}

function trimComparisonSide(value: string): string {
  return value
    .replace(/[,.!?;:]+$/g, '')
    .replace(/^(the|a|an)\s+/i, '')
    .trim();
}

function stringParam(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function transcriptPhraseAroundWord(
  transcription: { word: string; startMs: number; endMs: number }[],
  targetWordIdx: number,
): string {
  const maxBefore = 7;
  const maxAfter = 9;
  let start = targetWordIdx;
  while (start > 0 && targetWordIdx - start < maxBefore && !endsSentence(transcription[start - 1].word)) {
    start -= 1;
  }

  let end = targetWordIdx;
  while (end < transcription.length - 1 && end - targetWordIdx < maxAfter && !endsSentence(transcription[end].word)) {
    end += 1;
  }

  return transcription
    .slice(start, end + 1)
    .map((word) => cleanTranscriptToken(word.word))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTranscriptToken(token: string): string {
  return String(token ?? '').replace(/^[\s"'“”‘’([{]+|[\s"'“”‘’)\]}]+$/g, '').trim();
}

function endsSentence(token: string): boolean {
  return /[.!?]\s*$/.test(String(token ?? ''));
}

// ─── Original-to-Cut Timeline Mapping ──────────────────────────────────────

export interface FrameMapResult {
  frame: number;
  snapped: boolean;
  distance: number;
}

/**
 * Map a frame from original video space to cut-timeline space.
 *
 * After silence removal, each video overlay has:
 *   - `from`: position on the CUT timeline
 *   - `durationInFrames`: length on the CUT timeline
 *   - `sourceStartFrame`: position in the ORIGINAL video
 *
 * If the original frame falls inside a clip's source range, the mapping is exact.
 * If it falls in a removed gap, snap to the nearest clip boundary (within tolerance).
 * If no clip is within tolerance, return null (decision should be skipped).
 */
export function mapOriginalFrameToCutTimeline(
  originalFrame: number,
  clips: { from: number; durationInFrames: number; sourceStartFrame?: number }[],
  fps: number,
): FrameMapResult | null {
  // Exact containment: original frame is inside a clip's source range
  for (const clip of clips) {
    const srcStart = clip.sourceStartFrame ?? 0;
    const srcEnd = srcStart + clip.durationInFrames;
    if (originalFrame >= srcStart && originalFrame < srcEnd) {
      const offset = originalFrame - srcStart;
      return { frame: clip.from + offset, snapped: false, distance: 0 };
    }
  }

  // Frame falls in a removed gap. Snap to nearest clip boundary.
  const SNAP_TOLERANCE = fps * 5; // 5 seconds
  let bestClip: typeof clips[0] | null = null;
  let bestDistance = Infinity;
  let snapToStart = true;

  for (const clip of clips) {
    const srcStart = clip.sourceStartFrame ?? 0;
    const srcEnd = srcStart + clip.durationInFrames;

    const distToStart = Math.abs(originalFrame - srcStart);
    const distToEnd = Math.abs(originalFrame - srcEnd);

    if (distToStart < bestDistance) {
      bestDistance = distToStart;
      bestClip = clip;
      snapToStart = true;
    }
    if (distToEnd < bestDistance) {
      bestDistance = distToEnd;
      bestClip = clip;
      snapToStart = false;
    }
  }

  if (bestClip && bestDistance <= SNAP_TOLERANCE) {
    // Snap to the edge of the nearest clip
    const frame = snapToStart
      ? bestClip.from // Start of nearest clip
      : bestClip.from + bestClip.durationInFrames - 1; // End of nearest clip
    return { frame, snapped: true, distance: bestDistance };
  }

  // Gap too large — decision was for deeply removed content
  return null;
}

/**
 * Inverse of mapOriginalFrameToCutTimeline: CUT-timeline frame → ORIGINAL-timeline frame.
 *
 * The cut timeline is contiguous (clips laid end-to-end, no gaps), so a cut frame falls inside
 * exactly one clip — map it back through that clip's source range. Returns null only if the frame
 * is beyond all clips (no original correspondence).
 *
 * Why this exists: V-JEPA / Wav2Vec segments and word timestamps live on the ORIGINAL timeline,
 * while MG decision `frame`s are on the CUT timeline (clean ≈ 50% of original after silence removal).
 * Querying segments with a raw cut-frame time lands later decisions in removed-silence gaps → no
 * segment → per-moment signals fall back to video-level constants. That was the root cause of the
 * 6/13 missing-signal bug on proj_OzG2qgoYudFa (2026-06-03). Map cut→original BEFORE the lookup.
 */
export function mapCutFrameToOriginalFrame(
  cutFrame: number,
  clips: { from: number; durationInFrames: number; sourceStartFrame?: number }[],
): number | null {
  for (const clip of clips) {
    if (cutFrame >= clip.from && cutFrame < clip.from + clip.durationInFrames) {
      return (clip.sourceStartFrame ?? 0) + (cutFrame - clip.from);
    }
  }
  return null;
}
