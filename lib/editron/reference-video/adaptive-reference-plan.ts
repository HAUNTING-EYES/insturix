/**
 * R5: Adaptive Reference Plan.
 *
 * Normalizes a canonical EditFingerprint (R4) into structural slots + rhythm
 * relationships — the "adaptive template" the plan describes (R5):
 *
 *   - STRUCTURAL SLOTS: derive named slots (hook / drop / section bodies /
 *     protected-silence) from the fingerprint's sections, drops, and (when
 *     evidence is supplied) silence windows.
 *   - RHYTHM RELATIONSHIPS: the beat grid (bpm, beatsMs, dropsMs, section spans)
 *     plus cut density from the decisionStream.
 *   - TARGET MAPPING: rescale slot boundaries + batched beat grid to a requested
 *     target duration (proportional in slot-space; preserves order; clamping
 *     pushes each slot into bounds — never negative and never beyond target).
 *
 * Boundary of THIS module (R36): it normalizes and maps. It does NOT resolve
 * conflicts against the user's speech/action/brand/platform — that is the
 * Director's job (director-agent) and happens after this plan exists. Concrete
 * timeline decisions (overlay rows, keyframes, token placement) are owned by the
 * final timeline resolver. This file only produces the normalized reference
 * relationship map.
 */

import { EDIT_FINGERPRINT_VERSION, type EditFingerprint } from '@/lib/editron/types/edit-fingerprint';

export const ADAPTIVE_PLAN_VERSION = 'editron-r5-adaptive-plan-v1' as const;

export interface ReferencePlanSlot {
  id: string;
  role: string;
  startMs: number;
  endMs: number;
  /** What produced this slot: a section, a drop, a silence gap, or the overall clip. */
  source: 'section' | 'drop' | 'silence' | 'clip';
  /** Detector confidence 0..1 for this slot. 1 = structural fact, 0.9 = measured. ⚠️ INVENTED default. */
  confidence: number;
}

export interface ReferenceRhythm {
  bpm: number | null;
  beatsMs: number[];
  dropsMs: number[];
  avgCutsPerMinute: number;
  /** Cut times from the decisionStream (transition_* events). */
  cutMs: number[];
}

export interface AdaptiveReferencePlan {
  version: typeof ADAPTIVE_PLAN_VERSION;
  /** Fingerprint the plan was normalized from. */
  sourceFingerprintVersion: typeof EDIT_FINGERPRINT_VERSION;
  fingerprintId: string;
  referenceId: string;
  alignmentFrame: 'beat-space' | 'slot-space';
  /** Source clip duration (ms). */
  sourceDurationMs: number;
  slots: ReferencePlanSlot[];
  rhythm: ReferenceRhythm;
  /** Present when the caller requested a target-duration remap. */
  target?: {
    requestedDurationMs: number;
    slots: ReferencePlanSlot[];
    beatsMs: number[];
  };
}

export interface BuildAdaptivePlanOptions {
  /** Optional: rescale the plan to a requested target clip duration. */
  targetDurationMs?: number;
  /** Optional measured silence (R2) so protected-silence slots can be derived. */
  silenceWindows?: Array<{ startMs: number; endMs: number; durationMs: number }>;
}

/** Normalized slot roles from the fingerprint's own section labels (existing vocabulary). */
const SECTION_ROLE: Record<string, string> = {
  intro: 'hook',
  verse: 'body',
  'pre-chorus': 'pre-drop',
  chorus: 'payoff',
  drop: 'drop',
  build: 'pre-drop',
  breakdown: 'break',
  bridge: 'break',
  outro: 'outro',
};
const SECTION_FALLBACK_ROLE = 'body';

export function buildAdaptiveReferencePlan(
  fingerprint: EditFingerprint,
  options: BuildAdaptivePlanOptions = {},
): AdaptiveReferencePlan {
  const sourceDurationMs = fingerprint.durationMs || 0;

  // ── Rhythm relationships from the measured audio + decision layer ─────────
  const beatsMs = fingerprint.audio.beats.map((b) => b.timestampMs).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  const cutMs = fingerprint.decisionStream
    .filter((d) => d.family.startsWith('transition_'))
    .map((d) => d.anchor.tMs)
    .filter((t) => Number.isFinite(t));
  const durationMin = sourceDurationMs / 60_000;
  const avgCutsPerMinute = durationMin > 0 && cutMs.length ? cutMs.length / durationMin : 0;

  const rhythm: ReferenceRhythm = {
    bpm: fingerprint.audio.bpm ?? null,
    beatsMs,
    dropsMs: [...fingerprint.audio.dropsMs].sort((a, b) => a - b),
    avgCutsPerMinute: round(avgCutsPerMinute, 2),
    cutMs,
  };

  // ── Structural slots ──────────────────────────────────────────────────────
  const slots: ReferencePlanSlot[] = [];
  const usedRanges: Array<{ startMs: number; endMs: number; slotId: string }> = [];
  const overlapsAny = (s: number, e: number) =>
    usedRanges.some((r) => s < r.endMs && e > r.startMs);

  // 1. Drops first (highest priority → anchor the plan).
  for (const dropMs of rhythm.dropsMs) {
    const id = `drop-${slots.length}`;
    slots.push({
      id,
      role: 'drop',
      startMs: dropMs,
      endMs: Math.min(sourceDurationMs, dropMs + clampGap(fingerprint, dropMs)),
      source: 'drop',
      confidence: 1,
    });
    usedRanges.push({ startMs: slots[slots.length - 1].startMs, endMs: slots[slots.length - 1].endMs, slotId: id });
  }

  // 2. Sections (skip ranges already claimed by drops).
  for (const section of fingerprint.audio.sections) {
    const s = section.startMs;
    const e = section.endMs;
    if (s >= e) continue;
    if (overlapsAny(s, e)) continue;
    const id = `section-${section.label}-${slots.length}`;
    slots.push({
      id,
      role: SECTION_ROLE[section.label.trim().toLowerCase()] ?? SECTION_FALLBACK_ROLE,
      startMs: s,
      endMs: e,
      source: 'section',
      confidence: 1,
    });
    usedRanges.push({ startMs: s, endMs: e, slotId: id });
  }

  // 3. Protected-silence slots (R2 evidence; speech-viable/quiet regions).
  for (const win of options.silenceWindows ?? []) {
    if (win.endMs <= win.startMs) continue;
    if (overlapsAny(win.startMs, win.endMs)) continue;
    const id = `silence-${slots.length}`;
    slots.push({
      id,
      role: 'protected-silence',
      startMs: win.startMs,
      endMs: win.endMs,
      source: 'silence',
      confidence: 0.9,
    });
    usedRanges.push({ startMs: win.startMs, endMs: win.endMs, slotId: id });
  }

  // 4. Clip cap — ensure a body slot spans any gap the sections didn't cover if
  //    nothing else would. Kept minimal: only add when the source has no slots.
  if (slots.length === 0 && sourceDurationMs > 0) {
    slots.push({
      id: 'clip-0',
      role: 'body',
      startMs: 0,
      endMs: sourceDurationMs,
      source: 'clip',
      confidence: 1,
    });
  }
  slots.sort((a, b) => a.startMs - b.startMs);

  const base: AdaptiveReferencePlan = {
    version: ADAPTIVE_PLAN_VERSION,
    sourceFingerprintVersion: EDIT_FINGERPRINT_VERSION,
    fingerprintId: fingerprint.fingerprintId,
    referenceId: fingerprint.referenceId,
    alignmentFrame: fingerprint.alignmentFrame,
    sourceDurationMs,
    slots,
    rhythm,
  };

  if (options.targetDurationMs && sourceDurationMs > 0) {
    const target = remapToTarget(base, options.targetDurationMs);
    base.target = {
      requestedDurationMs: options.targetDurationMs,
      slots: target.slots,
      beatsMs: target.beatsMs,
    };
  }

  return base;
}

/**
 * Rescale slot boundaries + beat grid proportionally (slot-space, deterministic).
 * Order preserved; boundaries clamped into [0, target].
 */
function remapToTarget(plan: AdaptiveReferencePlan, targetDurationMs: number): {
  slots: ReferencePlanSlot[];
  beatsMs: number[];
} {
  const scale = targetDurationMs / plan.sourceDurationMs;
  const slots = plan.slots
    .map((s) => ({
      ...s,
      startMs: clamp(round(s.startMs * scale, 0), 0, targetDurationMs),
      endMs: clamp(round(s.endMs * scale, 0), 0, targetDurationMs),
    }))
    .map((s) => (s.endMs <= s.startMs ? { ...s, endMs: targetDurationMs } : s))
    .sort((a, b) => a.startMs - b.startMs);
  const beatsMs = plan.rhythm.beatsMs
    .map((t) => clamp(round(t * scale, 0), 0, targetDurationMs))
    .filter((t) => t >= 0 && t <= targetDurationMs);
  return { slots, beatsMs };
}

/** A fallback drop-span gap (ms). ⚠️ INVENTED — a drop is a moment, not a long window. */
const DROP_SPAN_MS = 1_000;

function clampGap(_fingerprint: EditFingerprint, dropMs: number): number {
  return DROP_SPAN_MS;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
