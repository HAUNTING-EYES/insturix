import { describe, expect, it } from 'vitest';
import type { EditDecision, EditDecisionList } from '../../lib/editron/services/reactive-edit-engine';
import {
  createUnifiedDecisionBundle,
  mergeSignalDrivenBundle,
  planUnifiedDecisionBundle,
  planUnifiedDecisionBundleFromCandidates,
} from '../../lib/editron/services/unified-decision-bundle';

describe('unified decision bundle merge', () => {
  it('keeps a Path E decision and attaches Path D validation for a near duplicate', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'zoom', frame: 60, durationFrames: 18, source: 'creative-brief:test' }),
      ]),
      expectedExecuted: 1,
      expectedSkipped: 0,
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({ type: 'zoom', frame: 66, durationFrames: 12, source: 'signal-executor:test', confidence: 0.83 }),
    ]));

    expect(merged.source).toBe('creative-brief+signal-driven');
    expect(merged.authority).toEqual({
      version: 'unified-decision-authority-v1',
      executableProducer: 'unified-planner',
      decisionMode: 'merged-supplemental',
      advisoryProducers: ['creative-brief', 'signal-driven'],
      signalDecisionRole: 'advisor',
      signalDecisionsCanAddExecutable: false,
    });
    expect(merged.edl.decisions).toHaveLength(1);
    expect(merged.evidence).toEqual(expect.objectContaining({
      signalDecisionCount: 1,
      addedSignalDecisionCount: 0,
      validatedDecisionCount: 1,
      suppressedSignalDuplicateCount: 1,
      evidenceOnlySignalDecisionCount: 0,
      evidenceOnlySignalDecisions: [],
    }));
    expect(merged.edl.decisions[0].params.unifiedDecisionMerge).toEqual(expect.objectContaining({
      version: 'unified-decision-bundle-v1',
      role: 'primary-validated',
      signalValidations: [
        expect.objectContaining({
          frame: 66,
          frameDistance: 6,
          source: 'signal-executor:test',
          confidence: 0.83,
        }),
      ],
    }));
  });

  it('lets high-confidence non-overlapping signal transitions become executable through the unified planner', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({ type: 'transition', frame: 140, source: 'signal-executor:test', confidence: 0.82, params: { transitionType: 'whip-pan' } }),
    ]));

    expect(merged.source).toBe('creative-brief+signal-driven');
    expect(merged.authority).toEqual({
      version: 'unified-decision-authority-v1',
      executableProducer: 'unified-planner',
      decisionMode: 'unified-planner',
      advisoryProducers: ['creative-brief', 'signal-driven'],
      signalDecisionRole: 'co-owner',
      signalDecisionsCanAddExecutable: true,
    });
    expect(merged.edl.decisions.map((d) => d.type)).toEqual(['graphic', 'transition']);
    expect(merged.edl.stats).toEqual(expect.objectContaining({
      graphicCount: 1,
      transitionCount: 1,
    }));
    expect(merged.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 1,
      validatedDecisionCount: 0,
      evidenceOnlySignalDecisionCount: 0,
    }));
    expect(merged.edl.decisions[1].params.unifiedDecisionMerge).toEqual(expect.objectContaining({
      role: 'signal-supplement',
      executionLicense: 'licensed-by-signal-policy',
    }));
    expect(merged.expectedSkipped).toBe(0);
  });

  it('lets a weak creative primary supplement with bounded signal-driven decisions', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({
          type: 'graphic',
          frame: 30,
          source: 'creative-brief:test',
          confidence: 0.48,
          params: { role: 'setup' },
        }),
        decision({
          type: 'zoom',
          frame: 210,
          source: 'creative-brief:test',
          confidence: 0.44,
          params: { role: 'weak-camera' },
        }),
      ]),
      expectedExecuted: 2,
      expectedSkipped: 0,
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({ type: 'transition', frame: 140, source: 'signal-executor:test', confidence: 0.82, params: { transitionType: 'whip-pan' } }),
      decision({ type: 'sfx-trigger', frame: 340, source: 'signal-executor:test', confidence: 0.82, params: { sfxType: 'impact' } }),
      decision({ type: 'zoom', frame: 420, source: 'signal-executor:test', confidence: 0.78, params: { scale: 1.08 } }),
    ]));

    expect(merged.source).toBe('creative-brief+signal-driven');
    expect(merged.authority).toMatchObject({
      executableProducer: 'unified-planner',
      decisionMode: 'unified-planner',
      signalDecisionRole: 'co-owner',
      signalDecisionsCanAddExecutable: true,
    });
    expect(merged.edl.decisions.map((d) => d.source)).toEqual(
      expect.arrayContaining(['creative-brief:test', 'signal-executor:test']),
    );
    expect(merged.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 3,
      validatedDecisionCount: 0,
      evidenceOnlySignalDecisionCount: 0,
      signalDecisionCount: 3,
    }));
  });

  it('normalizes Path E brief-executor EDL shape before merge/execution', () => {
    const bundle = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: {
        decisions: [{
          type: 'graphic',
          frame: 42,
          confidence: 0.72,
          source: 'creative-brief:test',
          technique: 'emphasis_word',
          params: { text: 'signal facts' },
        }],
        metadata: {
          totalMappingsEvaluated: 0,
          totalMappingsFired: 0,
          totalDecisionsGenerated: 1,
          totalDecisionsSuppressed: 0,
          executionTimeMs: 0,
        },
      },
    });

    expect(bundle.edl.projectId).toBe('unknown-project');
    expect(bundle.edl.generatedAt.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    expect(bundle.edl.totalDecisions).toBe(1);
    expect(bundle.edl.stats).toEqual(expect.objectContaining({
      graphicCount: 1,
      averageConfidence: 0.72,
    }));
    expect(bundle.edl.decisions[0]).toEqual(expect.objectContaining({
      priority: 3,
      signal: 'emphasis_word',
      reason: '',
    }));
  });

  it('can represent Path D as the only producer when Path E has no bundle', () => {
    const bundle = createUnifiedDecisionBundle({
      source: 'signal-driven',
      edl: edl([
        decision({ type: 'zoom', frame: 24, source: 'signal-executor:test' }),
      ]),
    });

    expect(bundle.source).toBe('signal-driven');
    expect(bundle.authority).toEqual({
      version: 'unified-decision-authority-v1',
      executableProducer: 'signal-driven',
      decisionMode: 'signal-primary',
      advisoryProducers: [],
      signalDecisionRole: 'primary',
      signalDecisionsCanAddExecutable: true,
    });
    expect(bundle.edl.totalDecisions).toBe(1);
    expect(bundle.evidence).toEqual(expect.objectContaining({
      primaryDecisionCount: 0,
      signalDecisionCount: 1,
      addedSignalDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 0,
      evidenceOnlySignalDecisions: [],
    }));
  });

  it('plans creative primary plus signal advisor through one planner boundary', () => {
    let bundle = planUnifiedDecisionBundle(null, {
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 90, source: 'creative-brief:test' }),
      ]),
      expectedExecuted: 1,
      expectedSkipped: 0,
    });

    bundle = planUnifiedDecisionBundle(bundle, {
      source: 'signal-driven',
      edl: edl([
        decision({ type: 'graphic', frame: 96, source: 'signal-executor:test', confidence: 0.84 }),
        decision({ type: 'transition', frame: 180, source: 'signal-executor:test', confidence: 0.82, params: { transitionType: 'whip-pan' } }),
      ]),
    });

    expect(bundle.source).toBe('creative-brief+signal-driven');
    expect(bundle.authority).toEqual({
      version: 'unified-decision-authority-v1',
      executableProducer: 'unified-planner',
      decisionMode: 'unified-planner',
      advisoryProducers: ['creative-brief', 'signal-driven'],
      signalDecisionRole: 'co-owner',
      signalDecisionsCanAddExecutable: true,
    });
    expect(bundle.edl.decisions.map((d) => d.type)).toEqual(['graphic', 'transition']);
    expect(bundle.evidence).toEqual(expect.objectContaining({
      primaryDecisionCount: 1,
      signalDecisionCount: 2,
      addedSignalDecisionCount: 1,
      validatedDecisionCount: 1,
      suppressedSignalDuplicateCount: 1,
      evidenceOnlySignalDecisionCount: 0,
    }));
    expect(bundle.expectedSkipped).toBe(0);
  });

  it('keeps later signal batches executable when they pass the same unified policy', () => {
    let bundle = planUnifiedDecisionBundle(null, {
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 90, source: 'creative-brief:test' }),
      ]),
    });

    bundle = planUnifiedDecisionBundle(bundle, {
      source: 'signal-driven',
      edl: edl([
        decision({ type: 'transition', frame: 180, source: 'signal-executor:first', confidence: 0.82, params: { transitionType: 'whip-pan' } }),
      ]),
    });

    bundle = planUnifiedDecisionBundle(bundle, {
      source: 'signal-driven',
      edl: edl([
        decision({ type: 'sfx-trigger', frame: 260, source: 'signal-executor:later', confidence: 0.86, params: { sfxType: 'impact' } }),
      ]),
    });

    expect(bundle.source).toBe('creative-brief+signal-driven');
    expect(bundle.authority).toEqual({
      version: 'unified-decision-authority-v1',
      executableProducer: 'unified-planner',
      decisionMode: 'unified-planner',
      advisoryProducers: ['creative-brief', 'signal-driven'],
      signalDecisionRole: 'co-owner',
      signalDecisionsCanAddExecutable: true,
    });
    expect(bundle.edl.decisions.map((d) => d.source)).toEqual([
      'creative-brief:test',
      'signal-executor:first',
      'signal-executor:later',
    ]);
    expect(bundle.evidence).toEqual(expect.objectContaining({
      signalDecisionCount: 2,
      addedSignalDecisionCount: 2,
      evidenceOnlySignalDecisionCount: 0,
    }));
  });

  it('can accept signal producer before creative primary without changing precedence', () => {
    let bundle = planUnifiedDecisionBundle(null, {
      source: 'signal-driven',
      edl: edl([
        decision({ type: 'zoom', frame: 54, source: 'signal-executor:test', confidence: 0.82 }),
      ]),
    });

    bundle = planUnifiedDecisionBundle(bundle, {
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'zoom', frame: 60, source: 'creative-brief:test', confidence: 0.9 }),
      ]),
      expectedExecuted: 1,
    });

    expect(bundle.source).toBe('creative-brief+signal-driven');
    expect(bundle.edl.decisions).toHaveLength(1);
    expect(bundle.edl.decisions[0].source).toBe('creative-brief:test');
    expect(bundle.edl.decisions[0].params.unifiedDecisionMerge).toEqual(expect.objectContaining({
      role: 'primary-validated',
    }));
    expect(bundle.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 0,
      validatedDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 0,
      evidenceOnlySignalDecisions: [],
    }));
  });

  it('fails loud when a second creative primary tries to overwrite the planner', () => {
    const bundle = planUnifiedDecisionBundle(null, {
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:first' }),
      ]),
    });

    expect(() => planUnifiedDecisionBundle(bundle, {
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 60, source: 'creative-brief:second' }),
      ]),
    })).toThrow('already has primary producer');
  });

  it('plans an unordered producer candidate batch with unified planner authority', () => {
    const bundle = planUnifiedDecisionBundleFromCandidates([
      {
        source: 'signal-driven',
        edl: edl([
          decision({ type: 'transition', frame: 120, source: 'signal-executor:test', confidence: 0.82, params: { transitionType: 'whip-pan' } }),
        ]),
      },
      {
        source: 'creative-brief',
        edl: edl([
          decision({ type: 'graphic', frame: 60, source: 'creative-brief:test', confidence: 0.88 }),
        ]),
        expectedExecuted: 1,
      },
    ]);

    expect(bundle?.source).toBe('creative-brief+signal-driven');
    expect(bundle?.edl.decisions.map((d) => d.source)).toEqual([
      'creative-brief:test',
      'signal-executor:test',
    ]);
    expect(bundle?.evidence).toEqual(expect.objectContaining({
      primaryDecisionCount: 1,
      signalDecisionCount: 1,
      addedSignalDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 0,
    }));
  });

  it('returns no bundle when no producer candidates exist', () => {
    expect(planUnifiedDecisionBundleFromCandidates([])).toBeNull();
  });

  it('lets signal SFX execute selectively without flooding the timeline', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 3400, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({ type: 'sfx-trigger', frame: 100, source: 'signal-executor:sfx-1', confidence: 0.9, params: { sfxType: 'impact' } }),
      decision({ type: 'sfx-trigger', frame: 220, source: 'signal-executor:sfx-2', confidence: 0.9, params: { sfxType: 'impact' } }),
      decision({ type: 'sfx-trigger', frame: 340, source: 'signal-executor:sfx-3', confidence: 0.9, params: { sfxType: 'impact' } }),
      decision({ type: 'sfx-trigger', frame: 460, source: 'signal-executor:sfx-4', confidence: 0.9, params: { sfxType: 'impact' } }),
      decision({ type: 'sfx-trigger', frame: 580, source: 'signal-executor:sfx-5', confidence: 0.9, params: { sfxType: 'impact' } }),
      decision({ type: 'sfx-trigger', frame: 700, source: 'signal-executor:sfx-6', confidence: 0.9, params: { sfxType: 'impact' } }),
    ]));

    expect(merged.edl.decisions.filter((d) => d.type === 'sfx-trigger')).toHaveLength(1);
    expect(merged.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 5,
    }));
    expect(merged.evidence.evidenceOnlySignalDecisions.map((d) => d.source)).toEqual([
      'signal-executor:sfx-2',
      'signal-executor:sfx-3',
      'signal-executor:sfx-4',
      'signal-executor:sfx-5',
      'signal-executor:sfx-6',
    ]);
    expect(merged.evidence.evidenceOnlySignalDecisions[0]).toEqual(expect.objectContaining({
      type: 'sfx-trigger',
      frame: 220,
      params: { sfxType: 'impact' },
      reason: 'signal-rhythm-budget-exhausted',
    }));
    expect(merged.expectedSkipped).toBe(0);
  });

  it('keeps hard-cut signal transitions as evidence while executing licensed special transitions', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({ type: 'transition', frame: 180, source: 'signal-executor:hard-cut', confidence: 0.95, params: { transitionType: 'hard-cut' } }),
      decision({ type: 'transition', frame: 420, source: 'signal-executor:whip-pan', confidence: 0.82, params: { transitionType: 'whip-pan' } }),
    ]));

    expect(merged.edl.decisions.filter((d) => d.type === 'transition')).toHaveLength(1);
    expect(merged.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 1,
    }));
    expect(merged.evidence.evidenceOnlySignalDecisions.map((d) => d.params)).toEqual([
      { transitionType: 'hard-cut' },
    ]);
    expect(merged.evidence.evidenceOnlySignalDecisions[0].reason).toBe('hard-cut-is-boundary-evidence');
    expect(merged.expectedSkipped).toBe(0);
  });

  it('builds a full signal-decision audit without changing executable decisions', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({ type: 'caption-emphasis', frame: 50, source: 'signal-executor:caption', confidence: 0.91 }),
      decision({ type: 'zoom', frame: 90, source: 'signal-executor:zoom', confidence: 0.4 }),
      decision({ type: 'transition', frame: 180, source: 'signal-executor:transition', confidence: 0.95, params: { transitionType: 'hard-cut' } }),
      decision({ type: 'sfx-trigger', frame: 360, source: 'signal-executor:sfx', confidence: 0.89, params: { sfxType: 'impact' } }),
    ]));

    expect(merged.edl.decisions.map((d) => d.type)).toEqual(['graphic', 'caption-emphasis', 'sfx-trigger']);
    expect(merged.evidence.signalDecisionAudit).toEqual(expect.objectContaining({
      version: 'signal-decision-audit-v1',
      totalCount: 4,
      outcomes: {
        'added-executable': 2,
        'evidence-only': 2,
        'signal-primary': 0,
        'validated-primary': 0,
      },
    }));
    expect(merged.evidence.signalDecisionAudit.byFamily.caption).toEqual(expect.objectContaining({
      count: 1,
      frames: expect.objectContaining({ first: 50, last: 50, samples: [50] }),
      sources: { 'signal-executor:caption': 1 },
    }));
    expect(merged.evidence.signalDecisionAudit.byFamily.audio).toEqual(expect.objectContaining({
      count: 1,
      confidence: expect.objectContaining({ min: 0.89, max: 0.89, average: 0.89 }),
    }));
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'below-signal-confidence-floor': expect.objectContaining({ count: 1 }),
      'hard-cut-is-boundary-evidence': expect.objectContaining({ count: 1 }),
      'licensed-by-signal-policy': expect.objectContaining({ count: 2 }),
    }));
    expect(merged.evidence.signalDecisionAudit.candidates.map((candidate) => ({
      family: candidate.family,
      role: candidate.role,
      timing: candidate.timingAnchor.kind,
      frame: candidate.timingAnchor.frame,
      evidenceStrength: candidate.evidenceStrength,
      completeness: candidate.completeness,
      riskFlags: candidate.riskFlags,
      calibrationStatus: candidate.calibrationStatus,
    }))).toEqual(expect.arrayContaining([
      {
        family: 'caption',
        role: 'caption-emphasis',
        timing: 'moment',
        frame: 50,
        evidenceStrength: 0.91,
        completeness: 0.75,
        riskFlags: ['incomplete-intent'],
        calibrationStatus: 'invented-needs-calibration',
      },
      {
        family: 'camera',
        role: 'camera-motion',
        timing: 'moment',
        frame: 90,
        evidenceStrength: 0.4,
        completeness: 0.75,
        riskFlags: ['below-execution-confidence', 'incomplete-intent'],
        calibrationStatus: 'invented-needs-calibration',
      },
      {
        family: 'transition',
        role: 'transition-boundary',
        timing: 'boundary',
        frame: 180,
        evidenceStrength: 0.95,
        completeness: 1,
        riskFlags: ['hard-cut-boundary-evidence'],
        calibrationStatus: 'invented-needs-calibration',
      },
      {
        family: 'audio',
        role: 'audio-emphasis',
        timing: 'moment',
        frame: 360,
        evidenceStrength: 0.89,
        completeness: 1,
        riskFlags: [],
        calibrationStatus: 'invented-needs-calibration',
      },
    ]));
    expect(merged.evidence.signalDecisionAudit.samples.map((sample) => ({
      family: sample.family,
      outcome: sample.outcome,
      reason: sample.reason,
      frame: sample.frame,
      source: sample.source,
    }))).toEqual(expect.arrayContaining([
      {
        family: 'caption',
        outcome: 'added-executable',
        reason: 'licensed-by-signal-policy',
        frame: 50,
        source: 'signal-executor:caption',
      },
      {
        family: 'camera',
        outcome: 'evidence-only',
        reason: 'below-signal-confidence-floor',
        frame: 90,
        source: 'signal-executor:zoom',
      },
      {
        family: 'transition',
        outcome: 'evidence-only',
        reason: 'hard-cut-is-boundary-evidence',
        frame: 180,
        source: 'signal-executor:transition',
      },
      {
        family: 'audio',
        outcome: 'added-executable',
        reason: 'licensed-by-signal-policy',
        frame: 360,
        source: 'signal-executor:sfx',
      },
    ]));
  });
});

function edl(decisions: EditDecision[]): EditDecisionList {
  return {
    projectId: 'unified-decision-bundle-test',
    generatedAt: new Date('2026-06-11T00:00:00.000Z'),
    totalDecisions: decisions.length,
    decisions,
    stats: {
      cutsPerMinute: 0,
      transitionCount: decisions.filter((d) => d.type === 'transition').length,
      graphicCount: decisions.filter((d) => d.type === 'graphic').length,
      zoomCount: decisions.filter((d) => d.type === 'zoom').length,
      speedChangeCount: decisions.filter((d) => d.type === 'speed-change').length,
      averageConfidence: decisions.length
        ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length
        : 0,
    },
  };
}

function decision(overrides: Partial<EditDecision>): EditDecision {
  return {
    type: 'graphic',
    frame: 0,
    durationFrames: 12,
    priority: 3,
    source: 'test',
    signal: 'test_signal',
    reason: 'test decision',
    params: {},
    confidence: 0.9,
    ...overrides,
  };
}

