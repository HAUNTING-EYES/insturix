import { describe, expect, it, vi } from 'vitest';
import {
  extractVisualFingerprint,
  parseVisualExtraction,
} from '@/lib/editron/reference-video/extract-visual-fingerprint';
import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import { REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1 } from '@/lib/editron/reference-video/reference-materialized-media-registration-v1';

describe('parseVisualExtraction', () => {
  it('maps one strict full observation', () => {
    const json = JSON.stringify({
      treatment: { saturate: 1.3, contrast: 1.1 },
      typography: { textCase: 'upper', reveal: 'pop', position: 'center' },
      structure: { slots: [{ role: 'hook', startMs: 0, endMs: 3000 }] },
      graphics: { classes: ['kinetic-type'], density: 'heavy' },
      performance: { shotScales: ['mcu'], subjectPosition: 'center', cameraMotion: 'push_in' },
      decisionStream: [
        { family: 'zoom_punch', tMs: 1500, confidence: 0.8 },
      ],
    });

    const out = parseVisualExtraction(json);

    expect(out.treatment).toEqual({ saturate: 1.3, contrast: 1.1 });
    expect(out.typography).toEqual({ textCase: 'upper', reveal: 'pop', position: 'center' });
    expect(out.structure).toEqual({ slots: [{ role: 'hook', startMs: 0, endMs: 3000 }] });
    expect(out.graphics).toEqual({ classes: ['kinetic-type'], density: 'heavy' });
    expect(out.performance).toEqual({ shotScales: ['mcu'], subjectPosition: 'center', cameraMotion: 'push_in' });
    expect(out.decisionStream).toHaveLength(1);
    expect(out.decisionStream![0]).toEqual({
      family: 'zoom_punch',
      anchor: { kind: 'none', tMs: 1500 },
      params: {},
      confidence: 0.8,
    });
  });

  it('rejects malformed, unknown and out-of-range model claims', () => {
    expect(() => parseVisualExtraction('no json here')).toThrow('returned no JSON');
    expect(() => parseVisualExtraction(JSON.stringify({ typography: { textCase: 'random' } })))
      .toThrow('violated its schema');
    expect(() => parseVisualExtraction(JSON.stringify({ decisionStream: [
      { family: 'sfx_impact', tMs: 100, confidence: 1 },
    ] }))).toThrow('violated its schema');
    expect(() => parseVisualExtraction(JSON.stringify({ structure: {
      slots: [{ role: 'hook', startMs: 0, endMs: 4_001 }],
    } }), { durationMs: 4_000 })).toThrow('exceeds source duration');
  });

  it('extracts JSON embedded in markdown fences', () => {
    const out = parseVisualExtraction('```json\n{"graphics":{"classes":["callout"],"density":"minimal"}}\n```');
    expect(out.graphics).toEqual({ classes: ['callout'], density: 'minimal' });
  });

  it('uploads only a valid receipt-bound source with truthful MIME', async () => {
    const upload = vi.fn().mockResolvedValue('https://generativelanguage.googleapis.com/files/ref');
    const generate = vi.fn().mockResolvedValue(JSON.stringify({
      performance: { cameraMotion: 'handheld' },
    }));
    const input = canonicalInput();

    await expect(extractVisualFingerprint(input, { upload, generate, seed: 7 }))
      .resolves.toEqual({ performance: { cameraMotion: 'handheld' } });
    expect(upload).toHaveBeenCalledWith(input.source.videoUrl, 'video/quicktime');
    expect(generate).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/files/ref',
      'video/quicktime',
      expect.stringContaining('VISUAL edit fingerprint'),
      7,
    );
  });

  it('rejects a floating URL before upload or provider generation', async () => {
    const upload = vi.fn();
    const generate = vi.fn();
    await expect(extractVisualFingerprint(
      'https://youtube.com/watch?v=floating',
      { upload, generate },
    )).rejects.toMatchObject({ code: 'canonical_source_required' });
    expect(upload).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
});

function canonicalInput() {
  const receiptMaterial = {
    version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
    assetId: 'asset-visual-reference',
    mediaOwner: { type: 'USER' as const, userId: 'user-visual' },
    contentType: 'video/quicktime',
    byteLength: 42_000,
    bytesSha256: 'b'.repeat(64),
    storage: { backend: 'R2' as const, key: 'users/user-visual/reference.mov' },
    provenance: {
      version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
      role: 'SOURCE' as const,
    },
  };
  return {
    userId: 'user-visual',
    source: {
      referenceAssetId: receiptMaterial.assetId,
      videoUrl: 'https://cdn.example.test/reference.mov',
      sourceName: 'reference.mov',
      durationSec: 12,
      registration: {
        ...receiptMaterial,
        receiptSha256: hashEditronCanonicalJsonV1(receiptMaterial),
      },
    },
  };
}
