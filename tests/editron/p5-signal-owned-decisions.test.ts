import { beforeEach, describe, expect, it, vi } from 'vitest';

const transcriptionMock = vi.hoisted(() => ({
  getTranscription: vi.fn(),
}));

vi.mock('@/lib/editron/services/media', () => ({
  getTranscription: transcriptionMock.getTranscription,
}));

vi.mock('@/lib/editron/services/transcript-editor', () => ({
  editTranscript: vi.fn(async () => ({ method: 'fragment-pipeline', removals: [], keepRanges: [] })),
}));

vi.mock('@/lib/editron/services/editorial-intent-detector', () => ({
  detectEditorialIntent: vi.fn(async () => ({ intents: [], additionalRemovals: [] })),
}));

import { buildEditronConfig } from '@/lib/editron/config/editron-config';
import { inferBPMFromHints } from '@/lib/editron/services/beat-detection-service';
import { detectContentType } from '@/lib/editron/services/content-type-detector';
import { processRawFootage } from '@/lib/editron/services/raw-footage-processor';
import { classifyRepetitionIntent } from '@/lib/editron/services/repetition-intent-discriminator';
import type { TranscriptionWord } from '@/lib/editron/services/media/types';

describe('P5 signal-owned decisions', () => {
  beforeEach(() => {
    transcriptionMock.getTranscription.mockReset();
  });

  it('derives silence thresholds from transcript signals, not detected content labels', () => {
    const words = timedWords('This is a steady measured explanation with clear pacing and no filler words', 350);

    const documentary = detectContentType(words, 20, undefined, 'documentary');
    const tutorial = detectContentType(words, 20, undefined, 'tutorial');

    expect(documentary.contentType).toBe('documentary');
    expect(tutorial.contentType).toBe('tutorial');
    expect(documentary.silenceThreshold).toEqual(tutorial.silenceThreshold);
  });

  it('keeps edit budgets independent of profile pacing and cut ranges', () => {
    const fastProfile = {
      profileId: 'fast-profile',
      bgmDuckLevel: 0.05,
      cutsPerMinRange: [24, 36],
      pacing: 'fast',
      actions: [{ tool: 'sync_cuts_to_beats', params: { beatFilter: 'all' } }],
    } as any;
    const slowProfile = {
      profileId: 'slow-profile',
      bgmDuckLevel: 0.6,
      cutsPerMinRange: [1, 2],
      pacing: 'slow',
      actions: [],
    } as any;

    const fast = buildEditronConfig({ fps: 30, durationInFrames: 900 }, fastProfile);
    const slow = buildEditronConfig({ fps: 30, durationInFrames: 900 }, slowProfile);

    expect(fast.budgets).toEqual(slow.budgets);
    expect(fast.music.beatSyncMode).toBe(slow.music.beatSyncMode);
    expect(fast.audio.duckLevel).toBe(slow.audio.duckLevel);
  });

  it('keeps duplicate-take verdicts independent of content type metadata', () => {
    const group = [
      segment('This is the point.', 0, 1200),
      segment('This is the point.', 5000, 6200),
    ];

    const cinematic = classifyRepetitionIntent(group, {
      contentType: 'cinematic',
      confidence: 0.99,
      signals: ['legacy label'],
      silenceThreshold: { removeAboveMs: 4000, shortenRangeMs: [2000, 4000], shortenTargetMs: 800 },
    });
    const gaming = classifyRepetitionIntent(group, {
      contentType: 'gaming',
      confidence: 0.99,
      signals: ['legacy label'],
      silenceThreshold: { removeAboveMs: 1200, shortenRangeMs: [600, 1200], shortenTargetMs: 250 },
    });

    expect(cinematic).toEqual(gaming);
    expect(cinematic.verdict).toBe('INTENTIONAL');
  });

  it('preserves intentional repeated statements through the real fallback best-take producer', async () => {
    const words = [
      ...transcriptWords('This is the point.', 0),
      ...transcriptWords('This is the point.', 1500),
    ];

    transcriptionMock.getTranscription.mockResolvedValue({
      words,
      transcript: words.map(word => word.word).join(' '),
      language: 'en',
      confidence: 0.99,
      generatedAt: new Date('2026-07-06T00:00:00Z'),
    });

    const result = await processRawFootage('asset_repeat', 'user_1', 5);

    expect(result.editMethod).toBe('fragment-pipeline');
    expect(result.segments.map(seg => seg.text)).toEqual(['This is the point.', 'This is the point.']);
    expect(result.bestTakeSelections).toEqual([]);
    expect(result.silenceRemovalPlan.some(action => action.reason === 'inferior-take')).toBe(false);
  });

  it('keeps preserved repetition candidates eligible for later retake matching', async () => {
    const words = [
      ...transcriptWords('This exact point.', 0),
      ...transcriptWords('This exact point.', 500),
    ];

    for (let index = 0; index < 28; index++) {
      words.push(...transcriptWords(`filler${index}.`, 1000 + index * 250, 250));
    }

    words.push(...transcriptWords('This exact point', 8000));

    transcriptionMock.getTranscription.mockResolvedValue({
      words,
      transcript: words.map(word => word.word).join(' '),
      language: 'en',
      confidence: 0.99,
      generatedAt: new Date('2026-07-06T00:00:00Z'),
    });

    const result = await processRawFootage('asset_repeat_then_retake', 'user_1', 12);

    expect(result.editMethod).toBe('fragment-pipeline');
    expect(result.bestTakeSelections).toHaveLength(1);
    expect(result.bestTakeSelections[0].repetitionIntent).toEqual(expect.objectContaining({ verdict: 'RETAKE' }));
    expect(result.silenceRemovalPlan.some(action => action.reason === 'inferior-take')).toBe(true);
  });

  it('infers BPM from script/mood signals and ignores profile/content labels', () => {
    expect(inferBPMFromHints({ profileId: 'tiktok-fast', contentType: 'fitness' })).toBe(120);
    expect(inferBPMFromHints({ profileId: 'documentary', contentType: 'cinematic', mood: 'calm reflective' })).toBe(85);
    expect(inferBPMFromHints({ profileId: 'linkedin', contentType: 'corporate', scriptText: 'Use high-energy rhythmic music' })).toBe(140);
  });
});

function timedWords(text: string, gapMs: number): TranscriptionWord[] {
  return text.split(/\s+/).map((word, index) => {
    const startMs = index * gapMs;
    return { word, startMs, endMs: startMs + 220, confidence: 0.99 };
  });
}

function transcriptWords(text: string, startMs: number, gapMs = 300): TranscriptionWord[] {
  return text.split(/\s+/).map((word, index) => {
    const wordStartMs = startMs + index * gapMs;
    return { word, startMs: wordStartMs, endMs: wordStartMs + 220, confidence: 0.99 };
  });
}

function segment(text: string, startMs: number, endMs: number) {
  const tokenCount = Math.max(text.split(/\s+/).length, 1);
  const words = timedWords(text, Math.max(1, Math.floor((endMs - startMs) / tokenCount)))
    .map(word => ({
      ...word,
      startMs: startMs + word.startMs,
      endMs: startMs + word.endMs,
    }));

  return {
    id: `seg-${startMs}`,
    startMs,
    endMs,
    text,
    wordCount: text.split(/\s+/).length,
    words,
    fillerCount: 0,
    silenceGapCount: 0,
    avgWordGapMs: 0,
    index: startMs,
  };
}