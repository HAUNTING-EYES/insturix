import { describe, expect, it } from 'vitest';
import { deriveEditDna } from '@/lib/editron/reference-video/derive-edit-dna';
import { assembleEditFingerprint } from '@/lib/editron/reference-video/edit-fingerprint-assembler';
import type { FingerprintAudioLayer } from '@/lib/editron/types/edit-fingerprint';

function audio(o: Partial<FingerprintAudioLayer> = {}): FingerprintAudioLayer {
  return {
    soundClass: 'unknown',
    beats: [],
    dropsMs: [],
    sections: [],
    energyCurve: [],
    audioAnchored: false,
    voiceWindows: [],
    durationMs: 60_000,
    ...o,
  };
}

describe('deriveEditDna — full fingerprint', () => {
  const fp = assembleEditFingerprint({
    referenceId: 'ref_1',
    fingerprintId: 'efp_1',
    audio: audio({ bpm: 140, energyCurve: [0.8, 0.9], durationMs: 60_000 }),
    decisionStream: [
      { family: 'transition_whip_pan', anchor: { kind: 'none', tMs: 1000 }, params: {}, confidence: 1 },
      { family: 'transition_whip_pan', anchor: { kind: 'none', tMs: 2000 }, params: {}, confidence: 1 },
      { family: 'transition_hard_cut', anchor: { kind: 'none', tMs: 3000 }, params: {}, confidence: 1 },
    ],
    treatment: { saturate: 1.3, contrast: 0.8 },
    typography: { position: 'center', reveal: 'pop' },
    graphics: { classes: ['kinetic-type'], density: 'heavy' },
  });
  const dna = deriveEditDna(fp);

  it('carries identity from the fingerprint', () => {
    expect(dna.profileId).toBe('style_efp_1');
    expect(dna.sourceName).toBe('ref_1');
  });

  it('derives cutRhythm + transitions from the decisionStream', () => {
    expect(dna.cutRhythm.avgCutsPerMinute).toBe(3); // 3 cuts / 1 min
    expect(dna.cutRhythm.avgClipDuration).toBe(15); // 60s / (3+1)
    expect(dna.transitions.dominant).toBe('slide'); // whip_pan ×2 → slide
    expect(dna.transitions.frequency).toBe(67); // 2 of 3 styled
  });

  it('derives colorGrade, musicStyle, pacing, graphics', () => {
    expect(dna.colorGrade.saturation).toBe('high'); // 1.3 > 1.1
    expect(dna.colorGrade.contrast).toBe('low'); // 0.8 < 0.9
    expect(dna.musicStyle.tempo).toBe('fast'); // 140 > 130
    expect(dna.musicStyle.energyLevel).toBe('high'); // mean 0.85 > 0.66
    expect(dna.pacing.overall).toBe('slow'); // 3 cuts/min < 8
    expect(dna.textStyle.position).toBe('center');
    expect(dna.textStyle.animation).toBe('pop');
    expect(dna.graphicsDensity).toBe('heavy');
  });
});

describe('deriveEditDna — partial (audio-only) fingerprint falls back honestly', () => {
  const dna = deriveEditDna(
    assembleEditFingerprint({ referenceId: 'ref_2', fingerprintId: 'efp_2', audio: audio({ bpm: 100, energyCurve: [0.5], durationMs: 30_000 }) }),
  );

  it('derives musicStyle and defaults the rest', () => {
    expect(dna.musicStyle.tempo).toBe('medium'); // 100 in [90,130]
    expect(dna.musicStyle.energyLevel).toBe('medium'); // 0.5 in band
    expect(dna.musicStyle.genre).toBe('unknown'); // not in the fingerprint
    expect(dna.cutRhythm).toEqual({ avgCutsPerMinute: 10, pattern: 'steady', avgClipDuration: 3 }); // defaults
    expect(dna.transitions).toEqual({ dominant: 'hard_cut', frequency: 30 });
    expect(dna.colorGrade).toEqual({ temperature: 'neutral', saturation: 'normal', contrast: 'normal', dominantColors: [] });
    expect(dna.textStyle.position).toBe('lower_third');
    expect(dna.graphicsDensity).toBe('moderate');
    expect(dna.pacing.overall).toBe('medium'); // 10 cuts/min in [8,20]
  });
});

describe('deriveEditDna — bucket boundaries', () => {
  const tempoOf = (bpm: number) => deriveEditDna(assembleEditFingerprint({ referenceId: 'r', audio: audio({ bpm }) })).musicStyle.tempo;
  const satOf = (saturate: number) =>
    deriveEditDna(assembleEditFingerprint({ referenceId: 'r', audio: audio(), treatment: { saturate } })).colorGrade.saturation;

  it('buckets tempo by bpm', () => {
    expect(tempoOf(89)).toBe('slow');
    expect(tempoOf(90)).toBe('medium');
    expect(tempoOf(131)).toBe('fast');
  });

  it('buckets saturation by the treatment delta', () => {
    expect(satOf(0.8)).toBe('desaturated');
    expect(satOf(1.0)).toBe('normal');
    expect(satOf(1.2)).toBe('high');
  });
});
