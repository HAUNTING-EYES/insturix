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
    expect(merged.edl.decisions).toHaveLength(1);
    expect(merged.evidence).toEqual(expect.objectContaining({
      signalDecisionCount: 1,
      addedSignalDecisionCount: 0,
      validatedDecisionCount: 1,
      suppressedSignalDuplicateCount: 1,
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

  it('adds non-overlapping Path D decisions as signal supplements', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({ type: 'transition', frame: 140, source: 'signal-executor:test', confidence: 0.78 }),
    ]));

    expect(merged.source).toBe('creative-brief+signal-driven');
    expect(merged.edl.decisions.map((d) => d.type)).toEqual(['graphic', 'transition']);
    expect(merged.edl.stats).toEqual(expect.objectContaining({
      graphicCount: 1,
      transitionCount: 1,
    }));
    expect(merged.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 1,
      validatedDecisionCount: 0,
    }));
    expect(merged.edl.decisions[1].params.unifiedDecisionMerge).toEqual(expect.objectContaining({
      role: 'signal-supplement',
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
    expect(bundle.edl.totalDecisions).toBe(1);
    expect(bundle.evidence).toEqual(expect.objectContaining({
      primaryDecisionCount: 0,
      signalDecisionCount: 1,
      addedSignalDecisionCount: 1,
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
        decision({ type: 'transition', frame: 180, source: 'signal-executor:test', confidence: 0.74 }),
      ]),
    });

    expect(bundle.source).toBe('creative-brief+signal-driven');
    expect(bundle.edl.decisions.map((d) => d.type)).toEqual(['graphic', 'transition']);
    expect(bundle.evidence).toEqual(expect.objectContaining({
      primaryDecisionCount: 1,
      signalDecisionCount: 2,
      addedSignalDecisionCount: 1,
      validatedDecisionCount: 1,
      suppressedSignalDuplicateCount: 1,
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

  it('plans an unordered producer candidate batch with creative as the primary owner', () => {
    const bundle = planUnifiedDecisionBundleFromCandidates([
      {
        source: 'signal-driven',
        edl: edl([
          decision({ type: 'transition', frame: 120, source: 'signal-executor:test', confidence: 0.74 }),
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
    }));
  });

  it('returns no bundle when no producer candidates exist', () => {
    expect(planUnifiedDecisionBundleFromCandidates([])).toBeNull();
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
