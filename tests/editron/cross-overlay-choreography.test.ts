import { describe, expect, it } from 'vitest';
import type { EditDecision } from '../../lib/editron/services/reactive-edit-engine';
import { applyCrossOverlayChoreography } from '../../lib/editron/services/cross-overlay-choreography';

describe('cross-overlay choreography scheduler', () => {
  it('keeps one text-lane owner when MG and caption emphasis compete on the same moment', () => {
    const result = applyCrossOverlayChoreography([
      decision({
        type: 'graphic',
        frame: 180,
        durationFrames: 70,
        confidence: 0.94,
        source: 'signal-executor:mg',
      }),
      decision({
        type: 'caption-emphasis',
        frame: 190,
        durationFrames: 35,
        confidence: 0.78,
        source: 'signal-executor:caption',
        params: { text: 'important phrase' },
      }),
    ]);

    expect(result.decisions.map((item) => item.type)).toEqual(['graphic']);
    expect(result.suppressed).toEqual([
      expect.objectContaining({
        reason: 'text-lane-stack',
        family: 'caption',
        frame: 190,
        conflictingWith: expect.objectContaining({
          type: 'graphic',
          family: 'mg',
          source: 'signal-executor:mg',
        }),
      }),
    ]);
    expect(result.report).toEqual(expect.objectContaining({
      version: 'cross-overlay-choreography-v1',
      inputDecisionCount: 2,
      outputDecisionCount: 1,
      suppressedDecisionCount: 1,
      calibrationStatus: 'invented-needs-calibration',
    }));
    expect(result.report.laneLoad).toEqual(expect.objectContaining({ text: 1, motion: 0, audio: 0 }));
    expect(result.decisions[0].params.crossOverlayChoreography).toEqual(expect.objectContaining({
      family: 'mg',
      lane: 'text',
      syncGroupId: null,
      suppressedNearbyCount: 1,
      calibrationStatus: 'invented-needs-calibration',
    }));
  });

  it('allows a transition and zoom to share a beat when the boundary planner licenses a zoom bridge', () => {
    const result = applyCrossOverlayChoreography([
      decision({
        type: 'transition',
        frame: 300,
        confidence: 0.91,
        source: 'signal-executor:transition',
        params: {
          transitionBoundaryPlan: {
            crossFamily: { zoomBridgeAllowed: true },
          },
        },
      }),
      decision({
        type: 'zoom',
        frame: 306,
        durationFrames: 24,
        confidence: 0.88,
        source: 'signal-executor:zoom',
      }),
    ]);

    expect(result.suppressed).toEqual([]);
    expect(result.decisions.map((item) => item.type).sort()).toEqual(['transition', 'zoom']);
    expect(result.decisions.every((item) => item.params.crossOverlayChoreography)).toBe(true);
    expect(result.report.laneLoad).toEqual(expect.objectContaining({ motion: 2 }));
    expect(result.report.syncGroups).toEqual([expect.objectContaining({
      id: 'sync:300',
      lane: 'motion',
      lanes: ['motion'],
      frame: 300,
      families: ['camera', 'transition'],
      decisionTypes: ['transition', 'zoom'],
      count: 2,
    })]);
    expect(result.decisions.map((item) => item.params.crossOverlayChoreography.syncGroupId)).toEqual(['sync:300', 'sync:300']);
  });

  it('does not treat missing SFX anchor atoms as a valid sync link', () => {
    const result = applyCrossOverlayChoreography([
      decision({
        type: 'graphic',
        frame: 120,
        durationFrames: 50,
        confidence: 0.9,
        source: 'signal-executor:mg',
      }),
      decision({
        type: 'sfx-trigger',
        frame: 125,
        durationFrames: 8,
        confidence: 0.82,
        source: 'signal-executor:sfx',
        params: { sfxType: 'impact' },
      }),
    ]);

    expect(result.decisions.map((item) => item.type)).toEqual(['graphic']);
    expect(result.suppressed[0]).toEqual(expect.objectContaining({
      reason: 'unlinked-audio-on-crowded-moment',
      family: 'audio',
    }));
  });

  it('does not let high-confidence unlinked SFX outrank the visual beat it should support', () => {
    const result = applyCrossOverlayChoreography([
      decision({
        type: 'sfx-trigger',
        frame: 125,
        durationFrames: 8,
        confidence: 0.99,
        source: 'signal-executor:sfx',
        params: { sfxType: 'impact' },
      }),
      decision({
        type: 'graphic',
        frame: 120,
        durationFrames: 50,
        confidence: 0.72,
        source: 'signal-executor:mg',
      }),
    ]);

    expect(result.decisions.map((item) => item.type)).toEqual(['graphic']);
    expect(result.suppressed[0]).toEqual(expect.objectContaining({
      reason: 'unlinked-audio-on-crowded-moment',
      family: 'audio',
    }));
  });
  it('keeps linked SFX when it lands inside the sync window of its visual beat', () => {
    const result = applyCrossOverlayChoreography([
      decision({
        type: 'transition',
        frame: 240,
        confidence: 0.88,
        source: 'signal-executor:transition',
      }),
      decision({
        type: 'sfx-trigger',
        frame: 246,
        durationFrames: 8,
        confidence: 0.82,
        source: 'signal-executor:sfx',
        params: {
          sfxType: 'impact',
          beatFrame: 240,
        },
      }),
    ]);

    expect(result.suppressed).toEqual([]);
    expect(result.decisions.map((item) => item.type).sort()).toEqual(['sfx-trigger', 'transition']);
    expect(result.report.syncGroups).toEqual([expect.objectContaining({
      id: 'sync:240',
      lane: 'motion',
      lanes: ['audio', 'motion'],
      frame: 240,
      families: ['audio', 'transition'],
      decisionTypes: ['sfx-trigger', 'transition'],
      count: 2,
    })]);
  });
});

function decision(overrides: Partial<EditDecision>): EditDecision {
  return {
    type: 'graphic',
    frame: 0,
    durationFrames: 12,
    priority: 3,
    source: 'test',
    signal: 'test-signal',
    reason: 'test decision',
    params: {},
    confidence: 0.9,
    ...overrides,
  };
}
