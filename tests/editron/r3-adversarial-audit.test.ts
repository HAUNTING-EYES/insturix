import { describe, expect, it } from 'vitest';

import {
  measureReferenceEvidence,
  type MeasureReferenceEvidenceDeps,
} from '@/lib/editron/reference-video/measure-reference-evidence';
import {
  resolveSoundtrackIdentity,
  SoundtrackIdentityError,
  type AudioRecognizer,
} from '@/lib/editron/reference-video/soundtrack-identity';

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
      const primary = makePcm(16_000, 1);
      return {
        sampleRate: 16_000,
        length: primary.length,
        numberOfChannels: 1,
        getChannelData: () => primary,
        duration: 1,
      };
    },
    analyzeBeats: async () => ({
      beats: [{ timeMs: 250, strength: 0.5, isDownbeat: true }],
      bpm: 120,
      bpmConfidence: 0.9,
      durationMs: 1000,
      timeSignatureNumerator: 4,
      energyPeaks: [],
      rawOnsets: [],
    }),
    detectCuts: async () => ({ cuts: [{ tMs: 500, sceneScore: 0.8 }], durationMs: 1000 }),
    measureSilenceFn: () => ({ windows: [], totalSilentMs: 0, silentRatio: 0, durationMs: 1000, version: 'editron-r2-silence-v1' as const }),
    ...overrides,
  };
}

const video = new Uint8Array(Buffer.from('video-bytes'));
const audio = new Uint8Array(Buffer.from('audio-bytes'));

describe('R3 adversarial audit — fixed behaviours', () => {
  it('FIX-A: a recognizer failure is NO LONGER mislabeled; it surfaces as a warning and evidence survives', async () => {
    const deps = fakeDeps({
      soundtrackRecognizer: async () => {
        throw new Error('audd upstream 500');
      },
    });
    const evidence = await measureReferenceEvidence('ref_canon_x', video, audio, deps);

    // Evidence must survive (beats/silence/cuts intact) — NOT a thrown error.
    expect(evidence.beats.bpm).toBe(120);
    expect(evidence.cuts).toHaveLength(1);
    expect(evidence.silence.version).toBe('editron-r2-silence-v1');
    // Identity degraded + warning surfaced loudly (not swallowed silently).
    expect(evidence.soundtrackIdentity).toBeNull();
    expect(evidence.warnings.length).toBe(1);
    expect(evidence.warnings[0]).toMatchObject({ source: 'soundtrack', code: 'recognizer_failed' });
    expect(evidence.warnings[0].message).toContain('audd upstream 500');
  });

  it('FIX-A2: a real decode failure still throws audio_decode_failed (distinct from recognizer failure)', async () => {
    const deps = fakeDeps({
      decodeAudio: async () => {
        throw new Error('bad magic bytes');
      },
      soundtrackRecognizer: async () => ({ recordingId: 'r', title: 'T', artists: ['A'], confidence: 0.9, providerName: 'audd', providerReceipt: 'rx' }),
    });
    await expect(measureReferenceEvidence('ref_canon_x', video, audio, deps))
      .rejects.toMatchObject({ code: 'audio_decode_failed' });
  });

  it('FIX-B: section provider failure degrades sections but keeps beats + identity', async () => {
    const deps = fakeDeps({
      measureSections: async () => {
        throw new Error('modal down');
      },
      soundtrackRecognizer: async () => ({
        recordingId: 'isrc:X1',
        title: 'T',
        artists: ['A'],
        isrcs: ['X1'],
        confidence: 0.9,
        providerName: 'musicbrainz',
        providerReceipt: 'rec',
      }),
    });
    const evidence = await measureReferenceEvidence('ref_canon_x', video, audio, deps);
    expect(evidence.sections).toEqual([]);
    expect(evidence.soundtrackIdentity?.recordingId).toBe('isrc:X1');
    expect(evidence.warnings).toContainEqual(expect.objectContaining({ source: 'section', code: 'section_provider_failed' }));
  });

  it('FIX-C: title is trimmed like artists; empty recordingId/title/artist refuse to fabricate identity', async () => {
    const trimmed = await resolveSoundtrackIdentity('r', audio, {
      recognize: async () => ({
        recordingId: 'r1',
        title: '  Nightcall  ',
        artists: ['  Kavinsky  '],
        confidence: 0.9,
        providerName: 'audd',
        providerReceipt: 'rx',
      }),
    });
    expect(trimmed?.title).toBe('Nightcall');
    expect(trimmed?.artists).toEqual(['Kavinsky']);

    const blankId = await resolveSoundtrackIdentity('r', audio, {
      recognize: async () => ({ recordingId: '   ', title: 'T', artists: ['A'], confidence: 0.9, providerName: 'audd', providerReceipt: 'rx' }),
    }).then(() => 'resolved').catch((e: unknown) => e instanceof SoundtrackIdentityError ? e.code : 'other');
    expect(blankId).toBe('recognizer_failed');

    const blankArtist = await resolveSoundtrackIdentity('r', audio, {
      recognize: async () => ({ recordingId: 'r', title: 'T', artists: ['  ', ''], confidence: 0.9, providerName: 'audd', providerReceipt: 'rx' }),
    }).then(() => 'resolved').catch((e: unknown) => e instanceof SoundtrackIdentityError ? e.code : 'other');
    expect(blankArtist).toBe('recognizer_failed');
  });

  it('confidence normalization: numeric/percent/NaN — [0,1] clamped (documented, not silent corruption)', async () => {
    const cases: Array<{ confidence: unknown; expected: number }> = [
      { confidence: 0.94, expected: 0.94 },
      { confidence: '0.94', expected: 0.94 },
      { confidence: 94, expected: 1 },
      { confidence: -5, expected: 0 },
    ];
    for (const c of cases) {
      const id = await resolveSoundtrackIdentity('r', audio, {
        recognize: async () => ({ recordingId: 'r', title: 'T', artists: ['A'], confidence: c.confidence as number, providerName: 'audd', providerReceipt: 'rx' }),
      });
      expect(id?.confidence).toBe(c.expected);
    }
    // Non-numeric should not corrupt the record — becomes 0 (no identity claim).
    const nan = await resolveSoundtrackIdentity('r', audio, {
      recognize: async () => ({ recordingId: 'r', title: 'T', artists: ['A'], confidence: Number.NaN, providerName: 'audd', providerReceipt: 'rx' }),
    });
    expect(nan?.confidence).toBe(0);
  });

  it('isrc: 12-char codes pass, invalid drop, dedupe + sort', async () => {
    const id = await resolveSoundtrackIdentity('r', audio, {
      recognize: async () => ({
        recordingId: 'r', title: 'T', artists: ['A'],
        isrcs: ['USRC17607839', 'ZZAA00000000', 'zzb', 'USRC17607839'],
        confidence: 0.5, providerName: 'audd', providerReceipt: 'rx',
      }),
    });
    expect(id?.isrcs).toEqual(['USRC17607839', 'ZZAA00000000']);
  });

  it('zero-length audio -> no_audio; oversized -> audio_too_large (fail-loud)', async () => {
    await expect(resolveSoundtrackIdentity('r', new Uint8Array(0), {})).rejects.toMatchObject({ code: 'no_audio' });
    await expect(resolveSoundtrackIdentity('r', new Uint8Array(2 * 1024 * 1024), { maxRecognitionBytes: 1024 }))
      .rejects.toMatchObject({ code: 'audio_too_large' });
  });
});
