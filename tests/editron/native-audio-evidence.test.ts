import { describe, expect, it } from 'vitest';

import {
  deriveNativeAudioEvidence,
  getNativeAudioDuckRegions,
  getSoundAudioDuckRegions,
} from '@/lib/editron/services/native-audio-evidence';
import { runQualityReview } from '@/lib/editron/services/quality-review-service';
import { createTailFadeVolume } from '@/components/editron/editor/version-7.0.0/utils/audio-ducking';
import { ROW } from '@/lib/pipeline/scene-to-editron';

describe('native audio evidence', () => {
  it('derives bounded source-frame speech regions from transcript words', () => {
    const evidence = deriveNativeAudioEvidence({
      speechCoverage: 0.42,
      transcription: {
        words: [
          { word: 'first', startMs: 0, endMs: 300, confidence: 0.98 },
          { word: 'cluster', startMs: 700, endMs: 980, confidence: 0.98 },
          { word: 'second', startMs: 2500, endMs: 2800, confidence: 0.96 },
        ],
        transcript: 'first cluster second',
        language: 'en',
        confidence: 0.97,
        generatedAt: new Date('2026-07-06T00:00:00Z'),
      },
    });

    expect(evidence).toEqual(expect.objectContaining({
      hasNativeAudio: true,
      hasSpeech: true,
      source: 'transcription',
      wordCount: 3,
      speechCoverage: 0.42,
      regionCount: 2,
    }));
    expect(evidence.speechRegions[0]).toEqual(expect.objectContaining({
      sourceStartFrame: 0,
      sourceEndFrame: 33,
    }));
    expect(evidence.speechRegions[1]).toEqual(expect.objectContaining({
      sourceStartFrame: 71,
      sourceEndFrame: 88,
    }));
  });

  it('maps source speech regions onto split timeline clips', () => {
    const evidence = deriveNativeAudioEvidence({
      speechCoverage: 0.4,
      transcription: {
        words: [
          { word: 'early', startMs: 0, endMs: 400, confidence: 0.95 },
          { word: 'later', startMs: 2500, endMs: 2800, confidence: 0.95 },
        ],
        transcript: 'early later',
        language: 'en',
        confidence: 0.95,
        generatedAt: new Date('2026-07-06T00:00:00Z'),
      },
    });

    const splitClip = {
      id: 12,
      type: 'video',
      from: 120,
      durationInFrames: 60,
      sourceStartFrame: 60,
      metadata: { nativeAudioEvidence: evidence },
    };

    expect(getNativeAudioDuckRegions(splitClip)).toEqual([
      { from: 131, durationInFrames: 17 },
    ]);
  });

  it('does not invent native audio for silent visual-only uploads', () => {
    const evidence = deriveNativeAudioEvidence({
      speechCoverage: 0,
      transcription: {
        words: [],
        transcript: '',
        language: 'en',
        confidence: 0,
        generatedAt: new Date('2026-07-06T00:00:00Z'),
      },
    });

    expect(evidence.hasNativeAudio).toBe(false);
    expect(getNativeAudioDuckRegions({
      id: 1,
      type: 'video',
      from: 0,
      durationInFrames: 120,
      hasNativeAudio: false,
      metadata: { nativeAudioEvidence: evidence },
    })).toEqual([]);
  });

  it('keeps legacy generated-video native audio ducking when no speech evidence exists', () => {
    expect(getNativeAudioDuckRegions({
      id: 1,
      type: 'video',
      from: 30,
      durationInFrames: 90,
      hasNativeAudio: true,
    })).toEqual([{ from: 30, durationInFrames: 90 }]);
  });

  it('projects source-bound dialogue evidence across split sound overlays', () => {
    const nativeAudioEvidence = {
      evidenceId: 'EV-DIALOGUE-1',
      sourceAssetId: 'dialogue-asset',
      sourceVersion: 'dialogue-sha256-v1',
      hasNativeAudio: true,
      hasSpeech: true,
      source: 'transcription',
      wordCount: 2,
      speechCoverage: 225 / 480,
      speechRegions: [
        { sourceStartFrame: 60, sourceEndFrame: 151, startMs: 2000, endMs: 5033.333 },
        { sourceStartFrame: 196, sourceEndFrame: 330, startMs: 6533.333, endMs: 11000 },
      ],
      regionCount: 2,
    } as const;

    expect(getSoundAudioDuckRegions({
      id: 1,
      type: 'sound',
      assetId: 'dialogue-asset',
      from: 0,
      durationInFrames: 151,
      startFromSound: 0,
      metadata: { nativeAudioEvidence },
    })).toEqual([{ from: 60, durationInFrames: 91 }]);

    expect(getSoundAudioDuckRegions({
      id: 2,
      type: 'sound',
      assetId: 'dialogue-asset',
      from: 151,
      durationInFrames: 284,
      startFromSound: 196,
      metadata: { nativeAudioEvidence },
    })).toEqual([{ from: 151, durationInFrames: 134 }]);
  });

  it('distinguishes absent, explicitly silent, unbound, and malformed sound evidence', () => {
    const base = {
      id: 1,
      type: 'sound',
      assetId: 'dialogue-asset',
      from: 0,
      durationInFrames: 90,
      startFromSound: 0,
    };
    expect(getSoundAudioDuckRegions(base)).toBeNull();
    expect(getSoundAudioDuckRegions({
      ...base,
      metadata: { nativeAudioEvidence: { hasSpeech: false } },
    })).toEqual([]);
    expect(() => getSoundAudioDuckRegions({
      ...base,
      metadata: {
        nativeAudioEvidence: {
          hasSpeech: true,
          sourceAssetId: 'different-asset',
          sourceVersion: 'v1',
          speechRegions: [{ sourceStartFrame: 0, sourceEndFrame: 30 }],
        },
      },
    })).toThrow(/UNBOUND_SOUND_SPEECH_EVIDENCE/);
    expect(() => getSoundAudioDuckRegions({
      ...base,
      metadata: {
        nativeAudioEvidence: {
          hasSpeech: true,
          sourceAssetId: 'dialogue-asset',
          sourceVersion: 'v1',
          speechRegions: [{ sourceStartFrame: 30, sourceEndFrame: 30 }],
        },
      },
    })).toThrow(/INVALID_BOUND_SOUND_SPEECH_EVIDENCE/);
  });

  it('flags BGM that is not ducking under native source speech', () => {
    const evidence = deriveNativeAudioEvidence({
      speechCoverage: 0.5,
      transcription: {
        words: [{ word: 'speech', startMs: 1000, endMs: 1500, confidence: 0.96 }],
        transcript: 'speech',
        language: 'en',
        confidence: 0.96,
        generatedAt: new Date('2026-07-06T00:00:00Z'),
      },
    });
    const report = runQualityReview([
      {
        id: 1,
        type: 'video',
        row: ROW.VIDEO,
        from: 0,
        durationInFrames: 180,
        metadata: { nativeAudioEvidence: evidence },
      },
      {
        id: 2,
        type: 'sound',
        row: ROW.BGM,
        from: 0,
        durationInFrames: 180,
        styles: { volume: 0.5 },
      },
    ] as any, 30, 180);

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'bgm_not_ducking', overlayId: 2 }),
    ]));
  });

  it('renders an explicit BGM tail fade to silence at the overlay end', () => {
    const volume = createTailFadeVolume(0.75, 90, 30);

    expect(volume(0)).toBeCloseTo(0.75);
    expect(volume(60)).toBeCloseTo(0.75);
    expect(volume(89)).toBeCloseTo(0);
  });

  it('does not flag BGM no-fade when the overlay declares a rendered tail fade', () => {
    const report = runQualityReview([
      {
        id: 10,
        type: 'sound',
        row: ROW.BGM,
        from: 0,
        durationInFrames: 180,
        styles: {
          volume: 0.75,
          animation: { exit: 'fade', duration: 1 },
        },
      },
    ] as any, 30, 180);

    expect(report.issues.some((issue) => issue.type === 'bgm_no_fade')).toBe(false);
  });
});
