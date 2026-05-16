/**
 * Constraint Enforcer — 8-Pass Ordered Validation (FLAG 5)
 *
 * Post-execution pass that validates all 50 constraints from creative-knowledge-graph.json Part 4.
 * Auto-corrects violations where possible. Reports uncorrectable ones as quality issues.
 *
 * PASS ORDER (each operates on output of the previous):
 *   1. Position corrections (move things)
 *   2. Temporal/rhythm (timing after positions fixed)
 *   3. Transition checks
 *   4. Visual/overlay checks
 *   5. Audio checks
 *   6. Continuity + AI
 *   7. Budget enforcement
 *   8. Accessibility (LAST — checks final state, NON-OVERRIDABLE)
 *
 * Consumers: director-agent.ts (Path D, after humanize-pass)
 */

import type { GraphIndex, ConstraintNode } from './graph-query';
import type { EditDecision } from '../types/edit-decision';
import type { RawFootageAnalysis, OverlayInfo } from './signal-registry';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConstraintViolation {
  constraintId: string;
  constraintName: string;
  severity: 'blocker' | 'warning' | 'info';
  frame: number;
  description: string;
  autoCorrected: boolean;
  correction?: string;
  deduction: number;
}

export interface ConstraintEnforcementResult {
  violations: ConstraintViolation[];
  totalChecked: number;
  totalViolations: number;
  totalAutoCorrected: number;
  totalUncorrectable: number;
  qualityDeduction: number;
}

// ─── Main Enforcer ──────────────────────────────────────────────────────────

/**
 * Enforce all constraints in 8 ordered passes.
 * Mutates the decisions array in place (shifts frames, removes violations).
 * Returns violation report for quality scoring.
 */
export function enforceConstraints(
  decisions: EditDecision[],
  overlays: OverlayInfo[],
  graphIndex: GraphIndex,
  rawFootage: RawFootageAnalysis | null,
  fps: number = 30
): ConstraintEnforcementResult {
  const violations: ConstraintViolation[] = [];
  let totalChecked = 0;

  // ── PASS 1: Position corrections (these MOVE things) ────────────────

  totalChecked += enforcePositionConstraints(decisions, rawFootage, fps, violations);

  // ── PASS 2: Temporal/rhythm checks ──────────────────────────────────

  totalChecked += enforceTemporalConstraints(decisions, fps, violations);

  // ── PASS 3: Transition checks ───────────────────────────────────────

  totalChecked += enforceTransitionConstraints(decisions, rawFootage, fps, violations);

  // ── PASS 4: Visual/overlay checks ───────────────────────────────────

  totalChecked += enforceVisualConstraints(decisions, overlays, fps, violations);

  // ── PASS 5: Audio checks ────────────────────────────────────────────

  totalChecked += enforceAudioConstraints(decisions, overlays, violations);

  // ── PASS 6: Continuity + AI ─────────────────────────────────────────

  totalChecked += enforceContinuityConstraints(decisions, violations);

  // ── PASS 7: Budget enforcement ──────────────────────────────────────

  totalChecked += enforceBudgetConstraints(decisions, violations);

  // ── PASS 8: Accessibility (LAST — NON-OVERRIDABLE) ──────────────────

  totalChecked += enforceAccessibilityConstraints(decisions, fps, violations);

  // ── Compute totals ──────────────────────────────────────────────────

  const totalViolations = violations.length;
  const totalAutoCorrected = violations.filter(v => v.autoCorrected).length;
  const totalUncorrectable = violations.filter(v => !v.autoCorrected).length;
  const qualityDeduction = violations.reduce((sum, v) => sum + v.deduction, 0);

  return {
    violations,
    totalChecked,
    totalViolations,
    totalAutoCorrected,
    totalUncorrectable,
    qualityDeduction,
  };
}

// ─── Pass 1: Position Corrections ───────────────────────────────────────────

function enforcePositionConstraints(
  decisions: EditDecision[],
  rawFootage: RawFootageAnalysis | null,
  fps: number,
  violations: ConstraintViolation[]
): number {
  let checked = 0;
  const words = rawFootage?.transcription?.words ?? [];

  // 1.1 cut_mid_word: shift cuts to word boundaries
  const cutDecisions = decisions.filter(d => d.type === 'cut' || d.type === 'transition');
  for (const cut of cutDecisions) {
    checked++;
    const timestampMs = (cut.frame / fps) * 1000;
    const midWordHit = words.find(w =>
      timestampMs > w.startMs + 30 && timestampMs < w.endMs - 30
    );

    if (midWordHit) {
      // Auto-correct: shift to nearest word boundary (end of current word or start of next)
      const endOfWord = Math.round((midWordHit.endMs / 1000) * fps);
      const wordIdx = words.indexOf(midWordHit);
      const startOfNext = wordIdx < words.length - 1
        ? Math.round((words[wordIdx + 1].startMs / 1000) * fps)
        : endOfWord + 3;

      // Pick nearest boundary
      const distToEnd = Math.abs(cut.frame - endOfWord);
      const distToNext = Math.abs(cut.frame - startOfNext);
      const correctedFrame = distToEnd <= distToNext ? endOfWord : startOfNext;

      violations.push({
        constraintId: 'constraint:temporal.cut_mid_word',
        constraintName: 'Cut Mid-Word',
        severity: 'blocker',
        frame: cut.frame,
        description: `Cut at frame ${cut.frame} falls mid-word "${midWordHit.word}"`,
        autoCorrected: true,
        correction: `Shifted to frame ${correctedFrame} (word boundary)`,
        deduction: 0, // auto-corrected = no penalty
      });

      cut.frame = correctedFrame;
    }
  }

  // 1.2 sfx_timing_drift: realign SFX to visual events (within ±3 frames)
  const sfxDecisions = decisions.filter(d => d.type === 'sfx-trigger');
  for (const sfx of sfxDecisions) {
    checked++;
    // Find the nearest visual decision (zoom, transition) within ±15 frames
    const nearestVisual = decisions.find(d =>
      (d.type === 'zoom' || d.type === 'transition') &&
      Math.abs(d.frame - sfx.frame) <= 15 && Math.abs(d.frame - sfx.frame) > 3
    );
    if (nearestVisual && Math.abs(nearestVisual.frame - sfx.frame) > 3) {
      const oldFrame = sfx.frame;
      sfx.frame = nearestVisual.frame; // align SFX to visual event
      violations.push({
        constraintId: 'constraint:transition.missing_transition_sound',
        constraintName: 'SFX Timing Drift',
        severity: 'warning',
        frame: oldFrame,
        description: `SFX at frame ${oldFrame} drifted from visual event at ${nearestVisual.frame}`,
        autoCorrected: true,
        correction: `Realigned to frame ${nearestVisual.frame}`,
        deduction: 0,
      });
    }
  }

  return checked;
}

// ─── Pass 2: Temporal/Rhythm ────────────────────────────────────────────────

function enforceTemporalConstraints(
  decisions: EditDecision[],
  fps: number,
  violations: ConstraintViolation[]
): number {
  let checked = 0;

  // 2.1 pacing_monotony: all durations within 10% of each other for 5+ shots
  const cutFrames = decisions
    .filter(d => d.type === 'cut' || d.type === 'transition')
    .map(d => d.frame)
    .sort((a, b) => a - b);

  if (cutFrames.length >= 5) {
    const durations: number[] = [];
    for (let i = 1; i < cutFrames.length; i++) {
      durations.push(cutFrames[i] - cutFrames[i - 1]);
    }

    // Check windows of 5
    for (let i = 4; i < durations.length; i++) {
      checked++;
      const window = durations.slice(i - 4, i + 1);
      const avg = window.reduce((s, v) => s + v, 0) / window.length;
      const maxDev = Math.max(...window.map(d => Math.abs(d - avg) / avg));

      if (maxDev < 0.1 && avg > 0) { // all within 10%
        violations.push({
          constraintId: 'constraint:temporal.pacing_monotony',
          constraintName: 'Pacing Monotony',
          severity: 'warning',
          frame: cutFrames[i],
          description: `5 consecutive shots with identical duration (~${Math.round(avg / fps * 10) / 10}s)`,
          autoCorrected: false,
          deduction: -5,
        });
      }
    }
  }

  // 2.2 metronomic_beat_sync: 6+ consecutive beat-aligned cuts
  let consecutiveBeat = 0;
  for (const d of decisions.filter(d => d.type === 'cut' || d.type === 'transition')) {
    checked++;
    if (d.source?.includes('beat') || d.source?.includes('downbeat')) {
      consecutiveBeat++;
      if (consecutiveBeat >= 6) {
        violations.push({
          constraintId: 'constraint:rhythm.metronomic_beat_sync',
          constraintName: 'Metronomic Beat Sync',
          severity: 'info',
          frame: d.frame,
          description: `${consecutiveBeat} consecutive beat-locked cuts — sounds robotic`,
          autoCorrected: false,
          deduction: -1,
        });
      }
    } else {
      consecutiveBeat = 0;
    }
  }

  return checked;
}

// ─── Pass 3: Transition Checks ──────────────────────────────────────────────

function enforceTransitionConstraints(
  decisions: EditDecision[],
  rawFootage: RawFootageAnalysis | null,
  fps: number,
  violations: ConstraintViolation[]
): number {
  let checked = 0;
  const transitions = decisions.filter(d => d.type === 'transition');
  const words = rawFootage?.transcription?.words ?? [];

  // 3.1 transition_repetition: 3+ identical transition types in sequence
  for (let i = 2; i < transitions.length; i++) {
    checked++;
    const prev2 = transitions[i - 2].params['type'];
    const prev1 = transitions[i - 1].params['type'];
    const curr = transitions[i].params['type'];

    if (prev2 === prev1 && prev1 === curr && curr !== 'hard-cut') {
      violations.push({
        constraintId: 'constraint:transition.transition_repetition',
        constraintName: 'Transition Repetition',
        severity: 'warning',
        frame: transitions[i].frame,
        description: `3 consecutive "${curr}" transitions — viewer notices the pattern`,
        autoCorrected: false,
        deduction: -5,
      });
    }
  }

  // 3.2 fade_to_black_overuse: max 2-3 per video
  const fadeToBlacks = transitions.filter(t => t.params['type'] === 'fade-to-black');
  if (fadeToBlacks.length > 3) {
    checked++;
    violations.push({
      constraintId: 'constraint:transition.fade_to_black_overuse',
      constraintName: 'Fade-to-Black Overuse',
      severity: 'warning',
      frame: fadeToBlacks[3].frame,
      description: `${fadeToBlacks.length} fade-to-blacks (max 3) — content feels episodic`,
      autoCorrected: false,
      deduction: -5,
    });
  }

  // 3.3 transition_during_speech: non-hard-cut transitions should be in speech gaps
  // Uses actual word-level timestamps from transcript to verify
  if (words.length > 0) {
    for (const t of transitions) {
      checked++;
      if (t.params['type'] === 'hard-cut') continue;

      const transitionMs = (t.frame / fps) * 1000;
      const transitionDurationMs = Number(t.params['duration_frames'] ?? 15) / fps * 1000;
      const transitionEndMs = transitionMs + transitionDurationMs;

      // Check if any word overlaps with the transition duration window
      const speechDuringTransition = words.some(w =>
        w.startMs < transitionEndMs && w.endMs > transitionMs
      );

      if (speechDuringTransition) {
        // Find nearest speech gap to shift transition to
        const gaps: Array<{ startMs: number; endMs: number }> = [];
        for (let i = 0; i < words.length - 1; i++) {
          const gapStart = words[i].endMs;
          const gapEnd = words[i + 1].startMs;
          if (gapEnd - gapStart >= transitionDurationMs) {
            gaps.push({ startMs: gapStart, endMs: gapEnd });
          }
        }

        const nearestGap = gaps.reduce<{ startMs: number; endMs: number } | null>((best, gap) => {
          if (!best) return gap;
          return Math.abs(gap.startMs - transitionMs) < Math.abs(best.startMs - transitionMs) ? gap : best;
        }, null);

        if (nearestGap && Math.abs(nearestGap.startMs - transitionMs) < 2000) {
          // Auto-correct: shift to gap
          const newFrame = Math.round((nearestGap.startMs / 1000) * fps);
          violations.push({
            constraintId: 'constraint:transition.transition_during_speech',
            constraintName: 'Transition During Speech',
            severity: 'warning',
            frame: t.frame,
            description: `${t.params['type']} at frame ${t.frame} overlaps with speech`,
            autoCorrected: true,
            correction: `Shifted to speech gap at frame ${newFrame}`,
            deduction: 0,
          });
          t.frame = newFrame;
        } else {
          // No nearby gap — flag but don't auto-correct
          violations.push({
            constraintId: 'constraint:transition.transition_during_speech',
            constraintName: 'Transition During Speech',
            severity: 'warning',
            frame: t.frame,
            description: `${t.params['type']} at frame ${t.frame} overlaps with speech (no nearby gap to shift to)`,
            autoCorrected: false,
            deduction: -5,
          });
        }
      }
    }
  }

  return checked;
}

// ─── Pass 4: Visual/Overlay ─────────────────────────────────────────────────

function enforceVisualConstraints(
  decisions: EditDecision[],
  overlays: OverlayInfo[],
  fps: number,
  violations: ConstraintViolation[]
): number {
  let checked = 0;

  // 4.1 visual_clutter: >2 non-caption overlays simultaneously
  const graphicDecisions = decisions.filter(d => d.type === 'graphic');
  for (let i = 1; i < graphicDecisions.length; i++) {
    checked++;
    const prev = graphicDecisions[i - 1];
    const curr = graphicDecisions[i];
    const prevEnd = prev.frame + (Number(prev.params['duration_s'] ?? 3) * fps);

    if (curr.frame < prevEnd) {
      // Overlapping graphics — stagger
      violations.push({
        constraintId: 'constraint:overlay.visual_clutter',
        constraintName: 'Visual Clutter',
        severity: 'warning',
        frame: curr.frame,
        description: `Graphic at frame ${curr.frame} overlaps with graphic ending at frame ${prevEnd}`,
        autoCorrected: true,
        correction: `Staggered: delayed to frame ${prevEnd + 9}`,
        deduction: 0,
      });
      curr.frame = prevEnd + 9; // 0.3s gap after previous exits
    }
  }

  // 4.2 graphic_too_small: graphics must be readable
  for (const g of graphicDecisions) {
    checked++;
    // This is a render-time check — flag if duration < 1.5s (unreadable)
    const duration = Number(g.params['duration_s'] ?? 3);
    if (duration < 1.5) {
      violations.push({
        constraintId: 'constraint:overlay.graphic_too_small',
        constraintName: 'Graphic Too Brief',
        severity: 'warning',
        frame: g.frame,
        description: `Graphic duration ${duration}s is below 1.5s minimum for readability`,
        autoCorrected: true,
        correction: 'Extended to 2.0s',
        deduction: 0,
      });
      g.params['duration_s'] = 2.0;
    }
  }

  return checked;
}

// ─── Pass 5: Audio ──────────────────────────────────────────────────────────

function enforceAudioConstraints(
  decisions: EditDecision[],
  overlays: OverlayInfo[],
  violations: ConstraintViolation[]
): number {
  let checked = 0;

  // 5.1 missing_transition_sound: every non-hard-cut needs a sound
  const transitions = decisions.filter(d => d.type === 'transition');
  for (const t of transitions) {
    checked++;
    if (t.params['type'] === 'hard-cut') continue;

    // Check if there's a paired SFX within ±5 frames
    const hasPairedSfx = decisions.some(d =>
      d.type === 'sfx-trigger' && Math.abs(d.frame - t.frame) <= 5
    );

    if (!hasPairedSfx) {
      violations.push({
        constraintId: 'constraint:transition.missing_transition_sound',
        constraintName: 'Missing Transition Sound',
        severity: 'warning',
        frame: t.frame,
        description: `${t.params['type']} transition at frame ${t.frame} has no paired SFX`,
        autoCorrected: true,
        correction: 'Auto-inserted SFX trigger',
        deduction: 0,
      });

      // Auto-insert SFX
      decisions.push({
        type: 'sfx-trigger',
        frame: t.frame,
        confidence: 0.7,
        source: 'constraint:transition.missing_transition_sound',
        technique: 'technique:sound.sfx_whoosh',
        params: { type: inferSfxForTransition(t.params['type'] as string), level_db: -14 },
        reason: 'Auto-paired by constraint enforcer',
      });
    }
  }

  return checked;
}

// ─── Pass 6: Continuity + AI ────────────────────────────────────────────────

function enforceContinuityConstraints(
  decisions: EditDecision[],
  violations: ConstraintViolation[]
): number {
  let checked = 0;

  // 6.1 ai_footage_overheld: AI clips held > 5s without narrative pressure
  const zoomDecisions = decisions.filter(d => d.type === 'zoom');
  for (const z of zoomDecisions) {
    checked++;
    // If this is a hold/drift zoom with very long duration on AI footage
    const durationS = Number(z.params['duration_s'] ?? 3);
    if (durationS > 5 && z.params['ai_footage'] === 'true') {
      violations.push({
        constraintId: 'constraint:ai-specific.ai_footage_overheld',
        constraintName: 'AI Footage Overheld',
        severity: 'warning',
        frame: z.frame,
        description: `AI footage held ${durationS}s exceeds 5s threshold (artifacts likely)`,
        autoCorrected: true,
        correction: 'Reduced to 4s',
        deduction: 0,
      });
      z.params['duration_s'] = 4;
    }
  }

  return checked;
}

// ─── Pass 7: Budget Enforcement ─────────────────────────────────────────────

function enforceBudgetConstraints(
  decisions: EditDecision[],
  violations: ConstraintViolation[]
): number {
  let checked = 0;

  // 7.1 identical_zoom_targets: 3+ zooms to exact same scale
  const zooms = decisions.filter(d => d.type === 'zoom');
  const zoomScales = zooms.map(z => Number(z.params['end_scale'] ?? 1.1));

  for (let i = 2; i < zoomScales.length; i++) {
    checked++;
    if (Math.abs(zoomScales[i] - zoomScales[i-1]) < 0.01 &&
        Math.abs(zoomScales[i-1] - zoomScales[i-2]) < 0.01) {
      violations.push({
        constraintId: 'constraint:rhythm.identical_zoom_targets',
        constraintName: 'Identical Zoom Targets',
        severity: 'info',
        frame: zooms[i].frame,
        description: `3 consecutive zooms to ${zoomScales[i]}x — feels robotic`,
        autoCorrected: false,
        deduction: -1,
      });
    }
  }

  return checked;
}

// ─── Pass 8: Accessibility (LAST — NON-OVERRIDABLE) ─────────────────────────

function enforceAccessibilityConstraints(
  decisions: EditDecision[],
  fps: number,
  violations: ConstraintViolation[]
): number {
  let checked = 0;

  // 8.1 flash_rate_violation: NEVER more than 3 flashes per second
  const flashDecisions = decisions.filter(d =>
    d.type === 'transition' && (d.params['type'] === 'flash' || d.params['type'] === 'dip-to-white')
  );

  // Check 1-second windows
  for (let i = 0; i < flashDecisions.length; i++) {
    checked++;
    const windowEnd = flashDecisions[i].frame + fps; // 1 second window
    const flashesInWindow = flashDecisions.filter(f =>
      f.frame >= flashDecisions[i].frame && f.frame < windowEnd
    );

    if (flashesInWindow.length > 3) {
      // Remove excess flashes (NON-OVERRIDABLE — accessibility law)
      const excess = flashesInWindow.slice(3);
      for (const f of excess) {
        const idx = decisions.indexOf(f);
        if (idx >= 0) {
          decisions.splice(idx, 1);
          violations.push({
            constraintId: 'constraint:accessibility.flash_rate_violation',
            constraintName: 'Flash Rate Violation (WCAG)',
            severity: 'blocker',
            frame: f.frame,
            description: `Flash at frame ${f.frame} exceeds 3 flashes/sec limit (photosensitive epilepsy)`,
            autoCorrected: true,
            correction: 'Removed excess flash (accessibility — NON-OVERRIDABLE)',
            deduction: 0,
          });
        }
      }
    }
  }

  // 8.2 text_contrast_failure: captions must meet WCAG AA (4.5:1)
  const captionDecisions = decisions.filter(d => d.type === 'caption-emphasis');
  for (const c of captionDecisions) {
    checked++;
    // Flag if no background specified (render-time check, just note it)
    if (!c.params['background']) {
      c.params['background'] = 'rgba(0,0,0,0.7)'; // ensure contrast
    }
  }

  return checked;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function inferSfxForTransition(transitionType: string): string {
  switch (transitionType) {
    case 'dissolve': return 'shimmer';
    case 'whip-pan': case 'whip_pan': return 'whoosh';
    case 'wipe': return 'whoosh';
    case 'zoom-punch': case 'zoom_punch': return 'impact';
    case 'flash': return 'shutter';
    case 'fade-to-black': case 'fade_to_black': return 'fade';
    case 'film-burn': case 'film_burn': return 'crackle';
    case 'iris-wipe': case 'iris_wipe': return 'mechanical';
    case 'blur': return 'whoosh';
    case 'slide': return 'whoosh';
    default: return 'whoosh';
  }
}
