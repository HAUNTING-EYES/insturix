import { describe, expect, it } from 'vitest';
import { buildUnifiedMomentContext, buildUnifiedMomentContexts } from '../../lib/editron/services/unified-moment-context';
import type { SignalSnapshot, SignalTimeline } from '../../lib/editron/services/signal-registry';

function timeline(): SignalTimeline {
  const gridSignals: SignalTimeline['gridSignals'] = new Map<number, SignalSnapshot>([
    [105, {
      frame: 105,
      timestampMs: 3_500,
      'speech.energy': 0.86,
      'visual.significance': 0.9,
      'visual.motion_intensity': 0.42,
      'visual.motion_vector.x': -0.35,
      'visual.motion_vector.y': 0.18,
      'visual.main_subject.x': 0.22,
      'visual.main_subject.y': 0.35,
      'visual.main_subject.width': 0.28,
      'visual.main_subject.height': 0.52,
      'visual.text_coverage': 0.08,
      'visual.negative_space.right': 0.82,
    }],
    [510, {
      frame: 510,
      timestampMs: 17_000,
      'speech.energy': 0.35,
      'visual.significance': 0.3,
    }],
  ]);

  return {
    fps: 30,
    totalFrames: 900,
    gridInterval: 15,
    globalSignals: {
      'content.formality': 0.4,
      'personality.pacing_velocity': 0.7,
      'visual.perception.primary_mode': 'screen-text',
      'visual.perception.placement_trust': 'trusted',
      'visual.perception.avg_viewer_value': 0.74,
    },
    gridSignals,
    eventSignals: [
      {
        frame: 105,
        timestampMs: 3_500,
        signal: 'speech.emphasis_word',
        value: true,
        context: 'changed',
      },
      {
        frame: 106,
        timestampMs: 3_520,
        signal: 'entity.number',
        value: true,
        context: '10 to 100',
      },
      {
        frame: 510,
        timestampMs: 17_000,
        signal: 'entity.topic_boundary',
        value: true,
        context: 'new section',
      },
    ],
  };
}

describe('unified moment context', () => {
  it('packages cut-frame, original-frame, signals, transcript atoms, and atomic bundle together', () => {
    const context = buildUnifiedMomentContext({
      timeline: timeline(),
      frame: 5,
      baseSignals: {
        formality: 0.6,
        visual_dependency: 0.3,
      },
      sourceClips: [
        { from: 0, durationInFrames: 100, sourceStartFrame: 100 },
        { from: 100, durationInFrames: 100, sourceStartFrame: 500 },
      ],
      eventWindowMs: 100,
    });

    expect(context).toMatchObject({
      version: 'unified-moment-context-v1',
      frame: 5,
      sourceFrame: 105,
      sourceGridFrame: 105,
      evidence: {
        hasSnapshot: true,
        hasScreenPrimitives: true,
        hasTranscriptEvents: true,
      },
    });
    expect(context.signals).toEqual(expect.objectContaining({
      'content.formality': 0.4,
      formality: 0.6,
      visual_dependency: 0.3,
      'speech.energy': 0.86,
      'visual.main_subject.x': 0.22,
      main_subject_x: 0.22,
      motion_vector_x: -0.35,
      visual_significance: 0.9,
      'visual.perception.primary_mode': 'screen-text',
      'visual.perception.placement_trust': 'trusted',
      'visual.perception.avg_viewer_value': 0.74,
    }));
    expect(context.eventAtoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'speech.emphasis_word', channel: 'speech', level: 'primitive', source: 'event' }),
      expect.objectContaining({ key: 'entity.number', channel: 'transcript', level: 'primitive', source: 'event' }),
    ]));
    expect(context.transcript.text).toContain('changed');
    expect(context.atomicMomentBundle.sourceFrame).toBe(105);
    expect(context.atomicMomentBundle.primitiveAtoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'visual.main_subject.x', value: 0.22 }),
    ]));
    expect(context.atomicMomentBundle.derivedAtoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'entity.number', value: true }),
    ]));
  });

  it('does not invent a source snapshot when a cut frame is outside kept clips', () => {
    const context = buildUnifiedMomentContext({
      timeline: timeline(),
      frame: 250,
      sourceClips: [{ from: 0, durationInFrames: 100, sourceStartFrame: 100 }],
    });

    expect(context.sourceFrame).toBeNull();
    expect(context.sourceGridFrame).toBeNull();
    expect(context.snapshot).toBeNull();
    expect(context.evidence.hasSnapshot).toBe(false);
    expect(context.evidence.hasScreenPrimitives).toBe(false);
    expect(context.transcript.events).toEqual([]);
  });

  it('can build a batch of contexts for shared Path E and Path D callers', () => {
    const contexts = buildUnifiedMomentContexts({
      timeline: timeline(),
      frames: [105, 510],
    });

    expect(contexts).toHaveLength(2);
    expect(contexts[0].sourceFrame).toBe(105);
    expect(contexts[1].sourceFrame).toBe(510);
    expect(contexts[1].transcript.text).toBe('new section');
  });
});
