import { describe, expect, it } from 'vitest';

import {
  compactRawFootageAnalysisForProject,
  type PersistableRawFootageAnalysis,
} from '@/lib/editron/services/raw-footage-persistence';
import type { TranscriptionWord } from '@/lib/editron/services/media/types';

function makeWords(text: string[], startMs = 0, stepMs = 400): TranscriptionWord[] {
  return text.map((word, index) => ({
    word,
    startMs: startMs + index * stepMs,
    endMs: startMs + index * stepMs + 220,
    confidence: 0.95,
  }));
}

type TestPersistableRawFootageAnalysis = PersistableRawFootageAnalysis & {
  transcription: {
    words: TranscriptionWord[];
    transcript: string;
    language: string;
    confidence: number;
    generatedAt: Date;
  };
};

describe('raw footage persistence compaction', () => {
  it('removes duplicated segment words while preserving canonical transcription words', () => {
    const segmentWords = makeWords(['real', 'content'], 1000);
    const analysis: TestPersistableRawFootageAnalysis = {
      transcription: {
        words: segmentWords,
        transcript: 'real content',
        language: 'en',
        confidence: 0.95,
        generatedAt: new Date('2026-06-09T00:00:00Z'),
      },
      silenceGaps: [],
      fillerWords: [],
      segments: [{
        text: 'real content',
        startMs: 1000,
        endMs: 1800,
        wordCount: 2,
        words: segmentWords,
        fillerCount: 0,
        silenceGapCount: 0,
        avgWordGapMs: 180,
        index: 0,
      }],
      bestTakeSelections: [{
        keptSegment: {
          text: 'real content',
          startMs: 1000,
          endMs: 1800,
          wordCount: 2,
          words: segmentWords,
          fillerCount: 0,
          silenceGapCount: 0,
          avgWordGapMs: 180,
          index: 0,
        },
        inferiorSegments: [{
          text: 'real content bad take',
          startMs: 0,
          endMs: 900,
          wordCount: 4,
          words: makeWords(['real', 'content', 'bad', 'take'], 0),
          fillerCount: 0,
          silenceGapCount: 0,
          avgWordGapMs: 180,
          index: 1,
        }],
        similarity: 0.9,
        keptScore: 0.8,
      }],
      contentTypeDetection: {
        contentType: 'talking-head',
        confidence: 0.9,
        signals: ['test'],
        silenceThreshold: {
          removeAboveMs: 1500,
          shortenRangeMs: [800, 1500],
          shortenTargetMs: 300,
        },
      },
      silenceRemovalPlan: [],
      estimatedCleanDurationMs: 1800,
      originalDurationMs: 2000,
      editMethod: 'transcript-editor',
      transcriptEditRanges: [{ s: 0, e: 1 }],
      speechCoverage: 0.9,
      needsVisualDrivenEditing: false,
    };

    const compact = compactRawFootageAnalysisForProject(analysis);

    expect(compact.transcription?.words).toHaveLength(2);
    expect(compact.segments[0]).not.toHaveProperty('words');
    expect(compact.segments[0].wordStartMs).toBe(1000);
    expect(compact.bestTakeSelections[0].keptSegment).not.toHaveProperty('words');
    expect(compact.bestTakeSelections[0].inferiorSegments[0]).not.toHaveProperty('words');
  });
});
