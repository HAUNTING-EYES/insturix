import { describe, expect, it } from 'vitest';

import { buildCanonicalFingerprintFromEvidence } from '@/lib/editron/reference-video/build-canonic-fingerprint';
import { MEASURED_EVIDENCE_VERSION } from '@/lib/editron/reference-video/measure-reference-evidence';
import { isLayerExtracted } from '@/lib/editron/reference-video/edit-fingerprint-assembler';
import type { MeasuredReferenceEvidence } from '@/lib/editron/reference-video/measure-reference-evidence';
import type { SoundtrackIdentity } from '@/lib/editron/reference-video/soundtrack-identity';

function evidence(): MeasuredReferenceEvidence {
  return {
    version: MEASURED_EVIDENCE_VERSION,
    referenceAssetId: 'ref_canon_x',
    durationMs: 2000,
    cuts: [
      { tMs: 500, sceneScore: 0.8 },
      { tMs: 1300, sceneScore: 0.35, merged: true },
    ],
    beats: {
      beats: [
        { timeMs: 250, strength: 0.6, isDownbeat: true },
        { timeMs: 500, strength: 0.7, isDownbeat: false },
      ],
      bpm: 120,
      bpmConfidence: 0.9,
      durationMs: 2000,
      timeSignatureNumerator: 4,
      energyPeaks: [],
      rawOnsets: [],
    },
    silence: {
      windows: [{ startMs: 1500, endMs: 1800, durationMs: 300, relativeLevel: 0.05 }],
      totalSilentMs: 300,
      silentRatio: 0.15,
      durationMs: 2000,
      version: 'editron-r2-silence-v1',
    },
    sections: [
      { startMs: 0, endMs: 800, label: 'intro' },
      { startMs: 800, endMs: 2000, label: 'drop' },
    ],
    soundtrackIdentity: null,
    warnings: [],
    rhythm: { avgCutsPerMinute: 60, avgClipDurationMs: 800, bpm: 120 },
  };
}

function identity(): SoundtrackIdentity {
  return {
    version: 'editron-r3-soundtrack-identity-v1',
    referenceAssetId: 'ref_canon_x',
    recordingId: 'isrc:USRC17607839',
    title: 'Nightcall',
    artists: ['Kavinsky'],
    isrcs: ['USRC17607839'],
    catalogDurationMs: 244_000,
    confidence: 0.94,
    cueOffsetMs: 3_200,
    provider: { name: 'audd', receipt: 'audd_receipt_abc123' },
    recognizedAt: '2026-08-06T00:00:00.000Z',
  };
}

describe('R4 canonical EditFingerprint from evidence', () => {
  it('unifies cuts + beats + sections + identity into one fingerprint', () => {
    const fp = buildCanonicalFingerprintFromEvidence('ref_1', evidence(), identity(), { extractedAt: 't1' });

    expect(fp.fingerprintId).toBeTruthy();
    expect(fp.referenceId).toBe('ref_1');
    expect(fp.durationMs).toBe(2000);
    expect(fp.alignmentFrame).toBe('beat-space'); // audioAnchored via beats

    // Audio layer: bpm + beats + sections + drop + identity.
    expect(fp.audio.bpm).toBe(120);
    expect(fp.audio.beats).toHaveLength(2);
    expect(fp.audio.beats[0].timestampMs).toBe(250);
    expect(fp.audio.sections.map((s) => s.label)).toEqual(['intro', 'drop']);
    expect(fp.audio.dropsMs).toEqual([800]);
    expect(fp.audio.soundClass).toBe('catalog-track');
    expect(fp.audio.recognition).toEqual({
      trackIdentity: 'isrc:USRC17607839',
      soundClass: 'catalog-track',
      playOffsetMs: 3_200,
    });

    // Cuts -> decisionStream (transition_hard_cut), merged flag carried.
    expect(fp.decisionStream).toHaveLength(2);
    expect(fp.decisionStream[0]).toMatchObject({ family: 'transition_hard_cut', anchor: { tMs: 500 }, params: { sceneScore: 0.8 } });
    expect(fp.decisionStream[1].params.merged).toBe(1);
  });

  it('attaches R4 metadata (source, algorithm version, coordinateSpace, units) per layer', () => {
    const fp = buildCanonicalFingerprintFromEvidence('ref_1', evidence(), null, { extractedAt: 't1' });
    expect(isLayerExtracted(fp, 'audio')).toBe(true);
    expect(isLayerExtracted(fp, 'decision')).toBe(true);

    const audioMeta = fp.layerConfidence.audio;
    expect(audioMeta).toMatchObject({
      confidence: 0.9,
      source: 'measured-reference-evidence',
      algorithmVersion: MEASURED_EVIDENCE_VERSION,
      coordinateSpace: 'beat',
      units: 'ms',
    });
    const decisionMeta = fp.layerConfidence.decision;
    expect(decisionMeta).toMatchObject({
      coordinateSpace: 'wall-clock',
      units: 'ms',
      evidenceFramesMs: [500, 1300],
    });
  });

  it('keeps soundClass unknown and skips recognition when no identity', () => {
    const fp = buildCanonicalFingerprintFromEvidence('ref_1', evidence(), null, { extractedAt: 't1' });
    expect(fp.audio.soundClass).toBe('unknown');
    expect(fp.audio.recognition).toBeUndefined();
  });

  it('uses slot-space framing when there are no beats', () => {
    const noBeats = { ...evidence(), beats: { ...evidence().beats, beats: [], bpm: 0 } };
    const fp = buildCanonicalFingerprintFromEvidence('ref_1', noBeats, null, { extractedAt: 't1' });
    expect(fp.audio.audioAnchored).toBe(false);
    expect(fp.alignmentFrame).toBe('slot-space');
  });

  it('is pure + deterministic for a fixed input (fixed id)', () => {
    const a = buildCanonicalFingerprintFromEvidence('ref_1', evidence(), identity(), { extractedAt: 't1', fingerprintId: 'efp_fixed' });
    const b = buildCanonicalFingerprintFromEvidence('ref_1', evidence(), identity(), { extractedAt: 't1', fingerprintId: 'efp_fixed' });
    expect(a).toEqual(b);
  });
});
