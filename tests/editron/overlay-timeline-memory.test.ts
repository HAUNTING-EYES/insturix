import { describe, expect, it } from 'vitest';
import type { EditDecision, EditDecisionList } from '../../lib/editron/services/reactive-edit-engine';
import { enrichDecisionsWithOverlayTimelineMemory } from '../../lib/editron/services/overlay-timeline-memory';
import {
  createUnifiedDecisionBundle,
  mergeSignalDrivenBundle,
} from '../../lib/editron/services/unified-decision-bundle';

describe('overlay timeline memory', () => {
  it('computes shared cross-overlay pressure atoms without choosing final form', () => {
    const [enriched] = enrichDecisionsWithOverlayTimelineMemory([
      decision({
        type: 'transition',
        frame: 150,
        confidence: 0.88,
        params: {
          transitionType: 'whip-pan',
          boundaryFrame: 150,
          topicDelta: 0.7,
          motionVectorX: 0.74,
        },
      }),
    ], [
      decision({ type: 'graphic', frame: 120, durationFrames: 80 }),
      decision({ type: 'caption-emphasis', frame: 132, durationFrames: 36 }),
      decision({ type: 'zoom', frame: 60, durationFrames: 24 }),
      decision({ type: 'sfx', frame: 90, durationFrames: 8 }),
    ]);

    expect(enriched.params.signals).toEqual(expect.objectContaining({
      active_overlay_density: expect.any(Number),
      recent_overlay_density: expect.any(Number),
      caption_pressure: expect.any(Number),
      mg_pressure: expect.any(Number),
      recent_zoom_density: expect.any(Number),
      recent_sfx_density: expect.any(Number),
      time_since_last_zoom: 3,
    }));
    expect(enriched.params.overlayTimelineMemory).toEqual(expect.objectContaining({
      version: 'overlay-timeline-memory-v1',
      frame: 150,
      mgPressure: 0.5,
      captionPressure: 0.5,
      recentZoomDensity: expect.any(Number),
      recentSfxDensity: expect.any(Number),
      calibrationStatus: 'invented-needs-calibration',
    }));
    expect(enriched.params).not.toHaveProperty('transitionJob');
    expect(enriched.params).not.toHaveProperty('physicalForm');
  });

  it('does not overwrite explicit upstream memory atoms', () => {
    const [enriched] = enrichDecisionsWithOverlayTimelineMemory([
      decision({
        type: 'zoom',
        frame: 120,
        params: {
          signals: {
            active_overlay_density: 0.11,
            recent_sfx_density: 0.22,
          },
        },
      }),
    ], [
      decision({ type: 'graphic', frame: 100, durationFrames: 80 }),
      decision({ type: 'sfx', frame: 70, durationFrames: 10 }),
      decision({ type: 'sfx', frame: 90, durationFrames: 10 }),
    ]);

    expect(enriched.params.signals).toEqual(expect.objectContaining({
      active_overlay_density: 0.11,
      recent_sfx_density: 0.22,
      mg_pressure: 0.5,
    }));
  });

  it('feeds computed memory atoms into unified family planners', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 110, durationFrames: 70, source: 'creative-brief:mg' }),
        decision({ type: 'caption-emphasis', frame: 130, durationFrames: 24, source: 'creative-brief:caption' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'transition',
        frame: 150,
        source: 'signal-executor:boundary',
        confidence: 0.89,
        params: {
          transitionType: 'whip-pan',
          boundaryFrame: 150,
          signals: {
            topicDelta: 0.68,
            motionVectorX: 0.78,
            motionIntensity: 0.5,
          },
        },
      }),
    ]));

    const transition = merged.edl.decisions.find((item) => item.type === 'transition');
    expect(transition?.params.signals).toEqual(expect.objectContaining({
      active_overlay_density: 0.5,
      caption_pressure: 0.5,
      mg_pressure: 0.5,
    }));
    expect(transition?.params.transitionBoundaryPlan).toEqual(expect.objectContaining({
      version: 'transition-boundary-plan-v1',
      crossFamily: expect.objectContaining({
        captionConflictRisk: 0.5,
        mgConflictRisk: 0.5,
      }),
    }));
    expect(transition?.params.overlayTimelineMemory).toEqual(expect.objectContaining({
      activeOverlayDensity: 0.5,
      mgPressure: 0.5,
      captionPressure: 0.5,
    }));
  });
});

function edl(decisions: EditDecision[]): EditDecisionList {
  return {
    projectId: 'overlay-timeline-memory-test',
    generatedAt: new Date('2026-06-19T00:00:00.000Z'),
    totalDecisions: decisions.length,
    decisions,
    stats: {
      cutsPerMinute: 0,
      transitionCount: decisions.filter((item) => item.type === 'transition').length,
      graphicCount: decisions.filter((item) => item.type === 'graphic').length,
      zoomCount: decisions.filter((item) => item.type === 'zoom').length,
      speedChangeCount: decisions.filter((item) => item.type === 'speed-change').length,
      averageConfidence: decisions.length
        ? decisions.reduce((sum, item) => sum + item.confidence, 0) / decisions.length
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
    signal: 'test-signal',
    reason: 'test decision',
    params: {},
    confidence: 0.9,
    ...overrides,
  };
}
