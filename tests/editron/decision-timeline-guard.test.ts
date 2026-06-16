import { describe, expect, it } from 'vitest';
import {
  enforceCanonicalDecisionTimeline,
  type DecisionTimelineGuardDecision,
} from '../../lib/editron/services/decision-timeline-guard';
import { buildEditedTimelineContext } from '../../lib/editron/services/edited-timeline-context';
import type { RawFootageAnalysis } from '../../lib/editron/services/signal-registry';

const fps = 30;

function rawFootage(): RawFootageAnalysis {
  return {
    originalDurationMs: 6000,
    estimatedCleanDurationMs: 2000,
    transcription: {
      words: [
        { word: 'first', startMs: 0, endMs: 300 },
        { word: 'second', startMs: 5000, endMs: 5300 },
      ],
    },
    segments: [
      { text: 'first second', startMs: 0, endMs: 5300, fillerCount: 0, silenceGapCount: 1, avgWordGapMs: 4700 },
    ],
  };
}

function mappedContext() {
  return buildEditedTimelineContext({
    rawFootage: rawFootage(),
    fps,
    projectDurationFrames: 60,
    overlays: [
      { type: 'video', from: 0, durationInFrames: 30, sourceStartFrame: 0 },
      { type: 'video', from: 30, durationInFrames: 30, sourceStartFrame: 150 },
    ],
  });
}

describe('decision timeline guard', () => {
  it('stamps executable decisions as cut-timeline decisions with source provenance', () => {
    const decisions: DecisionTimelineGuardDecision[] = [
      { type: 'graphic', frame: 30, source: 'test', params: { text: 'second' } },
    ];

    const evidence = enforceCanonicalDecisionTimeline(decisions, mappedContext());

    expect(evidence).toMatchObject({
      version: 'canonical-decision-timeline-v1',
      frameSpace: 'cut',
      decisionCount: 1,
      stampedDecisionCount: 1,
      outOfRangeDecisionCount: 0,
      unmappedSourceDecisionCount: 0,
    });
    expect(decisions[0]!.params?.canonicalTimeline).toEqual({
      version: 'canonical-decision-timeline-v1',
      frameSpace: 'cut',
      cutFrame: 30,
      sourceFrame: 150,
      sourceMapped: true,
      status: 'ok',
      durationFrames: 60,
      hasSourceMapping: true,
      requiresSourceMapping: true,
    });
  });

  it('fails before render when a raw-frame decision leaks past the edited timeline', () => {
    const decisions: DecisionTimelineGuardDecision[] = [
      { type: 'graphic', frame: 150, source: 'raw-leak', params: { text: 'raw frame' } },
    ];

    expect(() => enforceCanonicalDecisionTimeline(decisions, mappedContext()))
      .toThrow('Non-canonical decision timeline: 1 out-of-range, 0 unmapped-source decisions');
    expect(decisions[0]!.params?.canonicalTimeline).toMatchObject({
      frameSpace: 'cut',
      cutFrame: 150,
      sourceFrame: null,
      status: 'out-of-range',
    });
  });

  it('fails before render when a multi-clip upload lacks complete source mapping', () => {
    const unsafeContext = buildEditedTimelineContext({
      rawFootage: rawFootage(),
      fps,
      projectDurationFrames: 60,
      overlays: [
        { type: 'video', from: 0, durationInFrames: 30, sourceStartFrame: 0 },
        { type: 'video', from: 30, durationInFrames: 30 },
      ],
    });

    expect(() => enforceCanonicalDecisionTimeline([
      { type: 'zoom', frame: 10, source: 'test', params: {} },
    ], unsafeContext)).toThrow('Unsafe canonical decision timeline: 1/2 video clips are missing source mapping');
  });
});
