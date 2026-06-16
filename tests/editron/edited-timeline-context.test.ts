import { describe, expect, it } from 'vitest';
import {
  buildEditedTimelineContext,
  mapEditedFrameToSourceFrame,
  mapSourceFrameToEditedFrame,
  projectMomentWeightMapToEditedTimeline,
  projectSignalTimelineToEditedTimeline,
} from '../../lib/editron/services/edited-timeline-context';
import type { MomentWeightMap } from '../../lib/editron/services/moment-weight-service';
import type { RawFootageAnalysis, SignalTimeline } from '../../lib/editron/services/signal-registry';

const fps = 30;

function rawFootage(): RawFootageAnalysis {
  return {
    originalDurationMs: 6000,
    estimatedCleanDurationMs: 2000,
    transcription: {
      words: [
        { word: 'first', startMs: 0, endMs: 300 },
        { word: 'removed', startMs: 3000, endMs: 3300 },
        { word: 'second', startMs: 5000, endMs: 5300, speaker: 1 },
      ],
    },
    fillerWords: [
      { word: 'removed', startMs: 3000, endMs: 3300, hasSurroundingSilence: true },
    ],
    segments: [
      { text: 'first removed second', startMs: 0, endMs: 5300, fillerCount: 1, silenceGapCount: 1, avgWordGapMs: 2350 },
    ],
  };
}

function sourceTimeline(): SignalTimeline {
  return {
    fps,
    totalFrames: 180,
    gridInterval: 15,
    globalSignals: {
      'video.duration_s': 6,
      'content.speech_coverage': 0.15,
    },
    gridSignals: new Map([
      [0, { frame: 0, timestampMs: 0, 'speech.energy': 0.2, 'visual.significance': 0.1 }],
      [150, { frame: 150, timestampMs: 5000, 'speech.energy': 0.9, 'visual.significance': 0.8 }],
    ]),
    eventSignals: [
      { frame: 0, timestampMs: 0, signal: 'speech.emphasis_word', value: true, context: 'first' },
      { frame: 90, timestampMs: 3000, signal: 'entity.name', value: true, context: 'removed' },
      { frame: 150, timestampMs: 5000, signal: 'entity.number', value: true, context: 'second' },
    ],
  };
}

describe('edited timeline context', () => {
  it('projects raw word timings into the edited timeline and drops removed words', () => {
    const context = buildEditedTimelineContext({
      rawFootage: rawFootage(),
      fps,
      projectDurationFrames: 60,
      overlays: [
        { type: 'video', from: 0, durationInFrames: 30, sourceStartFrame: 0 },
        { type: 'video', from: 30, durationInFrames: 30, sourceStartFrame: 150 },
      ],
    });

    expect(context).toMatchObject({
      version: 'edited-timeline-context-v1',
      durationFrames: 60,
      durationMs: 2000,
      evidence: {
        hasSourceMapping: true,
        isCanonicalDecisionTimeline: true,
        requiresSourceMapping: true,
        inputClipCount: 2,
        mappedClipCount: 2,
        missingSourceMappingCount: 0,
        inputWordCount: 3,
        keptWordCount: 2,
        droppedWordCount: 1,
        clipCount: 2,
      },
    });
    expect(context.transcription).toEqual([
      expect.objectContaining({ word: 'first', startMs: 0, endMs: 300, originalStartMs: 0, originalEndMs: 300 }),
      expect.objectContaining({ word: 'second', startMs: 1000, endMs: 1300, originalStartMs: 5000, originalEndMs: 5300, speaker: 1 }),
    ]);
    expect(context.editedRawFootage.transcription?.words).toEqual([
      { word: 'first', startMs: 0, endMs: 300, speaker: undefined },
      { word: 'second', startMs: 1000, endMs: 1300, speaker: 1 },
    ]);
    expect(context.editedRawFootage.originalDurationMs).toBe(2000);
    expect(context.editedRawFootage.silenceGaps).toEqual([]);
  });

  it('keeps identity timing explicit when no source mapping exists', () => {
    const context = buildEditedTimelineContext({
      rawFootage: rawFootage(),
      fps,
      projectDurationFrames: 180,
      overlays: [{ type: 'video', from: 0, durationInFrames: 180 }],
    });

    expect(context.evidence.hasSourceMapping).toBe(false);
    expect(context.evidence.isCanonicalDecisionTimeline).toBe(true);
    expect(context.evidence.requiresSourceMapping).toBe(false);
    expect(context.evidence.inputClipCount).toBe(1);
    expect(context.evidence.mappedClipCount).toBe(0);
    expect(context.evidence.missingSourceMappingCount).toBe(1);
    expect(context.sourceClips).toEqual([]);
    expect(context.transcription.map((word) => [word.word, word.startMs, word.endMs])).toEqual([
      ['first', 0, 300],
      ['removed', 3000, 3300],
      ['second', 5000, 5300],
    ]);
  });

  it('marks multi-clip edited timelines without complete source maps as unsafe for decisions', () => {
    const context = buildEditedTimelineContext({
      rawFootage: rawFootage(),
      fps,
      projectDurationFrames: 60,
      overlays: [
        { type: 'video', from: 0, durationInFrames: 30 },
        { type: 'video', from: 30, durationInFrames: 30 },
      ],
    });

    expect(context.evidence).toEqual(expect.objectContaining({
      hasSourceMapping: false,
      isCanonicalDecisionTimeline: false,
      requiresSourceMapping: true,
      inputClipCount: 2,
      mappedClipCount: 0,
      missingSourceMappingCount: 2,
    }));
    expect(context.sourceClips).toEqual([]);
    expect(context.transcription.map((word) => word.word)).toEqual(['first', 'removed', 'second']);
  });

  it('rejects partial source maps instead of fabricating identity mapping for missing clips', () => {
    const context = buildEditedTimelineContext({
      rawFootage: rawFootage(),
      fps,
      projectDurationFrames: 60,
      overlays: [
        { type: 'video', from: 0, durationInFrames: 30, sourceStartFrame: 0 },
        { type: 'video', from: 30, durationInFrames: 30 },
      ],
    });

    expect(context.evidence).toEqual(expect.objectContaining({
      hasSourceMapping: false,
      isCanonicalDecisionTimeline: false,
      requiresSourceMapping: true,
      inputClipCount: 2,
      mappedClipCount: 1,
      missingSourceMappingCount: 1,
    }));
    expect(context.sourceClips).toEqual([]);
  });

  it('maps frames in both directions without snapping removed gaps into content', () => {
    const context = buildEditedTimelineContext({
      rawFootage: rawFootage(),
      fps,
      projectDurationFrames: 60,
      overlays: [
        { type: 'video', from: 0, durationInFrames: 30, sourceStartFrame: 0 },
        { type: 'video', from: 30, durationInFrames: 30, sourceStartFrame: 150 },
      ],
    });

    expect(mapSourceFrameToEditedFrame(0, context.sourceClips)).toBe(0);
    expect(mapSourceFrameToEditedFrame(150, context.sourceClips)).toBe(30);
    expect(mapSourceFrameToEditedFrame(90, context.sourceClips)).toBeNull();
    expect(mapEditedFrameToSourceFrame(30, context.sourceClips)).toBe(150);
  });

  it('projects signal timelines onto cut frames while preserving source evidence values', () => {
    const context = buildEditedTimelineContext({
      rawFootage: rawFootage(),
      fps,
      projectDurationFrames: 60,
      overlays: [
        { type: 'video', from: 0, durationInFrames: 30, sourceStartFrame: 0 },
        { type: 'video', from: 30, durationInFrames: 30, sourceStartFrame: 150 },
      ],
    });
    const projected = projectSignalTimelineToEditedTimeline(sourceTimeline(), context);

    expect(projected.totalFrames).toBe(60);
    expect(projected.globalSignals['video.duration_s']).toBe(2);
    expect(projected.gridSignals.get(30)).toEqual(expect.objectContaining({
      frame: 30,
      timestampMs: 1000,
      sourceFrame: 150,
      sourceTimestampMs: 5000,
      'speech.energy': 0.9,
    }));
    expect(projected.eventSignals).toEqual([
      expect.objectContaining({ frame: 0, timestampMs: 0, context: 'first' }),
      expect.objectContaining({ frame: 30, timestampMs: 1000, context: 'second' }),
    ]);
  });

  it('projects moment weight ranges into edited time instead of leaving raw timestamps behind', () => {
    const context = buildEditedTimelineContext({
      rawFootage: rawFootage(),
      fps,
      projectDurationFrames: 60,
      overlays: [
        { type: 'video', from: 0, durationInFrames: 30, sourceStartFrame: 0 },
        { type: 'video', from: 30, durationInFrames: 30, sourceStartFrame: 150 },
      ],
    });
    const weights: MomentWeightMap = {
      default_weight: 0.5,
      computation_phase: 1,
      weights: [
        {
          segment_start_ms: 0,
          segment_end_ms: 1000,
          final_weight: 0.3,
          sources: { gemini: null, vjepa: null, wav2vec: null, thompson_adjustment: 0, eml_override: null },
          reason: 'opening',
          confidence: 'low',
        },
        {
          segment_start_ms: 5000,
          segment_end_ms: 6000,
          final_weight: 0.9,
          sources: { gemini: null, vjepa: null, wav2vec: null, thompson_adjustment: 0, eml_override: null },
          reason: 'important',
          confidence: 'high',
        },
      ],
    };

    const projected = projectMomentWeightMapToEditedTimeline(weights, context);

    expect(projected.weights).toEqual([
      expect.objectContaining({ segment_start_ms: 0, segment_end_ms: 1000, final_weight: 0.3 }),
      expect.objectContaining({ segment_start_ms: 1000, segment_end_ms: 2000, final_weight: 0.9 }),
    ]);
  });
});
