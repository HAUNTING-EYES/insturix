import { describe, expect, it } from 'vitest';

import {
  measureReferenceEvidence,
  MEASURED_EVIDENCE_VERSION,
  MeasureReferenceEvidenceError,
  type MeasureReferenceEvidenceDeps,
} from '@/lib/editron/reference-video/measure-reference-evidence';

function makePcm(sampleRate: number, seconds: number, freq = 440, amp = 0.5): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * seconds));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return samples;
}

function fakeDeps(overrides: Partial<MeasureReferenceEvidenceDeps> = {}): MeasureReferenceEvidenceDeps {
  return {
    decodeAudio: async () => {
      const primary = makePcm(16_000, 2);
      return {
        sampleRate: 16_000,
        length: primary.length,
        numberOfChannels: 1,
        getChannelData: () => primary,
        duration: 2,
      };
    },
    analyzeBeats: async () => ({
      beats: [
        { timeMs: 250, strength: 0.6, isDownbeat: true },
        { timeMs: 500, strength: 0.7, isDownbeat: false },
        { timeMs: 750, strength: 0.5, isDownbeat: false },
        { timeMs: 1000, strength: 0.8, isDownbeat: true },
      ],
      bpm: 120,
      bpmConfidence: 0.9,
      durationMs: 2000,
      timeSignatureNumerator: 4,
      energyPeaks: [{ timeMs: 1000, magnitude: 1 }],
      rawOnsets: [{ timeMs: 250, strength: 0.6 }],
    }),
    detectCuts: async () => ({
      cuts: [
        { tMs: 500, sceneScore: 0.8 },
        { tMs: 1200, sceneScore: 0.3 },
        { tMs: 1300, sceneScore: 0.35 },
      ],
      durationMs: 2000,
    }),
    measureSilenceFn: () => ({
      windows: [{ startMs: 1500, endMs: 1900, durationMs: 400, relativeLevel: 0.05 }],
      totalSilentMs: 400,
      silentRatio: 0.2,
      durationMs: 2000,
      version: 'editron-r2-silence-v1' as const,
    }),
    ...overrides,
  };
}

describe('R2 measured reference evidence', () => {
  const video = new Uint8Array(Buffer.from('video-bytes'));
  const audio = new Uint8Array(Buffer.from('audio-bytes'));

  it('composes cuts + beats + silence into a v1 evidence object', async () => {
    const evidence = await measureReferenceEvidence('ref_canon_x', video, audio, fakeDeps());

    expect(evidence.version).toBe(MEASURED_EVIDENCE_VERSION);
    expect(evidence.referenceAssetId).toBe('ref_canon_x');
    expect(evidence.durationMs).toBe(2000);
    // Weak cluster (0.3 + 0.35 at 1200/1300) collapses to its strongest member (1300).
    expect(evidence.cuts).toHaveLength(2);
    expect(evidence.cuts[0].tMs).toBe(500);
    expect(evidence.cuts[1].tMs).toBe(1300);
    expect(evidence.beats.bpm).toBe(120);
    expect(evidence.beats.beats).toHaveLength(4);
    expect(evidence.silence.windows).toHaveLength(1);
    expect(evidence.rhythm).toEqual({
      avgCutsPerMinute: 60, // 2 cuts / 2000ms * 60000
      avgClipDurationMs: 800, // (1300 - 500) / 1
      bpm: 120,
    });
  });

  it('marks collapsed weak-cluster cuts as merged', async () => {
    const evidence = await measureReferenceEvidence('ref_canon_x', video, audio, fakeDeps());
    const survivor = evidence.cuts.find((c) => c.tMs === 1300);
    // The collapsed weak cluster (1200/1300) survives as its strongest member.
    expect(survivor).toBeDefined();
    expect(survivor?.merged).toBe(true);
    // And a standalone strong cut is not merged.
    expect(evidence.cuts.find((c) => c.tMs === 500)?.merged).toBeUndefined();
  });

  it('keeps cuts, beats empty when no audio track is present', async () => {
    const evidence = await measureReferenceEvidence('ref_canon_x', video, null, fakeDeps());
    expect(evidence.cuts).toHaveLength(2); // cuts don't depend on audio
    expect(evidence.beats.beats).toEqual([]);
    expect(evidence.beats.bpm).toBe(0);
    expect(evidence.silence.windows).toEqual([]);
  });

  it('includes sections when a section provider is injected', async () => {
    const deps = fakeDeps({
      measureSections: async () => [
        { startMs: 0, endMs: 800, label: 'intro' },
        { startMs: 800, endMs: 2000, label: 'drop' },
      ],
    });
    const evidence = await measureReferenceEvidence('ref_canon_x', video, audio, deps);
    expect(evidence.sections).toHaveLength(2);
    expect(evidence.sections[1].label).toBe('drop');
  });

  it('attaches an R3 soundtrack identity when a recognizer is injected', async () => {
    const deps = fakeDeps({
      soundtrackRecognizer: async () => ({
        recordingId: 'isrc:USRC17607839',
        title: 'Nightcall',
        artists: ['Kavinsky'],
        isrcs: ['USRC17607839'],
        confidence: 0.94,
        cueOffsetMs: 3_200,
        providerName: 'audd',
        providerReceipt: 'audd_receipt_abc123',
      }),
    });
    const evidence = await measureReferenceEvidence('ref_canon_x', video, audio, deps);
    expect(evidence.soundtrackIdentity).not.toBeNull();
    expect(evidence.soundtrackIdentity?.title).toBe('Nightcall');
    expect(evidence.soundtrackIdentity?.cueOffsetMs).toBe(3_200);
    expect(evidence.soundtrackIdentity?.provider.receipt).toBe('audd_receipt_abc123');
  });

  it('keeps soundtrackIdentity null when no recognizer is configured', async () => {
    const evidence = await measureReferenceEvidence('ref_canon_x', video, audio, fakeDeps());
    expect(evidence.soundtrackIdentity).toBeNull();
  });

  it('fails loud on an undecodable audio track', async () => {
    const deps = fakeDeps({
      decodeAudio: async () => {
        throw new Error('bad magic bytes');
      },
    });
    await expect(measureReferenceEvidence('ref_canon_x', video, audio, deps))
      .rejects.toMatchObject({ code: 'audio_decode_failed' });
  });

  it('fails loud when no video bytes are provided', async () => {
    await expect(measureReferenceEvidence('ref_canon_x', new Uint8Array(0), null, fakeDeps()))
      .rejects.toBeInstanceOf(MeasureReferenceEvidenceError);
  });
});
