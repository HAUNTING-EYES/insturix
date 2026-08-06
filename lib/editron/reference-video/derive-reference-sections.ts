/**
 * R2/R5: Deterministic reference sectionizer (stopgap, not Essentia).
 *
 * The worker's audio-only enrichment cannot call the Essentia/Modal section
 * provider (not wired there), so R5 plans were section-less and R6 correctly
 * flagged them as unverifiable. This derives STRUCTURAL sections from the
 * measured signals the enrichment ALREADY has — beats, drops, silence, and
 * duration — so plans get real structure now.
 *
 * Honest framing: these are DERIVED sections (confidence ~0.6, marked), not the
 * Essentia music-segmentation (verse/chorus/drop) that the plan doc calls for.
 * When the Modal/Essentia provider is wired into a path, its sections should
 * REPLACE these (R36: a provider is the authority; this is a stopgap, never the
 * final word).
 *
 * Boundary rules (deterministic, no thresholds from vibe):
 *   - first `introRatio` of the clip = 'intro'; last `outroRatio` = 'outro'
 *   - around each drop marker: a 'drop' region, with 'build' just before it
 *   - remaining spanned time = 'body' segments opened/closed at silence boundaries
 */
import type { Beat } from '@/lib/editron/services/media/types';

export const DERIVED_SECTIONIZER_VERSION = 'editron-r2-derived-sectionizer-v1' as const;
export const DERIVED_SECTION_CONFIDENCE = 0.6; // ⚠️ INVENTED — derived from signals, not Essentia segmentation

/** Clip end-ratios for intro/outro caps. ⚠️ INVENTED — 8% bookends. */
const INTRO_RATIO = 0.08;
const OUTRO_RATIO = 0.08;
/** A 'drop' region extends this far either side of the marker. ⚠️ INVENTED unused-ish (kept minimal). */
const DROP_BAND_MS = 750;

export interface DerivedSection {
  startMs: number;
  endMs: number;
  label: string;
  confidence: number;
}

export interface SectionizerInput {
  durationMs: number;
  beats: Beat[];
  dropsMs: number[];
  silenceWindows: Array<{ startMs: number; endMs: number }>;
}

/**
 * Deterministically derive structural sections (intro/build/drop/body/outro)
 * from measured evidence. Returns [] when the clip is too short to section.
 */
export function deriveReferenceSections(input: SectionizerInput): DerivedSection[] {
  const { durationMs, dropsMs, silenceWindows } = input;
  if (!Number.isFinite(durationMs) || durationMs <= 2000) return [];

  const sections: DerivedSection[] = [];
  const introEnd = durationMs * INTRO_RATIO;
  const outroStart = durationMs * (1 - OUTRO_RATIO);

  // 1. Intro cap.
  sections.push({ startMs: 0, endMs: Math.ceil(introEnd), label: 'intro', confidence: DERIVED_SECTION_CONFIDENCE });

  // 2. Drop/build regions around each drop marker.
  const dropRegions: Array<{ startsAt: number; endsAt: number }> = [];
  for (const dropMs of dropsMs) {
    if (dropMs < introEnd || dropMs > outroStart) continue;
    const startsAt = Math.max(0, dropMs - DROP_BAND_MS);
    const endsAt = Math.min(durationMs, dropMs + DROP_BAND_MS);
    dropRegions.push({ startsAt, endsAt });
    sections.push({ startMs: startsAt, endMs: endsAt, label: 'drop', confidence: DERIVED_SECTION_CONFIDENCE });
    // build = the segment immediately before the drop band (if it doesn't overlap intro).
    const buildStart = Math.max(introEnd, startsAt - DROP_BAND_MS);
    if (buildStart < startsAt) {
      sections.push({ startMs: Math.ceil(buildStart), endMs: startsAt, label: 'build', confidence: DERIVED_SECTION_CONFIDENCE });
    }
  }

  // 3. Body segments: pack the uncovered spans, split at silence boundaries.
  const covered = (s: number, e: number) => sections.some((sec) => s < sec.endMs && e > sec.startMs);
  let cursor = Math.ceil(introEnd);
  const silenceBreaks = silenceWindows
    .map((w) => w.startMs)
    .filter((t) => t > introEnd && t < outroStart)
    .sort((a, b) => a - b);

  const emit = (s: number, e: number) => {
    const s2 = Math.max(s, 0);
    const e2 = Math.min(e, durationMs);
    if (e2 - s2 < 500) return;
    if (covered(s2, e2)) return;
    sections.push({ startMs: s2, endMs: e2, label: 'body', confidence: DERIVED_SECTION_CONFIDENCE });
  };

  let bodyStart = cursor;
  for (const brk of silenceBreaks) {
    if (brk <= bodyStart) continue;
    emit(bodyStart, brk);
    bodyStart = brk;
  }
  emit(bodyStart, outroStart);

  // 4. Outro cap.
  sections.push({ startMs: Math.ceil(outroStart), endMs: durationMs, label: 'outro', confidence: DERIVED_SECTION_CONFIDENCE });

  sections.sort((a, b) => a.startMs - b.startMs);
  // Drop the "build" slot if it overlaps a body we later emitted (dedupe by span).
  return dedupe(sections);
}

function dedupe(sections: DerivedSection[]): DerivedSection[] {
  const sorted = [...sections].sort((a, b) => a.startMs - b.startMs);
  const out: DerivedSection[] = [];
  for (const sec of sorted) {
    const prev = out[out.length - 1];
    if (prev && sec.startMs < prev.endMs) {
      // Overlapping — merge into the bigger span, keep the first label.
      prev.endMs = Math.max(prev.endMs, sec.endMs);
      continue;
    }
    out.push({ ...sec });
  }
  return out;
}
