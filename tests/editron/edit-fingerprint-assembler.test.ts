import { describe, expect, it } from 'vitest';
import {
  assembleEditFingerprint,
  isLayerExtracted,
} from '@/lib/editron/reference-video/edit-fingerprint-assembler';
import type { FingerprintAudioLayer } from '@/lib/editron/types/edit-fingerprint';

function audio(overrides: Partial<FingerprintAudioLayer> = {}): FingerprintAudioLayer {
  return {
    soundClass: 'unknown',
    beats: [],
    dropsMs: [],
    sections: [],
    energyCurve: [],
    audioAnchored: true,
    voiceWindows: [],
    durationMs: 5000,
    ...overrides,
  };
}

describe('assembleEditFingerprint', () => {
  it('builds a partial fingerprint from audio alone, with honest empty layers', () => {
    const fp = assembleEditFingerprint({ referenceId: 'ref_1', audio: audio(), fingerprintId: 'efp_test' });

    expect(fp.fingerprintId).toBe('efp_test');
    expect(fp.referenceId).toBe('ref_1');
    expect(fp.version).toBe(1);
    expect(fp.durationMs).toBe(5000);
    expect(fp.decisionStream).toEqual([]);
    expect(fp.signalConditionals).toEqual([]);
    expect(fp.structure).toEqual({ slots: [] });
    expect(fp.typography).toEqual({});
    expect(fp.performance).toEqual({});
    expect(fp.treatment).toEqual({});
    expect(fp.copyFormula).toEqual({ slots: [] });
    expect(fp.graphics).toEqual({ classes: [] });
    expect(fp.graphics.density).toBeUndefined(); // never a default claim
    expect(fp.layerConfidence).toEqual({});
    expect(fp.extractedAt).toBeUndefined();
  });

  it('derives alignmentFrame from audioAnchored (§7.1) and honors an override', () => {
    expect(assembleEditFingerprint({ referenceId: 'r', audio: audio({ audioAnchored: true }) }).alignmentFrame).toBe('beat-space');
    expect(assembleEditFingerprint({ referenceId: 'r', audio: audio({ audioAnchored: false }) }).alignmentFrame).toBe('slot-space');
    expect(
      assembleEditFingerprint({ referenceId: 'r', audio: audio({ audioAnchored: true }), alignmentFrame: 'slot-space' }).alignmentFrame,
    ).toBe('slot-space');
  });

  it('mints an efp_ id when none is supplied', () => {
    expect(assembleEditFingerprint({ referenceId: 'r', audio: audio() }).fingerprintId).toMatch(/^efp_/);
  });

  it('passes provided layers through and stamps extractedAt only when given', () => {
    const fp = assembleEditFingerprint({
      referenceId: 'r',
      audio: audio(),
      decisionStream: [
        { family: 'zoom_punch', anchor: { kind: 'beat', tMs: 100, beat: 2 }, params: { magnitude: 1.15 }, confidence: 0.8 },
      ],
      typography: { textCase: 'upper' },
      graphics: { classes: ['kinetic-type'], density: 'heavy' },
      layerConfidence: { audio: { confidence: 0.9 }, decision: { confidence: 0.7 } },
      extractedAt: '2026-07-10T00:00:00.000Z',
    });

    expect(fp.decisionStream).toHaveLength(1);
    expect(fp.typography).toEqual({ textCase: 'upper' });
    expect(fp.graphics).toEqual({ classes: ['kinetic-type'], density: 'heavy' });
    expect(fp.extractedAt).toBe('2026-07-10T00:00:00.000Z');
  });

  it('isLayerExtracted distinguishes analyzed layers from pending ones', () => {
    const fp = assembleEditFingerprint({
      referenceId: 'r',
      audio: audio(),
      layerConfidence: { audio: { confidence: 0.9 } },
    });
    expect(isLayerExtracted(fp, 'audio')).toBe(true);
    expect(isLayerExtracted(fp, 'decision')).toBe(false); // empty AND not analyzed
    expect(isLayerExtracted(fp, 'graphics')).toBe(false);
  });
});
