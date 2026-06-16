import { describe, expect, it, vi } from 'vitest';
import {
  analyzeReferenceEditingWithGemini,
  applyReferencePacingSignals,
  buildDeterministicReferenceEditAnalysisFromSceneTimes,
  buildReferenceEditingAnalysisRequest,
  classifyReferenceCutsFromSceneScores,
  deriveReferencePatterns,
  mergeReferenceEditingEvidence,
  normalizeCutsPerMinuteToPacingVelocity,
  parseFfmpegSceneDetectionOutput,
  parseFfmpegSceneScoreOutput,
  parseReferenceEditingAnalysisText,
} from '../../scripts/calibrate/calibrate';

function buildTimedTransitions(count: number, specialFrom: number): Array<{ timestampMs: number; type: string }> {
  return Array.from({ length: count }, (_, index) => ({
    timestampMs: index * 1000,
    type: index >= specialFrom ? (index % 2 === 0 ? 'dissolve' : 'fade') : 'hard-cut',
  }));
}

describe('calibration reference pattern extraction', () => {
  it('grounds Gemini reference analysis in the actual video with deterministic JSON config', () => {
    const request = buildReferenceEditingAnalysisRequest('https://storage.example/ref.mp4?sig=abc', 123_000, 7);

    expect(request.contents[0].parts[0]).toEqual({
      fileData: {
        mimeType: 'video/mp4',
        fileUri: 'https://storage.example/ref.mp4?sig=abc',
      },
    });
    expect(request.contents[0].parts[1]).toEqual(expect.objectContaining({
      text: expect.stringContaining('Analyze the ACTUAL editing decisions'),
    }));
    expect(request.generationConfig).toEqual({
      responseMimeType: 'application/json',
      seed: 7,
      maxOutputTokens: 65536,
    });
  });

  it('refuses text-only reference analysis inputs', () => {
    expect(() => buildReferenceEditingAnalysisRequest('   ', 60_000)).toThrow(/requires a video URI/);
  });

  it('retries parse failures with deterministic seeds before accepting grounded analysis', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const model = {
      generateContent: vi.fn()
        .mockResolvedValueOnce({ response: { text: () => '{not-json' } })
        .mockResolvedValueOnce({
          response: {
            text: () => '```json\n{"shots":[{"startMs":0,"endMs":900}],"naturalCutPoints":[{"timestampMs":900}],"transitionTypes":[{"timestampMs":900,"type":"hard-cut"}]}\n```',
          },
        }),
    };

    try {
      const fiveTrack = await analyzeReferenceEditingWithGemini(model, 'https://storage.example/ref.mp4', 900);

      expect(fiveTrack.shots).toHaveLength(1);
      expect(model.generateContent).toHaveBeenCalledTimes(2);
      expect(model.generateContent.mock.calls.map(([request]) => request.generationConfig.seed)).toEqual([42, 7]);
      expect(model.generateContent.mock.calls[0][0].contents[0].parts[0].fileData.fileUri).toBe('https://storage.example/ref.mp4');
    } finally {
      warn.mockRestore();
      log.mockRestore();
    }
  });

  it('fails closed instead of returning empty reference patterns on invalid Gemini JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const model = {
      generateContent: vi.fn().mockResolvedValue({ response: { text: () => 'not-json' } }),
    };

    try {
      await expect(analyzeReferenceEditingWithGemini(model, 'https://storage.example/ref.mp4', 900))
        .rejects
        .toThrow(/failed after 3 video-grounded attempts/);
      expect(model.generateContent).toHaveBeenCalledTimes(3);
    } finally {
      warn.mockRestore();
    }
  });

  it('parses fenced JSON reference responses', () => {
    expect(parseReferenceEditingAnalysisText('```json\n{"shots":[]}\n```')).toEqual({ shots: [] });
  });

  it('parses FFmpeg scene-detection timestamps from showinfo output', () => {
    const timestamps = parseFfmpegSceneDetectionOutput([
      '[Parsed_showinfo_1 @ 000] n:0 pts:15360 pts_time:0.500 pos:0',
      '[Parsed_showinfo_1 @ 000] n:1 pts:15500 pts_time:0.512 pos:0',
      '[Parsed_showinfo_1 @ 000] n:2 pts:92160 pts_time:3.000 pos:0',
    ].join('\n'));

    expect(timestamps).toEqual([500, 3000]);
  });

  it('parses FFmpeg scdet per-frame scene scores', () => {
    const samples = parseFfmpegSceneScoreOutput([
      '[Parsed_scdet_0 @ 000] lavfi.scd.score: 0.000, lavfi.scd.time: 1.001',
      '[Parsed_scdet_0 @ 000] lavfi.scd.score: 24.835, lavfi.scd.time: 1.793458',
      '[Parsed_scdet_0 @ 000] lavfi.scd.score: 20.000, lavfi.scd.time: 1.793458',
      'lavfi.scd.score=3.500',
      'lavfi.scd.time=2.250',
    ].join('\n'));

    expect(samples).toEqual([
      { timestampMs: 1001, score: 0 },
      { timestampMs: 1793, score: 24.835 },
      { timestampMs: 2250, score: 3.5 },
    ]);
  });

  it('turns classified hard-cut spikes into reference cuts, transitions, and shots', () => {
    const measured = buildDeterministicReferenceEditAnalysisFromSceneTimes(
      [250, 1000, 2000, 9900, 10_200],
      10_000,
      'deterministic-adaptive-cut-detect',
    );

    expect(measured.naturalCutPoints.map((cut: any) => cut.timestampMs)).toEqual([250, 1000, 2000]);
    expect(measured.naturalCutPoints[0]).toEqual(expect.objectContaining({
      reason: 'measured-hard-cut-spike',
    }));
    expect(measured.transitionTypes).toEqual([
      expect.objectContaining({ timestampMs: 250, type: 'hard-cut' }),
      expect.objectContaining({ timestampMs: 1000, type: 'hard-cut' }),
      expect.objectContaining({ timestampMs: 2000, type: 'hard-cut' }),
    ]);
    expect(measured.shots).toEqual([
      expect.objectContaining({ startMs: 0, endMs: 250 }),
      expect.objectContaining({ startMs: 250, endMs: 1000 }),
      expect.objectContaining({ startMs: 1000, endMs: 2000 }),
      expect.objectContaining({ startMs: 2000, endMs: 10_000 }),
    ]);
  });

  it('lets deterministic timing override coarse Gemini counts while preserving semantic evidence', () => {
    const gemini = {
      shots: [{ startMs: 0, endMs: 5000, shotType: 'talking-head' }],
      naturalCutPoints: [{ timestampMs: 5000, reason: 'semantic beat' }],
      transitionTypes: [{ timestampMs: 5000, type: 'hard-cut' }],
    };
    const deterministic = buildDeterministicReferenceEditAnalysisFromSceneTimes(
      [1000, 2000, 3000, 4000],
      5000,
      'deterministic-adaptive-cut-detect',
    );

    const merged = mergeReferenceEditingEvidence(gemini, deterministic);
    const patterns = deriveReferencePatterns(merged, 5000);

    expect(merged.naturalCutPoints).toHaveLength(4);
    expect(merged.referenceEvidence).toEqual(expect.objectContaining({
      semanticSource: 'gemini-vision',
      timingSource: 'deterministic-adaptive-cut-detect',
      geminiCutCount: 1,
      measuredCutCount: 4,
    }));
    expect(patterns).toEqual(expect.objectContaining({
      cutCount: 4,
      evidenceSource: 'timestamp-union',
      hardCutRatio: 1,
    }));
  });

  it('keeps Gemini transition labels when they align with measured cut timestamps', () => {
    const gemini = {
      transitionTypes: [
        { timestampMs: 2080, type: 'dissolve' },
        { timestampMs: 6000, type: 'fade' },
      ],
    };
    const deterministic = buildDeterministicReferenceEditAnalysisFromSceneTimes(
      [2000, 4000],
      5000,
      'deterministic-adaptive-cut-detect',
    );

    const merged = mergeReferenceEditingEvidence(gemini, deterministic);
    const patterns = deriveReferencePatterns(merged, 5000);

    expect(merged.transitionTypes).toEqual([
      expect.objectContaining({ timestampMs: 2000, type: 'dissolve', semanticSource: 'gemini-vision' }),
      expect.objectContaining({ timestampMs: 4000, type: 'hard-cut' }),
    ]);
    expect(patterns.transitionTypes).toEqual({
      dissolve: 1,
      'hard-cut': 1,
    });
  });

  it('classifies isolated score spikes while rejecting sustained motion plateaus', () => {
    const samples = [
      { timestampMs: 1600, score: 0.4 },
      { timestampMs: 1700, score: 0.8 },
      { timestampMs: 1800, score: 1.1 },
      { timestampMs: 1900, score: 0.7 },
      { timestampMs: 2000, score: 28 },
      { timestampMs: 2100, score: 1.2 },
      { timestampMs: 2200, score: 0.9 },
      { timestampMs: 2300, score: 0.4 },
      { timestampMs: 2400, score: 0.2 },
      { timestampMs: 4000, score: 17 },
      { timestampMs: 4100, score: 20 },
      { timestampMs: 4200, score: 23 },
      { timestampMs: 4300, score: 21 },
      { timestampMs: 4400, score: 19 },
      { timestampMs: 4500, score: 18 },
      { timestampMs: 6100, score: 0.3 },
      { timestampMs: 6200, score: 0.4 },
      { timestampMs: 6300, score: 0.6 },
      { timestampMs: 6400, score: 0.5 },
      { timestampMs: 6500, score: 32 },
      { timestampMs: 6600, score: 1.1 },
      { timestampMs: 6700, score: 0.7 },
      { timestampMs: 6800, score: 0.4 },
      { timestampMs: 6900, score: 0.2 },
    ];

    expect(classifyReferenceCutsFromSceneScores(samples, 8000)).toEqual([2000, 6500]);
  });

  it('converts observed edit density into calibration pacing signals', () => {
    expect(normalizeCutsPerMinuteToPacingVelocity(3)).toBeLessThan(0.4);
    expect(normalizeCutsPerMinuteToPacingVelocity(6)).toBeCloseTo(0.5, 3);
    expect(normalizeCutsPerMinuteToPacingVelocity(9.7)).toBeGreaterThan(0.6);

    const enriched = applyReferencePacingSignals({ pacing_velocity: 0.5 }, {
      cutCount: 173,
      cutsPerMinute: 9.7,
      transitionTypes: { 'hard-cut': 173 },
      avgShotDurationMs: 6200,
      specialTransitionCount: 0,
      specialTransitionsPerMinute: 0,
      hardCutRatio: 1,
      transitionDominance: 1,
      evidenceSource: 'timestamp-union',
    });

    expect(enriched.pacing_velocity).toBeGreaterThan(0.6);
    expect(enriched['rhythm.density']).toBe(enriched.pacing_velocity);
    expect(enriched['structural.cumulative_edit_density']).toBe(9.7);
  });

  it('uses rich transition/shot evidence instead of under-counted natural cut points', () => {
    const patterns = deriveReferencePatterns({
      naturalCutPoints: Array.from({ length: 7 }, (_, index) => ({ timestampMs: index * 20_000 })),
      transitionTypes: buildTimedTransitions(141, 114),
      shots: Array.from({ length: 141 }, (_, index) => ({
        startMs: index * 1000,
        endMs: (index + 1) * 1000,
      })),
    }, 20 * 60 * 1000);

    expect(patterns).toEqual(expect.objectContaining({
      cutCount: 141,
      evidenceSource: 'timestamp-union',
      specialTransitionCount: 27,
      cutsPerMinute: expect.closeTo(7.05, 3),
      specialTransitionsPerMinute: expect.closeTo(1.35, 3),
      hardCutRatio: expect.closeTo(114 / 141, 3),
    }));
    expect(patterns.transitionTypes).toEqual({
      'hard-cut': 114,
      dissolve: 14,
      fade: 13,
    });
  });

  it('falls back to shot boundaries when transition timestamps are unavailable', () => {
    const patterns = deriveReferencePatterns({
      naturalCutPoints: [],
      transitionTypes: [],
      shots: Array.from({ length: 9 }, (_, index) => ({
        startMs: index * 5000,
        endMs: (index + 1) * 5000,
      })),
    }, 60_000);

    expect(patterns).toEqual(expect.objectContaining({
      cutCount: 8,
      evidenceSource: 'timestamp-union',
      cutsPerMinute: 8,
      specialTransitionCount: 0,
    }));
  });
});
