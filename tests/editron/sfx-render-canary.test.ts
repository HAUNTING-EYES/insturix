import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  evaluateAtomicSfxAssetCandidate,
  resolveAtomicSfxForm,
} from '@/lib/editron/services/sfx-form';
import {
  searchAndDownloadSFX,
  type SFXLibrarySearchReport,
} from '@/lib/pipeline/sfx-library-service';
import {
  buildSfxRenderCanaryOverlays,
  measurePcmFrameWindow,
  parsePcm16Wav,
  SFX_RENDER_CANARY_MG_ANCHOR_FRAME,
  SFX_RENDER_CANARY_TRANSITION_FRAME,
  validateSfxRenderCanaryPlacements,
} from '@/scripts/sfx-render-canary-core';

describe('zero-credit rendered SFX canary', () => {
  it('keeps the MG event outside the CKG five-second editorial density gap', () => {
    const overlays = buildSfxRenderCanaryOverlays();
    expect(overlays).toHaveLength(3);
    expect(SFX_RENDER_CANARY_MG_ANCHOR_FRAME - SFX_RENDER_CANARY_TRANSITION_FRAME)
      .toBeGreaterThanOrEqual(5 * 30);
  });

  it('accepts catalog-only licensed transition and MG placements while preserving silence', () => {
    const overlays = placedFixture();
    const evidence = validateSfxRenderCanaryPlacements(overlays, {
      placed: 1,
      motionGraphics: { placed: 1 },
    });

    expect(evidence.map((item) => item.surface)).toEqual(['transition', 'motion-graphic']);
    expect(evidence.every((item) => item.selectionLane === 'catalog')).toBe(true);
    expect(evidence.every((item) => item.rights.licensed)).toBe(true);
  });

  it('rejects a provider fallback because the canary must consume zero API credits', () => {
    const overlays = placedFixture();
    const transition = overlays.find((overlay) => overlay.id === 1_001)!;
    const placement = (transition.metadata as Record<string, unknown>)
      .transitionSfxPlacement as Record<string, unknown>;
    placement.providerSearchReport = { selectionLane: 'provider' };

    expect(() => validateSfxRenderCanaryPlacements(overlays, {
      placed: 1,
      motionGraphics: { placed: 1 },
    })).toThrow(/escaped the bundled catalog lane/i);
  });

  it('requires signed semantic evidence in Vercel canary mode', () => {
    expect(() => validateSfxRenderCanaryPlacements(placedFixture(), {
      placed: 1,
      motionGraphics: { placed: 1 },
    }, {
      requireSemanticRetrieval: true,
    })).toThrow(/required semantic retrieval evidence/i);

    const evidence = validateSfxRenderCanaryPlacements(placedFixture(true), {
      placed: 1,
      motionGraphics: { placed: 1 },
    }, {
      requireSemanticRetrieval: true,
    });
    expect(evidence.every(
      item => item.semanticRetrieval?.candidateCount === 2,
    )).toBe(true);
  });

  it('keeps Vercel credentials branch-scoped and off command arguments', async () => {
    const script = await readFile(
      path.join(process.cwd(), 'scripts/configure-sfx-semantic-vercel.ps1'),
      'utf8',
    );

    expect(script).toContain(
      "$ExpectedProjectId = 'prj_uAwH5pAHMWaOiRNbS7FZuejWXUuc'",
    );
    expect(script).toContain(
      "$ExpectedOrgId = 'team_I1KWlM0rMN13dmFCVxzKSODS'",
    );
    expect(script).toContain(
      "[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)",
    );
    expect(script).toContain("'preview',\n      $Branch,");
    expect(script).toContain("'--sensitive',");
    expect(script).toContain('-InputValue ([string]$entry.Value)');
    expect(script).toContain('function Get-SemanticVariables');
    expect(script).toContain('function Assert-BranchVariablesListed');
    expect(script).toContain(
      "$variables['SFX_RENDER_CANARY_REQUIRE_SEMANTIC'] = '1'",
    );
    expect(script).toContain('[Environment]::SetEnvironmentVariable(');
    expect(script).toContain('$previousValues[$entry.Key]');
    expect(script).toContain(
      "$output = @(& npx 'tsx' 'scripts/run-sfx-render-canary.ts' 2>&1)",
    );
    expect(script).toContain('function Assert-RuntimeSemanticCatalog');
    expect(script).toMatch(
      /Assert-LinkedProject\s+Assert-RuntimeSemanticCatalog\s+if \(\$Configure\)/,
    );
    expect(script).toContain('lack semantic evidence');
    expect(script).not.toMatch(/'env',\s*'run'/);
    expect(script).not.toContain("'--value',");
  });

  it('routes an entrance-pop atomic form to the reviewed pop catalog role', async () => {
    const form = resolveAtomicSfxForm({
      signals: {
        motion_intensity: 0.84,
        visual_significance: 0.84,
        speech_energy: 0.08,
        active_overlay_count: 1,
      },
      params: {
        sfxCue: 'very subtle editorial entrance pop tick',
        sfxAnchor: 'mg-landing',
        mgLandingFrame: SFX_RENDER_CANARY_MG_ANCHOR_FRAME,
        syncFrame: SFX_RENDER_CANARY_MG_ANCHOR_FRAME,
        durationFrames: 90,
      },
      frame: 180,
      durationFrames: 90,
      sceneRemainingFrames: 90,
    });
    let report: SFXLibrarySearchReport | undefined;
    const result = await searchAndDownloadSFX(
      form.asset.queryTerms.join(' '),
      'zero-credit-test',
      form.asset.maxDurationSec,
      form,
      value => { report = value; },
    );

    expect(form.compatibilityToken).toBe('tick');
    expect(result?.source).toBe('catalog');
    expect(result?.durationMs).toBeLessThanOrEqual(form.asset.maxDurationSec * 1000);
    expect(report?.catalog.requestedRole).toBe('pop');
    expect(report?.catalog.selectedAssetId).toBe(result?.audioAssetId);
    expect(report?.selectionLane).toBe('catalog');
    expect(evaluateAtomicSfxAssetCandidate(form, result)).toMatchObject({
      accepted: true,
      decision: 'accept',
    });
  });

  it('measures audible and exact-silence frame windows from PCM16 WAV data', () => {
    const pcm = Buffer.alloc(48_000 * 2);
    pcm.writeInt16LE(12_000, 2_000 * 2);
    const wav = parsePcm16Wav(pcm16Wav(pcm, 48_000, 1));

    const audible = measurePcmFrameWindow(wav, 0, 2, 30);
    const silent = measurePcmFrameWindow(wav, 2, 3, 30);
    expect(audible.nonZeroSamples).toBe(1);
    expect(audible.peakSample).toBe(12_000);
    expect(audible.rms).toBeGreaterThan(0);
    expect(silent.nonZeroSamples).toBe(0);
    expect(silent.rms).toBe(0);
  });

  it('fails loud on malformed or non-PCM16 renderer output', () => {
    expect(() => parsePcm16Wav(Buffer.from('not a wav'))).toThrow(/RIFF\/WAVE/i);
    expect(() => parsePcm16Wav(pcm16Wav(Buffer.alloc(16), 48_000, 1, 24)))
      .toThrow(/invalid PCM16/i);
  });
});

function placedFixture(
  includeSemanticRetrieval = false,
): Array<Record<string, unknown>> {
  const overlays = buildSfxRenderCanaryOverlays();
  const transition = overlays.find((overlay) => overlay.id === 1_001)!;
  transition.metadata = {
    transitionSfxPlacement: {
      status: 'placed',
      providerSearchReport: providerReport(includeSemanticRetrieval),
    },
  };
  const motionGraphic = overlays.find((overlay) => overlay.id === 2_001)!;
  motionGraphic.metadata = {
    ...(motionGraphic.metadata as Record<string, unknown>),
    kineticSfxPlacement: {
      status: 'placed',
      providerSearchReport: providerReport(includeSemanticRetrieval),
    },
  };
  const silence = overlays.find((overlay) => overlay.id === 1_002)!;
  silence.metadata = {
    transitionSfxPlacement: {
      status: 'suppressed',
      reason: 'silence-wins (dip-to-black)',
    },
  };
  overlays.push(
    soundFixture(700_000_001, 'transition-sfx-placer', 1_001, 24, 36),
    soundFixture(800_000_001, 'kinetic-sfx-service', 2_001, 207, 24),
  );
  return overlays;
}

function providerReport(includeSemanticRetrieval: boolean) {
  return {
    selectionLane: 'catalog',
    ...(includeSemanticRetrieval ? {
      semanticRetrieval: {
        version: 'editron-sfx-catalog-semantic-retrieval-v1',
        releaseReceiptDigestSha256: 'a'.repeat(64),
        promotedManifestDigestSha256: 'b'.repeat(64),
        queryDigestSha256: 'c'.repeat(64),
        indexedAssetCount: 29,
        candidates: [
          { assetId: 'sfx-1', cosineSimilarity: 0.91 },
          { assetId: 'sfx-2', cosineSimilarity: 0.83 },
        ],
      },
    } : {}),
  };
}

function soundFixture(
  id: number,
  source: string,
  sourceOverlayId: number,
  from: number,
  durationInFrames: number,
): Record<string, unknown> {
  const assetId = `sfx_catalog_${id}`;
  return {
    id,
    type: 'sound',
    from,
    durationInFrames,
    src: `https://cdn.test/${assetId}.wav`,
    assetId,
    audioRights: {
      source: 'library',
      licensed: true,
      evidence: {
        kind: 'library-license',
        sourceAssetId: assetId,
        licenseId: 'cc0-1.0',
      },
    },
    metadata: {
      source,
      transitionOverlayId: source === 'transition-sfx-placer' ? sourceOverlayId : undefined,
      atomicSfxForm: {
        timing: { syncFrame: source === 'transition-sfx-placer' ? 30 : 210 },
      },
    },
  };
}

function pcm16Wav(
  pcm: Buffer,
  sampleRateHz: number,
  channelCount: number,
  bitsPerSample = 16,
): Buffer {
  const header = Buffer.alloc(44);
  const blockAlign = channelCount * bitsPerSample / 8;
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channelCount, 22);
  header.writeUInt32LE(sampleRateHz, 24);
  header.writeUInt32LE(sampleRateHz * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
