import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { buildStage25Rhc02PreviewCandidatesV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-rhc02-preview-candidates-v1';
import { buildStage25Rhc02PreviewCandidatesV2 }
  from '@/lib/editron/research/open-ended-planner/stage25-rhc02-preview-candidates-v2';
import {
  RHC02_PREVIEW_ASSET_IDS_V1,
  type Rhc02PreviewFixtureIdentityV1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/rhc02-preview-fixture-v1';

const identity = {
  assetVersions: Object.fromEntries(RHC02_PREVIEW_ASSET_IDS_V1.map(
    (assetId, index) => [assetId, prefixedSha(String(index + 1))],
  )),
  rightsEvidenceVersions: Object.fromEntries(RHC02_PREVIEW_ASSET_IDS_V1.map(
    (assetId, index) => [assetId, prefixedSha(String(index + 5))],
  )),
  fontVersion: prefixedSha('9'),
  fontFileSha256: 'a'.repeat(64),
} as Rhc02PreviewFixtureIdentityV1;

describe('Stage 2.5 RHC-02 preview candidate contracts V2', () => {
  it('supersedes V1 and binds the current native-owner observation', async () => {
    const predecessor = buildStage25Rhc02PreviewCandidatesV1(identity);
    const artifact = await buildStage25Rhc02PreviewCandidatesV2(identity);
    const native = artifact.routes.find(({ route }) => route === 'NATIVE');

    expect(artifact.supersedesArtifactHash).toBe(predecessor.artifactHash);
    expect(native).toMatchObject({
      disposition: 'CAPABILITY_GAP',
      capabilityAvailable: false,
      ownerObservation: {
        receiptSha256:
          '3bbe10d5d9eabf254c82efec20a6ef6d1902cfa6ff7e8ee5d30cac5fc96997e3',
        proofCeiling: 'ISOLATED_OWNER_AND_FORM_PROOF_NOT_RENDER_OR_PRODUCT_MUTATION',
      },
      qualifications: {
        isolatedRevisionIssuedOverlayWriter: true,
        bothStillImageFormsAccepted: true,
        exactNativeFontFileBinding: false,
      },
      capabilityGapCodes: ['NATIVE_EXACT_FONT_FILE_BINDING_UNAVAILABLE'],
    });
  });

  it('preserves the visual requests and adds explicit evidence bindings', async () => {
    const artifact = await buildStage25Rhc02PreviewCandidatesV2(identity);
    const native = artifact.routes.find(({ route }) => route === 'NATIVE');
    if (!native || native.candidateForm.kind !== 'EDITRON_ADD_OVERLAY_INPUTS') {
      throw new Error('native candidate missing');
    }

    expect(native.candidateForm.requestedOperations.map((operation) => ({
      operationId: operation.operationId,
      type: operation.arguments.type,
      content: 'text' in operation.arguments
        ? operation.arguments.text
        : operation.arguments.assetId,
      start: operation.arguments.start,
      duration: operation.arguments.duration,
      evidenceIds: operation.arguments.evidenceIds,
    }))).toEqual([
      {
        operationId: 'rhc02-add-still-a', type: 'image',
        content: 'rhc02-still-a', start: 300, duration: 90,
        evidenceIds: ['rhc02-source-rhc02-still-a'],
      },
      {
        operationId: 'rhc02-add-still-b', type: 'image',
        content: 'rhc02-still-b', start: 300, duration: 90,
        evidenceIds: ['rhc02-source-rhc02-still-b'],
      },
      {
        operationId: 'rhc02-add-title', type: 'text',
        content: 'How we shipped it', start: 300, duration: 90,
        evidenceIds: ['rhc02-font'],
      },
    ]);
    expect(native.candidateForm.audioMutationOperations).toEqual([]);
  });

  it('records generated still support without borrowing stale sandbox proof', async () => {
    const artifact = await buildStage25Rhc02PreviewCandidatesV2(identity);
    const generated = artifact.routes.find(
      ({ route }) => route === 'GENERATED_COMPOSITION',
    );

    expect(artifact.implementationBinding.generatedComposition).toMatchObject({
      apiSha256: 'ee2468e25c67987e466abaee1e1ef18b0e7caa08c48875b8c52b66ee0382e4bc',
      historicalDev02ApiSha256:
        'bc61a906a339386975d21ed69aa87e7a56beabfe0406511ee980a7a39e5e3e47',
      currentSandboxCapabilityAvailable: false,
      invalidationReason: 'API_IMPLEMENTATION_HASH_CHANGED',
    });
    expect(generated).toMatchObject({
      disposition: 'CAPABILITY_GAP',
      qualifications: {
        stillImageSourceOwner: true,
        playableAudioPreservationOwner: false,
        generatedProgramVerified: false,
        currentSandboxCapability: false,
      },
      capabilityGapCodes: [
        'GENERATED_PROXY_PLAYABLE_AUDIO_ABSENT',
        'GENERATED_CURRENT_SANDBOX_CAPABILITY_UNAVAILABLE',
        'GENERATED_RHC02_PROGRAM_UNMATERIALIZED',
      ],
      handoffs: null,
    });
  });

  it('keeps the complete hybrid handoffs and names only remaining owners', async () => {
    const artifact = await buildStage25Rhc02PreviewCandidatesV2(identity);
    const hybrid = artifact.routes.find(({ route }) => route === 'HYBRID');

    expect(hybrid).toMatchObject({
      disposition: 'CAPABILITY_GAP',
      qualifications: {
        nativeAudioBaselineBound: true,
        timebaseHandoff: true,
        audioHandoff: true,
        boundaryHandoff: true,
        stillImageSourceOwner: true,
        generatedProgramVerified: false,
        currentSandboxCapability: false,
        projectServiceGeneratedCompositionWriter: true,
        isolatedRevisionIssuedProposalAdapter: false,
      },
      capabilityGapCodes: [
        'HYBRID_ISOLATED_GENERATED_COMPOSITION_PROPOSAL_ADAPTER_UNAVAILABLE',
        'HYBRID_CURRENT_SANDBOX_CAPABILITY_UNAVAILABLE',
        'HYBRID_RHC02_PROGRAM_UNMATERIALIZED',
      ],
    });
    expect(hybrid?.handoffs).toEqual(artifact.fixture.boundaryHandoff);
  });

  it('is deterministic and records no execution side effects', async () => {
    const first = await buildStage25Rhc02PreviewCandidatesV2(identity);
    const second = await buildStage25Rhc02PreviewCandidatesV2(identity);

    expect(first).toEqual(second);
    expect(first.routeSetHash).toBe(hashCanonicalJsonV1(first.routes));
    expect(first).toMatchObject({
      providerInferenceCalls: 0,
      renderCalls: 0,
      databaseCalls: 0,
      canonicalProjectMutationWrites: 0,
      stateEffects: [],
    });
    expect(first.routes.every((route) => (
      route.disposition === 'CAPABILITY_GAP'
      && route.renderDisposition === 'NOT_RENDERED'
      && route.routeQualityDisposition === 'UNJUDGED'
      && route.productExecutionDisposition === 'NOT_AUTHORIZED'
      && route.stateEffects.length === 0
    ))).toBe(true);
  });

  it('fails closed on unbound identity', async () => {
    const invalid = {
      ...identity,
      fontFileSha256: 'invalid',
    } as Rhc02PreviewFixtureIdentityV1;

    await expect(buildStage25Rhc02PreviewCandidatesV2(invalid))
      .rejects.toThrow('RHC02_PREVIEW_FIXTURE_FONT_FILE_SHA256_INVALID');
  });
});

function prefixedSha(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}
