import { describe, expect, it } from 'vitest';

import {
  projectVerifiedGeneratedCompositionToLegacyTimelineV1,
  ProjectGeneratedCompositionLegacyProjectionErrorV1,
} from '@/lib/editron/services/project-generated-composition-legacy-timeline-projection-v1';
import {
  PROJECT_GENERATED_COMPOSITION_STATE_VERSION_V1,
  type ProjectGeneratedCompositionStateV1,
} from '@/lib/editron/services/project-generated-composition-state-v1';
import { ProjectGeneratedCompositionStateValidationErrorV1 } from '@/lib/editron/services/project-generated-composition-state-verifier-v1';

const STATE_TOKEN = `gcp-state-v1:${'a'.repeat(64)}`;
const TARGET = {
  projectId: 'project-1',
  fps: 30,
  playerDimensions: { width: 1080, height: 1920 },
};

describe('generated-composition legacy timeline projection', () => {
  it('derives one deterministic 30/1 view without mutating canonical state', () => {
    const state = validState();
    const before = structuredClone(state);

    const first = projectVerifiedGeneratedCompositionToLegacyTimelineV1(state, TARGET);
    const second = projectVerifiedGeneratedCompositionToLegacyTimelineV1(state, TARGET);

    expect(first).toEqual(second);
    expect(state).toEqual(before);
    expect(first).toMatchObject({
      projectionOf: {
        projectId: 'project-1',
        compositionId: 'composition-1',
        stateToken: STATE_TOKEN,
      },
      compatibility: {
        profile: 'LEGACY_EDITOR_30_1_CFR_SQUARE_PIXEL_SDR_BT709',
        fps: 30,
        persistenceDisposition: 'DERIVED_VIEW_ONLY',
        rendererDisposition: 'NOT_WIRED',
      },
      timeline: { from: 90, durationInFrames: 60, endExclusiveFrame: 150 },
      composition: {
        contentStartFrame: 0,
        contentDurationInFrames: 60,
        headHandleFrames: 6,
        tailHandleFrames: 9,
      },
      preview: {
        contentOffsetFrames: 6,
        durationInFrames: 75,
        outputKind: 'OPAQUE_NESTED_COMPOSITION',
      },
    });
  });

  it.each([
    ['TARGET_PROJECT_ID_MISMATCH', () => validState(), { ...TARGET, projectId: 'project-2' }],
    ['TARGET_PROJECT_FPS_UNSUPPORTED', () => validState(), { ...TARGET, fps: 29.97 }],
    ['TARGET_CANVAS_MISMATCH', () => validState(), { ...TARGET, playerDimensions: { width: 1920, height: 1080 } }],
  ])('fails closed on legacy target mismatch %s', (diagnostic, makeState, target) => {
    expectProjectionFailure(makeState(), target, diagnostic);
  });

  it('rejects a valid 60-fps project state because no rate-conversion owner exists', () => {
    const state = validState();
    state.placement.projectTimebase.rate = { numerator: '60', denominator: '1' };
    state.placement.projectRange.endExclusiveTick = '210';

    expectProjectionFailure(state, TARGET, 'PROJECT_TIMEBASE_UNSUPPORTED');
  });

  it('rejects a valid 60-fps composition instead of rounding it into legacy frames', () => {
    const state = validState();
    state.placement.compositionTimebase.rate = { numerator: '60', denominator: '1' };
    state.placement.compositionRange.endExclusiveTick = '120';
    state.renderArtifacts[0].frameRate = { numerator: '60', denominator: '1' };
    state.renderArtifacts[0].durationTicks = '135';

    expectProjectionFailure(state, TARGET, 'COMPOSITION_TIMEBASE_UNSUPPORTED');
  });

  it('rejects pending state and missing preview rather than presenting it as usable', () => {
    const state = validState();
    state.verificationDisposition = 'PENDING';
    state.proof = null;
    state.renderArtifacts = [];

    expectProjectionFailure(state, TARGET, 'PREVIEW_RENDER_MISSING');
    expectProjectionFailure(state, TARGET, 'STATE_NOT_VERIFIED');
  });

  it('rejects frame coordinates that cannot survive exact JavaScript-number projection', () => {
    const state = validState();
    state.placement.projectRange = {
      startTick: '9007199254740992',
      endExclusiveTick: '9007199254741052',
    };

    expectProjectionFailure(state, TARGET, 'PROJECT_RANGE_START_UNSAFE');
    expectProjectionFailure(state, TARGET, 'PROJECT_RANGE_END_UNSAFE');
  });

  it('still delegates malformed canonical state to the canonical state verifier', () => {
    const state = validState();
    state.placement.projectRange.endExclusiveTick = state.placement.projectRange.startTick;

    expect(() => projectVerifiedGeneratedCompositionToLegacyTimelineV1(state, TARGET)).toThrow(
      ProjectGeneratedCompositionStateValidationErrorV1,
    );
  });
});

function expectProjectionFailure(
  state: ProjectGeneratedCompositionStateV1,
  target: typeof TARGET,
  diagnostic: string,
): void {
  try {
    projectVerifiedGeneratedCompositionToLegacyTimelineV1(state, target);
    throw new Error('Expected legacy projection to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectGeneratedCompositionLegacyProjectionErrorV1);
    expect((error as ProjectGeneratedCompositionLegacyProjectionErrorV1).diagnostics).toContain(diagnostic);
  }
}

function validState(): ProjectGeneratedCompositionStateV1 {
  const program = artifact('program-1', '1');
  const preview = artifact('preview-1', '2');
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
      sourceBundleArtifact: artifact('source-bundle-1', '3'),
      generator: { kind: 'HUMAN_AUTHORED', authorId: 'fixture-author' },
      allowedApi: {
        apiId: '@editron/generated-composition-api/v1',
        apiVersion: '1',
        runtimeDigest: digest('4'),
      },
    },
    referenceBinding: null,
    placement: {
      projectTimebase: timebase('project-1:timeline', 'PROJECT', 'project-1'),
      compositionTimebase: timebase('composition-1:local', 'COMPOSITION', 'composition-1'),
      projectRange: { startTick: '90', endExclusiveTick: '150' },
      compositionRange: { startTick: '0', endExclusiveTick: '60' },
      headHandleTicks: '6',
      tailHandleTicks: '9',
      handlePolicy: 'DECLARED_HANDLES',
    },
    canvas: {
      width: 1080,
      height: 1920,
      pixelAspectRatio: { numerator: '1', denominator: '1' },
      colorIntent: 'SDR_BT709',
    },
    sourceBindings: [],
    dependencyBindings: [],
    fontBindings: [],
    exposedControls: [],
    output: {
      kind: 'OPAQUE_NESTED_COMPOSITION',
      representation: 'EDITABLE_PROGRAM_AND_PROXY',
      flatteningDisposition: 'EXPLICIT_HANDOFF_ONLY',
      audioDisposition: 'CUE_HANDOFF_ONLY',
    },
    audioCueIntents: [],
    renderArtifacts: [{
      stage: 'PREVIEW',
      artifact: preview,
      boundStateToken: STATE_TOKEN,
      programDigest: { ...program.digest },
      width: 1080,
      height: 1920,
      frameRate: { numerator: '30', denominator: '1' },
      durationTicks: '75',
      contentOffsetTicks: '6',
      outputKind: 'OPAQUE_NESTED_COMPOSITION',
    }],
    verificationDisposition: 'PASS',
    proof: {
      ownerId: 'generated-composition-proof-owner',
      receipt: artifact('proof-1', '5'),
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

function timebase(timebaseId: string, scope: 'PROJECT' | 'COMPOSITION', scopeId: string) {
  return {
    timebaseId,
    version: 'v1',
    scope,
    scopeId,
    rate: { numerator: '30', denominator: '1' },
  };
}

function artifact(artifactId: string, fill: string) {
  return { artifactId, version: 'v1', digest: digest(fill) };
}

function digest(fill: string) {
  return { algorithm: 'sha-256' as const, value: fill.repeat(64) };
}
