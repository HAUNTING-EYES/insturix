import { describe, expect, it } from 'vitest';
import {
  mergeCutsIntoVisual,
  extractVisualFingerprintWithCuts,
} from '@/lib/editron/reference-video/extract-visual-fingerprint-with-cuts';
import type { VisualExtractionTarget } from '@/lib/editron/reference-video/fingerprint-eval';
import type { FingerprintDecision } from '@/lib/editron/types/edit-fingerprint';
import type { FetchedReferenceVideo } from '@/lib/editron/reference-video/fetch-reference-video';
import type { FfmpegCutDetection } from '@/lib/editron/reference-video/detect-cuts-ffmpeg';

const cut = (tMs: number): FingerprintDecision => ({
  family: 'transition_hard_cut',
  anchor: { kind: 'none', tMs },
  params: { sceneScore: 0.7 },
  confidence: 1,
});
const zoom = (tMs: number): FingerprintDecision => ({
  family: 'zoom_punch',
  anchor: { kind: 'none', tMs },
  params: {},
  confidence: 0.8,
});

describe('mergeCutsIntoVisual (pure)', () => {
  it('strips Gemini transitions, keeps other events, splices in ffmpeg cuts, time-sorted', () => {
    const subjective: VisualExtractionTarget = {
      treatment: { saturate: 1.2 },
      decisionStream: [zoom(4000), cut(9999)], // the stray transition Gemini should not have emitted
    };
    const merged = mergeCutsIntoVisual(subjective, [cut(2000), cut(6000)]);

    expect(merged.treatment).toEqual({ saturate: 1.2 }); // other layers preserved
    expect(merged.decisionStream!.map((d) => [d.family, d.anchor.tMs])).toEqual([
      ['transition_hard_cut', 2000],
      ['zoom_punch', 4000],
      ['transition_hard_cut', 6000],
    ]); // Gemini's cut@9999 dropped; ffmpeg cuts + the zoom sorted
  });

  it('handles a subjective target with no decisionStream (just the ffmpeg cuts)', () => {
    const merged = mergeCutsIntoVisual({ graphics: { classes: ['callout'] } }, [cut(1000)]);
    expect(merged.decisionStream).toEqual([cut(1000)]);
    expect(merged.graphics).toEqual({ classes: ['callout'] });
  });

  it('yields an empty decisionStream (not undefined) when nothing was found — honest "analyzed, none"', () => {
    const merged = mergeCutsIntoVisual({}, []);
    expect(merged.decisionStream).toEqual([]);
  });
});

describe('extractVisualFingerprintWithCuts (orchestration, all seams injected)', () => {
  const detection: FfmpegCutDetection = { cuts: [{ tMs: 2000, sceneScore: 0.7 }], durationMs: 15000, sceneThreshold: 0.3 };

  it('fetches, runs both extractors, merges, and always cleans up', async () => {
    let cleaned = 0;
    const fetched: FetchedReferenceVideo = { filePath: '/tmp/v.mp4', source: 'download', cleanup: async () => void cleaned++ };

    const result = await extractVisualFingerprintWithCuts('https://youtube.com/watch?v=x', {
      fetchFile: async () => fetched,
      detectCuts: async () => detection,
      extractSubjective: async () => ({ decisionStream: [zoom(4000), cut(8000)], treatment: { contrast: 1.1 } }),
    });

    expect(result.treatment).toEqual({ contrast: 1.1 });
    expect(result.decisionStream!.map((d) => [d.family, d.anchor.tMs])).toEqual([
      ['transition_hard_cut', 2000], // from ffmpeg
      ['zoom_punch', 4000], // from Gemini, kept
      // Gemini's cut@8000 stripped
    ]);
    expect(cleaned).toBe(1);
  });

  it('cleans up even when cut detection fails, and fails loud', async () => {
    let cleaned = 0;
    const fetched: FetchedReferenceVideo = { filePath: '/tmp/v.mp4', source: 'download', cleanup: async () => void cleaned++ };
    await expect(
      extractVisualFingerprintWithCuts('https://youtube.com/watch?v=x', {
        fetchFile: async () => fetched,
        detectCuts: async () => { throw new Error('ffmpeg boom'); },
        extractSubjective: async () => ({}),
      }),
    ).rejects.toThrow(/ffmpeg boom/);
    expect(cleaned).toBe(1);
  });
});
