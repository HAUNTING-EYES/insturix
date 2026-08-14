import type { ProjectGeneratedCompositionStateV1 } from './project-generated-composition-state-v1';
import { parseProjectGeneratedCompositionStateV1 } from './project-generated-composition-state-verifier-v1';

export const PROJECT_GENERATED_COMPOSITION_LEGACY_TIMELINE_PROJECTION_VERSION_V1 =
  'EDITRON_PROJECT_GENERATED_COMPOSITION_LEGACY_TIMELINE_PROJECTION_V1' as const;

const LEGACY_EDITOR_FPS = 30 as const;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

type ImmutableArtifactV1 = ProjectGeneratedCompositionStateV1['renderArtifacts'][number]['artifact'];
type OutputKindV1 = ProjectGeneratedCompositionStateV1['output']['kind'];

export interface LegacyEditorProjectSnapshotV1 {
  projectId: string;
  fps: number;
  playerDimensions: {
    width: number;
    height: number;
  };
}

export interface ProjectGeneratedCompositionLegacyTimelineProjectionV1 {
  schemaVersion: 1;
  contractVersion: typeof PROJECT_GENERATED_COMPOSITION_LEGACY_TIMELINE_PROJECTION_VERSION_V1;
  kind: 'generated-composition-legacy-timeline-projection';
  projectionOf: {
    projectId: string;
    compositionId: string;
    stateToken: string;
  };
  compatibility: {
    profile: 'LEGACY_EDITOR_30_1_CFR_SQUARE_PIXEL_SDR_BT709';
    fps: typeof LEGACY_EDITOR_FPS;
    coordinateRule: 'ONE_CANONICAL_TICK_EQUALS_ONE_LEGACY_FRAME';
    persistenceDisposition: 'DERIVED_VIEW_ONLY';
    rendererDisposition: 'NOT_WIRED';
  };
  timeline: {
    from: number;
    durationInFrames: number;
    endExclusiveFrame: number;
  };
  composition: {
    contentStartFrame: number;
    contentDurationInFrames: number;
    headHandleFrames: number;
    tailHandleFrames: number;
    handlePolicy: ProjectGeneratedCompositionStateV1['placement']['handlePolicy'];
  };
  canvas: {
    width: number;
    height: number;
    pixelAspectRatio: '1/1';
    colorIntent: 'SDR_BT709';
  };
  preview: {
    artifact: ImmutableArtifactV1;
    proofReceipt: ImmutableArtifactV1;
    outputKind: OutputKindV1;
    contentOffsetFrames: number;
    durationInFrames: number;
  };
}

export class ProjectGeneratedCompositionLegacyProjectionErrorV1 extends Error {
  readonly code = 'PROJECT_GENERATED_COMPOSITION_LEGACY_PROJECTION_UNSUPPORTED';

  constructor(readonly diagnostics: readonly string[]) {
    super(`Generated composition cannot be projected into the legacy editor: ${diagnostics.join(', ')}`);
    this.name = 'ProjectGeneratedCompositionLegacyProjectionErrorV1';
  }
}

/**
 * Produces a derived compatibility view for the current numeric-frame editor.
 * It is deliberately not an Overlay, a ProjectService writer, or a renderer
 * adapter. The canonical rational-time state remains the sole timing source.
 */
export function projectVerifiedGeneratedCompositionToLegacyTimelineV1(
  value: unknown,
  target: LegacyEditorProjectSnapshotV1,
): ProjectGeneratedCompositionLegacyTimelineProjectionV1 {
  const state = parseProjectGeneratedCompositionStateV1(value);
  const diagnostics = compatibilityDiagnostics(state, target);
  if (diagnostics.length > 0) {
    throw new ProjectGeneratedCompositionLegacyProjectionErrorV1(diagnostics);
  }

  const preview = state.renderArtifacts.find(({ stage }) => stage === 'PREVIEW');
  const proof = state.proof;
  if (!preview || !proof) {
    throw new ProjectGeneratedCompositionLegacyProjectionErrorV1([
      'VERIFIED_PREVIEW_BINDING_MISSING',
    ]);
  }

  const projectStart = toSafeNumber(state.placement.projectRange.startTick);
  const projectEnd = toSafeNumber(state.placement.projectRange.endExclusiveTick);
  const compositionStart = toSafeNumber(state.placement.compositionRange.startTick);
  const compositionEnd = toSafeNumber(state.placement.compositionRange.endExclusiveTick);

  return {
    schemaVersion: 1,
    contractVersion: PROJECT_GENERATED_COMPOSITION_LEGACY_TIMELINE_PROJECTION_VERSION_V1,
    kind: 'generated-composition-legacy-timeline-projection',
    projectionOf: {
      projectId: state.projectId,
      compositionId: state.compositionId,
      stateToken: state.stateIdentity.token,
    },
    compatibility: {
      profile: 'LEGACY_EDITOR_30_1_CFR_SQUARE_PIXEL_SDR_BT709',
      fps: LEGACY_EDITOR_FPS,
      coordinateRule: 'ONE_CANONICAL_TICK_EQUALS_ONE_LEGACY_FRAME',
      persistenceDisposition: 'DERIVED_VIEW_ONLY',
      rendererDisposition: 'NOT_WIRED',
    },
    timeline: {
      from: projectStart,
      durationInFrames: projectEnd - projectStart,
      endExclusiveFrame: projectEnd,
    },
    composition: {
      contentStartFrame: compositionStart,
      contentDurationInFrames: compositionEnd - compositionStart,
      headHandleFrames: toSafeNumber(state.placement.headHandleTicks),
      tailHandleFrames: toSafeNumber(state.placement.tailHandleTicks),
      handlePolicy: state.placement.handlePolicy,
    },
    canvas: {
      width: state.canvas.width,
      height: state.canvas.height,
      pixelAspectRatio: '1/1',
      colorIntent: 'SDR_BT709',
    },
    preview: {
      artifact: copyArtifact(preview.artifact),
      proofReceipt: copyArtifact(proof.receipt),
      outputKind: preview.outputKind,
      contentOffsetFrames: toSafeNumber(preview.contentOffsetTicks),
      durationInFrames: toSafeNumber(preview.durationTicks),
    },
  };
}

function compatibilityDiagnostics(
  state: ProjectGeneratedCompositionStateV1,
  target: LegacyEditorProjectSnapshotV1,
): string[] {
  const diagnostics: string[] = [];
  const add = (condition: boolean, code: string) => {
    if (condition) diagnostics.push(code);
  };

  add(target.projectId !== state.projectId, 'TARGET_PROJECT_ID_MISMATCH');
  add(target.fps !== LEGACY_EDITOR_FPS, 'TARGET_PROJECT_FPS_UNSUPPORTED');
  add(!isExactRate(state.placement.projectTimebase.rate, 30, 1), 'PROJECT_TIMEBASE_UNSUPPORTED');
  add(!isExactRate(state.placement.compositionTimebase.rate, 30, 1), 'COMPOSITION_TIMEBASE_UNSUPPORTED');
  add(!isExactRate(state.canvas.pixelAspectRatio, 1, 1), 'PIXEL_ASPECT_RATIO_UNSUPPORTED');
  add(
    !Number.isInteger(target.playerDimensions.width)
      || target.playerDimensions.width <= 0
      || !Number.isInteger(target.playerDimensions.height)
      || target.playerDimensions.height <= 0,
    'TARGET_CANVAS_INVALID',
  );
  add(
    target.playerDimensions.width !== state.canvas.width
      || target.playerDimensions.height !== state.canvas.height,
    'TARGET_CANVAS_MISMATCH',
  );
  add(state.verificationDisposition !== 'PASS', 'STATE_NOT_VERIFIED');
  add(!state.renderArtifacts.some(({ stage }) => stage === 'PREVIEW'), 'PREVIEW_RENDER_MISSING');

  const integerFields = [
    ['PROJECT_RANGE_START_UNSAFE', state.placement.projectRange.startTick],
    ['PROJECT_RANGE_END_UNSAFE', state.placement.projectRange.endExclusiveTick],
    ['COMPOSITION_RANGE_START_UNSAFE', state.placement.compositionRange.startTick],
    ['COMPOSITION_RANGE_END_UNSAFE', state.placement.compositionRange.endExclusiveTick],
    ['HEAD_HANDLE_UNSAFE', state.placement.headHandleTicks],
    ['TAIL_HANDLE_UNSAFE', state.placement.tailHandleTicks],
    ...state.renderArtifacts
      .filter(({ stage }) => stage === 'PREVIEW')
      .flatMap((preview) => [
        ['PREVIEW_CONTENT_OFFSET_UNSAFE', preview.contentOffsetTicks],
        ['PREVIEW_DURATION_UNSAFE', preview.durationTicks],
      ]),
  ] as const;
  integerFields.forEach(([code, value]) => add(BigInt(value) > MAX_SAFE_INTEGER, code));

  return [...new Set(diagnostics)].sort(compareCodeUnits);
}

function isExactRate(
  rate: { numerator: string; denominator: string },
  numerator: number,
  denominator: number,
): boolean {
  return rate.numerator === String(numerator) && rate.denominator === String(denominator);
}

function toSafeNumber(value: string): number {
  return Number(BigInt(value));
}

function copyArtifact(artifact: ImmutableArtifactV1): ImmutableArtifactV1 {
  return {
    artifactId: artifact.artifactId,
    version: artifact.version,
    digest: { ...artifact.digest },
  };
}

function compareCodeUnits(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
