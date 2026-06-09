import { describe, expect, it } from 'vitest';

import {
  buildTranscriptEditPrompt,
  validateKeepRangesForTranscriptEdit,
} from '@/lib/editron/services/transcript-editor';
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

describe('transcript editor regression guards', () => {
  it('keeps content type in the prompt as an editing signal', () => {
    const prompt = buildTranscriptEditPrompt('0\thello\t0\t100', 1, {
      contentType: 'talking-head',
      platform: 'youtube',
    });

    expect(prompt).toContain('Content type: talking-head');
    expect(prompt).toContain('Platform: youtube');
  });

  it('rejects keep ranges that preserve production meta', () => {
    const words = makeWords([
      'Hello!',
      'I',
      'think',
      'my',
      'mic',
      'is',
      'on',
      'let',
      'me',
      'check.',
      'Real',
      'content',
      'starts',
      'now.',
      'Here',
      'is',
      'the',
      'actual',
      'point',
      'today.',
    ]);

    const result = validateKeepRangesForTranscriptEdit(
      [{ s: 0, e: 13 }],
      words,
      120_000,
      { contentType: 'talking-head' },
    );

    expect(result).toBeNull();
  });

  it('rejects long raw-footage plans that keep too much duration', () => {
    const words = makeWords(
      Array.from({ length: 1200 }, (_, index) => `word${index}`),
      0,
      800,
    );

    const result = validateKeepRangesForTranscriptEdit(
      [{ s: 0, e: 1050 }],
      words,
      20 * 60 * 1000,
      { contentType: 'vlog' },
    );

    expect(result).toBeNull();
  });
});

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
