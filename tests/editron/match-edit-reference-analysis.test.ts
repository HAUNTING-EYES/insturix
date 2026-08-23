import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  extractReferenceAnalysis,
  ReferenceAnalysisErrorV1,
  type CanonicalReferenceAnalysisInputV1,
} from '@/lib/editron/services/reference-content-extractor';
import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';

const MODEL_RESPONSE = JSON.stringify({
  editDNA: {
    cutRhythm: { avgCutsPerMinute: 99, pattern: 'building', avgClipDuration: 0.5 },
    transitions: { dominant: 'hard_cut', frequency: 40 },
    colorGrade: {
      temperature: 'warm',
      saturation: 'normal',
      contrast: 'high',
      dominantColors: ['#112233'],
    },
    textStyle: {
      fontWeight: 'bold',
      position: 'center',
      animation: 'pop',
      frequency: 'moderate',
    },
    musicStyle: { tempo: 'fast', genre: 'electronic', energyLevel: 'high' },
    pacing: { overall: 'fast', hookSpeed: 'fast', mainSpeed: 'fast' },
    graphicsDensity: 'moderate',
  },
  contentMap: [
    {
      index: 0,
      startApproxSec: 0,
      endApproxSec: 5,
      description: 'A presenter introduces the product.',
      keyVisuals: ['presenter', 'product'],
      narrationSummary: 'Opening claim.',
      isCritical: true,
    },
    {
      index: 1,
      startApproxSec: 5,
      endApproxSec: 10,
      description: 'The interface demonstrates the result.',
      keyVisuals: ['interface', 'result'],
      narrationSummary: '',
      isCritical: false,
    },
  ],
});

function canonicalInput(): CanonicalReferenceAnalysisInputV1 {
  const version = 'EDITRON_REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_V1_1' as const;
  return {
    userId: 'user_match',
    source: {
      referenceAssetId: 'ref_canon_match',
      videoUrl: 'https://cdn.example.com/ref_canon_match.mov',
      sourceName: 'Reference.mov',
      durationSec: 10,
      registration: receipt({
        version,
        assetId: 'ref_canon_match',
        mediaOwner: { type: 'USER', userId: 'user_match' },
        contentType: 'video/quicktime',
        byteLength: 100_000,
        bytesSha256: 'a'.repeat(64),
        storage: { backend: 'R2', key: 'references/ref_canon_match.mov' },
        provenance: {
          version,
          role: 'SOURCE',
          referenceEnvelopeSha256: 'c'.repeat(64),
        },
      }),
    },
  };
}

function validDeps() {
  return {
    upload: vi.fn().mockResolvedValue('https://generativelanguage.googleapis.com/files/ref'),
    generate: vi.fn().mockResolvedValue(MODEL_RESPONSE),
    detectScenes: vi.fn().mockResolvedValue({
      cuts: [{ tMs: 2_000 }, { tMs: 6_000 }],
      durationMs: 10_000,
      sceneThreshold: 0.35,
      processingTimeMs: 20,
    }),
  };
}

describe('legacy match-edit canonical reference analysis', () => {
  it('binds exact source identity, propagates MIME, and overrides model cut guesses', async () => {
    const deps = validDeps();

    const first = await extractReferenceAnalysis(canonicalInput(), deps);
    const second = await extractReferenceAnalysis(canonicalInput(), deps);

    expect(deps.upload).toHaveBeenCalledWith(
      'https://cdn.example.com/ref_canon_match.mov',
      'video/quicktime',
    );
    expect(first.dna.profileId).toBe(second.dna.profileId);
    expect(first.dna.sourceAssetId).toBe('ref_canon_match');
    expect(first.dna.sourceUrl).toBeUndefined();
    expect(first.dna.cutRhythm.avgCutsPerMinute).toBe(12);
    expect(first.dna.cutRhythm.avgClipDuration).toBeCloseTo(10 / 3);
    expect(first.source).toEqual({
      referenceAssetId: 'ref_canon_match',
      bytesSha256: 'a'.repeat(64),
      registrationReceiptSha256: canonicalInput().source.registration.receiptSha256,
    });
  });

  it('rejects copied or forged registration receipts before upload or analysis', async () => {
    const variants = [
      (input: CanonicalReferenceAnalysisInputV1) => {
        input.source.registration = { ...input.source.registration, assetId: 'another_asset' };
      },
      (input: CanonicalReferenceAnalysisInputV1) => {
        input.source.registration = { ...input.source.registration, receiptSha256: 'f'.repeat(64) };
      },
      (input: CanonicalReferenceAnalysisInputV1) => {
        input.source.registration = {
          ...input.source.registration,
          mediaOwner: { type: 'USER', userId: 'another_user' },
        };
      },
    ];

    for (const mutate of variants) {
      const input = canonicalInput();
      mutate(input);
      const deps = validDeps();
      await expect(extractReferenceAnalysis(input, deps)).rejects.toMatchObject({
        code: 'canonical_identity_invalid',
      } satisfies Partial<ReferenceAnalysisErrorV1>);
      expect(deps.upload).not.toHaveBeenCalled();
      expect(deps.generate).not.toHaveBeenCalled();
    }
  });

  it('does not substitute model-authored timing when measured cuts are unavailable', async () => {
    const deps = validDeps();
    deps.detectScenes.mockResolvedValue(null);

    await expect(extractReferenceAnalysis(canonicalInput(), deps)).rejects.toMatchObject({
      code: 'cut_evidence_unavailable',
    } satisfies Partial<ReferenceAnalysisErrorV1>);
  });

  it('rejects incomplete model observations instead of filling defaults', async () => {
    const deps = validDeps();
    deps.generate.mockResolvedValue(JSON.stringify({ editDNA: {}, contentMap: [] }));

    await expect(extractReferenceAnalysis(canonicalInput(), deps)).rejects.toMatchObject({
      code: 'model_response_invalid',
    } satisfies Partial<ReferenceAnalysisErrorV1>);
  });

  it('guards route ordering and removes the hard-coded generation quote', () => {
    const route = readFileSync(resolve(
      process.cwd(),
      'app/api/services/editron/match-edit/analyze/route.ts',
    ), 'utf8');

    expect(route.indexOf('canonicalizeReferenceVideo({')).toBeGreaterThan(-1);
    expect(route.indexOf('extractReferenceAnalysis({')).toBeGreaterThan(
      route.indexOf('canonicalizeReferenceVideo({'),
    );
    expect(route).toContain("status: 'required'");
    expect(route).toContain('matchThreshold: z.number()');
    expect(route).not.toContain('gapCost');
    expect(route).not.toContain('0.60');
    expect(route).not.toContain('matchThreshold = 0.25');
  });
});

function receipt<T extends Record<string, unknown>>(material: T): T & { receiptSha256: string } {
  return { ...material, receiptSha256: hashEditronCanonicalJsonV1(material) };
}
