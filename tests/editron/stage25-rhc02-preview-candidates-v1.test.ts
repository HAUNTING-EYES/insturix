import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { buildStage25Rhc02PreviewCandidatesV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-rhc02-preview-candidates-v1';
import {
  RHC02_PREVIEW_ASSET_IDS_V1,
  buildRhc02PreviewFixtureV1,
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

describe('Stage 2.5 RHC-02 preview candidate contracts V1', () => {
  it('binds the frozen project, local composition and source frames explicitly', () => {
    const fixture = buildRhc02PreviewFixtureV1(identity);

    expect(fixture.timelineMapping).toEqual({
      coordinateDomain: 'PROJECT_FRAME',
      rate: { numerator: '30', denominator: '1' },
      absoluteProofWindow: { startFrame: 270, endExclusiveFrame: 420 },
      absoluteTargetRange: { startFrame: 300, endExclusiveFrame: 390 },
      localProofWindow: { startFrame: 0, endExclusiveFrame: 150 },
      localTargetRange: { startFrame: 30, endExclusiveFrame: 120 },
      compositionRange: { startFrame: 0, endExclusiveFrame: 90 },
      compositionToProjectOffsetFrames: 300,
      interviewSourceToProjectOffsetFrames: 0,
    });
    expect(fixture.boundaryHandoff).toMatchObject({
      entry: {
        previousProjectFrame: 299,
        firstTargetProjectFrame: 300,
        firstCompositionFrame: 0,
        continuingInterviewSourceFrameUnderTarget: 300,
      },
      exit: {
        lastTargetProjectFrame: 389,
        lastCompositionFrame: 89,
        firstReturnProjectFrame: 390,
        firstReturnInterviewSourceFrame: 390,
      },
    });
  });

  it('keeps dialogue and room tone under one immutable native audio baseline', () => {
    const fixture = buildRhc02PreviewFixtureV1(identity);

    expect(fixture.audioBaseline).toMatchObject({
      owner: 'NATIVE_TIMELINE_AUDIO',
      candidateMayMutateAudio: false,
      requiredProof: 'DECODED_PCM_BASELINE_EQUIVALENCE',
      tracks: [
        { role: 'DIALOGUE', assetId: 'rhc02-interview' },
        { role: 'ROOM_TONE', assetId: 'rhc02-room-tone' },
      ],
    });
    expect(fixture.boundaryHandoff.audio.baselineHash)
      .toBe(hashCanonicalJsonV1(fixture.audioBaseline));
  });

  it('defines only bounded visual add-overlay inputs for the native route', () => {
    const artifact = buildStage25Rhc02PreviewCandidatesV1(identity);
    const native = artifact.routes.find(({ route }) => route === 'NATIVE');
    if (!native || native.candidateForm.kind !== 'EDITRON_ADD_OVERLAY_INPUTS') {
      throw new Error('native candidate missing');
    }

    expect(native.candidateForm.requestedOperations.map(({ operatorId }) => operatorId))
      .toEqual(['add_overlay', 'add_overlay', 'add_overlay']);
    expect(native.candidateForm.requestedOperations.map(({ arguments: args }) => ({
      type: args.type,
      content: 'text' in args ? args.text : args.assetId,
      start: args.start,
      duration: args.duration,
    }))).toEqual([
      { type: 'image', content: 'rhc02-still-a', start: 300, duration: 90 },
      { type: 'image', content: 'rhc02-still-b', start: 300, duration: 90 },
      { type: 'text', content: 'How we shipped it', start: 300, duration: 90 },
    ]);
    expect(native.candidateForm.requestedOperations[2].arguments).toMatchObject({
      x: 108,
      width: 864,
    });
    expect(native.candidateForm.audioMutationOperations).toEqual([]);
    expect(native.qualifications).toMatchObject({
      editableInputForm: true,
      audioBaselineBound: true,
      isolatedRevisionIssuedOverlayWriter: false,
      exactNativeFontFileBinding: false,
    });
  });

  it('keeps generated visual-only execution as an explicit capability gap', () => {
    const artifact = buildStage25Rhc02PreviewCandidatesV1(identity);
    const generated = artifact.routes.find(
      ({ route }) => route === 'GENERATED_COMPOSITION',
    );

    expect(generated).toMatchObject({
      disposition: 'CAPABILITY_GAP',
      capabilityAvailable: false,
      attemptedUnavailableOwner: false,
      capabilityGapCodes: [
        'GENERATED_SOURCE_SLOT_STILL_IMAGE_UNSUPPORTED',
        'GENERATED_PROXY_PLAYABLE_AUDIO_ABSENT',
      ],
      qualifications: {
        stillImageSourceOwner: false,
        playableAudioPreservationOwner: false,
        generatedProgramVerified: false,
      },
      handoffs: null,
    });
  });

  it('specifies hybrid timebase, audio and boundary handoffs without faking owners', () => {
    const artifact = buildStage25Rhc02PreviewCandidatesV1(identity);
    const hybrid = artifact.routes.find(({ route }) => route === 'HYBRID');

    expect(hybrid).toMatchObject({
      disposition: 'CAPABILITY_GAP',
      candidateForm: {
        kind: 'GENERATED_VISUAL_ISLAND_WITH_NATIVE_AUDIO',
        generatedVisualProjectRange: { startFrame: 300, endExclusiveFrame: 390 },
        generatedVisualCompositionRange: { startFrame: 0, endExclusiveFrame: 90 },
        nativeAudioOwner: 'NATIVE_TIMELINE_AUDIO',
        nativeAudioMutationAllowed: false,
        productMutationOwners: {
          prepare: 'lib/editron/services/project-service.ts#ProjectService.prepareProjectGeneratedCompositionV1',
          finalize: 'lib/editron/services/project-service.ts#ProjectService.finalizeProjectGeneratedCompositionV1',
        },
      },
      qualifications: {
        nativeAudioBaselineBound: true,
        timebaseHandoff: true,
        audioHandoff: true,
        boundaryHandoff: true,
        stillImageSourceOwner: false,
        projectServiceGeneratedCompositionWriter: true,
        isolatedRevisionIssuedProposalAdapter: false,
      },
      capabilityGapCodes: [
        'HYBRID_GENERATED_STILL_IMAGE_OWNER_UNAVAILABLE',
        'HYBRID_ISOLATED_GENERATED_COMPOSITION_PROPOSAL_ADAPTER_UNAVAILABLE',
      ],
    });
    expect(hybrid?.handoffs).toEqual(artifact.fixture.boundaryHandoff);
  });

  it('records no execution, rendering, provider calls or state effects', () => {
    const artifact = buildStage25Rhc02PreviewCandidatesV1(identity);

    expect(artifact).toMatchObject({
      providerInferenceCalls: 0,
      renderCalls: 0,
      databaseCalls: 0,
      canonicalProjectMutationWrites: 0,
      stateEffects: [],
    });
    expect(artifact.routes.every((route) => (
      route.disposition === 'CAPABILITY_GAP'
      && route.renderDisposition === 'NOT_RENDERED'
      && route.productExecutionDisposition === 'NOT_AUTHORIZED'
      && route.stateEffects.length === 0
    ))).toBe(true);
    expect(artifact.routeSetHash).toBe(hashCanonicalJsonV1(artifact.routes));
  });

  it('fails closed on unbound source identity', () => {
    const invalid = {
      ...identity,
      assetVersions: {
        ...identity.assetVersions,
        'rhc02-still-a': 'sha256:invalid',
      },
    } as Rhc02PreviewFixtureIdentityV1;

    expect(() => buildStage25Rhc02PreviewCandidatesV1(invalid))
      .toThrow('RHC02_PREVIEW_FIXTURE_ASSET_rhc02-still-a_SHA256_INVALID');
  });
});

function prefixedSha(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}
