import { describe, expect, it } from 'vitest';

import { buildAdaptiveReferencePlan, ADAPTIVE_PLAN_VERSION } from '@/lib/editron/reference-video/adaptive-reference-plan';
import type { EditFingerprint } from '@/lib/editron/types/edit-fingerprint';

function fingerprint(overrides: Partial<EditFingerprint> = {}): EditFingerprint {
  const base: EditFingerprint = {
    fingerprintId: 'efp_1',
    referenceId: 'ref_1',
    version: 1,
    alignmentFrame: 'beat-space',
    durationMs: 10_000,
    audio: {
      bpm: 120,
      beats: [
        { timestampMs: 250, strength: 0.5 },
        { timestampMs: 750, strength: 0.6 },
        { timestampMs: 1250, strength: 0.7 },
      ],
      sections: [
        { startMs: 0, endMs: 2000, label: 'intro' },
        { startMs: 2000, endMs: 6000, label: 'verse' },
        { startMs: 6000, endMs: 8000, label: 'drop' },
        { startMs: 8000, endMs: 10_000, label: 'outro' },
      ],
      dropsMs: [6500],
      energyCurve: [],
      audioAnchored: true,
      voiceWindows: [],
      soundClass: 'unknown',
      durationMs: 10_000,
    },
    decisionStream: [
      { family: 'transition_hard_cut', anchor: { kind: 'none', tMs: 2500 }, params: {}, confidence: 1 },
      { family: 'transition_hard_cut', anchor: { kind: 'none', tMs: 7000 }, params: {}, confidence: 1 },
    ],
    signalConditionals: [],
    structure: { slots: [] },
    typography: {},
    performance: {},
    treatment: {},
    copyFormula: { slots: [] },
    graphics: { classes: [] },
    layerConfidence: {},
  };
  return { ...base, ...overrides, audio: { ...base.audio, ...overrides.audio } } as EditFingerprint;
}

describe('R5 adaptive reference plan', () => {
  it('normalizes sections + drops into structural slots with rhythm relationships', () => {
    const plan = buildAdaptiveReferencePlan(fingerprint());

    expect(plan.version).toBe(ADAPTIVE_PLAN_VERSION);
    expect(plan.referenceId).toBe('ref_1');
    expect(plan.alignmentFrame).toBe('beat-space');

    // Rhythm: bpm + beats + cuts.
    expect(plan.rhythm.bpm).toBe(120);
    expect(plan.rhythm.beatsMs).toEqual([250, 750, 1250]);
    expect(plan.rhythm.dropsMs).toEqual([6500]);
    expect(plan.rhythm.cutMs).toEqual([2500, 7000]);
    // 2 cuts over 10s = 12/min
    expect(plan.rhythm.avgCutsPerMinute).toBeCloseTo(12, 2);

    // Slots: drop anchored first, then non-overlapping sections.
    const roles = plan.slots.map((s) => s.role);
    expect(roles).toContain('drop');
    expect(roles).toContain('hook'); // intro -> hook
    expect(roles).toContain('body'); // verse
    expect(roles).toContain('outro');
    // drop slot exists at 6500
    const dropSlot = plan.slots.find((s) => s.role === 'drop');
    expect(dropSlot?.startMs).toBe(6500);
    expect(dropSlot?.source).toBe('drop');
  });

  it('adds protected-silence slots from R2 evidence where no section claims the range', () => {
    const fp = fingerprint();
    // Remove the outro so 8500–9000 is free for the silence slot.
    fp.audio.sections = fp.audio.sections.filter((s) => s.label !== 'outro');
    const plan = buildAdaptiveReferencePlan(fp, {
      silenceWindows: [{ startMs: 8500, endMs: 9000, durationMs: 500 }],
    });
    const sil = plan.slots.find((s) => s.role === 'protected-silence');
    expect(sil).toMatchObject({ source: 'silence', startMs: 8500, endMs: 9000 });
  });

  it('skips a silence window that overlaps an already-claimed section', () => {
    const plan = buildAdaptiveReferencePlan(fingerprint(), {
      silenceWindows: [{ startMs: 8500, endMs: 9000, durationMs: 500 }], // overlaps outro (8000–10000)
    });
    expect(plan.slots.some((s) => s.source === 'silence')).toBe(false);
  });

  it('fills a clip-cap body slot when no sections/drops exist', () => {
    const fp = fingerprint();
    fp.audio.sections = [];
    fp.audio.dropsMs = [];
    const plan = buildAdaptiveReferencePlan(fp);
    expect(plan.slots).toHaveLength(1);
    expect(plan.slots[0]).toMatchObject({ role: 'body', source: 'clip', startMs: 0, endMs: 10_000 });
  });

  it('collapses overlapping sections in favor of previously anchored slots', () => {
    // A section that overlaps the drop is dropped from the slot list.
    const fp = fingerprint();
    fp.audio.sections.push({ startMs: 6000, endMs: 7000, label: 'verse' }); // overlaps the drop span
    const plan = buildAdaptiveReferencePlan(fp);
    const starts = plan.slots.map((s) => `${s.role}@${s.startMs}`);
    // The overlapping verse@6000 must not appear twice; drop@6500 remains.
    expect(starts.filter((x) => x === 'drop@6500')).toHaveLength(1);
    expect(starts.filter((x) => x.startsWith('body@6'))).toHaveLength(0);
  });

  it('maps the plan to a target duration deterministically (slot-space proportion)', () => {
    const plan = buildAdaptiveReferencePlan(fingerprint(), { targetDurationMs: 5000 });
    expect(plan.target).toBeDefined();
    expect(plan.target?.requestedDurationMs).toBe(5000);

    // Drop moves 6500 -> 3250 (scale 0.5).
    const dropSlot = plan.target?.slots.find((s) => s.role === 'drop');
    expect(dropSlot?.startMs).toBe(3250);
    // Beat grid rescaled.
    expect(plan.target?.beatsMs).toEqual([125, 375, 625]);
    // Cut + drop times are ALSO rescaled (no source/target space mixing).
    expect(plan.target?.cutMs).toEqual([1250, 3500]);
    expect(plan.target?.dropsMs).toEqual([3250]);
    // All boundaries within [0, target].
    for (const s of plan.target?.slots ?? []) {
      expect(s.startMs).toBeGreaterThanOrEqual(0);
      expect(s.endMs).toBeLessThanOrEqual(5000);
    }
  });

  it('is pure + deterministic for the same input', () => {
    const a = buildAdaptiveReferencePlan(fingerprint(), { targetDurationMs: 5000 });
    const b = buildAdaptiveReferencePlan(fingerprint(), { targetDurationMs: 5000 });
    expect(a).toEqual(b);
  });
});
