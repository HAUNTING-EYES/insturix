import { describe, expect, it } from 'vitest';
import {
  MusicCoveragePlanningError,
  planMusicCoverage,
  type MusicCoveragePlannerInput,
} from '@/lib/editron/services/music-coverage-planner';

const FPS = 30;
const TOTAL_FRAMES = 60 * FPS;

function frames(seconds: number): number {
  return seconds * FPS;
}

function input(overrides: Partial<MusicCoveragePlannerInput>): MusicCoveragePlannerInput {
  return {
    totalFrames: TOTAL_FRAMES,
    fps: FPS,
    ...overrides,
  };
}

describe('music coverage planner', () => {
  it.each([
    {
      contentType: 'tutorial',
      speechCoverage: 0.88,
      expectedMode: 'none',
    },
    {
      contentType: 'interview',
      speechCoverage: 0.91,
      expectedMode: 'none',
    },
    {
      contentType: 'podcast',
      speechCoverage: 0.95,
      expectedMode: 'none',
    },
    {
      contentType: 'corporate',
      speechCoverage: 0.82,
      expectedMode: 'none',
    },
    {
      contentType: 'ad',
      speechCoverage: 0.42,
      expectedMode: 'full',
    },
    {
      contentType: 'product-demo',
      speechCoverage: 0.22,
      expectedMode: 'full',
    },
    {
      contentType: 'cinematic',
      speechCoverage: 0.04,
      expectedMode: 'full',
    },
    {
      contentType: 'montage',
      speechCoverage: 0.02,
      expectedMode: 'full',
    },
    {
      contentType: 'vlog',
      speechCoverage: 0.58,
      energyArc: [
        { startFrame: frames(14), endFrame: frames(24), energy: 0.78 },
        { startFrame: frames(40), endFrame: frames(52), energy: 0.72 },
      ],
      expectedMode: 'sections',
    },
    {
      contentType: 'documentary',
      speechCoverage: 0.61,
      audioTreatments: [
        { startFrame: frames(0), endFrame: frames(6), treatment: 'music_beat' as const },
        { startFrame: frames(44), endFrame: frames(52), treatment: 'music_beat' as const },
      ],
      expectedMode: 'sections',
    },
  ])(
    'Rule-29 maps $contentType to $expectedMode from licensed evidence',
    ({ expectedMode, ...signals }) => {
      const plan = planMusicCoverage(input(signals));

      expect(plan.mode).toBe(expectedMode);
      expect(plan.evidence.contentType).toBe(signals.contentType);
      if (expectedMode === 'none') {
        expect(plan.sections).toEqual([]);
      } else {
        expect(plan.sections.length).toBeGreaterThan(0);
      }
    },
  );

  it('lets explicit user choices outrank computed content defaults', () => {
    const disabled = planMusicCoverage(input({
      contentType: 'ad',
      musicPreference: 'none',
      speechCoverage: 0,
    }));
    const subtle = planMusicCoverage(input({
      contentType: 'tutorial',
      musicPreference: 'subtle_bed',
      speechCoverage: 0.92,
    }));
    const energetic = planMusicCoverage(input({
      contentType: 'interview',
      musicPreference: 'energetic',
      speechCoverage: 0.9,
    }));
    const matched = planMusicCoverage(input({
      contentType: 'ad',
      musicPreference: 'match_video',
      speechCoverage: 0.4,
    }));

    expect(disabled).toMatchObject({
      mode: 'none',
      sections: [],
      reasonCodes: ['user-disabled'],
    });
    expect(subtle).toMatchObject({
      mode: 'full',
      sections: [{ startFrame: 0, endFrame: TOTAL_FRAMES, energyTier: 'low' }],
    });
    expect(energetic).toMatchObject({
      mode: 'full',
      sections: [{ startFrame: 0, endFrame: TOTAL_FRAMES, energyTier: 'high' }],
    });
    expect(matched).toMatchObject({
      mode: 'full',
      sections: [{ startFrame: 0, endFrame: TOTAL_FRAMES }],
    });
  });

  it('refuses to layer generated BGM over evidenced source music', () => {
    const plan = planMusicCoverage(input({
      contentType: 'cinematic',
      musicPreference: 'energetic',
      sourceMusic: {
        detected: true,
        confidence: 0.84,
        reason: 'music structure and repeated downbeats detected',
      },
    }));

    expect(plan).toMatchObject({
      mode: 'none',
      sections: [],
      reasonCodes: ['source-music-present'],
      evidence: {
        sourceMusicDetected: true,
        sourceMusicConfidence: 0.84,
      },
    });
  });

  it('builds normalized non-overlapping sections from mixed temporal evidence', () => {
    const plan = planMusicCoverage(input({
      contentType: 'vlog',
      speechCoverage: 0.55,
      energyArc: [
        { startFrame: -100, endFrame: frames(7), energy: 0.7 },
        { startFrame: frames(6), endFrame: frames(13), energy: 0.9 },
        { startFrame: frames(20), endFrame: frames(22), energy: 0.95 },
        { startFrame: frames(49), endFrame: TOTAL_FRAMES + 900, energy: 0.7 },
        { startFrame: Number.NaN, endFrame: frames(30), energy: 0.8 },
      ],
      audioTreatments: [
        { startFrame: frames(12), endFrame: frames(18), treatment: 'music_beat' },
        { startFrame: frames(30), endFrame: frames(35), treatment: 'vo' },
      ],
    }));

    expect(plan.mode).toBe('sections');
    expect(plan.sections).toEqual([
      expect.objectContaining({ startFrame: 0, endFrame: frames(18) }),
      expect.objectContaining({ startFrame: frames(49), endFrame: TOTAL_FRAMES }),
    ]);
    for (const [index, section] of plan.sections.entries()) {
      expect(section.startFrame).toBeGreaterThanOrEqual(0);
      expect(section.endFrame).toBeLessThanOrEqual(TOTAL_FRAMES);
      expect(section.endFrame - section.startFrame).toBeGreaterThanOrEqual(frames(4));
      if (index > 0) {
        expect(section.startFrame).toBeGreaterThanOrEqual(plan.sections[index - 1].endFrame);
      }
    }
  });

  it('uses explicit music beats for speech-first content without inventing a full bed', () => {
    const plan = planMusicCoverage(input({
      contentType: 'talking-head',
      speechCoverage: 0.86,
      audioTreatments: [
        { startFrame: 0, endFrame: frames(5), treatment: 'music_beat' },
        { startFrame: frames(28), endFrame: frames(33), treatment: 'vo' },
        { startFrame: frames(53), endFrame: TOTAL_FRAMES, treatment: 'music_beat' },
      ],
    }));

    expect(plan.mode).toBe('sections');
    expect(plan.sections).toEqual([
      expect.objectContaining({ startFrame: 0, endFrame: frames(5), intent: 'visual-beat' }),
      expect.objectContaining({ startFrame: frames(53), endFrame: TOTAL_FRAMES, intent: 'visual-beat' }),
    ]);
  });

  it('returns explicit none when mixed content has no temporal evidence', () => {
    const plan = planMusicCoverage(input({
      contentType: 'vlog',
      speechCoverage: 0.55,
    }));

    expect(plan).toMatchObject({
      mode: 'none',
      sections: [],
      reasonCodes: ['no-licensed-sections'],
    });
  });

  it.each([
    { totalFrames: 0, fps: 30 },
    { totalFrames: 100, fps: 0 },
    { totalFrames: Number.NaN, fps: 30 },
  ])('fails loud for invalid timeline geometry: %o', (timeline) => {
    expect(() => planMusicCoverage(timeline)).toThrow(MusicCoveragePlanningError);
  });
});
