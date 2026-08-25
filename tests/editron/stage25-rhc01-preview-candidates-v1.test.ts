import { describe, expect, it } from 'vitest';

import { OverlayType, type TextOverlay }
  from '@/components/editron/editor/version-7.0.0/types';
import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { verifyGeneratedCompositionProgramV1 }
  from '@/lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1';
import {
  buildStage25Rhc01NativePreviewOverlaysV1,
  buildStage25Rhc01PreviewCandidatesV1,
} from '@/lib/editron/research/open-ended-planner/stage25-rhc01-preview-candidates-v1';
import {
  RHC01_PREVIEW_ASSET_IDS_V1,
  buildRhc01GeneratedCompositionFixtureV1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/rhc01-preview-fixture-v1';

const identity = {
  assetVersions: Object.fromEntries(RHC01_PREVIEW_ASSET_IDS_V1.map((assetId, index) => (
    [assetId, `sha256:${String(index + 1).repeat(64)}`]
  ))) as Record<typeof RHC01_PREVIEW_ASSET_IDS_V1[number], `sha256:${string}`>,
  fontVersion: `sha256:${'9'.repeat(64)}` as const,
  fontFileSha256: '9'.repeat(64),
};

describe('Stage 2.5 RHC-01 preview candidates V1', () => {
  it('materializes three route-neutral editable candidates without executing them', () => {
    const artifact = buildStage25Rhc01PreviewCandidatesV1(identity);

    expect(artifact.candidates.map(({ route }) => route))
      .toEqual(['NATIVE', 'GENERATED_COMPOSITION', 'HYBRID']);
    expect(artifact).toMatchObject({
      providerInferenceCalls: 0,
      renderCalls: 0,
      canonicalProjectMutationWrites: 0,
      stateEffects: [],
    });
    expect(artifact.candidates.every((candidate) => (
      candidate.renderDisposition === 'NOT_RENDERED'
      && candidate.routeQualityDisposition === 'UNJUDGED'
      && candidate.productExecutionDisposition === 'NOT_AUTHORIZED'
      && candidate.stateEffects.length === 0
    ))).toBe(true);
    expect(artifact.candidateSetHash).toBe(hashCanonicalJsonV1(artifact.candidates));
  });

  it('keeps the generated and hybrid programs independently verifiable', () => {
    for (const route of ['GENERATED_COMPOSITION', 'HYBRID'] as const) {
      const fixture = buildRhc01GeneratedCompositionFixtureV1({ identity, route });
      expect(verifyGeneratedCompositionProgramV1(fixture)).toMatchObject({
        disposition: 'CONTRACT_PASS',
        diagnostics: [],
      });
    }
  });

  it('binds the native plan to exact independent text and source state', () => {
    const overlays = buildStage25Rhc01NativePreviewOverlaysV1();
    expect(overlays
      .filter((overlay): overlay is TextOverlay => overlay.type === OverlayType.TEXT)
      .map(({ content }) => content))
      .toEqual(['FAST', 'QUIET', 'LIGHT']);
    expect(overlays.filter(({ type }) => type === 'video').map(({ assetId }) => assetId))
      .toEqual([
        'rhc01-product-a',
        'rhc01-product-b',
        'rhc01-product-c',
        'rhc01-following-shot',
      ]);
    expect(overlays.filter(({ keyframeTracks }) => keyframeTracks?.length)).toHaveLength(3);
    expect(Object.isFrozen(overlays)).toBe(true);
  });

  it('binds generated-to-native continuity explicitly for generated and hybrid forms', () => {
    const artifact = buildStage25Rhc01PreviewCandidatesV1(identity);
    const generated = artifact.candidates.find(({ route }) => route === 'GENERATED_COMPOSITION');
    const hybrid = artifact.candidates.find(({ route }) => route === 'HYBRID');
    expect(generated?.handoffs.generatedToNativeBoundary).toMatchObject({
      projectFrame: 180,
      generatedExitSourceFrame: 179,
      followingSourceFrame: 180,
    });
    expect(hybrid?.handoffs.generatedToNativeBoundary).toMatchObject({
      projectFrame: 150,
      generatedExitSourceFrame: 149,
      followingSourceFrame: 150,
    });
  });

  it('fails closed when a generated source identity no longer matches evidence', () => {
    const fixture = structuredClone(buildRhc01GeneratedCompositionFixtureV1({
      identity,
      route: 'GENERATED_COMPOSITION',
    }));
    fixture.program.sourceSlots[0].assetVersion = `sha256:${'f'.repeat(64)}`;
    expect(verifyGeneratedCompositionProgramV1(fixture)).toMatchObject({
      disposition: 'CONTRACT_FAIL',
      diagnostics: expect.arrayContaining(['SOURCE_IDENTITY_OR_RIGHTS_DRIFT:source-fast']),
    });
  });

  it('does not expose the common following source as a generated island input', () => {
    const artifact = buildStage25Rhc01PreviewCandidatesV1(identity);
    for (const candidate of artifact.candidates.filter(({ route }) => route !== 'NATIVE')) {
      const representation = candidate.editableRepresentation as unknown as {
        program?: { sourceSlots: readonly { assetId: string }[] };
        generatedProgram?: { sourceSlots: readonly { assetId: string }[] };
      };
      const program = representation.program ?? representation.generatedProgram;
      expect(program?.sourceSlots.map(({ assetId }) => assetId))
        .toEqual(['rhc01-product-a', 'rhc01-product-b', 'rhc01-product-c']);
    }
  });
});
