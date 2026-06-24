import { describe, expect, it } from 'vitest';

import { buildEditronConfig } from '@/lib/editron/config/editron-config';
import { inferBPMFromHints } from '@/lib/editron/services/beat-detection-service';
import { detectContentType } from '@/lib/editron/services/content-type-detector';
import { classifyRepetitionIntent } from '@/lib/editron/services/repetition-intent-discriminator';
import type { TranscriptionWord } from '@/lib/editron/services/media/types';

describe('P5 signal-owned decisions', () => {
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