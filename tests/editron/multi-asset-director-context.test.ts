import { describe, expect, it, vi } from 'vitest';

import { hydrateStorylineAnalysesForBatch } from '@/lib/editron/services/batch-storyline-analysis-bridge';
import {
  buildMultiAssetDirectorContext,
  CANONICAL_MULTI_ASSET_COORDINATE_SPACE,
} from '@/lib/editron/services/multi-asset-director-context';
import {
  buildEditedTimelineContext,
  projectMomentWeightMapToEditedTimeline,
} from '@/lib/editron/services/edited-timeline-context';

function sourceAnalysis(assetId: string, word: string, language: string) {
  const rawFootageAnalysis = {
    transcription: {
      transcript: word,
      language,
      confidence: 0.9,
      words: [{ word, startMs: 1_100, endMs: 1_300, confidence: 0.9 }],
    },
    silenceGaps: [],
    fillerWords: [],
    segments: [{
      index: 0,
      startMs: 0,
      endMs: 3_000,
      text: word,
      wordCount: 1,
      words: [{ word, startMs: 1_100, endMs: 1_300 }],
      fillerCount: 0,
      silenceGapCount: 0,
      avgWordGapMs: 0,
    }],
    bestTakeSelections: [{ stale: true }],
    silenceRemovalPlan: [{ startMs: 0, endMs: 200, action: 'remove' }],
    originalDurationMs: 3_000,
    estimatedCleanDurationMs: 3_000,
    speechCoverage: 0.2,
    needsVisualDrivenEditing: true,
    contentTypeDetection: { contentType: 'product-demo', confidence: 0.8, profileId: 'A-01' },
  };
  const segmentAnalysis = {
    version: 1,
    globalContext: {
      visualSetup: { subjectCount: 1 },
      visualPerceptionWindows: [{
        startSec: 0,
        endSec: 3,
        visualMode: 'product-demo',
        subjects: ['garment'],
        actions: ['sewing'],
        visibleStateChanges: ['fabric assembled'],
        ocrText: [],
        visuallyExplains: true,
        visualExplainability: 'high',
        screenClutter: 0.2,
        salience: 0.8,
        confidence: 0.9,
        negativeSpacePreference: 'right',
        issues: [],
      }],
      contentType: 'product-demo',
      platform: 'instagram',
      colorGrade: 'neutral',
      pacing: 'medium',
      narrativeArc: 'process',
    },
    segments: [{
      index: 0,
      startMs: 0,
      endMs: 3_000,
      transcript: { text: word, wordCount: 1, fillerCount: 0, silenceGapCount: 0, avgWordGapMs: 0 },
      visual: null,
      semanticVisual: {
        windows: [{
          startSec: 0,
          endSec: 3,
          visualMode: 'product-demo',
          subjects: ['garment'],
          actions: ['sewing'],
          visibleStateChanges: ['fabric assembled'],
          ocrText: [],
          visuallyExplains: true,
          visualExplainability: 'high',
          screenClutter: 0.2,
          salience: 0.8,
          confidence: 0.9,
          negativeSpacePreference: 'right',
          issues: [],
        }],
        primaryVisualMode: 'product-demo',
        visualExplainability: 'high',
        visuallyExplains: true,
        ocrText: [],
        visibleStateChangeCount: 1,
        screenClutter: 0.2,
        salience: 0.8,
        confidence: 0.9,
        negativeSpacePreference: 'right',
      },
      vocal: null,
      weight: {
        finalWeight: 0.8,
        sources: { gemini: null, vjepa: 0.8, wav2vec: null, thompsonAdjustment: 0, emlOverride: null },
        confidence: 'high',
        reason: 'visual significance',
      },
    }],
    defaultWeight: 0.55,
    meta: {
      builtAt: '2026-07-13T00:00:00.000Z',
      hasVjepa: true,
      vjepaStatus: 'complete',
      vjepaRequestedSegmentCount: 1,
      vjepaAnalyzedSegmentCount: 1,
      vjepaDroppedSegmentCount: 0,
      vjepaCoverageRatio: 1,
      vjepaFailedBatchCount: 0,
      hasWav2vec: true,
      momentWeightPhase: 2,
      segmentCount: 1,
      originalDurationMs: 3_000,
      estimatedCleanDurationMs: 3_000,
    },
  };
  return {
    projectId: 'proj_1',
    assetId,
    rawFootageAnalysis,
    segmentAnalysis,
    vjepaAnalysis: {
      segments: [{
        startMs: 0,
        endMs: 3_000,
        visualSignificance: 0.8,
        motionIntensity: 0.6,
        actionType: 'demonstrating',
        motionType: 'subject_moving',
        faceEmotion: null,
        eyeContact: null,
        motionVectorX: 0.2,
        motionVectorY: 0,
        mainSubject: { x: 0.2, y: 0.2, width: 0.4, height: 0.6 },
        mainSubjectX: 0.2,
        mainSubjectY: 0.2,
        mainSubjectWidth: 0.4,
        mainSubjectHeight: 0.6,
        textBoxes: [],
        textBoxCount: 0,
        textCoverage: 0,
        objectCount: 2,
        faceCount: 0,
        negativeSpaceTop: 0.1,
        negativeSpaceRight: 0.3,
        negativeSpaceBottom: 0.1,
        negativeSpaceLeft: 0.1,
        primitivePresence: {
          motionVector: true,
          mainSubject: true,
          textBoxes: false,
          textCoverage: true,
          objectCount: true,
          faceCount: true,
          negativeSpace: true,
        },
      }],
      modelVersion: 'vjepa-test',
      processingTimeMs: 10,
      coverageRatio: 1,
    },
    wav2vecAnalysis: {
      segments: [{
        startMs: 1_000,
        endMs: 1_500,
        emotionIntensity: 0.7,
        emotionalValence: 'positive',
        energy: 0.8,
        pitchVariability: 0.6,
        stressDetected: true,
        fillerConfidence: 0,
      }],
      modelVersion: 'wav2vec-test',
      processingTimeMs: 8,
    },
    momentWeightMap: {
      weights: [{
        segment_start_ms: 0,
        segment_end_ms: 3_000,
        final_weight: 0.8,
        sources: { gemini: null, vjepa: 0.8, wav2vec: 0.7, thompson_adjustment: 0, eml_override: null },
        reason: 'multimodal',
        confidence: 'high',
      }],
      default_weight: 0.55,
      computation_phase: 2,
    },
    musicAnalysis: {
      bpm: 100,
      beats: [{ timestampMs: 1_200, strength: 0.9 }],
      sections: [{ startMs: 0, endMs: 3_000, label: 'verse' }],
      musicPresence: 0.5,
      key: 'C',
      energyCurve: [0.1, 0.4, 0.8],
      durationMs: 3_000,
      processingTimeMs: 5,
    },
  };
}

describe('multi-asset Director context', () => {
  it('projects overlapping asset-local clocks once onto the selected final timeline', () => {
    const overlays = [
      { type: 'video', assetId: 'asset_a', from: 0, durationInFrames: 60, sourceStartFrame: 30 },
      { type: 'video', assetId: 'asset_b', from: 60, durationInFrames: 60, sourceStartFrame: 30 },
    ];
    const result = buildMultiAssetDirectorContext({
      analyses: [sourceAnalysis('asset_a', 'first', 'en'), sourceAnalysis('asset_b', 'doosra', 'hi-en')],
      overlays,
      fps: 30,
      durationInFrames: 120,
    });

    expect(result.rawFootageAnalysis.timelineCoordinateSpace).toBe(CANONICAL_MULTI_ASSET_COORDINATE_SPACE);
    expect(result.rawFootageAnalysis.transcription.words).toEqual([
      expect.objectContaining({ word: 'first', startMs: 100, endMs: 300, assetId: 'asset_a' }),
      expect.objectContaining({ word: 'doosra', startMs: 2_100, endMs: 2_300, assetId: 'asset_b' }),
    ]);
    expect(result.rawFootageAnalysis.bestTakeSelections).toEqual([]);
    expect(result.rawFootageAnalysis.silenceRemovalPlan).toEqual([]);
    expect(result.segmentAnalysis.segments.map((segment) => [segment.startMs, segment.endMs, (segment as any).assetId])).toEqual([
      [0, 2_000, 'asset_a'],
      [2_000, 4_000, 'asset_b'],
    ]);
    expect(result.vjepaAnalysis?.segments.map((segment) => [segment.startMs, segment.endMs, (segment as any).assetId])).toEqual([
      [0, 2_000, 'asset_a'],
      [2_000, 4_000, 'asset_b'],
    ]);
    expect(result.wav2vecAnalysis?.segments.map((segment) => [segment.startMs, segment.endMs])).toEqual([
      [0, 500],
      [2_000, 2_500],
    ]);
    expect(result.momentWeightMap?.weights.map((weight) => [weight.segment_start_ms, weight.segment_end_ms])).toEqual([
      [0, 2_000],
      [2_000, 4_000],
    ]);
    expect(result.musicAnalysis?.beats.map((beat) => beat.timestampMs)).toEqual([200, 2_200]);
    expect(result.provenance).toEqual(expect.objectContaining({
      sourceAssetCount: 2,
      selectedVideoClipCount: 2,
      projectedWordCount: 2,
      projectedSegmentCount: 2,
    }));

    const edited = buildEditedTimelineContext({
      rawFootage: result.rawFootageAnalysis,
      overlays,
      fps: 30,
      projectDurationFrames: 120,
    });
    expect(edited.evidence.sourceAlreadyCanonical).toBe(true);
    expect(edited.sourceClips).toEqual([]);
    expect(edited.transcription.map((word) => [word.word, word.startMs])).toEqual([
      ['first', 100],
      ['doosra', 2_100],
    ]);
    expect(edited.editedRawFootage).toBe(result.rawFootageAnalysis);
    expect(projectMomentWeightMapToEditedTimeline(result.momentWeightMap!, edited)).toBe(result.momentWeightMap);
  });

  it('fails loudly when a selected clip has no full per-asset analysis', () => {
    expect(() => buildMultiAssetDirectorContext({
      analyses: [sourceAnalysis('asset_a', 'first', 'en')],
      overlays: [
        { type: 'video', assetId: 'asset_a', from: 0, durationInFrames: 60, sourceStartFrame: 0 },
        { type: 'video', assetId: 'missing', from: 60, durationInFrames: 60, sourceStartFrame: 0 },
      ],
      fps: 30,
      durationInFrames: 120,
    })).toThrow('Selected video assets lack full canonical analysis: missing');
  });

  it('preserves full deep-analysis structures in the batch bridge', async () => {
    const analysis = { ...sourceAnalysis('asset_a', 'first', 'en'), userId: 'user_1', status: 'complete', durationMs: 3_000 };
    const updates: any[] = [];
    const db = {
      collection() {
        return {
          find: () => ({ toArray: async () => [analysis] }),
          updateOne: vi.fn(async (filter: any, update: any, options: any) => {
            updates.push({ filter, update, options });
            return { acknowledged: true };
          }),
        };
      },
    };

    await hydrateStorylineAnalysesForBatch(db as any, {
      projectId: 'proj_1',
      userId: 'user_1',
      assets: [{ assetId: 'asset_a', type: 'video', duration: 3 }],
    });

    expect(updates[0].update.$set.rawFootageAnalysis).toBe(analysis.rawFootageAnalysis);
    expect(updates[0].update.$set.segmentAnalysis).toBe(analysis.segmentAnalysis);
    expect(updates[0].update.$set.musicAnalysis).toBe(analysis.musicAnalysis);
  });
});
