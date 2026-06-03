import { describe, it, expect } from 'vitest';
import { getOverlayDefinitions } from '../../lib/editron/engine/overlay-definitions-loader';
import { scoreAllOverlays } from '../../lib/editron/engine/utility-scorer';
import type { OverlayDefinition, SignalSnapshot } from '../../lib/editron/engine/utility-types';

// ─────────────────────────────────────────────────────────────────────────────
// SIGNALS CONTRACT — the "never again" safeguard (Phase 1, plan 2026-06-03).
//
// The disease this locks out: a motion dial scored ONLY from VIDEO-LEVEL CONSTANT
// signals has the same score at every frame, so it wins every moment → the
// "100% slide-up" monotony (root-caused 2026-06-03: entrance_slide read only
// pacing_velocity + speech_coverage, both constant). That failure was SILENT —
// no error, just identical output. This contract makes it LOUD and deterministic.
// ─────────────────────────────────────────────────────────────────────────────

// PER-MOMENT signals vary frame-to-frame (V-JEPA / Wav2Vec / structural position).
// A moment-driven dial MUST read at least one of these or it cannot vary by construction.
const PER_MOMENT_SIGNALS = new Set<string>([
  'visceral_impact', 'visual_change_rate', 'visual_significance', 'motion_intensity',
  'narrative_pressure', 'emotional_arousal', 'cinematic_moment', 'energy_delta',
  'face_emotion', 'face_present', 'shot_scale', 'scene_type', 'stress_detected',
  'time_since_last_cut', 'speech_energy', 'emotion_intensity', 'pitch_variability',
  'music_tatum', 'visual_complexity', 'text_on_screen', 'position_in_video',
  'montage_mode', 'emotional_alignment', 'active_overlay_count',
]);

// VIDEO-LEVEL signals are ~constant per video (personality / genre / global coverage).
// Fine as a SECONDARY consideration (brand-character baseline) — never the SOLE input
// of a moment-driven dial.
const VIDEO_LEVEL_SIGNALS = new Set<string>([
  'formality', 'warmth', 'humor', 'enthusiasm', 'pacing_velocity', 'visual_dependency',
  'speech_coverage', 'music_presence', 'music_energy', 'music_section', 'bpm', 'speaking_rate_wpm',
  'silence_duration_ms',
]);

// Dial families that pick the animation the viewer SEES — they must track the moment.
// (Zoom is added in Phase 3 once its dial structure is investigated + rewired.)
const MOMENT_DRIVEN_PREFIXES = ['mg.animation.entrance_'];

const considerationSignals = (def: OverlayDefinition): string[] =>
  (def.considerations ?? []).map((c) => c.signalId);

describe('signals-contract: moment-driven dials must track the moment', () => {
  const defs = getOverlayDefinitions();

  for (const prefix of MOMENT_DRIVEN_PREFIXES) {
    const family = defs.filter((d) => d.id.startsWith(prefix));

    it(`${prefix}* family exists`, () => {
      expect(family.length).toBeGreaterThan(0);
    });

    // INVARIANT 1 (structural): every dial reads >= 1 per-moment signal, and every
    // signal it reads is classified (keeps the taxonomy honest as dials evolve).
    for (const d of family) {
      it(`${d.id} reads >=1 per-moment signal (not constant-only)`, () => {
        const sigs = considerationSignals(d);
        const unknown = sigs.filter((s) => !PER_MOMENT_SIGNALS.has(s) && !VIDEO_LEVEL_SIGNALS.has(s));
        expect(
          unknown,
          `${d.id} reads unclassified signal(s) [${unknown.join(', ')}] — classify them in this contract`,
        ).toEqual([]);

        const perMoment = sigs.filter((s) => PER_MOMENT_SIGNALS.has(s));
        expect(
          perMoment.length,
          `${d.id} is scored ONLY from video-level constants [${sigs.join(', ')}] — it can never vary per-moment (the slide-up bug). Add a per-moment signal.`,
        ).toBeGreaterThan(0);
      });
    }
  }

  // INVARIANT 1b (the guard has teeth): the exact pre-fix slide wiring must be
  // detected as a violation — proves invariant 1 is not vacuously passing.
  it('detects a constant-only dial (regression proof of the old slide bug)', () => {
    const oldSlide = { signalIds: ['pacing_velocity', 'speech_coverage'] };
    const perMoment = oldSlide.signalIds.filter((s) => PER_MOMENT_SIGNALS.has(s));
    expect(perMoment.length).toBe(0); // old slide would correctly FAIL invariant 1
  });

  // INVARIANT 2 (behavioral): across distinct synthetic moments the entrance winner
  // VARIES — catches a dial that nominally reads a per-moment signal but whose curve
  // pins one winner anyway.
  // NOTE: entrance dials are SELECTION dials → scored MULTIPLICATIVELY in the real pipeline
  // (edl-executor.ts:1153-1163 puts mg.animation.entrance_* in SELECTION_IDS → 'multiplicative').
  // The test MUST use the same method or it validates a scoring path production never runs.
  // entrance_speed is NOT a selection dial (absent from SELECTION_IDS) → exclude it from the winner pool.
  it('entrance winner varies across distinct moments (multiplicative — the real method)', () => {
    const entrance = defs.filter(
      (d) => d.id.startsWith('mg.animation.entrance_') && d.id !== 'mg.animation.entrance_speed',
    );
    const moments: SignalSnapshot[] = [
      { visceral_impact: 0.15, visual_change_rate: 0.12, visual_significance: 0.10, formality: 0.40, warmth: 0.30 },
      { visceral_impact: 0.92, visual_change_rate: 0.50, visual_significance: 0.85, formality: 0.30, warmth: 0.30 },
      { visceral_impact: 0.30, visual_change_rate: 0.95, visual_significance: 0.20, formality: 0.30, warmth: 0.30 },
      { visceral_impact: 0.25, visual_change_rate: 0.20, visual_significance: 0.15, formality: 0.85, warmth: 0.30 },
      { visceral_impact: 0.30, visual_change_rate: 0.10, visual_significance: 0.20, formality: 0.30, warmth: 0.90 },
    ] as SignalSnapshot[];
    const winners = new Set<string>();
    for (const m of moments) {
      const top = scoreAllOverlays(entrance, m, 'multiplicative')[0];
      if (top) winners.add(top.overlayId);
    }
    expect(
      winners.size,
      `entrance collapsed to one type across varied moments: [${[...winners].join(', ')}]`,
    ).toBeGreaterThan(1);
  });
});
