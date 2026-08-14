import { describe, expect, it } from 'vitest';

import {
  PROJECT_GENERATED_COMPOSITION_STATE_VERSION_V1,
  type ProjectGeneratedCompositionStateV1,
} from '@/lib/editron/services/project-generated-composition-state-v1';
import {
  parseProjectGeneratedCompositionStateV1,
  ProjectGeneratedCompositionStateValidationErrorV1,
  verifyProjectGeneratedCompositionStateV1,
} from '@/lib/editron/services/project-generated-composition-state-verifier-v1';

const STATE_TOKEN = `gcp-state-v1:${'a'.repeat(64)}`;

describe('ProjectGeneratedCompositionStateV1', () => {
  it('accepts one editable, source-bound, handle-aware composition state', () => {
    const parsed = parseProjectGeneratedCompositionStateV1(validState());

    expect(parsed).toMatchObject({
      ownership: {
        projectStateOwner: 'PROJECT_SERVICE',
        executionAuthority: 'ISOLATED_SANDBOX_ONLY',
        directProjectMutation: 'DENY',
      },
      programRef: { boundProjectId: 'project-1' },
      verificationDisposition: 'PASS',
    });
    expect(parsed.sourceBindings.map(({ mediaKind }) => mediaKind)).toEqual(['VIDEO', 'IMAGE']);
    expect(parsed.exposedControls.map(({ parameterId }) => parameterId)).toEqual([
      'title',
      'gutter-width',
      'show-title',
      'title-color',
    ]);
  });

  it('rejects raw URLs, generated source, project revisions, and unknown state effects', () => {
    for (const forbidden of [
      { publicUrl: 'https://example.com/raw.mp4' },
      { generatedSource: 'export const Root = () => null' },
      { projectRevision: 17 },
      { stateEffects: [] },
    ]) {
      const state = { ...validState(), ...forbidden };
      expect(() => parseProjectGeneratedCompositionStateV1(state)).toThrow(
        ProjectGeneratedCompositionStateValidationErrorV1,
      );
    }
  });

  it.each([
    ['PROGRAM_CROSS_PROJECT', (state: ProjectGeneratedCompositionStateV1) => { state.programRef.boundProjectId = 'project-2'; }],
    ['PROJECT_TIMEBASE_SCOPE_INVALID', (state: ProjectGeneratedCompositionStateV1) => { state.placement.projectTimebase.scopeId = 'project-2'; }],
    ['COMPOSITION_TIMEBASE_SCOPE_INVALID', (state: ProjectGeneratedCompositionStateV1) => { state.placement.compositionTimebase.scopeId = 'composition-2'; }],
    ['NON_REDUCED_RATIONAL_RATE', (state: ProjectGeneratedCompositionStateV1) => { state.placement.projectTimebase.rate = { numerator: '48', denominator: '2' }; }],
    ['PLACEMENT_DURATION_MISMATCH', (state: ProjectGeneratedCompositionStateV1) => { state.placement.projectRange.endExclusiveTick = '123'; }],
    ['LOCKED_BOUNDARY_HAS_HANDLES', (state: ProjectGeneratedCompositionStateV1) => { state.placement.handlePolicy = 'LOCKED_BOUNDARY_NO_TRIM'; }],
  ])('fails deterministic project/timebase invariant %s', (diagnostic, mutate) => {
    const state = validState();
    mutate(state);

    expect(verifyProjectGeneratedCompositionStateV1(state)).toMatchObject({
      disposition: 'FAIL',
      diagnostics: expect.arrayContaining([diagnostic]),
    });
  });

  it.each([
    ['SOURCE_SLOT_DUPLICATE', (state: ProjectGeneratedCompositionStateV1) => { state.sourceBindings[1].slotId = 'source-video'; }],
    ['DEPENDENCY_SOURCE_MISSING:subject-track', (state: ProjectGeneratedCompositionStateV1) => { state.dependencyBindings[0].sourceSlotId = 'missing'; }],
    ['DEPENDENCY_TIMEBASE_MISMATCH:subject-track', (state: ProjectGeneratedCompositionStateV1) => { state.dependencyBindings[0].sourceTimebase.timebaseId = 'other'; }],
    ['DEPENDENCY_RANGE_OUTSIDE_SOURCE:subject-track', (state: ProjectGeneratedCompositionStateV1) => { state.dependencyBindings[0].sourceRange.endExclusiveTick = '1300'; }],
    ['CONTROL_ID_DUPLICATE', (state: ProjectGeneratedCompositionStateV1) => { state.exposedControls[1].parameterId = 'title'; }],
    ['CONTROL_NUMBER_OUT_OF_RANGE:gutter-width', (state: ProjectGeneratedCompositionStateV1) => {
      const control = state.exposedControls[1];
      if (control.kind === 'NUMBER') control.value = 101;
    }],
  ])('fails deterministic source/control invariant %s', (diagnostic, mutate) => {
    const state = validState();
    mutate(state);

    expect(verifyProjectGeneratedCompositionStateV1(state).diagnostics).toContain(diagnostic);
  });

  it.each([
    ['RENDER_STATE_STALE:PREVIEW', (state: ProjectGeneratedCompositionStateV1) => { state.renderArtifacts[0].boundStateToken = `gcp-state-v1:${'b'.repeat(64)}`; }],
    ['RENDER_PROGRAM_MISMATCH:PREVIEW', (state: ProjectGeneratedCompositionStateV1) => { state.renderArtifacts[0].programDigest.value = 'b'.repeat(64); }],
    ['RENDER_FORMAT_MISMATCH:PREVIEW', (state: ProjectGeneratedCompositionStateV1) => { state.renderArtifacts[0].width = 1920; }],
    ['RENDER_HANDLE_BINDING_INVALID:PREVIEW', (state: ProjectGeneratedCompositionStateV1) => { state.renderArtifacts[0].durationTicks = '59'; }],
    ['PROOF_STATE_STALE', (state: ProjectGeneratedCompositionStateV1) => { if (state.proof) state.proof.boundStateToken = `gcp-state-v1:${'b'.repeat(64)}`; }],
  ])('rejects stale or incompatible render/proof binding %s', (diagnostic, mutate) => {
    const state = validState();
    mutate(state);

    expect(verifyProjectGeneratedCompositionStateV1(state).diagnostics).toContain(diagnostic);
  });

  it('keeps PASS, FAIL, UNVERIFIABLE, and PENDING lifecycle meanings separate', () => {
    const failed = validState();
    failed.verificationDisposition = 'FAIL';
    if (failed.proof) {
      failed.proof.status = 'FAIL';
      failed.proof.observations[0].status = 'FAIL';
    }
    expect(verifyProjectGeneratedCompositionStateV1(failed)).toEqual({
      disposition: 'PASS',
      diagnostics: [],
    });

    const unverifiable = validState();
    unverifiable.verificationDisposition = 'UNVERIFIABLE';
    if (unverifiable.proof) {
      unverifiable.proof.status = 'UNVERIFIABLE';
      unverifiable.proof.observations[0].status = 'UNVERIFIABLE';
    }
    expect(verifyProjectGeneratedCompositionStateV1(unverifiable)).toEqual({
      disposition: 'PASS',
      diagnostics: [],
    });

    const pending = validState();
    pending.verificationDisposition = 'PENDING';
    pending.proof = null;
    expect(verifyProjectGeneratedCompositionStateV1(pending)).toEqual({
      disposition: 'PASS',
      diagnostics: [],
    });

    const dishonest = validState();
    if (dishonest.proof) dishonest.proof.observations[0].status = 'FAIL';
    expect(verifyProjectGeneratedCompositionStateV1(dishonest).diagnostics).toContain(
      'PROOF_OBSERVATION_AGGREGATE_MISMATCH',
    );
  });

  it('requires a bound preview for PASS and passing proof for a final artifact', () => {
    const noPreview = validState();
    noPreview.renderArtifacts = [];
    expect(verifyProjectGeneratedCompositionStateV1(noPreview).diagnostics).toContain(
      'PASS_MISSING_PREVIEW_RENDER',
    );

    const finalWithoutPass = validState();
    finalWithoutPass.verificationDisposition = 'FAIL';
    if (finalWithoutPass.proof) {
      finalWithoutPass.proof.status = 'FAIL';
      finalWithoutPass.proof.observations[0].status = 'FAIL';
    }
    finalWithoutPass.renderArtifacts.push({
      ...finalWithoutPass.renderArtifacts[0],
      stage: 'FINAL',
      artifact: artifact('final-render', 'f'),
    });
    expect(verifyProjectGeneratedCompositionStateV1(finalWithoutPass).diagnostics).toContain(
      'FINAL_RENDER_WITHOUT_PASS',
    );
  });

  it('binds cue timing to composition-local content, not project frames', () => {
    const state = validState();
    state.audioCueIntents[0].localTick = '48';

    expect(verifyProjectGeneratedCompositionStateV1(state).diagnostics).toContain(
      'AUDIO_CUE_OUTSIDE_CONTENT:panel-entry',
    );
  });
});

function validState(): ProjectGeneratedCompositionStateV1 {
  const program = artifact('program-gcp-1', '1');
  const preview = artifact('preview-gcp-1', '8');
  const sourceTimebase = {
    timebaseId: 'source-video:pts',
    version: 'probe-v1',
    scope: 'SOURCE' as const,
    scopeId: 'source-video',
    rate: { numerator: '24000', denominator: '1001' },
  };
  return {
    schemaVersion: 1,
    contractVersion: PROJECT_GENERATED_COMPOSITION_STATE_VERSION_V1,
    kind: 'generated-composition',
    ownership: {
      projectStateOwner: 'PROJECT_SERVICE',
      executionAuthority: 'ISOLATED_SANDBOX_ONLY',
      directProjectMutation: 'DENY',
    },
    projectId: 'project-1',
    compositionId: 'composition-1',
    stateIdentity: { issuer: 'PROJECT_SERVICE', token: STATE_TOKEN },
    programRef: {
      artifactType: 'GeneratedCompositionProgramV1',
      contractVersion: 'EDITRON_GENERATED_COMPOSITION_PROGRAM_V1',
      programId: 'program-1',
      boundProjectId: 'project-1',
      programArtifact: program,
      sourceBundleArtifact: artifact('source-bundle-gcp-1', '2'),
      generator: {
        kind: 'MODEL_GENERATED',
        provider: 'provider-1',
        modelId: 'model-snapshot-1',
        promptDigest: digest('3'),
      },
      allowedApi: {
        apiId: '@editron/generated-composition-api/v1',
        apiVersion: '1',
        runtimeDigest: digest('4'),
      },
    },
    referenceBinding: {
      blueprintId: 'reference-blueprint-1',
      blueprintArtifact: artifact('reference-blueprint-1', '5'),
    },
    placement: {
      projectTimebase: {
        timebaseId: 'project-1:timeline',
        version: 'timeline-v1',
        scope: 'PROJECT',
        scopeId: 'project-1',
        rate: { numerator: '24', denominator: '1' },
      },
      compositionTimebase: {
        timebaseId: 'composition-1:local',
        version: 'program-v1',
        scope: 'COMPOSITION',
        scopeId: 'composition-1',
        rate: { numerator: '48', denominator: '1' },
      },
      projectRange: { startTick: '100', endExclusiveTick: '124' },
      compositionRange: { startTick: '0', endExclusiveTick: '48' },
      headHandleTicks: '4',
      tailHandleTicks: '8',
      handlePolicy: 'DECLARED_HANDLES',
    },
    canvas: {
      width: 1080,
      height: 1920,
      pixelAspectRatio: { numerator: '1', denominator: '1' },
      colorIntent: 'SDR_BT709',
    },
    sourceBindings: [
      {
        slotId: 'source-video',
        mediaKind: 'VIDEO',
        coordinateDomain: 'SOURCE_TICK',
        asset: artifact('source-video', '6'),
        rightsReceipt: artifact('source-video-rights', '7'),
        sourceTimebase,
        sourceRange: { startTick: '1000', endExclusiveTick: '1200' },
      },
      {
        slotId: 'source-image',
        mediaKind: 'IMAGE',
        coordinateDomain: 'STATIC',
        asset: artifact('source-image', '9'),
        rightsReceipt: artifact('source-image-rights', 'a'),
      },
    ],
    dependencyBindings: [{
      dependencyId: 'subject-track',
      kind: 'TRACK',
      ownerId: 'native-track-owner',
      sourceSlotId: 'source-video',
      artifact: artifact('track-artifact', 'b'),
      sourceTimebase: structuredClone(sourceTimebase),
      sourceRange: { startTick: '1020', endExclusiveTick: '1180' },
    }],
    fontBindings: [{
      slotId: 'title-font',
      fontAsset: artifact('font-inter', 'c'),
      family: 'Inter',
      face: 'Bold',
      weight: 700,
      axes: {},
      glyphCoverage: ['U+0000-00FF'],
      licenseReceipt: artifact('font-inter-license', 'd'),
    }],
    exposedControls: [
      { parameterId: 'title', kind: 'STRING', value: 'EVENT RECAP', maximumLength: 80 },
      { parameterId: 'gutter-width', kind: 'NUMBER', value: 24, minimum: 0, maximum: 100 },
      { parameterId: 'show-title', kind: 'BOOLEAN', value: true },
      { parameterId: 'title-color', kind: 'COLOR_SRGB_HEX', value: '#FFFF00' },
    ],
    output: {
      kind: 'OPAQUE_NESTED_COMPOSITION',
      representation: 'EDITABLE_PROGRAM_AND_PROXY',
      flatteningDisposition: 'EXPLICIT_HANDOFF_ONLY',
      audioDisposition: 'CUE_HANDOFF_ONLY',
    },
    audioCueIntents: [{ cueId: 'panel-entry', localTick: '12', semanticEvent: 'centre-panel-enters' }],
    renderArtifacts: [{
      stage: 'PREVIEW',
      artifact: preview,
      boundStateToken: STATE_TOKEN,
      programDigest: { ...program.digest },
      width: 1080,
      height: 1920,
      frameRate: { numerator: '48', denominator: '1' },
      durationTicks: '60',
      contentOffsetTicks: '4',
      outputKind: 'OPAQUE_NESTED_COMPOSITION',
    }],
    verificationDisposition: 'PASS',
    proof: {
      ownerId: 'generated-composition-proof-owner',
      receipt: artifact('proof-receipt', 'e'),
      boundStateToken: STATE_TOKEN,
      programDigest: { ...program.digest },
      status: 'PASS',
      observations: [{
        obligationId: 'render:visual',
        required: true,
        status: 'PASS',
        evidence: [preview],
      }],
    },
  };
}

function artifact(artifactId: string, fill: string) {
  return { artifactId, version: 'v1', digest: digest(fill) };
}

function digest(fill: string) {
  return { algorithm: 'sha-256' as const, value: fill.repeat(64) };
}
