/**
 * EditFingerprint — voiceWindows deriver (§7.2 rev6).
 *
 * Speech-viable spans where the user's VO can go. Deterministic, no LLM. Derived from the
 * exemplar's OWN vocals (the Grok transcript word timings), with drop/chorus PEAK zones removed
 * (those are visual-only beats — no VO). All windows here are `hadVocals: true`.
 *
 * SCOPE (honest, not MVP): the doc also wants low-energy-INFERRED windows (`hadVocals: false`,
 * instrumental sections quiet enough for VO). Those need the SEPARATED music stem's energy —
 * today's energyCurve is from the MIX (Demucs isn't built yet), so the low-energy source lands
 * with the stem-separation phase. We do not fake it here.
 *
 * Reuse, not reinvent:
 *   - MAX_WORD_GAP_MS = DEFAULTS.SILENCE_THRESHOLD_MS (the codebase silence constant);
 *   - peak labels {drop, chorus} = the CRG music_section vocabulary.
 */

import type { TranscriptionWord } from '@/lib/editron/services/media/types';
import { DEFAULTS } from '@/lib/editron/services/media/types';
import type { FingerprintAudioLayer, FingerprintVoiceWindow } from '@/lib/editron/types/edit-fingerprint';

/** A gap >= this between consecutive words breaks one vocal span into two. */
const MAX_WORD_GAP_MS = DEFAULTS.SILENCE_THRESHOLD_MS;

/** Section labels that are peak / no-VO zones (visual-only beats). CRG music_section vocabulary. */
const PEAK_LABELS = new Set(['drop', 'chorus']);

interface Interval {
  startMs: number;
  endMs: number;
}

/** Merge consecutive words into vocal spans, breaking on a silence gap. */
function vocalSpans(words: TranscriptionWord[]): Interval[] {
  const sorted = words.filter((w) => w.endMs > w.startMs).sort((a, b) => a.startMs - b.startMs);
  const spans: Interval[] = [];
  for (const w of sorted) {
    const last = spans[spans.length - 1];
    if (last && w.startMs - last.endMs < MAX_WORD_GAP_MS) {
      last.endMs = Math.max(last.endMs, w.endMs);
    } else {
      spans.push({ startMs: w.startMs, endMs: w.endMs });
    }
  }
  return spans;
}

/** Merge overlapping/adjacent intervals into a normalized, sorted set. */
function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.endMs > i.startMs).sort((a, b) => a.startMs - b.startMs);
  const merged: Interval[] = [];
  for (const i of sorted) {
    const last = merged[merged.length - 1];
    if (last && i.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, i.endMs);
    } else {
      merged.push({ ...i });
    }
  }
  return merged;
}

/** Remove (already-merged, sorted) peak intervals from a span → the remaining speech-viable sub-spans. */
function subtractPeaks(span: Interval, peaks: Interval[]): Interval[] {
  let cursor = span.startMs;
  const out: Interval[] = [];
  for (const peak of peaks) {
    if (peak.endMs <= cursor || peak.startMs >= span.endMs) continue; // no overlap with the remaining span
    if (peak.startMs > cursor) out.push({ startMs: cursor, endMs: Math.min(peak.startMs, span.endMs) });
    cursor = Math.max(cursor, peak.endMs);
    if (cursor >= span.endMs) break;
  }
  if (cursor < span.endMs) out.push({ startMs: cursor, endMs: span.endMs });
  return out.filter((i) => i.endMs > i.startMs);
}

/**
 * Derive voiceWindows from the exemplar's vocals (Grok transcript), excluding drop/chorus peaks.
 * Returns [] when there are no vocals — the low-energy-inferred windows are added by the
 * stem-separation phase.
 */
export function deriveVoiceWindows(
  words: TranscriptionWord[],
  audio: Pick<FingerprintAudioLayer, 'sections'>,
): FingerprintVoiceWindow[] {
  const peaks = mergeIntervals(
    audio.sections
      .filter((section) => PEAK_LABELS.has(section.label.trim().toLowerCase()))
      .map((section) => ({ startMs: section.startMs, endMs: section.endMs })),
  );

  const windows: FingerprintVoiceWindow[] = [];
  for (const span of vocalSpans(words)) {
    for (const sub of subtractPeaks(span, peaks)) {
      windows.push({ startMs: sub.startMs, endMs: sub.endMs, hadVocals: true });
    }
  }
  return windows;
}
